/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "reselect";

import { getProfileViewOptions } from "~/components/FFP/selectors/profile";

import type { ThreadsKey, CallNodePath, Selector } from "~/components/FFP/types";

export type RightClickedCallNodeInfo = {
  readonly threadsKey: ThreadsKey;
  readonly callNodePath: CallNodePath;
};

export const getRightClickedCallNodeInfo: Selector<RightClickedCallNodeInfo | null> = createSelector(
  getProfileViewOptions,
  (viewOptions) => viewOptions.rightClickedCallNode
);
