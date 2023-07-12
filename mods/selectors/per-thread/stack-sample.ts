/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "reselect";
import * as CallTree from "~/components/FFP/profile-logic/call-tree";
import * as FlameGraph from "~/components/FFP/profile-logic/flame-graph";
import { getLineTimings, getStackLineInfo } from "~/components/FFP/profile-logic/line-timings";
import * as ProfileData from "~/components/FFP/profile-logic/profile-data";
import * as StackTiming from "~/components/FFP/profile-logic/stack-timing";
import * as ProfileSelectors from "~/components/FFP/selectors/profile";
import { getRightClickedCallNodeInfo } from "~/components/FFP/selectors/right-clicked-call-node";
import * as UrlState from "~/components/FFP/selectors/url-state";
import { PathSet } from "~/components/FFP/utils/path";

import type {
  CallNodeInfo,
  CallNodePath,
  IndexIntoCallNodeTable,
  IndexIntoCategoryList,
  IndexIntoSamplesTable,
  LineTimings,
  SelectedState,
  Selector,
  StackLineInfo,
  StartEndRange,
  Thread,
  ThreadIndex,
  ThreadsKey,
  TracedTiming,
  WeightType,
} from "~/components/FFP/types";

import type { ThreadSelectorsPerThread } from "~/components/FFP/selectors/per-thread/thread";

/**
 * Infer the return type from the getStackAndSampleSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type StackAndSampleSelectorsPerThread = ReturnType<typeof getStackAndSampleSelectorsPerThread>;

/**
 * Create the selectors for a thread that have to do with either stacks or samples.
 */
