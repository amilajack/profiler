/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { oneLine } from "common-tags";
import { getCallNodePathFromIndex } from "~/components/FFP/profile-logic/profile-data";
import { getThreadSelectorsFromThreadsKey, selectedThreadSelectors } from "~/components/FFP/selectors/per-thread";
import { getPreviewSelection } from "~/components/FFP/selectors/profile";
import {
  getImplementationFilter,
  getSelectedThreadIndexes,
  getSelectedThreadsKey,
} from "~/components/FFP/selectors/url-state";
import { objectShallowEquals } from "~/components/FFP/utils/index";

import type { TabSlug } from "~/components/FFP/app-logic/tabs-handling";
import type {
  Action,
  BottomBoxInfo,
  CallNodeInfo,
  CallNodePath,
  ImplementationFilter,
  IndexIntoCallNodeTable,
  IndexIntoSamplesTable,
  PreviewSelection,
  SelectionContext,
  TableViewOptions,
  ThreadIndex,
  ThreadsKey,
  ThunkAction,
} from "~/components/FFP/types";
import { initializeSelectedThreadIndex } from "../profile-logic/tracks";

/**
 * This file contains actions that pertain to changing the view on the profile, including
 * searching and filtering. Currently the call tree's actions are in this file, but
 * should be split apart. These actions should most likely affect every panel.
 */

/**
 * Select a call node for a given thread. An optional call node path can be provided
 * to expand child nodes beyond the selected call node path.
 *
 * Note that optionalExpandedToCallNodePath, if specified, must be a descendant call node
 * of selectedCallNodePath.
 */
export function changeSelectedCallNode(
  threadsKey: ThreadsKey,
  selectedCallNodePath: CallNodePath,
  context: SelectionContext = { source: "auto" },
  optionalExpandedToCallNodePath?: CallNodePath
): Action {
  if (optionalExpandedToCallNodePath) {
    for (let i = 0; i < selectedCallNodePath.length; i++) {
      if (selectedCallNodePath[i] !== optionalExpandedToCallNodePath[i]) {
        // This assertion ensures that the selectedCallNode will be correctly expanded.
        throw new Error(
          oneLine`
             The optional expanded call node path provided to the changeSelectedCallNode
             must contain the selected call node path.
           `
        );
      }
    }
  }
  return {
    type: "CHANGE_SELECTED_CALL_NODE",
    selectedCallNodePath,
    optionalExpandedToCallNodePath,
    threadsKey,
    context,
  };
}

/**
 * This action is used when the user right clicks on a call node (in panels such
 * as the call tree, the flame chart, or the stack chart). It's especially used
 * to display the context menu.
 */
export function changeRightClickedCallNode(threadsKey: ThreadsKey, callNodePath: CallNodePath | null) {
  return {
    type: "CHANGE_RIGHT_CLICKED_CALL_NODE",
    threadsKey,
    callNodePath,
  };
}

/**
 * Given a threadIndex and a sampleIndex, select the call node at the top ("leaf")
 * of that sample's stack.
 */
export function selectLeafCallNode(
  threadsKey: ThreadsKey,
  sampleIndex: IndexIntoSamplesTable | null
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const filteredThread = threadSelectors.getFilteredThread(getState());
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    let newSelectedCallNode = -1;
    if (sampleIndex !== null) {
      // The newSelectedStack could be undefined if there are 0 samples.
      const newSelectedStack = filteredThread.samples.stack[sampleIndex];

      if (newSelectedStack !== null && newSelectedStack !== undefined) {
        newSelectedCallNode = callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];
      }
    }

    dispatch(
      changeSelectedCallNode(threadsKey, getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable))
    );
  };
}

/**
 * This selects a set of thread from thread indexes.
 * Please use it in tests only.
 */
export function changeSelectedThreads(selectedThreadIndexes: Set<ThreadIndex>): Action {
  return {
    type: "CHANGE_SELECTED_THREAD",
    selectedThreadIndexes,
  };
}

export function focusCallTree(): Action {
  return {
    type: "FOCUS_CALL_TREE",
  };
}

export function changeCallTreeSearchString(searchString: string): Action {
  return {
    type: "CHANGE_CALL_TREE_SEARCH_STRING",
    searchString,
  };
}

