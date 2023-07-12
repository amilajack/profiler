/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import memoize from "memoize-immutable";
import { createSelector } from "reselect";
import { getLineTimings, getStackLineInfoForCallNode } from "~/components/FFP/profile-logic/line-timings";
import * as ProfileData from "~/components/FFP/profile-logic/profile-data";
import {
  StackAndSampleSelectorsPerThread,
  getStackAndSampleSelectorsPerThread,
} from "~/components/FFP/selectors/per-thread/stack-sample";
import { ThreadSelectorsPerThread, getThreadSelectorsPerThread } from "~/components/FFP/selectors/per-thread/thread";
import * as UrlState from "~/components/FFP/selectors/url-state";
import { ensureExists, getFirstItemFromSet } from "~/components/FFP/utils/flow";
import * as ProfileSelectors from "../profile";

import type {
  CallNodeIndexToCompareCallNodeIndexTable,
  LineTimings,
  Selector,
  StackLineInfo,
  Thread,
  ThreadIndex,
  ThreadsKey,
} from "~/components/FFP/types";

import { TimingsForPath, getCallNodeIndexFromPath } from "~/components/FFP/profile-logic/profile-data";
import { timeCode } from "~/components/FFP/utils/time-code";
import { cyrb53 } from "~/utils/hash";

/**
 * Traditional selectors only take one parameter, the `State` object. The selectors
 * memoize based off of the `State` of the last call. If a ThreadIndex parameter were
 * passed in, the memoization would break as the ThreadIndex would change many times
 * across a single render call. Instead for ThreadSelectors, duplicate the selector
 * functions once per thread in the profile, so each memoizes separately.
 */
export type ThreadSelectors = ThreadSelectorsPerThread & StackAndSampleSelectorsPerThread;

/**
 * This is the static object store that holds the selector functions.
 */
const _threadSelectorsCache: {
  [key: number]: ThreadSelectors;
} = {};
const _mergedThreadSelectorsMemoized = memoize(
  (threadsKey: ThreadsKey) => {
    // We don't pass this set inside this memoization function since we create
    // an intermediate Set whenever we need to access the cache. Memoize should
    // only use threadsKey as the key.
    const threadIndexes = new Set(("" + threadsKey).split(",").map((n) => +n));
    return _buildThreadSelectors(threadIndexes, threadsKey);
  },
  { limit: 5 }
);

const getSingleThreadSelectors = (threadIndex: ThreadIndex): ThreadSelectors => {
  if (threadIndex in _threadSelectorsCache) {
    return _threadSelectorsCache[threadIndex];
  }

  const threadIndexes = new Set([threadIndex]);
  const selectors = _buildThreadSelectors(threadIndexes);
  // @ts-ignore-next-line
  _threadSelectorsCache[threadIndex] = selectors;
  // @ts-ignore-next-line
  return selectors;
};

/**
 * This function does the work of building out the selectors for a given thread index.
 * See the respective definitions in the functions getXXXXXSelectorsPerThread for
 * what they specifically include.
 */
export const getThreadSelectors = (oneOrManyThreadIndexes: ThreadIndex | Set<ThreadIndex>): ThreadSelectors => {
  let threadIndex: null | ThreadIndex = null;
  let threadIndexes: null | Set<ThreadIndex> = null;

  if (typeof oneOrManyThreadIndexes === "number") {
    threadIndex = oneOrManyThreadIndexes;
  } else {
    threadIndexes = oneOrManyThreadIndexes;
  }

  // The thread selectors have two different caching strategies. For a single thread
  // index, we will retain the cache forever. For a Set of more than one thread indexes
  // we will only memoize the last used Set. Most likely, users will add on to a
  // selection until they have the desired set of Threads. It would be very memory
  // intensive to retain this set of selectors forever, as it can change frequently
  // and with various different values.
  if (threadIndex !== null) {
    return getSingleThreadSelectors(threadIndex);
  }

  // This must be true with the logic above.
  threadIndexes = ensureExists(threadIndexes);

  return getThreadSelectorsFromThreadsKey(ProfileData.getThreadsKey(threadIndexes), threadIndexes);
};

/**
 * This function returns the selectors for a group of threads, based on the ThreadsKey.
 * It only memoizes off of a single ThreadsKey. If that key changes, the caching will
 * be invalidated, and a new set of selectors will be generated. This is because
 * thread selections are fairly dynamic, and we don't want to retain too many
 * extraneous results.
 */
export const getThreadSelectorsFromThreadsKey = (
  threadsKey: ThreadsKey,
  threadIndexes: Set<ThreadIndex> = new Set(("" + threadsKey).split(",").map((n) => +n))
): ThreadSelectors => {
  if (threadIndexes.size === 1) {
    // We should get the single thread and use its caching mechanism.
    // We know this value exists because of the size check, even if Flow doesn't.
    return getSingleThreadSelectors(ensureExists(getFirstItemFromSet(threadIndexes)));
  }

  // @ts-ignore-next-line
  return _mergedThreadSelectorsMemoized(threadsKey);
};

