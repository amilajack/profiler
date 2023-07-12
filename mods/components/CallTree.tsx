/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import React, { PureComponent } from "react";
import memoize from "memoize-immutable";
import explicitConnect from "~/components/FFP/utils/connect";
import { TreeView } from "~/components/FFP/components/shared/TreeView";
import { getCallNodePathFromIndex } from "~/components/FFP/profile-logic/profile-data";
import {
  getImplementationFilter,
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
  getIsCompareMode,
} from "~/components/FFP/selectors/url-state";
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getPreviewSelection,
  getCategories,
  getCurrentTableViewOptions,
} from "~/components/FFP/selectors/profile";
import {
  compareThreadSelectors,
  getCallNodeIndexToCompareCallNodeIndexTable,
  selectedThreadSelectors,
} from "~/components/FFP/selectors/per-thread";
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  changeTableViewOptions,
  updateBottomBoxContentsAndOpen,
  updateBottomBoxContents,
} from "~/components/FFP/actions/profile-view";

import type {
  State,
  ImplementationFilter,
  ThreadsKey,
  CallNodeInfo,
  CategoryList,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  TableViewOptions,
  SelectionContext,
  CallNodeIndexToCompareCallNodeIndexTable,
} from "~/components/FFP/types";
import type { CallTree as CallTreeType } from "~/components/FFP/profile-logic/call-tree";

import type { Column, MaybeResizableColumn } from "~/components/FFP/components/shared/TreeView";
import type { ConnectedProps } from "~/components/FFP/utils/connect";
import { Placeholder } from "~/components/Placeholder";
import { MESSAGES } from "~/constants";

const ROW_HEIGHT = 17;
const INDENT_WIDTH = 12;

type StateProps = {
  readonly threadsKey: ThreadsKey;
  readonly scrollToSelectionGeneration: number;
  readonly focusCallTreeGeneration: number;
  readonly tree: CallTreeType;
  readonly compareTree: CallTreeType | null;
  readonly callNodeIndexToCompareCallNodeIndexTable: CallNodeIndexToCompareCallNodeIndexTable | null;
  readonly isCompareMode: boolean;
  readonly callNodeInfo: CallNodeInfo;
  readonly categories: CategoryList;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>;
  readonly searchStringsRegExp: RegExp | null;
  readonly disableOverscan: boolean;
  readonly implementationFilter: ImplementationFilter;
  readonly callNodeMaxDepth: number;
  // readonly weightType: WeightType;
  readonly tableViewOptions: TableViewOptions;
};

type DispatchProps = {
  readonly changeSelectedCallNode: typeof changeSelectedCallNode;
  readonly changeRightClickedCallNode: typeof changeRightClickedCallNode;
  readonly changeExpandedCallNodes: typeof changeExpandedCallNodes;
  readonly updateBottomBoxContentsAndOpen: typeof updateBottomBoxContentsAndOpen;
  readonly updateBottomBoxContents: typeof updateBottomBoxContents;
  readonly onTableViewOptionsChange: (arg1: TableViewOptions) => any;
};

type Props = ConnectedProps<Record<any, any>, StateProps, DispatchProps>;

class CallTreeImpl extends PureComponent<Props> {
  _mainColumn: Column<CallNodeDisplayData> = {
    propName: "name",
    title: "Activity",
  };
  _appendageColumn: Column<CallNodeDisplayData> = {
    propName: "lib",
    title: "",
  };
  _treeView: TreeView<CallNodeDisplayData> | null = null;
  _takeTreeViewRef = (treeView: TreeView<CallNodeDisplayData> | null) => (this._treeView = treeView);

