/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file contains actions related to error handling.

import type { Action } from "~/components/FFP/types";
import { FatalError } from "~/components/FFP/utils/errors";
import { MESSAGES } from "~/constants";
import { IS_DEV } from "~/constants";
import { PROFILER_ERROR_DESCRIPTION } from "..";

export function fatalError(_error: unknown): Action {
  if (IS_DEV) console.error("Profiler: ", _error);

  const error = (() => {
    if (_error instanceof FatalError) {
      return _error;
    }

    return new FatalError(MESSAGES.PROFILER_DATA_ERROR, PROFILER_ERROR_DESCRIPTION);
  })();

  return {
    type: "FATAL_ERROR",
    error,
  };
}
