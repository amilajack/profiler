/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getFunctionName } from "~/components/FFP/profile-logic/function-info";
import {
  getBottomBoxInfoForCallNode,
  getCategoryPairLabel,
  getFileNameAnnotationForFunc,
  getOriginAnnotationForFunc,
  getSampleIndexToCallNodeIndex,
} from "~/components/FFP/profile-logic/profile-data";
import type {
  BottomBoxInfo,
  CallNodeData,
  CallNodeDisplayData,
  CallNodeInfo,
  CallNodeTable,
  CategoryList,
  ExtraBadgeInfo,
  IndexIntoCallNodeTable,
  IndexIntoFuncTable,
  Milliseconds,
  SamplesLikeTable,
  SamplesTable,
  Thread,
  TracedTiming,
  WeightType,
} from "~/components/FFP/types";
import { timeCode } from "~/components/FFP/utils/time-code";

import * as ProfileData from "~/components/FFP/profile-logic/profile-data";
import type { CallTreeSummaryStrategy, ImplementationFilter } from "~/components/FFP/types/actions";
import { assertExhaustiveCheck, ensureExists } from "~/components/FFP/utils/flow";
import { formatPercent } from "~/components/FFP/utils/format-numbers";

type CallNodeChildren = IndexIntoCallNodeTable[];
type CallNodeSummary = {
  self: Float32Array;
  total: Float32Array;
};
export type CallTreeCountsAndSummary = {
  callNodeChildCount: Uint32Array;
  callNodeSummary: CallNodeSummary;
  rootCount: number;
  rootTotalSummary: number;
};

export class CallTree {
  _categories: CategoryList;
  _callNodeInfo: CallNodeInfo;
  _callNodeTable: CallNodeTable;
  _callNodeSummary: CallNodeSummary;
  _callNodeChildCount: Uint32Array; // A table column matching the callNodeTable
  _thread: Thread;
  _rootTotalSummary: number;
  _rootCount: number;
  _displayDataByIndex: Map<IndexIntoCallNodeTable, CallNodeDisplayData>;
  // _children is indexed by IndexIntoCallNodeTable. Since they are
  // integers, using an array directly is faster than going through a Map.
  _children: Array<CallNodeChildren>;
  _jsOnly: boolean;
  _interval: number;
  _isHighPrecision: boolean;
  _weightType: WeightType;

  constructor(
    thread: Thread,
    categories: CategoryList,
    callNodeInfo: CallNodeInfo,
    callNodeSummary: CallNodeSummary,
    callNodeChildCount: Uint32Array,
    rootTotalSummary: number,
    rootCount: number,
    jsOnly: boolean,
    interval: number,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._callNodeInfo = callNodeInfo;
    this._callNodeTable = callNodeInfo.callNodeTable;
    this._callNodeSummary = callNodeSummary;
    this._callNodeChildCount = callNodeChildCount;
    this._thread = thread;
    this._rootTotalSummary = rootTotalSummary;
    this._rootCount = rootCount;
    this._displayDataByIndex = new Map();
    this._children = [];
    this._jsOnly = jsOnly;
    this._interval = interval;
    this._isHighPrecision = isHighPrecision;
    this._weightType = weightType;
  }

  getRoots() {
    return this.getChildren(-1);
  }

  getChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    let children = this._children[callNodeIndex];
    if (children === undefined) {
      const childCount = callNodeIndex === -1 ? this._rootCount : this._callNodeChildCount[callNodeIndex];
      children = [];
      for (
        let childCallNodeIndex = callNodeIndex + 1;
        childCallNodeIndex < this._callNodeTable.length && children.length < childCount;
        childCallNodeIndex++
      ) {
        const childPrefixIndex = this._callNodeTable.prefix[childCallNodeIndex];
        const childTotalSummary = this._callNodeSummary.total[childCallNodeIndex];
        const childChildCount = this._callNodeChildCount[childCallNodeIndex];

        if (childPrefixIndex === callNodeIndex && (childTotalSummary !== 0 || childChildCount !== 0)) {
          children.push(childCallNodeIndex);
        }
      }
      children.sort((a, b) => {
        /**
         * 1. if a and b are both positive, the bigger one is bigger
         * 2. if a and b are both negative, the smaller one is bigger
         * 3. if a is positive and b is negative, a is bigger
         * 4. if a is negative and b is positive, b is bigger
         */

        if (Math.abs(this._callNodeSummary.total[a]) === Math.abs(this._callNodeSummary.total[b])) {
          // If the absolute values are the same, positive values are bigger than negative values.
          if (this._callNodeSummary.total[a] > 0 && this._callNodeSummary.total[b] < 0) return -1;
          if (this._callNodeSummary.total[a] < 0 && this._callNodeSummary.total[b] > 0) return 1;
        }
        return Math.abs(this._callNodeSummary.total[b]) - Math.abs(this._callNodeSummary.total[a]);
      });
      this._children[callNodeIndex] = children;
    }
    return children;
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this.getChildren(callNodeIndex).length !== 0;
  }

  _addDescendantsToSet(callNodeIndex: IndexIntoCallNodeTable, set: Set<IndexIntoCallNodeTable>): void {
    for (const child of this.getChildren(callNodeIndex)) {
      set.add(child);
      this._addDescendantsToSet(child, set);
    }
  }

  getAllDescendants(callNodeIndex: IndexIntoCallNodeTable): Set<IndexIntoCallNodeTable> {
    const result = new Set<IndexIntoCallNodeTable>();
    this._addDescendantsToSet(callNodeIndex, result);
    return result;
  }

  getCallNodeTable(): CallNodeTable {
    return this._callNodeTable;
  }

  getParent(callNodeIndex: IndexIntoCallNodeTable): IndexIntoCallNodeTable | -1 {
    return this._callNodeTable.prefix[callNodeIndex];
  }

  getDepth(callNodeIndex: IndexIntoCallNodeTable): number {
    return this._callNodeTable.depth[callNodeIndex];
  }

  hasSameNodeIds(tree: CallTree): boolean {
    return this._callNodeTable === tree._callNodeTable;
  }

  getNodeData(callNodeIndex: IndexIntoCallNodeTable): CallNodeData {
    const funcIndex = this._callNodeTable.func[callNodeIndex];
    const funcName = this._thread.stringTable.getString(this._thread.funcTable.name[funcIndex]);

    const { total, totalRelative } = this.getNodeTotal(callNodeIndex);

    const self = this._callNodeSummary.self[callNodeIndex];
    const selfRelative = this._rootTotalSummary ? self / this._rootTotalSummary : 0;

    return {
      funcName,
      total,
      totalRelative,
      self,
      selfRelative,
    };
  }

  getNodeTotal(callNodeIndex: IndexIntoCallNodeTable): { total: number; totalRelative: number } {
    const total = this._callNodeSummary.total[callNodeIndex];
    const totalRelative = this._rootTotalSummary ? total / this._rootTotalSummary : 0;

    return { total, totalRelative };
  }

  _getInliningBadge(callNodeIndex: IndexIntoCallNodeTable, funcName: string): ExtraBadgeInfo | undefined {
    const calledFunction = getFunctionName(funcName);
    const inlinedIntoNativeSymbol = this._callNodeTable.sourceFramesInlinedIntoSymbol[callNodeIndex];
    if (inlinedIntoNativeSymbol === null) {
      return undefined;
    }

    if (inlinedIntoNativeSymbol === -1) {
      return {
        name: "divergent-inlining",
        vars: { calledFunction },
        localizationId: "CallTree--divergent-inlining-badge",
        contentFallback: "",
        titleFallback: `Some calls to ${calledFunction} were inlined by the compiler.`,
      };
    }

    const outerFunction = getFunctionName(
      this._thread.stringTable.getString(this._thread.nativeSymbols.name[inlinedIntoNativeSymbol])
    );
    return {
      name: "inlined",
      vars: { calledFunction, outerFunction },
      localizationId: "CallTree--inlining-badge",
      contentFallback: "(inlined)",
      titleFallback: `Calls to ${calledFunction} were inlined into ${outerFunction} by the compiler.`,
    };
  }

  getLibName(callNodeIndex: IndexIntoCallNodeTable): string {
    const funcIndex = this._callNodeTable.func[callNodeIndex];
    return this._getOriginAnnotation(funcIndex);
  }

  getDisplayData(callNodeIndex: IndexIntoCallNodeTable): CallNodeDisplayData {
    let displayData: CallNodeDisplayData | undefined = this._displayDataByIndex.get(callNodeIndex);
    if (displayData === undefined) {
      const { funcName, total, totalRelative, self, selfRelative } = this.getNodeData(callNodeIndex);
      const funcIndex = this._callNodeTable.func[callNodeIndex];
      const categoryIndex = this._callNodeTable.category[callNodeIndex];
      const subcategoryIndex = this._callNodeTable.subcategory[callNodeIndex];
      const badge = this._getInliningBadge(callNodeIndex, funcName);
      const resourceIndex = this._thread.funcTable.resource[funcIndex];
      const isFrameLabel = resourceIndex === -1;
      const libName = this._getOriginAnnotation(funcIndex);

      const totalPercent = `${formatPercent(totalRelative)}`;
      const selfPercent = `${formatPercent(selfRelative)}`;

      displayData = {
        total: String(total),
        // totalWithUnit: total === 0 ? "—" : totalWithUnit,
        self: String(self),
        // selfWithUnit: self === 0 ? "—" : selfWithUnit,
        selfPercent,
        selfRelative,
        totalPercent,
        totalRelative,
        name: funcName,
        lib: libName.slice(0, 1000),
        // Dim platform pseudo-stacks.
        isFrameLabel,
        badge,
        categoryName: getCategoryPairLabel(this._categories, categoryIndex, subcategoryIndex),
        categoryColor: this._categories[categoryIndex].color,
        // iconSrc,
        // icon,
        // ariaLabel,
      };
      this._displayDataByIndex.set(callNodeIndex, displayData);
    }
    return displayData;
  }

  _getOriginAnnotation(funcIndex: IndexIntoFuncTable): string {
    return getOriginAnnotationForFunc(
      funcIndex,
      this._thread.funcTable,
      this._thread.resourceTable,
      this._thread.stringTable
    );
  }

  /**
   * Experimental version of `_getOriginAnnotation`
   *
   * In the future this should fully replace `_getOriginAnnotation`
   */
  _getFileNameAnnotation(callNodeIndex: IndexIntoCallNodeTable): string {
    return getFileNameAnnotationForFunc(
      this._callNodeTable.func[callNodeIndex],
      this._thread.funcTable,
      this._thread.stringTable
    );
  }

  getBottomBoxInfoForCallNode(callNodeIndex: IndexIntoCallNodeTable): BottomBoxInfo {
    return getBottomBoxInfoForCallNode(callNodeIndex, this._callNodeInfo, this._thread);
  }
}

