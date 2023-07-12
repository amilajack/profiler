/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineReducers } from "redux";
import { tabSlugs } from "~/components/FFP/app-logic/tabs-handling";

import type {
  AppState,
  AppViewState,
  CssPixels,
  IsOpenPerPanelState,
  Reducer,
  ThreadsKey,
  UrlSetupPhase,
} from "~/components/FFP/types";

const view: Reducer<AppViewState> = (state = { phase: "INITIALIZING" }, action) => {
  switch (action.type) {
    case "TEMPORARY_ERROR":
      return {
        phase: "INITIALIZING",
        additionalData: {
          message: action.error.message,
          attempt: action.error.attempt,
        },
      };
    case "FATAL_ERROR":
      return { phase: "FATAL_ERROR", error: action.error };
    case "WAITING_FOR_PROFILE_FROM_BROWSER":
    case "WAITING_FOR_PROFILE_FROM_URL":
    case "WAITING_FOR_PROFILE_FROM_FILE":
      return { phase: "INITIALIZING" };
    case "ROUTE_NOT_FOUND":
      return { phase: "ROUTE_NOT_FOUND" };
    case "REVERT_TO_PRE_PUBLISHED_STATE":
    case "SANITIZED_PROFILE_PUBLISHED":
      return { phase: "TRANSITIONING_FROM_STALE_PROFILE" };
    // case "PROFILE_LOADED":
    //   return { phase: "PROFILE_LOADED" };
    case "DATA_RELOAD":
      return { phase: "DATA_RELOAD" };
    case "PROFILE_LOADED":
    case "RECEIVE_ZIP_FILE":
    case "VIEW_FULL_PROFILE":
    case "VIEW_ORIGINS_PROFILE":
    case "VIEW_ACTIVE_TAB_PROFILE":
      return { phase: "DATA_LOADED" };
    default:
      return state;
  }
};

const urlSetupPhase: Reducer<UrlSetupPhase> = (state = "initial-load", action) => {
  switch (action.type) {
    case "START_FETCHING_PROFILES":
      return "loading-profile";
    case "ROUTE_NOT_FOUND":
    case "FATAL_ERROR":
    case "URL_SETUP_DONE":
      return "done";
    default:
      return state;
  }
};

const hasZoomedViaMousewheel: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case "HAS_ZOOMED_VIA_MOUSEWHEEL": {
      return true;
    }
    default:
      return state;
  }
};

function _getSidebarInitialState() {
  const state: Record<string, any> = {};
  tabSlugs.forEach((tabSlug) => (state[tabSlug] = false));
  state.calltree = true;
  state["marker-table"] = true;
  return state;
}

const isSidebarOpenPerPanel: Reducer<IsOpenPerPanelState> = (state = _getSidebarInitialState(), action) => {
  switch (action.type) {
    case "CHANGE_SIDEBAR_OPEN_STATE": {
      const { tab, isOpen } = action;
      // Due to how this action will be dispatched we'll always have the value
      // changed so we don't need the performance optimization of checking the
      // stored value against the new value.
      return {
        ...state,
        [tab]: isOpen,
      };
    }
    default:
      return state;
  }
};

/**
 * The panels that make up the timeline, details view, and sidebar can all change
 * their sizes depending on the state that is fed to them. In order to control
 * the invalidations of this sizing information, provide a "generation" value that
 * increases monotonically for any change that potentially changes the sizing of
 * any of the panels. This provides a mechanism for subscribing components to
 * deterministically update their sizing correctly.
 */
const panelLayoutGeneration: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case "INCREMENT_PANEL_LAYOUT_GENERATION":
    // Sidebar: (fallthrough)
    case "CHANGE_SIDEBAR_OPEN_STATE":
    // Timeline: (fallthrough)
    case "HIDE_GLOBAL_TRACK":
    case "SHOW_ALL_TRACKS":
    case "SHOW_PROVIDED_TRACKS":
    case "HIDE_PROVIDED_TRACKS":
    case "SHOW_GLOBAL_TRACK":
    case "SHOW_GLOBAL_TRACK_INCLUDING_LOCAL_TRACKS":
    case "ISOLATE_PROCESS":
    case "ISOLATE_PROCESS_MAIN_THREAD":
    case "HIDE_LOCAL_TRACK":
    case "SHOW_LOCAL_TRACK":
    case "ISOLATE_LOCAL_TRACK":
    case "TOGGLE_RESOURCES_PANEL":
    case "ENABLE_EXPERIMENTAL_CPU_GRAPHS":
    case "ENABLE_EXPERIMENTAL_PROCESS_CPU_TRACKS":
    // Committed range changes: (fallthrough)
    case "COMMIT_RANGE":
    case "POP_COMMITTED_RANGES":
    // Bottom box: (fallthrough)
    case "UPDATE_BOTTOM_BOX":
    case "CLOSE_BOTTOM_BOX_FOR_TAB":
      return state + 1;
    default:
      return state;
  }
};

const trackThreadHeights: Reducer<Partial<Record<ThreadsKey, CssPixels>>> = (state = {}, action) => {
  switch (action.type) {
    case "UPDATE_TRACK_THREAD_HEIGHT": {
      const newState = { ...state };
      newState[action.threadsKey] = action.height;
      return newState;
    }
    default:
      return state;
  }
};

/**
 * Signals which categories are opened by default in the sidebar per type
 */
const sidebarOpenCategories: Reducer<Map<string, Set<number>>> = (
  openCats: Map<string, Set<number>> | null | undefined = new Map(),
  action
) => {
  switch (action.type) {
    case "TOGGLE_SIDEBAR_OPEN_CATEGORY": {
      const newOpenCats = new Map(openCats);
      let openCatSet = newOpenCats.get(action.kind);
      if (openCatSet === undefined) {
        openCatSet = new Set<number>();
      }
      if (openCatSet.has(action.category)) {
        openCatSet.delete(action.category);
      } else {
        openCatSet.add(action.category);
      }
      newOpenCats.set(action.kind, openCatSet);
      return newOpenCats;
    }
    default:
      return openCats as Map<string, Set<number>>;
  }
};

const isExpandedMode: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case "TOGGLE_EXPANDED_MODE":
      return action.isExpanded;
    default:
      return state;
  }
};

const appStateReducer: Reducer<AppState> = combineReducers({
  view,
  urlSetupPhase,
  hasZoomedViaMousewheel,
  isSidebarOpenPerPanel,
  panelLayoutGeneration,
  trackThreadHeights,
  sidebarOpenCategories,
  isExpandedMode,
});

export default appStateReducer;
