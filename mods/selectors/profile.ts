/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "reselect";
import type { TabSlug } from "~/components/FFP/app-logic/tabs-handling";
import { getDefaultCategories } from "~/components/FFP/profile-logic/data-structures";
import { IPCMarkerCorrelations, correlateIPCMarkers } from "~/components/FFP/profile-logic/marker-data";
import { markerSchemaFrontEndOnly } from "~/components/FFP/profile-logic/marker-schema";
import { defaultTableViewOptions } from "~/components/FFP/reducers/profile-view";
import * as UrlState from "~/components/FFP/selectors/url-state";
import { assertExhaustiveCheck, ensureExists } from "~/components/FFP/utils/flow";

import type {
  ActiveTabProfileViewState,
  CategoryList,
  Counter,
  FullProfileViewState,
  IndexIntoCategoryList,
  InnerWindowID,
  LastNonShiftClickInformation,
  MarkerSchema,
  MarkerSchemaByName,
  Milliseconds,
  OriginsViewState,
  Page,
  PageList,
  PreviewSelection,
  Profile,
  ProfileMeta,
  ProfileViewState,
  ProfilerConfiguration,
  ProgressGraphData,
  SampleUnits,
  Selector,
  StartEndRange,
  State,
  SymbolicationStatus,
  TabID,
  TableViewOptions,
  Thread,
  TrackReference,
  VisualMetrics,
} from "~/components/FFP/types";

export const getProfileView: Selector<ProfileViewState> = (state) => state.profileView;
export const getFullProfileView: Selector<FullProfileViewState> = (state) => getProfileView(state).full;
export const getActiveTabProfileView: Selector<ActiveTabProfileViewState> = (state) => getProfileView(state).activeTab;
export const getOriginsProfileView: Selector<OriginsViewState> = (state) => getProfileView(state).origins;

/**
 * Profile View Options
 */
export const getProfileViewOptions: Selector<ProfileViewState["viewOptions"]> = (state) =>
  getProfileView(state).viewOptions;
export const getCurrentTableViewOptions: Selector<TableViewOptions> = (state) =>
  getProfileViewOptions(state).perTab[UrlState.getSelectedTab(state)] || defaultTableViewOptions;
export const getProfileRootRange: Selector<StartEndRange> = (state) => getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus: Selector<SymbolicationStatus> = (state) =>
  getProfileViewOptions(state).symbolicationStatus;
export const getScrollToSelectionGeneration: Selector<number> = (state) =>
  getProfileViewOptions(state).scrollToSelectionGeneration;
export const getFocusCallTreeGeneration: Selector<number> = (state) =>
  getProfileViewOptions(state).focusCallTreeGeneration;
export const getZeroAt: Selector<Milliseconds> = (state) => getProfileRootRange(state).start;

export const getCommittedRange: Selector<StartEndRange> = createSelector(
  getProfileRootRange,
  getZeroAt,
  UrlState.getAllCommittedRanges,
  (rootRange, zeroAt, committedRanges): StartEndRange => {
    if (committedRanges.length > 0) {
      let { start, end } = committedRanges[committedRanges.length - 1];
      start += zeroAt;
      end += zeroAt;
      return { start, end };
    }
    return rootRange;
  }
);

export const getMouseTimePosition: Selector<Milliseconds | null> = (state) =>
  getProfileViewOptions(state).mouseTimePosition;

export const getTableViewOptionSelectors: (arg1: TabSlug) => Selector<TableViewOptions> = (tab) => (state) => {
  const options = getProfileViewOptions(state).perTab[tab];
  return options || defaultTableViewOptions;
};

export const getPreviewSelection: Selector<PreviewSelection> = (state) => getProfileViewOptions(state).previewSelection;

/**
 * This selector returns the current range, taking into account the current
 * preview selection if any.
 */
export const getPreviewSelectionRange: Selector<StartEndRange> = createSelector(
  getCommittedRange,
  getPreviewSelection,
  (committedRange, previewSelection) => {
    if (previewSelection.hasSelection) {
      return {
        start: previewSelection.selectionStart,
        end: previewSelection.selectionEnd,
      };
    }
    return committedRange;
  }
);