export function getStackAndSampleSelectorsPerThread(
  threadSelectors: ThreadSelectorsPerThread,
  threadIndexes: Set<ThreadIndex>,
  threadsKey: ThreadsKey
) {
  const getCallNodeInfo: Selector<CallNodeInfo> = createSelector(
    threadSelectors.getFilteredThread,
    ProfileSelectors.getDefaultCategory,
    ({ stackTable, frameTable, funcTable }: Thread, defaultCategory: IndexIntoCategoryList): CallNodeInfo => {
      return ProfileData.getCallNodeInfo(stackTable, frameTable, funcTable, defaultCategory);
    }
  );

  const getSourceViewStackLineInfo: Selector<StackLineInfo | null> = createSelector(
    threadSelectors.getFilteredThread,
    UrlState.getSourceViewFile,
    UrlState.getInvertCallstack,
    (
      { stackTable, frameTable, funcTable, stringTable }: Thread,
      sourceViewFile,
      invertCallStack
    ): StackLineInfo | null => {
      if (sourceViewFile === null) {
        return null;
      }
      return getStackLineInfo(
        stackTable,
        frameTable,
        funcTable,
        stringTable.indexForString(sourceViewFile),
        invertCallStack
      );
    }
  );

  const getSelectedCallNodePath: Selector<CallNodePath> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions): CallNodePath => threadViewOptions.selectedCallNodePath
  );

  const getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> = createSelector(
    getCallNodeInfo,
    getSelectedCallNodePath,
    (callNodeInfo, callNodePath) => {
      return ProfileData.getCallNodeIndexFromPath(callNodePath, callNodeInfo.callNodeTable);
    }
  );

  const getExpandedCallNodePaths: Selector<PathSet> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions) => threadViewOptions.expandedCallNodePaths
  );

  const getExpandedCallNodeIndexes: Selector<Array<IndexIntoCallNodeTable | null>> = createSelector(
    getCallNodeInfo,
    getExpandedCallNodePaths,
    ({ callNodeTable }, callNodePaths) =>
      ProfileData.getCallNodeIndicesFromPaths(Array.from(callNodePaths), callNodeTable)
  );

  const getSamplesSelectedStatesInFilteredThread: Selector<null | SelectedState[]> = createSelector(
    threadSelectors.getFilteredThread,
    threadSelectors.getTabFilteredThread,
    getCallNodeInfo,
    getSelectedCallNodeIndex,
    (thread, tabFilteredThread, { callNodeTable, stackIndexToCallNodeIndex }, selectedCallNode) => {
      if (thread.isJsTracer) {
        // This is currently to slow to compute in JS Tracer threads.
        return null;
      }
      const sampleIndexToCallNodeIndex = ProfileData.getSampleIndexToCallNodeIndex(
        thread.samples.stack,
        stackIndexToCallNodeIndex
      );
      const activeTabFilteredCallNodeIndex = ProfileData.getSampleIndexToCallNodeIndex(
        tabFilteredThread.samples.stack,
        stackIndexToCallNodeIndex
      );
      return ProfileData.getSamplesSelectedStates(
        callNodeTable,
        sampleIndexToCallNodeIndex,
        activeTabFilteredCallNodeIndex,
        selectedCallNode
      );
    }
  );

  const getFilteredCallNodeMaxDepth: Selector<number> = createSelector(
    threadSelectors.getFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepth
  );

  const getPreviewFilteredCallNodeMaxDepth: Selector<number> = createSelector(
    threadSelectors.getPreviewFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepth
  );

  /**
   * When computing the call tree, a "samples" table is used, which
   * can represent a variety of formats with different weight types.
   * This selector uses that table's weight type if it exists, or
   * defaults to samples, which the Gecko Profiler outputs by default.
   */
  const getWeightTypeForCallTree: Selector<WeightType> = createSelector(
    // The weight type is not changed by the filtering done on the profile.
    threadSelectors.getUnfilteredSamplesForCallTree,
    (samples) => samples.weightType || "samples"
  );

  const getCallTreeCountsAndSummary: Selector<CallTree.CallTreeCountsAndSummary> = createSelector(
    threadSelectors.getPreviewFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileSelectors.getProfileInterval,
    UrlState.getInvertCallstack,
    CallTree.computeCallTreeCountsAndSummary
  );

  const getCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    ProfileSelectors.getProfileInterval,
    getCallNodeInfo,
    ProfileSelectors.getCategories,
    UrlState.getImplementationFilter,
    getCallTreeCountsAndSummary,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getSourceViewLineTimings: Selector<LineTimings> = createSelector(
    getSourceViewStackLineInfo,
    threadSelectors.getPreviewFilteredSamplesForCallTree,
    getLineTimings
  );

  const getTracedTiming: Selector<TracedTiming | null> = createSelector(
    threadSelectors.getFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileSelectors.getProfileInterval,
    UrlState.getInvertCallstack,
    CallTree.computeTracedTiming
  );

  const getStackTimingByDepth: Selector<StackTiming.StackTimingByDepth> = createSelector(
    threadSelectors.getFilteredSamplesForCallTree,
    getCallNodeInfo,
    getFilteredCallNodeMaxDepth,
    ProfileSelectors.getProfileInterval,
    StackTiming.getStackTimingByDepth
  );

  const getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    getCallTreeCountsAndSummary,
    FlameGraph.getFlameGraphTiming
  );

  const getRightClickedCallNodeIndex: Selector<null | IndexIntoCallNodeTable> = createSelector(
    getRightClickedCallNodeInfo,
    getCallNodeInfo,
    (rightClickedCallNodeInfo, { callNodeTable }) => {
      if (rightClickedCallNodeInfo !== null && threadsKey === rightClickedCallNodeInfo.threadsKey) {
        return ProfileData.getCallNodeIndexFromPath(rightClickedCallNodeInfo.callNodePath, callNodeTable);
      }

      return null;
    }
  );

  return {
    getWeightTypeForCallTree,
    getCallNodeInfo,
    getSourceViewStackLineInfo,
    getSelectedCallNodePath,
    getSelectedCallNodeIndex,
    getExpandedCallNodePaths,
    getExpandedCallNodeIndexes,
    getSamplesSelectedStatesInFilteredThread,
    getCallTree,
    getSourceViewLineTimings,
    getTracedTiming,
    getStackTimingByDepth,
    getFilteredCallNodeMaxDepth,
    getPreviewFilteredCallNodeMaxDepth,
    getFlameGraphTiming,
    getRightClickedCallNodeIndex,
  };
}