function _getInvertedStackSelf(
  // The samples could either be a SamplesTable, or a JsAllocationsTable.
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>
): {
  // In an inverted profile, all the amount of self unit (time, bytes, count, etc.) is
  // accounted to the root nodes. So `callNodeSelf` will be 0 for all non-root nodes.
  callNodeSelf: Float32Array;
  // This property stores the amount of unit (time, bytes, count, etc.) spent in the
  // stacks' leaf nodes. Later these values will make it possible to compute the
  // total for all nodes by summing up the values up the tree.
  callNodeLeaf: Float32Array;
} {
  // Compute an array that maps the callNodeIndex to its root.
  const callNodeToRoot = new Int32Array(callNodeTable.length);
  for (let callNodeIndex = 0; callNodeIndex < callNodeTable.length; callNodeIndex++) {
    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode === -1) {
      // callNodeIndex is a root node
      callNodeToRoot[callNodeIndex] = callNodeIndex;
    } else {
      // The callNodeTable guarantees that a callNode's prefix always comes
      // before the callNode; prefix references are always to lower callNode
      // indexes and never to higher indexes.
      // We are iterating the callNodeTable in forwards direction (starting at
      // index 0) so we know that we have already visited the current call
      // node's prefix call node and can reuse its stored root node, which
      // recursively is the value we're looking for.
      callNodeToRoot[callNodeIndex] = callNodeToRoot[prefixCallNode];
    }
  }

  // Calculate the timing information by going through each sample.
  const callNodeSelf = new Float32Array(callNodeTable.length);
  const callNodeLeaf = new Float32Array(callNodeTable.length);
  for (let sampleIndex = 0; sampleIndex < sampleIndexToCallNodeIndex.length; sampleIndex++) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const rootIndex = callNodeToRoot[callNodeIndex];
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      callNodeSelf[rootIndex] += weight;
      callNodeLeaf[callNodeIndex] += weight;
    }
  }

  return { callNodeSelf, callNodeLeaf };
}

/**
 * This is a helper function to get the stack timings for un-inverted call trees.
 */
function _getStackSelf(
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<null | IndexIntoCallNodeTable>
): {
  callNodeSelf: Float32Array; // Milliseconds[],
  callNodeLeaf: Float32Array; // Milliseconds[]
} {
  const callNodeSelf = new Float32Array(callNodeTable.length);

  for (let sampleIndex = 0; sampleIndex < sampleIndexToCallNodeIndex.length; sampleIndex++) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      callNodeSelf[callNodeIndex] += weight;
    }
  }

  return { callNodeSelf, callNodeLeaf: callNodeSelf };
}