/**
 * Profile
 */
export const getProfileOrNull: Selector<Profile | null> = (state) => getProfileView(state).profile;
export const getProfile: Selector<Profile> = (state) =>
  ensureExists(getProfileOrNull(state), "Tried to access the profile before it was loaded.");
export const getProfileInterval: Selector<Milliseconds> = (state) => getProfile(state).meta.interval;
export const getPageList = (state: State): PageList | null => getProfile(state).pages || null;
export const getDefaultCategory: Selector<IndexIntoCategoryList> = (state) =>
  getCategories(state).findIndex((c) => c.color === "grey");
export const getThreads: Selector<Thread[]> = (state) => getProfile(state).threads;
export const getThreadNames: Selector<string[]> = (state) => getProfile(state).threads.map((t) => t.name);
export const getLastNonShiftClick: Selector<LastNonShiftClickInformation | null> = (state) =>
  getProfileViewOptions(state).lastNonShiftClick;
export const getRightClickedTrack: Selector<TrackReference | null> = (state) =>
  getProfileViewOptions(state).rightClickedTrack;
export const getCounter: Selector<Counter[] | null> = (state) => getProfile(state).counters || null;
export const getMeta: Selector<ProfileMeta> = (state) => getProfile(state).meta;
export const getVisualMetricsOrNull: Selector<VisualMetrics | null> = (state) => getMeta(state).visualMetrics || null;
export const getVisualMetrics: Selector<VisualMetrics> = (state) =>
  ensureExists(getVisualMetricsOrNull(state), "Tried to access the visual metrics when it does not exist.");
export const getVisualProgress: Selector<ProgressGraphData[] | null> = (state) =>
  getVisualMetrics(state).VisualProgress;
export const getPerceptualSpeedIndexProgress: Selector<ProgressGraphData[] | null> = (state) =>
  getVisualMetrics(state).PerceptualSpeedIndexProgress ?? null;
export const getContentfulSpeedIndexProgress: Selector<ProgressGraphData[] | null> = (state) =>
  getVisualMetrics(state).ContentfulSpeedIndexProgress ?? null;
export const getProfilerConfiguration: Selector<ProfilerConfiguration | null | undefined> = (state) =>
  getMeta(state).configuration;
export const getProjectId: Selector<string> = (state) => getMeta(state).projectId;
export const getSampleCount: Selector<number> = (state) => getMeta(state).sampleCount;
export const getIsProfileEmpty: Selector<boolean> = (state) => {
  const profile = getProfileOrNull(state);
  if (!profile) return true;

  const { threads } = profile;
  if (threads.length === 0) return true;

  // Iterate through the threads and check for relevant data
  for (const thread of threads) {
    if (
      // Check if the thread has samples and a non-empty samples array
      (thread.samples && thread.samples.length > 0) ||
      // Check if the thread has markers and a non-empty markers array
      (thread.markers && thread.markers.length > 0)
    ) {
      // If any thread contains relevant data, the profile is not empty
      return false;
    }
  }

  return true;
};

// Get the marker schema that comes from the Gecko profile.
const getMarkerSchemaGecko: Selector<MarkerSchema[]> = (state) => getMeta(state).markerSchema;

// Get the samples table units. They can be different depending on their platform.
// See SampleUnits type definition for more information.
export const getSampleUnits: Selector<SampleUnits | undefined> = (state) => getMeta(state).sampleUnits;

/**
 * Firefox profiles will always have categories. However, imported profiles may not
 * contain default categories. In this case, provide a default list.
 */
export const getCategories: Selector<CategoryList> = createSelector(getProfile, (profile) => {
  const { categories } = profile.meta;
  return categories ? categories : getDefaultCategories();
});

