/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { CallTree } from "~/components/FFP/profile-logic/call-tree";
import { getCallNodeIndexFromPath, toValidImplementationFilter } from "~/components/FFP/profile-logic/profile-data";
import { assertExhaustiveCheck, convertToTransformType } from "~/components/FFP/utils/flow";
import {
  decodeUintArrayFromUrlComponent,
  encodeUintArrayForUrlComponent,
} from "~/components/FFP/utils/uintarray-encoding";

import type {
  CallNodeAndCategoryPath,
  CallNodePath,
  CallNodeTable,
  ImplementationFilter,
  IndexIntoFuncTable,
  Thread,
  TransformStack,
  TransformType,
} from "~/components/FFP/types";

/**
 * This file contains the functions and logic for working with and applying transforms
 * to profile data.
 */

// Create mappings from a transform name, to a url-friendly short name.
const TRANSFORM_TO_SHORT_KEY: Partial<Record<TransformType, string>> = {};
const SHORT_KEY_TO_TRANSFORM: {
  [key: string]: TransformType;
} = {};
[
  "focus-subtree",
  "focus-function",
  "focus-category",
  "merge-call-node",
  "merge-function",
  "drop-function",
  "collapse-resource",
  "collapse-direct-recursion",
  "collapse-indirect-recursion",
  "collapse-function-subtree",
].forEach((transform: TransformType) => {
  // This is kind of an awkward switch, but it ensures we've exhaustively checked that
  // we have a mapping for every transform.
  let shortKey;
  switch (transform) {
    case "focus-subtree":
      shortKey = "f";
      break;
    case "focus-function":
      shortKey = "ff";
      break;
    case "focus-category":
      shortKey = "fg";
      break;
    case "merge-call-node":
      shortKey = "mcn";
      break;
    case "merge-function":
      shortKey = "mf";
      break;
    case "drop-function":
      shortKey = "df";
      break;
    case "collapse-resource":
      shortKey = "cr";
      break;
    case "collapse-direct-recursion":
      shortKey = "rec";
      break;
    case "collapse-indirect-recursion":
      shortKey = "irec";
      break;
    case "collapse-function-subtree":
      shortKey = "cfs";
      break;
    default: {
      throw assertExhaustiveCheck(transform as never);
    }
  }
  TRANSFORM_TO_SHORT_KEY[transform] = shortKey;
  SHORT_KEY_TO_TRANSFORM[shortKey] = transform;
});

/**
 * Map each transform key into a short representation.
 */

/**
 * Parses the transform stack that is applied to the selected thread,
 * or to the set of selected threads.
 * Every transform is separated by the "~" character.
 * Each transform is made up of a tuple separated by "-"
 * The first value in the tuple is a short key of the transform type.
 *
 * e.g "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
 */
