/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { configureStore } from "@reduxjs/toolkit";
import thunk from "redux-thunk";
import reducers from "~/components/FFP/reducers";
import type { Store } from "~/components/FFP/types";
/**
 * Isolate the store creation into a function, so that it can be used outside of the
 * app's execution context, e.g. for testing.
 * @return {object} Redux store.
 */

export const createStore = (): Store => {
  const middleware = [thunk];

  // if (process.env.NODE_ENV === "development") {
  //   middlewares.push(
  //     createLogger({
  //       collapsed: true,
  //       titleFormatter: (action, time, duration) => `[action]    ${action.type} (in ${duration.toFixed(2)} ms)`,
  //       logErrors: false,
  //       duration: true,
  //     })
  //   );
  // }

  const store = configureStore({ reducer: reducers, middleware });
  return store as Store;
};