/**
 * This computes all of the count and timing information displayed in the calltree.
 * It takes into account both the normal tree, and the inverted tree.
 *
 * Note: The "timings" could have a number of different meanings based on the
 * what type of weight is in the SamplesLikeTable. For instance, it could be
 * milliseconds, sample counts, or bytes.
 */
export function computeCallTreeCountsAndSummary(
  samples: SamplesLikeTable,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): CallTreeCountsAndSummary {
  const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(samples.stack, stackIndexToCallNodeIndex);
  // Inverted trees need a different method for computing the timing.
  const { callNodeSelf, callNodeLeaf } = invertCallstack
    ? _getInvertedStackSelf(samples, callNodeTable, sampleIndexToCallNodeIndex)
    : _getStackSelf(samples, callNodeTable, sampleIndexToCallNodeIndex);

  // Compute the following variables:
  const callNodeTotalSummary = new Float32Array(callNodeTable.length);
  const callNodeChildCount = new Uint32Array(callNodeTable.length);
  let rootTotalSummary = 0;
  let rootCount = 0;

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total is known at the time we reach a
  // node.
  for (let callNodeIndex = callNodeTable.length - 1; callNodeIndex >= 0; callNodeIndex--) {
    callNodeTotalSummary[callNodeIndex] += callNodeLeaf[callNodeIndex];
    rootTotalSummary += Math.abs(callNodeLeaf[callNodeIndex]);
    const hasChildren = callNodeChildCount[callNodeIndex] !== 0;
    const hasTotalValue = callNodeTotalSummary[callNodeIndex] !== 0;

    if (!hasChildren && !hasTotalValue) {
      continue;
    }

    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode === -1) {
      rootCount++;
    } else {
      callNodeTotalSummary[prefixCallNode] += callNodeTotalSummary[callNodeIndex];
      callNodeChildCount[prefixCallNode]++;
    }
  }

  /**
   * If we are not inverting the callstack, we can assume that there's only
   * one root node, and that it's the first node in the callNodeTable.
   *
   * Due to rounding errors, totalSummary for the root node will not be exactly 0.
   * Therefore, if it's less than 10 it's likely that we are in compare mode,
   * and the root node is just noise.
   */
  if (!invertCallstack && callNodeTotalSummary[0] < 10) {
    callNodeTotalSummary[0] = 0;
  }

  return {
    callNodeSummary: {
      self: callNodeSelf,
      total: callNodeTotalSummary,
    },
    callNodeChildCount,
    rootTotalSummary,
    rootCount,
  };
}

/**
 * An exported interface to get an instance of the CallTree class.
 * This handles computing timing information, and passing it all into
 * the CallTree constructor.
 */
export function getCallTree(
  thread: Thread,
  interval: Milliseconds,
  callNodeInfo: CallNodeInfo,
  categories: CategoryList,
  implementationFilter: ImplementationFilter,
  callTreeCountsAndSummary: CallTreeCountsAndSummary,
  weightType: WeightType
): CallTree {
  return timeCode("getCallTree", () => {
    const { callNodeSummary, callNodeChildCount, rootTotalSummary, rootCount } = callTreeCountsAndSummary;

    const jsOnly = implementationFilter === "js";
    // By default add a single decimal value, e.g 13.1, 0.3, 5234.4
    return new CallTree(
      thread,
      categories,
      callNodeInfo,
      callNodeSummary,
      callNodeChildCount,
      rootTotalSummary,
      rootCount,
      jsOnly,
      interval,
      Boolean(thread.isJsTracer),
      weightType
    );
  });
}

/**
 * This function takes the call tree summary strategy, and finds the appropriate data
 * structure. This can then be used by the call tree and other UI to report on the data.
 */
