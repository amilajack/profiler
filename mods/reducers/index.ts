/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import profileView from "~/components/FFP/reducers/profile-view";
import app from "~/components/FFP/reducers/app";
import urlState from "~/components/FFP/reducers/url-state";
import code from "~/components/FFP/reducers/code";
import { combineReducers } from "redux";
import type { Reducer, State } from "~/components/FFP/types";

/**
 * This function provides a mechanism to swap out to an old state that we have
 * retained.
 */
const wrapReducerInResetter = (regularRootReducer: Reducer<State>): Reducer<State> => {
  return (state, action) => {
    switch (action.type) {
      case "REVERT_TO_PRE_PUBLISHED_STATE":
        return action.prePublishedState;
      default:
        return regularRootReducer(state, action);
    }
  };
};

const rootReducer: Reducer<State> = wrapReducerInResetter(
  combineReducers({
    app,
    profileView,
    urlState,
    code,
  })
);

export default rootReducer;