// Combine the marker schema from Gecko and the front-end. This allows the front-end
// to generate markers such as the Jank markers, and display them.
export const getMarkerSchema: Selector<MarkerSchema[]> = createSelector(getMarkerSchemaGecko, (geckoSchema) => {
  const frontEndSchemaNames = new Set([...markerSchemaFrontEndOnly.map((schema) => schema.name)]);
  return [
    // Don't duplicate schema definitions that the front-end already has.
    ...geckoSchema.filter((schema) => !frontEndSchemaNames.has(schema.name)),
    ...markerSchemaFrontEndOnly,
  ];
});

export const getMarkerSchemaByName: Selector<MarkerSchemaByName> = createSelector(getMarkerSchema, (schemaList) => {
  const result = Object.create(null);
  for (const schema of schemaList) {
    result[schema.name] = schema;
  }
  return result;
});

export const getActiveTabID: Selector<TabID | null> = (state) => {
  const configuration = getProfilerConfiguration(state);
  if (configuration && configuration.activeTabID && configuration.activeTabID !== 0) {
    // activeTabID can be `0` and that means Firefox has failed to get
    // the TabID of the active tab. We are converting that `0` to
    // `null` here to explicitly indicate that we don't have that information.
    return configuration.activeTabID;
  }
  return null;
};

export const getIPCMarkerCorrelations: Selector<IPCMarkerCorrelations> = createSelector(
  getThreads,
  correlateIPCMarkers
);

/**
 * Returns an InnerWindowID -> Page map, so we can look up the page from inner
 * window id quickly. Returns null if there are no pages in the profile.
 */
export const getInnerWindowIDToPageMap: Selector<Map<InnerWindowID, Page> | null> = createSelector(
  getPageList,
  (pages) => {
    if (!pages) {
      // Return null if there are no pages.
      return null;
    }

    const innerWindowIDToPageMap: Map<InnerWindowID, Page> = new Map();
    for (const page of pages) {
      innerWindowIDToPageMap.set(page.innerWindowID, page);
    }

    return innerWindowIDToPageMap;
  }
);

/**
 * Get the pages array and construct a Map of pages that we can use to get the
 * relationships of tabs. The constructed map is `Map<TabID,Page[]>`.
 * The TabID we use in that map is the TabID of the topmost frame. That corresponds
 * to a tab. So we had to figure out the outer most TabID of each element and
 * constructed an intermediate map to quickly find that value.
 */
export const getPagesMap: Selector<Map<TabID, Page[]> | null> = createSelector(
  getPageList,
  getInnerWindowIDToPageMap,
  (pageList, innerWindowIDToPageMap) => {
    if (pageList === null || innerWindowIDToPageMap === null || pageList.length === 0) {
      // There is no data, return null
      return null;
    }

    // Construction of TabID to Page array map.
    const pageMap: Map<TabID, Page[]> = new Map();
    const appendPageMap = (tabID: number, page: Page | number) => {
      const tabEntry = pageMap.get(tabID);
      if (tabEntry === undefined) {
        // @ts-ignore-next-line
        pageMap.set(tabID, [page]);
      } else {
        // @ts-ignore-next-line
        tabEntry.push(page);
      }
    };

    for (const page of pageList) {
      if (page.embedderInnerWindowID === undefined) {
        // This is the top most page, which means the web page itself.
        appendPageMap(page.tabID, page.innerWindowID);
      } else {
        // This is an iframe, we should find its parent to see find top most
        // TabID, which is the tab ID for our case.
        const getTopMostParent = (item: Page): Page => {
          // We are using a Map to make this more performant.
          // It should be 1-2 loop iteration in 99% of the cases.
          const parent = innerWindowIDToPageMap.get(item.embedderInnerWindowID);
          if (parent !== undefined) {
            return getTopMostParent(parent);
          }
          return item;
        };

        const parent = getTopMostParent(page);
        // Now we have the top most parent. We can append the pageMap.
        appendPageMap(parent.tabID, page);
      }
    }

    return pageMap;
  }
);

/**
 * Return the relevant page array for active tab.
 * This is useful for operations that require the whole Page object instead of
 * only the InnerWindowIDs. If you only need the InnerWindowID array of the active
 * tab, please use getRelevantInnerWindowIDsForActiveTab selector. Returns
 * _emptyRelevantPagesForActiveTab array as empty array to return the same array
 * every time the selector inputs are invalidated. That eliminates the re-render
 * of the components.
 */