export function parseTransforms(transformString: string): TransformStack {
  if (!transformString) {
    return [];
  }
  const transforms: TransformStack = [];

  transformString.split("~").forEach((s) => {
    const tuple = s.split("-");
    const shortKey = tuple[0];
    const type = convertToTransformType(SHORT_KEY_TO_TRANSFORM[shortKey]);
    if (type === null) {
      console.error("Unrecognized transform was passed to the URL.", shortKey);
      return;
    }
    // This switch breaks down each transform into the minimum amount of data needed
    // to represent it in the URL. Each transform has slightly different requirements
    // as defined in src/types/transforms.js.
    switch (type) {
      case "collapse-resource": {
        // e.g. "cr-js-325-8"
        const [, implementation, resourceIndexRaw, collapsedFuncIndexRaw] = tuple;
        const resourceIndex = parseInt(resourceIndexRaw, 10);
        const collapsedFuncIndex = parseInt(collapsedFuncIndexRaw, 10);
        if (isNaN(resourceIndex) || isNaN(collapsedFuncIndex)) {
          break;
        }
        if (resourceIndex >= 0) {
          transforms.push({
            type,
            resourceIndex,
            collapsedFuncIndex,
            implementation: toValidImplementationFilter(implementation),
          });
        }

        break;
      }
      case "collapse-direct-recursion":
      case "collapse-indirect-recursion": {
        // e.g. "rec-js-325"
        const [, implementation, funcIndexRaw] = tuple;
        const funcIndex = parseInt(funcIndexRaw, 10);
        if (isNaN(funcIndex) || funcIndex < 0) {
          break;
        }
        switch (type) {
          case "collapse-direct-recursion":
            transforms.push({
              type: "collapse-direct-recursion",
              funcIndex,
              implementation: toValidImplementationFilter(implementation),
            });
            break;
          case "collapse-indirect-recursion":
            transforms.push({
              type: "collapse-indirect-recursion",
              funcIndex,
              implementation: toValidImplementationFilter(implementation),
            });
            break;
          default:
            throw new Error("Unmatched transform.");
        }
        break;
      }
      case "merge-function":
      case "focus-function":
      case "drop-function":
      case "collapse-function-subtree": {
        // e.g. "mf-325"
        const [, funcIndexRaw] = tuple;
        const funcIndex = parseInt(funcIndexRaw, 10);
        // Validate that the funcIndex makes sense.
        if (!isNaN(funcIndex) && funcIndex >= 0) {
          switch (type) {
            case "merge-function":
              transforms.push({
                type: "merge-function",
                funcIndex,
              });
              break;
            case "focus-function":
              transforms.push({
                type: "focus-function",
                funcIndex,
              });
              break;
            case "drop-function":
              transforms.push({
                type: "drop-function",
                funcIndex,
              });
              break;
            case "collapse-function-subtree":
              transforms.push({
                type: "collapse-function-subtree",
                funcIndex,
              });
              break;
            default:
              throw new Error("Unmatched transform.");
          }
        }
        break;
      }
      case "focus-category": {
        // e.g. "fg-3"
        const [, categoryRaw] = tuple;
        const category = parseInt(categoryRaw, 10);
        // Validate that the category makes sense.
        if (!isNaN(category) && category >= 0) {
          transforms.push({
            type: "focus-category",
            category,
          });
        }
        break;
      }
      case "focus-subtree":
      case "merge-call-node": {
        // e.g. "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
        const [, implementationRaw, serializedCallNodePath, invertedRaw] = tuple;
        const implementation = toValidImplementationFilter(implementationRaw);
        const callNodePath = decodeUintArrayFromUrlComponent(serializedCallNodePath);
        const inverted = Boolean(invertedRaw);
        // Flow requires a switch because it can't deduce the type string correctly.
        switch (type) {
          case "focus-subtree":
            transforms.push({
              type: "focus-subtree",
              implementation,
              callNodePath,
              inverted,
            });
            break;
          case "merge-call-node":
            transforms.push({
              type: "merge-call-node",
              implementation,
              callNodePath,
            });
            break;
          default:
            throw new Error("Unmatched transform.");
        }

        break;
      }
      default:
        throw assertExhaustiveCheck(type as never);
    }
  });
  return transforms;
}

/**
 * Each transform in the stack is separated by a "~".
 */
export function stringifyTransforms(transformStack: TransformStack): string {
  return transformStack
    .map((transform) => {
      const shortKey = TRANSFORM_TO_SHORT_KEY[transform.type];
      if (!shortKey) {
        throw new Error("Expected to be able to convert a transform into its short key.");
      }
      // This switch breaks down each transform into shared groups of what data
      // they need, as defined in src/types/transforms.js. For instance some transforms
      // need only a funcIndex, while some care about the current implemention, or
      // other pieces of data.
      switch (transform.type) {
        case "merge-function":
        case "drop-function":
        case "collapse-function-subtree":
        case "focus-function":
          return `${shortKey}-${transform.funcIndex}`;
        case "focus-category":
          return `${shortKey}-${transform.category}`;
        case "collapse-resource":
          return `${shortKey}-${transform.implementation}-${transform.resourceIndex}-${transform.collapsedFuncIndex}`;
        case "collapse-direct-recursion":
        case "collapse-indirect-recursion":
          return `${shortKey}-${transform.implementation}-${transform.funcIndex}`;
        case "focus-subtree":
        case "merge-call-node": {
          let string = [
            shortKey,
            transform.implementation,
            encodeUintArrayForUrlComponent(transform.callNodePath),
          ].join("-");
          if (transform.inverted) {
            string += "-i";
          }
          return string;
        }
        default:
          throw assertExhaustiveCheck(transform);
      }
    })
    .join("~");
}

export type TransformLabeL10nIds = {
  readonly l10nId: string;
  readonly item: string;
};

/**
 * Take a CallNodePath, and invert it given a CallTree. Note that if the CallTree
 * is itself inverted, you will get back the uninverted CallNodePath to the regular
 * CallTree.
 *
 * e.g:
 *   (invertedPath, invertedCallTree) => path
 *   (path, callTree) => invertedPath
 *
 * Call trees are sorted with the CallNodes with the heaviest total time as the first
 * entry. This function walks to the tip of the heaviest branches to find the leaf node,
 * then construct an inverted CallNodePath with the result. This gives a pretty decent
 * result, but it doesn't guarantee that it will select the heaviest CallNodePath for the
 * INVERTED call tree. This would require doing a round trip through the reducers or
 * some other mechanism in order to first calculate the next inverted call tree. This is
 * probably not worth it, so go ahead and use the uninverted call tree, as it's probably
 * good enough.
 */
