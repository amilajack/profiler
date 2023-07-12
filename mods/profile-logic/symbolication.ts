/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { AddressResult } from "~/components/FFP/profile-logic/symbol-store";
import type {
  Address,
  CallNodePath,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  IndexIntoLibs,
  IndexIntoNativeSymbolTable,
  IndexIntoResourceTable,
} from "~/components/FFP/types";
import { PathSet } from "~/components/FFP/utils/path";

type ThreadLibSymbolicationInfo = {
  // The resourceIndex for this lib in this thread.
  resourceIndex: IndexIntoResourceTable;
  // The libIndex for this lib in this thread.
  libIndex: IndexIntoLibs;
  // The set of funcs for this lib in this thread.
  allFuncsForThisLib: Set<IndexIntoFuncTable>;
  // The set of native symbols for this lib in this thread.
  allNativeSymbolsForThisLib: Set<IndexIntoNativeSymbolTable>;
  // All frames for this lib in this thread.
  allFramesForThisLib: Array<IndexIntoFrameTable>;
  // All addresses for frames for this lib in this thread, as lib-relative offsets.
  frameAddresses: Array<Address>;
};

// This type exists because we symbolicate the profile in steps in order to
// provide a profile to the user faster. This type represents a single step.
export type SymbolicationStepInfo = {
  threadLibSymbolicationInfo: ThreadLibSymbolicationInfo;
  resultsForLib: Map<Address, AddressResult>;
};

export type FuncToFuncsMap = Map<IndexIntoFuncTable, IndexIntoFuncTable[]>;

// Create a new call path, where each func in the old call path is
// replaced with one or more funcs from the FuncToFuncsMap.
// This is used during symbolication, where some previously separate
// funcs can be mapped onto the same new func, or a previously "flat"
// func can expand into a path of new funcs (from inlined functions).
// Any func that is not present as a key in the map stays unchanged.
//
// Example:
// path: [1, 2, 3]
// oldFuncToNewFuncsMap: (1 => [1, 4], 2 => [1])
// result: [1, 4, 1, 3]
export function applyFuncSubstitutionToCallPath(
  oldFuncToNewFuncsMap: FuncToFuncsMap,
  path: CallNodePath
): CallNodePath {
  return path.reduce<Array<any>>((accum, oldFunc) => {
    const newFuncs = oldFuncToNewFuncsMap.get(oldFunc);
    return newFuncs === undefined ? [...accum, oldFunc] : [...accum, ...newFuncs];
  }, []);
}

// This function is used for the path set of expanded call nodes in the call tree
// when symbolication is applied. We want to keep all open ("expanded") tree nodes open.
// The tree nodes are represented as a set of call paths, each call path is an array
// of funcs. Symbolication substitutes funcs.
export function applyFuncSubstitutionToPathSetAndIncludeNewAncestors(
  oldFuncToNewFuncsMap: FuncToFuncsMap,
  pathSet: PathSet
): PathSet {
  const newPathSet = [];
  for (const callPath of pathSet) {
    // Apply substitution to this path and add it.
    const newCallPath = applyFuncSubstitutionToCallPath(oldFuncToNewFuncsMap, callPath);
    newPathSet.push(newCallPath);

    // Additionally, we want to make sure that all new ancestors of the substituted call path
    // are in the new path set. Example:
    //
    // callPath = [1, 2, 3, 4] and map = (4 => [5, 6, 7])
    // newCallPath = [1, 2, 3, 5, 6, 7]
    //
    // We need to add these three new call paths:
    //
    //  1. [1, 2, 3, 5, 6, 7] (this one is already done)
    //  2. [1, 2, 3, 5, 6]
    //  3. [1, 2, 3, 5]

    const oldLeaf = callPath[callPath.length - 1];
    const mappedOldLeaf = applyFuncSubstitutionToCallPath(oldFuncToNewFuncsMap, [oldLeaf]);
    const mappedOldLeafSubpathLen = mappedOldLeaf.length;
    // "assert(newCallPath.endsWith(mappedOldLeaf))"
    if (mappedOldLeafSubpathLen > 1) {
      // The leaf has been replaced by multiple funcs.
      for (let i = 1; i < mappedOldLeafSubpathLen; i++) {
        newPathSet.push(newCallPath.slice(0, newCallPath.length - i));
      }
    }
  }

  return new PathSet(newPathSet);
}
