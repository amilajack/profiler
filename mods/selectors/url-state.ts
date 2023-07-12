/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "reselect";
import { getThreadsKey } from "~/components/FFP/profile-logic/profile-data";
import { ensureExists } from "~/components/FFP/utils/flow";
import { splitSearchString, stringsToRegExp } from "~/components/FFP/utils/string";

import type {
  ActiveTabSpecificProfileUrlState,
  CallTreeSummaryStrategy,
  FullProfileSpecificUrlState,
  ImplementationFilter,
  ProfileSpecificUrlState,
  Selector,
  StartEndRange,
  ThreadIndex,
  ThreadsKey,
  TimelineTrackOrganization,
  UrlState,
} from "~/components/FFP/types";

import type { BottomBoxTabSlug, TabSlug } from "~/components/FFP/app-logic/tabs-handling";
import { getView } from "./app";

/**
 * Various simple selectors into the UrlState.
 */
export const getUrlState: Selector<UrlState> = (state): UrlState => state.urlState;
export const getProfileSpecificState: Selector<ProfileSpecificUrlState> = (state) => getUrlState(state).profileSpecific;
export const getFullProfileSpecificState: Selector<FullProfileSpecificUrlState> = (state) =>
  getProfileSpecificState(state).full;
export const getActiveTabProfileSpecificState: Selector<ActiveTabSpecificProfileUrlState> = (state) =>
  getProfileSpecificState(state).activeTab;

export const getAllCommittedRanges: Selector<StartEndRange[]> = (state) =>
  getProfileSpecificState(state).committedRanges;
export const getImplementationFilter: Selector<ImplementationFilter> = (state) =>
  getProfileSpecificState(state).implementation;
export const getLastSelectedCallTreeSummaryStrategy: Selector<CallTreeSummaryStrategy> = (state) =>
  getProfileSpecificState(state).lastSelectedCallTreeSummaryStrategy;
export const getInvertCallstack: Selector<boolean> = (state) => getProfileSpecificState(state).invertCallstack;
export const getShowUserTimings: Selector<boolean> = (state) => getProfileSpecificState(state).showUserTimings;
export const getSourceViewFile: Selector<string | null> = (state) =>
  getProfileSpecificState(state).sourceView.sourceFile;
export const getSourceViewScrollGeneration: Selector<number> = (state) =>
  getProfileSpecificState(state).sourceView.scrollGeneration;
export const getIsCompareMode: Selector<boolean> = (state) => getProfileSpecificState(state).isCompareMode;
export const getTimelineTrackOrganization: Selector<TimelineTrackOrganization> = (state) =>
  getUrlState(state).timelineTrackOrganization;
export const getFetchRetryGeneration: Selector<number> = (state) => getProfileSpecificState(state).fetchRetryGeneration;
export const getIsProfilerLoading: Selector<boolean> = (state) => {
  const phase = getView(state).phase;
  return phase !== "DATA_LOADED" && phase !== "FATAL_ERROR";
};

/**
 * Raw search strings, before any splitting has been performed.
 */
export const getCurrentSearchString: Selector<string> = (state) => getProfileSpecificState(state).callTreeSearchString;
export const getMarkersSearchString: Selector<string> = (state) => getProfileSpecificState(state).markersSearchString;

export const getSelectedTab: Selector<TabSlug> = (state) => getUrlState(state).selectedTab;
export const getSelectedBottomBoxTab: Selector<BottomBoxTabSlug> = (state) => getUrlState(state).selectedBottomBoxTab;
export const getSelectedThreadIndexesOrNull: Selector<Set<ThreadIndex> | null> = (state) =>
  getProfileSpecificState(state).selectedThreads;
export const getSelectedThreadIndexes: Selector<Set<ThreadIndex>> = (state) =>
  ensureExists(getSelectedThreadIndexesOrNull(state), "Attempted to get a thread index before a profile was loaded.");
export const getSelectedThreadsKey: Selector<ThreadsKey> = (state) => getThreadsKey(getSelectedThreadIndexes(state));

/**
 * Search strings filter a thread to only samples that match the strings.
 */
export const getSearchStrings: Selector<string[] | null> = createSelector(getCurrentSearchString, splitSearchString);

export const getMarkersSearchStrings: Selector<string[] | null> = createSelector(
  getMarkersSearchString,
  splitSearchString
);

/**
 * A RegExp can be used for searching and filtering the thread's samples.
 */
export const getSearchStringsAsRegExp: Selector<RegExp | null> = createSelector(getSearchStrings, stringsToRegExp);

export const getMarkersSearchStringsAsRegExp: Selector<RegExp | null> = createSelector(
  getMarkersSearchStrings,
  stringsToRegExp
);

export const getIsBottomBoxOpen: Selector<boolean> = (state) => {
  return !!getProfileSpecificState(state).isBottomBoxOpenPerPanel["calltree"];
};