const _emptyRelevantPagesForActiveTab: Page[] = [];
export const getRelevantPagesForActiveTab: Selector<Page[]> = createSelector(
  getPagesMap,
  getActiveTabID,
  (pagesMap, activeTabID) => {
    if (pagesMap === null || pagesMap.size === 0 || activeTabID === null) {
      // Return an empty array if we want to see everything or that data is not there.
      return _emptyRelevantPagesForActiveTab;
    }

    return pagesMap.get(activeTabID) ?? _emptyRelevantPagesForActiveTab;
  }
);

/**
 * Get the page map and return the set of InnerWindowIDs by its parent TabID.
 * This is a helper selector for other selectors so we can easily get the relevant
 * InnerWindowID set of a parent TabID. Set is useful for faster
 * filtering operations.
 */
export const getInnerWindowIDSetByTabID: Selector<Map<TabID, Set<InnerWindowID>> | null> = createSelector(
  getPagesMap,
  (pagesMap) => {
    if (pagesMap === null || pagesMap.size === 0) {
      // There is no data, return null
      return null;
    }

    const innerWindowIDSetByTabID = new Map();
    for (const [tabID, pages] of pagesMap) {
      innerWindowIDSetByTabID.set(tabID, new Set(pages.map((page) => page.innerWindowID)));
    }
    return innerWindowIDSetByTabID;
  }
);

/**
 * Get the page map and the active tab ID, then return the InnerWindowIDs that
 * are related to this active tab. This is a fairly simple map element access.
 * The `TabID -> Set<InnerWindowID>` construction happens inside
 * the getInnerWindowIDSetByTabID selector.
 * This function returns the Set all the time even though we are not in the active
 * tab view at the moment. Ideally you should use the wrapper
 * getRelevantInnerWindowIDsForCurrentTab function if you want to do something
 * inside the active tab view. This is needed for only viewProfile function to
 * calculate the hidden tracks during page load, even though we are not in the
 * active tab view.
 */
export const getRelevantInnerWindowIDsForActiveTab: Selector<Set<InnerWindowID>> = createSelector(
  getInnerWindowIDSetByTabID,
  getActiveTabID,
  (pagesMap, activeTabID) => {
    if (pagesMap === null || pagesMap.size === 0 || activeTabID === null) {
      // Return an empty set if we want to see everything or that data is not there.
      return new Set();
    }

    const pageSet = pagesMap.get(activeTabID);
    return pageSet ?? new Set();
  }
);

/**
 * A simple wrapper for getRelevantInnerWindowIDsForActiveTab.
 * It returns an empty Set if ctxId is null, and returns the real Set if
 * ctxId is assigned already. We should usually use this instead of the
 * wrapped function. But the wrapped function is helpful to calculate the hidden
 * tracks by active tab view during the first page load(inside viewProfile function).
 */
export const getRelevantInnerWindowIDsForCurrentTab: Selector<Set<InnerWindowID>> = createSelector(
  UrlState.getTimelineTrackOrganization,
  getRelevantInnerWindowIDsForActiveTab,
  (timelineTrackOrganization, relevantInnerWindowIDs) => {
    switch (timelineTrackOrganization.type) {
      case "active-tab":
        return relevantInnerWindowIDs;
      case "full":
      case "origins":
        return new Set();
      default:
        throw assertExhaustiveCheck(timelineTrackOrganization, "Unhandled timelineTrackOrganization case");
    }
  }
);

/** Does the profile have implementation data? */
export const getProfileUsesFrameImplementation: Selector<boolean> = (state) => {
  const { profile } = state.profileView;
  if (!profile) {
    return true;
  }
  return profile.meta.doesNotUseFrameImplementation !== true;
};

/* Hide the stack type of frames in context menus? */
export const getProfileUsesMultipleStackTypes: Selector<boolean> = (state) => {
  const { profile } = state.profileView;
  if (!profile) {
    return true;
  }
  return profile.meta.usesOnlyOneStackType !== true;
};
