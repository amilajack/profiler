/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { RequestedLib } from "~/components/FFP/types";

export type LibSymbolicationRequest = {
  lib: RequestedLib;
  addresses: Set<number>;
};

export type LibSymbolicationResponse =
  | {
      type: "SUCCESS";
      lib: RequestedLib;
      results: Map<number, AddressResult>;
    }
  | {
      type: "ERROR";
      request: LibSymbolicationRequest;
      error: Error;
    };

export type AddressResult = {
  // The name of the outer function that this address belongs to.
  name: string;
  // The address (relative to the library) where the function that
  // contains this address starts, i.e. the address of the function symbol.
  symbolAddress: number;
  // The path of the file that contains the source code of the outer function that contains
  // this address.
  // Optional because the information may not be known by the symbolication source, or because
  // the symbolication method does not expose it.
  file?: string;
  // The line number that contains the source code of the outer function that generated the
  // instructions at the address, optional.
  // Optional because the information may not be known by the symbolication source, or because
  // the symbolication method does not expose it.
  line?: number;
  // An optional inline callstack, ordered from inside to outside.
  // addressResult.name calls addressResult.inlines[inlines.length - 1].function, which
  // calls addressResult.inlines[inlines.length - 2].function etc.
  inlines?: Array<AddressInlineFrame>;
  // An optional size, in bytes, of the machine code of the outer function that
  // this address belongs to.
  functionSize?: number;
};

export type AddressInlineFrame = {
  name: string;
  file?: string;
  line?: number;
};
