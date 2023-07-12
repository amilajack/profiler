/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "reselect";

import * as CallTree from "~/components/FFP/profile-logic/call-tree";
import * as Cpu from "~/components/FFP/profile-logic/cpu";
import * as ProfileData from "~/components/FFP/profile-logic/profile-data";
import * as ProfileSelectors from "~/components/FFP/selectors/profile";
import * as UrlState from "~/components/FFP/selectors/url-state";
import { assertExhaustiveCheck, ensureExists, getFirstItemFromSet } from "~/components/FFP/utils/flow";

import type {
  CallTreeSummaryStrategy,
  NativeAllocationsTable,
  SamplesLikeTable,
  SamplesTable,
  Selector,
  StartEndRange,
  Thread,
  ThreadIndex,
  ThreadsKey,
  ThreadViewOptions,
  WeightType,
} from "~/components/FFP/types";

import type { UniqueStringArray } from "~/components/FFP/utils/unique-string-array";

import { mergeThreads } from "~/components/FFP/profile-logic/merge-compare";
import { defaultThreadViewOptions } from "~/components/FFP/reducers/profile-view";

/**
 * Infer the return type from the getThreadSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type ThreadSelectorsPerThread = ReturnType<typeof getThreadSelectorsPerThread>;

/**
 * Create the selectors for a thread that have to do with an entire thread. This includes
 * the general filtering pipeline for threads.
 */
