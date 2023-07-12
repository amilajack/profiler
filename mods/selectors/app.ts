/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { AppState, AppViewState, Selector } from "~/components/FFP/types";

export const getApp: Selector<AppState> = (state: any) => state.app;
export const getView: Selector<AppViewState> = (state) => getApp(state).view;
export const getHasZoomedViaMousewheel: Selector<boolean> = (state: any) => {
  return getApp(state).hasZoomedViaMousewheel;
};
export const getIsSidebarOpen: Selector<boolean> = (state) =>
  // FFP tracks sidebar state based on current tab. In our case, we want
  // a global state and therefore hardcode the tab name to "calltree".
  !!getApp(state).isSidebarOpenPerPanel["calltree"];

export const getPanelLayoutGeneration: Selector<number> = (state: any) => getApp(state).panelLayoutGeneration;

export const getIsExpandedMode: Selector<boolean> = (state) => getApp(state).isExpandedMode;