export function invertCallNodePath(path: CallNodePath, callTree: CallTree, callNodeTable: CallNodeTable): CallNodePath {
  let callNodeIndex = getCallNodeIndexFromPath(path, callNodeTable);
  if (callNodeIndex === null) {
    // No path was found, return an empty CallNodePath.
    return [];
  }
  let children = [callNodeIndex];
  const pathToLeaf = [];
  do {
    // Walk down the tree's depth to construct a path to the leaf node, this should
    // be the heaviest branch of the tree.
    callNodeIndex = children[0];
    pathToLeaf.push(callNodeIndex);
    children = callTree.getChildren(callNodeIndex);
  } while (children && children.length > 0);

  return (
    pathToLeaf
      // Map the CallNodeIndex to FuncIndex.
      .map((index) => callNodeTable.func[index])
      // Reverse it so that it's in the proper inverted order.
      .reverse()
  );
}

const FUNC_MATCHES = {
  combined: (_thread: Thread, _funcIndex: IndexIntoFuncTable) => true,
  cpp: (thread: Thread, funcIndex: IndexIntoFuncTable): boolean => {
    const { funcTable, stringTable } = thread;
    // Return quickly if this is a JS frame.
    if (thread.funcTable.isJS[funcIndex]) {
      return false;
    }

    // Regular C++ functions are associated with a resource that describes the
    // shared library that these C++ functions were loaded from. Jitcode is not
    // loaded from shared libraries but instead generated at runtime, so Jitcode
    // frames are not associated with a shared library and thus have no resource
    const locationString = stringTable.getString(funcTable.name[funcIndex]);
    const isProbablyJitCode = funcTable.resource[funcIndex] === -1 && locationString.startsWith("0x");
    return !isProbablyJitCode;
  },
  js: (thread: Thread, funcIndex: IndexIntoFuncTable): boolean => {
    return thread.funcTable.isJS[funcIndex] || thread.funcTable.relevantForJS[funcIndex];
  },
} as const;

/**
 * When restoring function in a CallNodePath there can be multiple correct CallNodePaths
 * that could be restored. The best approach would probably be to restore to the
 * "heaviest" callstack in the call tree (i.e. the one that is displayed first in the
 * calltree because it has the most samples under it.) This function only finds the first
 * match and returns it.
 */
export function restoreAllFunctionsInCallNodePath(
  thread: Thread,
  previousImplementationFilter: ImplementationFilter,
  callNodePath: CallNodePath
): CallNodePath {
  const { stackTable, frameTable } = thread;
  const funcMatchesImplementation = FUNC_MATCHES[previousImplementationFilter];
  // For every stackIndex, matchesUpToDepth[stackIndex] will be:
  //  - null if stackIndex does not match the callNodePath
  //  - <depth> if stackIndex matches callNodePath up to (and including) callNodePath[<depth>]
  const matchesUpToDepth: (number | null)[] = [];
  let tipStackIndex = null;
  // Try to find the tip most stackIndex in the CallNodePath, but skip anything
  // that doesn't match the previous implementation filter.
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const prefixPathDepth = prefix === null ? -1 : matchesUpToDepth[prefix];

    if (prefixPathDepth === null) {
      continue;
    }

    const pathDepth = prefixPathDepth + 1;
    const nextPathFuncIndex = callNodePath[pathDepth];
    if (nextPathFuncIndex === funcIndex) {
      // This function is a match.
      matchesUpToDepth[stackIndex] = pathDepth;
      if (pathDepth === callNodePath.length - 1) {
        // The tip of the CallNodePath has been found.
        tipStackIndex = stackIndex;
        break;
      }
    } else if (!funcMatchesImplementation(thread, funcIndex)) {
      // This function didn't match, but it also wasn't in the previous implementation.
      // Keep on searching for a match.
      matchesUpToDepth[stackIndex] = prefixPathDepth;
    } else {
      matchesUpToDepth[stackIndex] = null;
    }
  }

  // Turn the stack index into a CallNodePath
  if (tipStackIndex === null) {
    return [];
  }
  const newCallNodePath = [];
  for (let stackIndex = tipStackIndex; stackIndex !== null; stackIndex = stackTable.prefix[stackIndex]) {
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    newCallNodePath.push(funcIndex);
  }
  return newCallNodePath.reverse();
}

export function filterCallNodePathByImplementation(
  thread: Thread,
  implementationFilter: ImplementationFilter,
  callNodePath: CallNodePath
): CallNodePath {
  const funcMatchesImplementation = FUNC_MATCHES[implementationFilter];
  return callNodePath.filter((funcIndex) => funcMatchesImplementation(thread, funcIndex));
}

export function filterCallNodeAndCategoryPathByImplementation(
  thread: Thread,
  implementationFilter: ImplementationFilter,
  path: CallNodeAndCategoryPath
): CallNodeAndCategoryPath {
  const funcMatchesImplementation = FUNC_MATCHES[implementationFilter];
  return path.filter((funcIndex) => funcMatchesImplementation(thread, funcIndex.func));
}