export function expandAllCallNodeDescendants(
  threadsKey: ThreadsKey,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo
): ThunkAction<void> {
  return (dispatch, getState) => {
    const expandedCallNodeIndexes = selectedThreadSelectors.getExpandedCallNodeIndexes(getState());
    const tree = selectedThreadSelectors.getCallTree(getState());

    // Create a set with the selected call node and its descendants
    const descendants = tree.getAllDescendants(callNodeIndex);
    descendants.add(callNodeIndex);
    // And also add all the call nodes that already were expanded
    expandedCallNodeIndexes.forEach((callNodeIndex) => {
      if (callNodeIndex !== null) {
        descendants.add(callNodeIndex);
      }
    });

    const expandedCallNodePaths = [...descendants].map((callNodeIndex) =>
      getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
    );
    dispatch(changeExpandedCallNodes(threadsKey, expandedCallNodePaths));
  };
}

export function changeExpandedCallNodes(threadsKey: ThreadsKey, expandedCallNodePaths: Array<CallNodePath>): Action {
  return {
    type: "CHANGE_EXPANDED_CALL_NODES",
    threadsKey,
    expandedCallNodePaths,
  };
}

export function changeImplementationFilter(implementation: ImplementationFilter): ThunkAction<void> {
  return (dispatch, getState) => {
    const previousImplementation = getImplementationFilter(getState());
    const threadsKey = getSelectedThreadsKey(getState());
    const transformedThread = selectedThreadSelectors.getRangeFilteredThread(getState());

    dispatch({
      type: "CHANGE_IMPLEMENTATION_FILTER",
      implementation,
      threadsKey,
      transformedThread,
      previousImplementation,
    });
  };
}

export function changeInvertCallstack(invertCallstack: boolean): ThunkAction<void> {
  return (dispatch, getState) => {
    dispatch({
      type: "CHANGE_INVERT_CALLSTACK",
      invertCallstack,
      selectedThreadIndexes: getSelectedThreadIndexes(getState()),
      callTree: selectedThreadSelectors.getCallTree(getState()),
      callNodeTable: selectedThreadSelectors.getCallNodeInfo(getState()).callNodeTable,
    });
  };
}

export function updatePreviewSelection(previewSelection: PreviewSelection): ThunkAction<void> {
  return (dispatch, getState) => {
    const currentPreviewSelection = getPreviewSelection(getState());
    if (!objectShallowEquals(currentPreviewSelection, previewSelection)) {
      // Only dispatch if the selection changes. This function can fire in a tight loop,
      // and this check saves a dispatch.
      dispatch({
        type: "UPDATE_PREVIEW_SELECTION",
        previewSelection,
      });
    }
  };
}

export function changeTableViewOptions(tab: TabSlug, tableViewOptions: TableViewOptions): Action {
  return {
    type: "CHANGE_TABLE_VIEW_OPTIONS",
    tab,
    tableViewOptions,
  };
}

export function updateBottomBoxContentsAndOpen({ libIndex, sourceFile, nativeSymbols }: BottomBoxInfo): Action {
  // TODO: If the set has more than one element, pick the native symbol with
  // the highest total sample count
  const nativeSymbol = nativeSymbols.length !== 0 ? nativeSymbols[0] : null;

  return {
    type: "UPDATE_BOTTOM_BOX",
    libIndex,
    sourceFile,
    nativeSymbol,
    allNativeSymbolsForInitiatingCallNode: nativeSymbols,
    currentTab: "calltree",
    shouldOpenBottomBox: true,
    shouldOpenAssemblyView: sourceFile === null && nativeSymbol !== null,
  };
}

export function updateBottomBoxContents({ libIndex, sourceFile, nativeSymbols }: BottomBoxInfo): Action {
  // TODO: If the set has more than one element, pick the native symbol with
  // the highest total sample count
  const nativeSymbol = nativeSymbols.length !== 0 ? nativeSymbols[0] : null;

  return {
    type: "UPDATE_BOTTOM_BOX",
    libIndex,
    sourceFile,
    nativeSymbol,
    allNativeSymbolsForInitiatingCallNode: nativeSymbols,
    currentTab: "calltree",
    shouldOpenBottomBox: false,
    shouldOpenAssemblyView: false,
  };
}

export function closeBottomBox(): ThunkAction<void> {
  return (dispatch) => {
    dispatch({
      type: "CLOSE_BOTTOM_BOX_FOR_TAB",
      tab: "calltree",
    });
  };
}

export function toggleExpandedMode(isExpanded: boolean): Action {
  return {
    type: "TOGGLE_EXPANDED_MODE",
    isExpanded,
  };
}

export function changeTrack(selectedTab: TabSlug, isCompareMode: boolean): Action {
  return {
    type: "SELECT_TRACK",
    selectedThreadIndexes: initializeSelectedThreadIndex(selectedTab, isCompareMode),
    selectedTab,
    lastNonShiftClickInformation: null,
  };
}