function _buildThreadSelectors(
  threadIndexes: Set<ThreadIndex>,
  threadsKey: ThreadsKey = ProfileData.getThreadsKey(threadIndexes)
) {
  // We define the thread selectors in 3 steps to ensure clarity in the
  // separate files.
  // 1. The basic selectors.
  let selectors = getThreadSelectorsPerThread(threadIndexes, threadsKey);
  // 2. Stack, sample and marker selectors that need the previous basic
  // selectors for their own definition.
  selectors = {
    ...selectors,
    ...getStackAndSampleSelectorsPerThread(selectors, threadIndexes, threadsKey),
    // ...getMarkerSelectorsPerThread(selectors, threadIndexes, threadsKey),
  };
  // 3. Other selectors that need selectors from different files to be defined.
  selectors = {
    ...selectors,
    // @ts-ignore-next-line
    // ...getComposedSelectorsPerThread(selectors),
  };
  return selectors;
}

/**
 * Most of the time, we only want to work with the selected thread. This object
 * collects the selectors for the currently selected thread.
 */
export const selectedThreadSelectors: ThreadSelectors = (() => {
  const anyThreadSelectors: ThreadSelectors = getThreadSelectors(0);
  const result: Partial<ThreadSelectors> = {};
  for (const key in anyThreadSelectors) {
    // @ts-ignore-next-line
    result[key] = (state) => getThreadSelectors(UrlState.getSelectedThreadIndexes(state))[key](state);
  }
  const result2: ThreadSelectors = result as any;
  return result2;
})();

export const compareThreadSelectors: ThreadSelectors = (() => {
  const anyThreadSelectors: ThreadSelectors = getThreadSelectors(0);
  const result: Partial<ThreadSelectors> = {};
  for (const key in anyThreadSelectors) {
    // @ts-ignore-next-line
    result[key] = (state) => getThreadSelectors(new Set([2]))[key](state);
  }
  const result2: ThreadSelectors = result as any;
  return result2;
})();

export const getCallNodeIndexToCompareCallNodeIndexTable: Selector<CallNodeIndexToCompareCallNodeIndexTable> =
  createSelector(
    selectedThreadSelectors.getCallTree,
    compareThreadSelectors.getCallTree,
    (selectedCallTree, compareCallTree) => {
      const callNodeIndexToCompareCallNodeIndexTable: CallNodeIndexToCompareCallNodeIndexTable = new Map<
        number,
        undefined
      >();

      timeCode("getSelectedCallNodeIndexToCompareCallNodeIndexTable", () => {
        // Using Record over Map seems to be faster
        const compareCallNodePathCache: Record<string, number> = {};

        const compareCallNodeTable = compareCallTree.getCallNodeTable();
        const selectedCallNodeTable = selectedCallTree.getCallNodeTable();

        const comparePrefixPaths = new Array<number>(compareCallNodeTable.length).fill(0);
        for (let callNodeIndex = 0; callNodeIndex < compareCallNodeTable.length; callNodeIndex++) {
          const prefix = compareCallNodeTable.prefix[callNodeIndex];
          const prefixPath = comparePrefixPaths[prefix] ?? 0;
          const libName = compareCallTree._getFileNameAnnotation(callNodeIndex);
          const path = cyrb53(`${prefixPath}${libName}`);
          comparePrefixPaths[callNodeIndex] = path;

          compareCallNodePathCache[path] = callNodeIndex;
        }

        const selectedPrefixPaths = new Array<number>(selectedCallNodeTable.length).fill(0);
        for (let callNodeIndex = 0; callNodeIndex < selectedCallNodeTable.length; callNodeIndex++) {
          const prefix = selectedCallNodeTable.prefix[callNodeIndex];
          const prefixPath = selectedPrefixPaths[prefix] ?? 0;
          const libName = selectedCallTree._getFileNameAnnotation(callNodeIndex);
          const path = cyrb53(`${prefixPath}${libName}`);
          selectedPrefixPaths[callNodeIndex] = path;

          const compareCallNodeIndex = compareCallNodePathCache[path];
          callNodeIndexToCompareCallNodeIndexTable.set(callNodeIndex, compareCallNodeIndex);
        }
      });

      return callNodeIndexToCompareCallNodeIndexTable;
    }
  );