export function getThreadSelectorsPerThread(threadIndexes: Set<ThreadIndex>, threadsKey: ThreadsKey) {
  const getMergedThread: Selector<Thread> = createSelector(ProfileSelectors.getProfile, (profile) =>
    mergeThreads([...threadIndexes].map((threadIndex) => profile.threads[threadIndex]))
  );
  /**
   * Either return the raw thread from the profile, or merge several raw threads
   * together.
   */
  const getThread: Selector<Thread> = (state) =>
    threadIndexes.size === 1
      ? ProfileSelectors.getProfile(state).threads[ensureExists(getFirstItemFromSet(threadIndexes))]
      : getMergedThread(state);
  const getStringTable: Selector<UniqueStringArray> = (state) => getThread(state).stringTable;
  const getSamplesTable: Selector<SamplesTable> = (state) => getThread(state).samples;
  const getNativeAllocations: Selector<NativeAllocationsTable | undefined> = (state) =>
    getThread(state).nativeAllocations;
  const getThreadRange: Selector<StartEndRange> = (state) =>
    // This function is already memoized in profile-data.js, so we don't need to
    // memoize it here with `createSelector`.
    ProfileData.getTimeRangeForThread(getThread(state), ProfileSelectors.getProfileInterval(state));

  /**
   * This selector gets the weight type from the thread.samples table, but
   * does not get it for others like the Native Allocations table. The call
   * tree uses the getWeightTypeForCallTree selector.
   */
  const getSamplesWeightType: Selector<WeightType> = (state) => getSamplesTable(state).weightType || "samples";

  /**
   * The first per-thread selectors filter out and transform a thread based on user's
   * interactions. The transforms are order dependendent.
   *
   * 1. Unfiltered getThread - The first selector gets the unmodified original thread.
   * 2. CPU - New samples table with processed threadCPUDelta values.
   * 3. Tab - New samples table with only samples that belongs to the active tab.
   * 4. Range - New samples table with only samples in the committed range.
   * 5. Transform - Apply the transform stack that modifies the stacks and samples.
   * 6. Implementation - Modify stacks and samples to only show a single implementation.
   * 7. Search - Exclude samples that don't include some text in the stack.
   * 8. Preview - Only include samples that are within a user's preview range selection.
   */

  const getCPUProcessedThread: Selector<Thread> = createSelector(
    getThread,
    ProfileSelectors.getSampleUnits,
    ProfileSelectors.getProfileInterval,
    (thread, sampleUnits, profileInterval) =>
      thread.samples === null || thread.samples.threadCPUDelta === undefined || !sampleUnits
        ? thread
        : Cpu.processThreadCPUDelta(thread, sampleUnits, profileInterval)
  );

  const getTabFilteredThread: Selector<Thread> = createSelector(
    getCPUProcessedThread,
    ProfileSelectors.getRelevantInnerWindowIDsForCurrentTab,
    (thread, relevantPages) => {
      if (relevantPages.size === 0) {
        // If this set doesn't have any relevant page, just return the whole thread.
        return thread;
      }
      return ProfileData.filterThreadByTab(thread, relevantPages);
    }
  );

  const getRangeFilteredThread: Selector<Thread> = createSelector(
    getTabFilteredThread,
    ProfileSelectors.getCommittedRange,
    (thread, range) => {
      const { start, end } = range;
      return ProfileData.filterThreadSamplesToRange(thread, start, end);
    }
  );

  const _getImplementationFilteredThread: Selector<Thread> = createSelector(
    getRangeFilteredThread, // getRangeAndTransformFilteredThread,
    UrlState.getImplementationFilter,
    ProfileSelectors.getDefaultCategory,
    ProfileSelectors.getCategories,
    ProfileData.filterThreadByImplementation
  );

  const _getImplementationAndSearchFilteredThread: Selector<Thread> = createSelector(
    _getImplementationFilteredThread,
    UrlState.getSearchStrings,
    (thread, searchStrings) => {
      return ProfileData.filterThreadToSearchStrings(thread, searchStrings);
    }
  );

  const getFilteredThread: Selector<Thread> = createSelector(
    _getImplementationAndSearchFilteredThread,
    UrlState.getInvertCallstack,
    ProfileSelectors.getDefaultCategory,
    (thread, shouldInvertCallstack, defaultCategory) => {
      return shouldInvertCallstack ? ProfileData.invertCallstack(thread, defaultCategory) : thread;
    }
  );

  const getPreviewFilteredThread: Selector<Thread> = createSelector(
    getFilteredThread,
    // ProfileSelectors.getPreviewSelection,
    (thread): Thread => {
      // if (!previewSelection.hasSelection) {
      //   return thread;
      // }
      // const { selectionStart, selectionEnd } = previewSelection;
      // Since we are only plotting flame graphs which are not time relative,
      // ignore `previewSelection` and return threads for the full range.
      // The correct solution would be to make this `Selector` take
      // into account `selectedTab` and conditionally filter threads.
      return ProfileData.filterThreadSamplesToRange(thread, 0, 1);
    }
  );

  /**
   * The CallTreeSummaryStrategy determines how the call tree summarizes the
   * the current thread. By default, this is done by timing, but other
   * methods are also available. This selectors also ensures that the current
   * thread supports the last selected call tree summary strategy.
   */
  const getCallTreeSummaryStrategy: Selector<CallTreeSummaryStrategy> = createSelector(
    getThread,
    UrlState.getLastSelectedCallTreeSummaryStrategy,
    (thread, lastSelectedCallTreeSummaryStrategy) => {
      switch (lastSelectedCallTreeSummaryStrategy) {
        case "timing":
          if (thread.samples.length === 0 && thread.nativeAllocations && thread.nativeAllocations.length > 0) {
            // This is a profile with no samples, but with native allocations available.
            return "native-allocations";
          }
          break;
        case "js-allocations":
          if (!thread.jsAllocations) {
            // Attempting to view a thread with no JS allocations, switch back to timing.
            return "timing";
          }
          break;
        case "native-allocations":
        case "native-retained-allocations":
        case "native-deallocations-sites":
        case "native-deallocations-memory":
          if (!thread.nativeAllocations) {
            // Attempting to view a thread with no native allocations, switch back
            // to timing.
            return "timing";
          }
          break;
        default:
          assertExhaustiveCheck(lastSelectedCallTreeSummaryStrategy, "Unhandled call tree sumary strategy.");
      }
      return lastSelectedCallTreeSummaryStrategy;
    }
  );

  const getUnfilteredSamplesForCallTree: Selector<SamplesLikeTable> = createSelector(
    getThread,
    getCallTreeSummaryStrategy,
    CallTree.extractSamplesLikeTable
  );

  const getFilteredSamplesForCallTree: Selector<SamplesLikeTable> = createSelector(
    getFilteredThread,
    getCallTreeSummaryStrategy,
    CallTree.extractSamplesLikeTable
  );

  const getPreviewFilteredSamplesForCallTree: Selector<SamplesLikeTable> = createSelector(
    getPreviewFilteredThread,
    getCallTreeSummaryStrategy,
    CallTree.extractSamplesLikeTable
  );

  /**
   * This selector returns the offset to add to a sampleIndex when accessing the
   * base thread, if your thread is a range filtered thread (all but the base
   * `getThread` or the last `getPreviewFilteredThread`).
   */
  const getSampleIndexOffsetFromCommittedRange: Selector<number> = createSelector(
    getUnfilteredSamplesForCallTree,
    ProfileSelectors.getCommittedRange,
    (samples, { start, end }) => {
      const [beginSampleIndex] = ProfileData.getSampleIndexRangeForSelection(samples, start, end);
      return beginSampleIndex;
    }
  );

  /**
   * This selector returns the offset to add to a sampleIndex when accessing the
   * base thread, if your thread is the preview filtered thread.
   */
  const getSampleIndexOffsetFromPreviewRange: Selector<number> = createSelector(
    getFilteredSamplesForCallTree,
    ProfileSelectors.getPreviewSelection,
    getSampleIndexOffsetFromCommittedRange,
    (samples, previewSelection, sampleIndexFromCommittedRange) => {
      if (!previewSelection.hasSelection) {
        return sampleIndexFromCommittedRange;
      }

      // Since we are only plotting flame graphs which are not time relative,
      // ignore `previewSelection` and return threads for the full range.
      // The correct solution would be to make this `Selector` take
      // into account `selectedTab` and conditionally filter threads.
      const [beginSampleIndex] = ProfileData.getSampleIndexRangeForSelection(samples, 0, 1);

      return sampleIndexFromCommittedRange + beginSampleIndex;
    }
  );

  const getFriendlyThreadName: Selector<string> = createSelector(
    ProfileSelectors.getThreads,
    getThread,
    ProfileData.getFriendlyThreadName
  );

  const getThreadProcessDetails: Selector<string> = createSelector(
    getThread,
    getFriendlyThreadName,
    ProfileData.getThreadProcessDetails
  );

  const getViewOptions: Selector<ThreadViewOptions> = (state) =>
    ProfileSelectors.getProfileViewOptions(state).perThread[threadsKey] || defaultThreadViewOptions;

  /**
   * Check to see if there are any JS allocations for this thread. This way we
   * can display a custom thread.
   */
  const getHasJsAllocations: Selector<boolean> = (state) => Boolean(getThread(state).jsAllocations);

  /**
   * Check to see if there are any JS allocations for this thread. This way we
   * can display a custom thread.
   */
  const getHasNativeAllocations: Selector<boolean> = (state) => Boolean(getThread(state).nativeAllocations);

  /**
   * We can only compute the retained memory in the versions of the native allocations
   * format that provide the memory address. The earlier versions did not have
   * balanced allocations and deallocations.
   */
  const getCanShowRetainedMemory: Selector<boolean> = (state) => {
    const nativeAllocations = getNativeAllocations(state);
    if (!nativeAllocations) {
      return false;
    }
    return "memoryAddress" in nativeAllocations;
  };

  return {
    getThread,
    getStringTable,
    getSamplesTable,
    getSamplesWeightType,
    getNativeAllocations,
    getThreadRange,
    getFilteredThread,
    getRangeFilteredThread,
    getPreviewFilteredThread,
    getUnfilteredSamplesForCallTree,
    getFilteredSamplesForCallTree,
    getPreviewFilteredSamplesForCallTree,
    getSampleIndexOffsetFromCommittedRange,
    getSampleIndexOffsetFromPreviewRange,
    getFriendlyThreadName,
    getThreadProcessDetails,
    getViewOptions,
    getHasJsAllocations,
    getHasNativeAllocations,
    getCanShowRetainedMemory,
    getCPUProcessedThread,
    getTabFilteredThread,
    getCallTreeSummaryStrategy,
  };
}
