/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BottomBoxTabSlug, TabSlug } from "~/components/FFP/app-logic/tabs-handling";
import { getSelectedTab } from "~/components/FFP/selectors";
import { Action, ThunkAction } from "~/components/FFP/types";

export function changeSelectedTab(selectedTab: TabSlug): ThunkAction<void> {
  return (dispatch, getState) => {
    const previousTab = getSelectedTab(getState());
    if (previousTab !== selectedTab) {
      dispatch({
        type: "CHANGE_SELECTED_TAB",
        selectedTab,
      });
    }
  };
}

export function changeSelectedBottomBoxTab(selectedBottomBoxTab: BottomBoxTabSlug): Action {
  return {
    type: "CHANGE_SELECTED_BOTTOM_BOX_TAB",
    selectedBottomBoxTab,
  };
}

export function changeProfilesToCompare(profiles: string[]): Action {
  return {
    type: "CHANGE_PROFILES_TO_COMPARE",
    profiles,
  };
}

/**
 * The viewport component provides a hint to use shift to zoom scroll. The first
 * time a user does this, the hint goes away.
 */
export function setHasZoomedViaMousewheel() {
  return { type: "HAS_ZOOMED_VIA_MOUSEWHEEL" };
}

export function changeSidebarOpenState(isOpen: boolean): Action {
  // FFP tracks sidebar state based on current tab. In our case, we want
  // a global state and therefore hardcode the tab name to "calltree".
  return { type: "CHANGE_SIDEBAR_OPEN_STATE", tab: "calltree", isOpen };
}

export function retryProfileQuery(): Action {
  return { type: "RETRY_PROFILE_QUERY" };
}