export type NodeSelectors = {
  readonly getName: Selector<string>;
  readonly getIsJS: Selector<boolean>;
  readonly getLib: Selector<string>;
  readonly getThreadOrigin: Selector<number | undefined>;
  readonly getLibMetadata: Selector<
    | {
        line?: number;
        col?: number;
        fileName?: string;
        projectId?: string;
        resource?: string;
      }
    | undefined
  >;
  readonly getTimingsForSidebar: Selector<TimingsForPath>;
  readonly getSourceViewStackLineInfo: Selector<StackLineInfo | null>;
  readonly getSourceViewLineTimings: Selector<LineTimings>;
  readonly getStackId: Selector<string[]>;
};

export const selectedNodeSelectors: NodeSelectors = (() => {
  const getName: Selector<string> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable }) => {
      if (!selectedPath.length) {
        return "";
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return stringTable.getString(funcTable.name[funcIndex]);
    }
  );

  const getIsJS: Selector<boolean> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { funcTable }) => {
      if (!selectedPath.length) {
        return false;
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return funcTable.isJS[funcIndex];
    }
  );

  const getLib: Selector<string> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable, resourceTable }) => {
      if (!selectedPath.length) {
        return "";
      }

      return ProfileData.getOriginAnnotationForFunc(
        ProfileData.getLeafFuncIndex(selectedPath),
        funcTable,
        resourceTable,
        stringTable
      );
    }
  );

  const getThreadOrigin: Selector<number | undefined> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { funcTable }) => {
      if (!selectedPath.length) {
        return undefined;
      }

      // all the logic for determining the correct thread origin
      // is handled in merge-compare.ts/combineFuncTables
      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      const threadOrigin = funcTable.threadOrigin?.[funcIndex] ?? undefined;
      return threadOrigin;
    }
  );

  const getLibMetadata: Selector<
    | {
        line?: number;
        col?: number;
        fileName?: string;
        resource?: string;
      }
    | undefined
  > = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable, resourceTable }) => {
      if (!selectedPath.length) {
        return undefined;
      }

      return ProfileData.getMetadataAnnotationForFunc(
        ProfileData.getLeafFuncIndex(selectedPath),
        funcTable,
        resourceTable,
        stringTable
      );
    }
  );

  const getTimingsForSidebar: Selector<TimingsForPath> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getCallNodeInfo,
    ProfileSelectors.getProfileInterval,
    UrlState.getInvertCallstack,
    selectedThreadSelectors.getPreviewFilteredThread,
    selectedThreadSelectors.getThread,
    selectedThreadSelectors.getSampleIndexOffsetFromPreviewRange,
    ProfileSelectors.getCategories,
    selectedThreadSelectors.getPreviewFilteredSamplesForCallTree,
    selectedThreadSelectors.getUnfilteredSamplesForCallTree,
    ProfileSelectors.getProfileUsesFrameImplementation,
    ProfileData.getTimingsForPath
  );

  const getSourceViewStackLineInfo: Selector<StackLineInfo | null> = createSelector(
    selectedThreadSelectors.getFilteredThread,
    UrlState.getSourceViewFile,
    selectedThreadSelectors.getCallNodeInfo,
    selectedThreadSelectors.getSelectedCallNodeIndex,
    UrlState.getInvertCallstack,
    (
      { stackTable, frameTable, funcTable, stringTable }: Thread,
      sourceViewFile,
      callNodeInfo,
      selectedCallNodeIndex,
      invertCallStack
    ): StackLineInfo | null => {
      if (sourceViewFile === null || selectedCallNodeIndex === null) {
        return null;
      }
      const selectedFunc = callNodeInfo.callNodeTable.func[selectedCallNodeIndex];
      const selectedFuncFile = funcTable.fileName[selectedFunc];
      if (selectedFuncFile === null || stringTable.getString(selectedFuncFile) !== sourceViewFile) {
        return null;
      }
      return getStackLineInfoForCallNode(stackTable, frameTable, selectedCallNodeIndex, callNodeInfo, invertCallStack);
    }
  );

  const getSourceViewLineTimings: Selector<LineTimings> = createSelector(
    getSourceViewStackLineInfo,
    selectedThreadSelectors.getPreviewFilteredSamplesForCallTree,
    getLineTimings
  );

  const getStackId: Selector<string[]> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    selectedThreadSelectors.getCallNodeInfo,
    (selectedPath, { stringTable }, { callNodeTable }) => {
      const callNodeIndex = getCallNodeIndexFromPath(selectedPath, callNodeTable);

      if (callNodeIndex === null) return [];

      const stringTableIndexes = callNodeTable.stackId[callNodeIndex];
      const newArray: string[] = [];
      for (const stringTableIndex of stringTableIndexes) {
        newArray.push(stringTableIndex === -1 ? "null" : stringTable.getString(stringTableIndex));
      }

      return newArray;
    }
  );

  return {
    getName,
    getIsJS,
    getLib,
    getThreadOrigin,
    getLibMetadata,
    getTimingsForSidebar,
    getSourceViewStackLineInfo,
    getSourceViewLineTimings,
    getStackId,
  };
})();