  /**
   * Call Trees can have different types of "weights" for the data. Choose the
   * appropriate labels for the call tree based on this weight.
   */
  _getFixedColumns = memoize(
    (isCompareMode: boolean): MaybeResizableColumn<CallNodeDisplayData>[] => {
      if (isCompareMode) {
        return [
          // {
          //   propName: "total",
          //   title: "",
          //   minWidth: 44,
          //   initialWidth: 44,
          //   hideDividerAfter: true,
          // },
          // {
          //   propName: "totalPercent",
          //   title: "",
          //   minWidth: 44,
          //   initialWidth: 44,
          //   resizable: false,
          //   hideDividerAfter: true,
          // },
          {
            propName: "totalPercentCompare",
            title: "Total Time",
            minWidth: 56,
            initialWidth: 56,
            resizable: true,
          },
          // {
          //   propName: "self",
          //   title: "",
          //   minWidth: 44,
          //   initialWidth: 44,
          //   hideDividerAfter: true,
          // },
          // {
          //   propName: "selfPercent",
          //   title: "",
          //   minWidth: 44,
          //   initialWidth: 44,
          //   resizable: false,
          //   hideDividerAfter: true,
          // },
          {
            propName: "selfPercentCompare",
            title: "Self Time",
            minWidth: 50,
            initialWidth: 56,
            hideDividerAfter: false,
            resizable: true,
          },
        ];
      }

      return [
        // {
        //   propName: "total",
        //   title: "",
        //   minWidth: 44,
        //   initialWidth: 44,
        //   hideDividerAfter: true,
        // },
        {
          propName: "totalPercent",
          title: "Total Time",
          minWidth: 56,
          initialWidth: 80,
          resizable: true,
        },
        // {
        //   propName: "self",
        //   title: "",
        //   minWidth: 44,
        //   initialWidth: 44,
        //   hideDividerAfter: true,
        // },
        {
          propName: "selfPercent",
          title: "Self Time",
          minWidth: 50,
          initialWidth: 80,
          resizable: true,
        },
      ];
    },
    // Use a Map cache, as the function only takes one argument, which is a simple string.
    { cache: new Map() }
  );

  componentDidMount() {
    this.maybeProcureInterestingInitialSelection();

    if (this.props.selectedCallNodeIndex !== null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  componentDidUpdate(prevProps: Props) {
    this.maybeProcureInterestingInitialSelection();

    if (
      this.props.selectedCallNodeIndex !== null &&
      this.props.scrollToSelectionGeneration > prevProps.scrollToSelectionGeneration &&
      this._treeView
    ) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  focus() {
    if (this._treeView) {
      this._treeView.focus();
    }
  }

  _onSelectedCallNodeChange = (newSelectedCallNode: IndexIntoCallNodeTable, context: SelectionContext) => {
    const { tree, callNodeInfo, threadsKey, updateBottomBoxContents, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadsKey,
      getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable),
      context
    );

    const bottomBoxInfo = tree.getBottomBoxInfoForCallNode(newSelectedCallNode);
    updateBottomBoxContents(bottomBoxInfo);
  };

  _onRightClickSelection = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;
    changeRightClickedCallNode(threadsKey, getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable));
  };

  _onExpandedCallNodesChange = (newExpandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>) => {
    const { callNodeInfo, threadsKey, changeExpandedCallNodes } = this.props;
    changeExpandedCallNodes(
      threadsKey,
      newExpandedCallNodeIndexes.map((callNodeIndex) =>
        getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
      )
    );
  };

  _onKeyDown = (event: React.KeyboardEvent) => {
    const { selectedCallNodeIndex, rightClickedCallNodeIndex, threadsKey } = this.props;
    const nodeIndex = rightClickedCallNodeIndex !== null ? rightClickedCallNodeIndex : selectedCallNodeIndex;
    if (nodeIndex === null) {
      return;
    }
  };

  _onEnterOrDoubleClick = (nodeId: IndexIntoCallNodeTable) => {
    const { tree, updateBottomBoxContentsAndOpen } = this.props;
    const bottomBoxInfo = tree.getBottomBoxInfoForCallNode(nodeId);
    updateBottomBoxContentsAndOpen(bottomBoxInfo);
  };

  maybeProcureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedCallNodeIndexes, selectedCallNodeIndex } = this.props;

    // Let's not change some existing state.
    if (selectedCallNodeIndex !== null || expandedCallNodeIndexes.length > 0) return;

    let callNodeChildren = tree.getRoots();
    if (callNodeChildren.length === 0 || callNodeChildren.length > 1) return;

    const newExpandedCallNodeIndexes = expandedCallNodeIndexes.slice();
    while (callNodeChildren.length === 1) {
      newExpandedCallNodeIndexes.push(callNodeChildren[0]);
      callNodeChildren = tree.getChildren(callNodeChildren[0]);
    }

    this._onExpandedCallNodesChange(newExpandedCallNodeIndexes);
  }

  render() {
    const {
      tree,
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      expandedCallNodeIndexes,
      searchStringsRegExp,
      disableOverscan,
      callNodeMaxDepth,
      tableViewOptions,
      onTableViewOptionsChange,
      compareTree,
      callNodeIndexToCompareCallNodeIndexTable,
      isCompareMode,
    } = this.props;
    if (tree.getRoots().length === 0) {
      return (
        <div className="h-full w-full px-[var(--card-x-inset)] py-[var(--card-y-inset)]">
          <Placeholder
            title={MESSAGES.SEARCH_NO_RESULT}
            description={
              searchStringsRegExp
                ? MESSAGES.SEARCH_NO_RESULT_DESCRIPTION(searchStringsRegExp.toString().slice(1, -3))
                : undefined
            }
            className="h-full w-full"
          />
        </div>
      );
    }

    return (
      <TreeView
        tree={tree}
        compareTree={compareTree}
        callNodeIndexToCompareCallNodeIndexTable={callNodeIndexToCompareCallNodeIndexTable}
        isCompareMode={isCompareMode}
        fixedColumns={this._getFixedColumns(isCompareMode)}
        mainColumn={this._mainColumn}
        appendageColumn={this._appendageColumn}
        onSelectionChange={this._onSelectedCallNodeChange}
        onRightClickSelection={this._onRightClickSelection}
        onExpandedNodesChange={this._onExpandedCallNodesChange}
        selectedNodeId={selectedCallNodeIndex}
        rightClickedNodeId={rightClickedCallNodeIndex}
        expandedNodeIds={expandedCallNodeIndexes}
        highlightRegExp={searchStringsRegExp}
        disableOverscan={disableOverscan}
        ref={this._takeTreeViewRef}
        maxNodeDepth={callNodeMaxDepth}
        rowHeight={ROW_HEIGHT}
        indentWidth={INDENT_WIDTH}
        onKeyDown={this._onKeyDown}
        onEnterKey={this._onEnterOrDoubleClick}
        onDoubleClick={this._onEnterOrDoubleClick}
        viewOptions={tableViewOptions}
        onViewOptionsChange={onTableViewOptionsChange}
      />
    );
  }
}

export const CallTree = explicitConnect<Record<any, any>, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => {
    const isCompareMode = getIsCompareMode(state);
    return {
      threadsKey: getSelectedThreadsKey(state),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      focusCallTreeGeneration: getFocusCallTreeGeneration(state),
      tree: selectedThreadSelectors.getCallTree(state),
      compareTree: isCompareMode ? compareThreadSelectors.getCallTree(state) : null,
      callNodeIndexToCompareCallNodeIndexTable: isCompareMode
        ? getCallNodeIndexToCompareCallNodeIndexTable(state)
        : null,
      isCompareMode,
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      categories: getCategories(state),
      selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(state),
      rightClickedCallNodeIndex: selectedThreadSelectors.getRightClickedCallNodeIndex(state),
      expandedCallNodeIndexes: selectedThreadSelectors.getExpandedCallNodeIndexes(state),
      searchStringsRegExp: getSearchStringsAsRegExp(state),
      disableOverscan: getPreviewSelection(state).isModifying,
      implementationFilter: getImplementationFilter(state),
      // Use the filtered call node max depth, rather than the preview filtered call node
      // max depth so that the width of the TreeView component is stable across preview
      // selections.
      callNodeMaxDepth: selectedThreadSelectors.getFilteredCallNodeMaxDepth(state),
      // weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
      tableViewOptions: getCurrentTableViewOptions(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeExpandedCallNodes,
    updateBottomBoxContentsAndOpen,
    updateBottomBoxContents,
    onTableViewOptionsChange: (options: TableViewOptions) => changeTableViewOptions("calltree", options),
  },
  component: CallTreeImpl,
});