export function extractSamplesLikeTable(thread: Thread, strategy: CallTreeSummaryStrategy): SamplesLikeTable {
  switch (strategy) {
    case "timing":
      return thread.samples;
    case "js-allocations":
      return ensureExists(
        thread.jsAllocations,
        'Expected the NativeAllocationTable to exist when using a "js-allocation" strategy'
      );
    case "native-retained-allocations": {
      const nativeAllocations = ensureExists(
        thread.nativeAllocations,
        'Expected the NativeAllocationTable to exist when using a "native-allocation" strategy'
      );

      /* istanbul ignore if */
      // @ts-ignore-next-line
      if (!nativeAllocations.memoryAddress) {
        throw new Error("Attempting to filter by retained allocations data that is missing the memory addresses.");
      }
      // @ts-ignore-next-line
      return ProfileData.filterToRetainedAllocations(nativeAllocations);
    }
    case "native-allocations":
      return ProfileData.filterToAllocations(
        ensureExists(
          thread.nativeAllocations,
          'Expected the NativeAllocationTable to exist when using a "native-allocations" strategy'
        )
      );
    case "native-deallocations-sites":
      return ProfileData.filterToDeallocationsSites(
        ensureExists(
          thread.nativeAllocations,
          'Expected the NativeAllocationTable to exist when using a "native-deallocations-sites" strategy'
        )
      );
    case "native-deallocations-memory": {
      const nativeAllocations = ensureExists(
        thread.nativeAllocations,
        'Expected the NativeAllocationTable to exist when using a "native-deallocations-memory" strategy'
      );

      /* istanbul ignore if */
      // @ts-ignore-next-line
      if (!nativeAllocations.memoryAddress) {
        throw new Error("Attempting to filter by retained allocations data that is missing the memory addresses.");
      }

      return ProfileData.filterToDeallocationsMemory(
        // @ts-ignore-next-line
        ensureExists(
          nativeAllocations,
          'Expected the NativeAllocationTable to exist when using a "js-allocation" strategy'
        )
      );
    }
    /* istanbul ignore next */
    default:
      throw assertExhaustiveCheck(strategy);
  }
}

/**
 * This function is extremely similar to computeCallTreeCountsAndSummary,
 * but is specialized for converting sample counts into traced timing. Samples
 * don't have duration information associated with them, it's mostly how long they
 * were observed to be running. This function computes the timing the exact same
 * way that the stack chart will display the information, so that timing information
 * will agree. In the past, timing was computed by samplingInterval * sampleCount.
 * This caused confusion when switching to the trace-based views when the numbers
 * did not agree. In order to remove confusion, we can show the sample counts,
 * plus the traced timing, which is a compromise between correctness, and consistency.
 */
export function computeTracedTiming(
  samples: SamplesLikeTable,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): TracedTiming | null {
  if (samples.weightType !== "samples" || samples.weight) {
    // Only compute for the samples weight types that have no weights. If a samples
    // table has weights then it's a diff profile. Currently, we aren't calculating
    // diff profiles, but it could be possible to compute this information twice,
    // once for positive weights, and once for negative weights, then sum them
    // together. At this time it's not really worth it.
    //
    // See https://github.com/firefox-devtools/profiler/issues/2615
    return null;
  }

  // Compute the timing duration, which is the time between this sample and the next.
  const weight = [];
  for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex++) {
    weight.push(samples.time[sampleIndex + 1] - samples.time[sampleIndex]);
  }
  if (samples.length > 0) {
    // Use the sampling interval for the last sample.
    weight.push(interval);
  }
  const samplesWithWeight: SamplesTable = {
    ...samples,
    weight,
  };

  const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(samples.stack, stackIndexToCallNodeIndex);
  // Inverted trees need a different method for computing the timing.
  const { callNodeSelf, callNodeLeaf } = invertCallstack
    ? _getInvertedStackSelf(samplesWithWeight, callNodeTable, sampleIndexToCallNodeIndex)
    : _getStackSelf(samplesWithWeight, callNodeTable, sampleIndexToCallNodeIndex);

  // Compute the following variables:
  const callNodeTotalSummary = new Float32Array(callNodeTable.length);
  const callNodeChildCount = new Uint32Array(callNodeTable.length);

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total time is known at the time we reach a
  // node.
  for (let callNodeIndex = callNodeTable.length - 1; callNodeIndex >= 0; callNodeIndex--) {
    callNodeTotalSummary[callNodeIndex] += callNodeLeaf[callNodeIndex];
    const hasChildren = callNodeChildCount[callNodeIndex] !== 0;
    const hasTotalValue = callNodeTotalSummary[callNodeIndex] !== 0;

    if (!hasChildren && !hasTotalValue) {
      continue;
    }

    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode !== -1) {
      callNodeTotalSummary[prefixCallNode] += callNodeTotalSummary[callNodeIndex];
      callNodeChildCount[prefixCallNode]++;
    }
  }

  return {
    self: callNodeSelf,
    running: callNodeTotalSummary,
  };
}
