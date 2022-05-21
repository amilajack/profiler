/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// This file uses extensive use of Object generic trait bounds, which is a false
// positive for this rule.
/* eslint-disable flowtype/no-weak-types */

import * as React from 'react';
import classNames from 'classnames';
import memoize from 'memoize-immutable';
import { Localized } from '@fluent/react';

import { VirtualList } from './VirtualList';

import { ContextMenuTrigger } from './ContextMenuTrigger';

import type { CssPixels } from 'firefox-profiler/types';

import './TreeView.css';

/**
 * This number is used to decide how many lines the selection moves when the
 * user presses PageUp or PageDown.
 * It's big enough to be useful, but small enough to always be less than one
 * window. Of course the correct number should depend on the height of the
 * viewport, but this is more complex, and an hardcoded number is good enough in
 * this case.
 */
const PAGE_KEYS_DELTA = 15;

/**
 * A component that accepts falsy values as the `id` prop for `Localized`.
 * `Localized` throws a warning if the `id` field is empty or null. This is made
 * to silence those warnings by directy rendering the children for that case instead.
 */
function PermissiveLocalized(props: JSX.LibraryManagedAttributes<typeof Localized, React.ComponentProps<typeof Localized>>) {
  const { children, id } = props;
  return id ? <Localized {...props}>{children}</Localized> : children;
}

// This is used for the result of RegExp.prototype.exec because Flow doesn't do it.
// See https://github.com/facebook/flow/issues/4099
type RegExpResult = null | {
  index: number,
  input: string
} & string[];
type NodeIndex = number;

export type Column<DisplayData extends any> = {
  readonly propName: string,
  readonly titleL10nId: string,
  readonly component?: React.ComponentType<{
    displayData: DisplayData
  }>
};

type TreeViewHeaderProps<DisplayData extends any> = {
  readonly fixedColumns: Column<DisplayData>[],
  readonly mainColumn: Column<DisplayData>
};

const TreeViewHeader = <DisplayData extends any>(
  {
    fixedColumns,
    mainColumn,
  }: TreeViewHeaderProps<DisplayData>,
) => {
  if (fixedColumns.length === 0 && !mainColumn.titleL10nId) {
    // If there is nothing to display in the header, do not render it.
    return null;
  }
  return (
    <div className="treeViewHeader">
      {fixedColumns.map((col) => (
        <PermissiveLocalized
          id={col.titleL10nId}
          attrs={{ title: true }}
          key={col.propName}
        >
          <span
            className={`treeViewHeaderColumn treeViewFixedColumn ${col.propName}`}
          ></span>
        </PermissiveLocalized>
      ))}
      <PermissiveLocalized id={mainColumn.titleL10nId} attrs={{ title: true }}>
        <span
          className={`treeViewHeaderColumn treeViewMainColumn ${mainColumn.propName}`}
        ></span>
      </PermissiveLocalized>
    </div>
  );
};

function reactStringWithHighlightedSubstrings(
  string: string,
  regExp: RegExp | null,
  className: string
) {
  if (!regExp) {
    return string;
  }

  // Since the regexp is reused and likely global, let's make sure we reset it.
  regExp.lastIndex = 0;

  const highlighted: Array<React.ReactElement<React.ComponentProps<'span'>> | any | string> = [];
  let lastOccurrence = 0;
  let result;
  while ((result = regExp.exec(string))) {
    const typedResult: RegExpResult = result;
    if (typedResult === null) {
      break;
    }
    highlighted.push(string.substring(lastOccurrence, typedResult.index));
    lastOccurrence = regExp.lastIndex;
    highlighted.push(
      <span key={typedResult.index} className={className}>
        {typedResult[0]}
      </span>
    );
  }
  highlighted.push(string.substring(lastOccurrence));
  return highlighted;
}

type TreeViewRowFixedColumnsProps<DisplayData extends any> = {
  readonly displayData: DisplayData,
  readonly nodeId: NodeIndex,
  readonly columns: Column<DisplayData>[],
  readonly index: number,
  readonly isSelected: boolean,
  readonly isRightClicked: boolean,
  readonly onClick: (arg1: NodeIndex, arg2: React.MouseEvent) => unknown,
  readonly highlightRegExp: RegExp | null,
  readonly rowHeightStyle: {
    height: CssPixels,
    lineHeight: string
  }
};

class TreeViewRowFixedColumns<DisplayData extends any> extends React.PureComponent<TreeViewRowFixedColumnsProps<DisplayData>> {
  _onClick = (event: React.MouseEvent) => {
    const { nodeId, onClick } = this.props;
    onClick(nodeId, event);
  };

  render() {
    const {
      displayData,
      columns,
      index,
      isSelected,
      isRightClicked,
      highlightRegExp,
      rowHeightStyle,
    } = this.props;
    return (
      <div
        className={classNames('treeViewRow', 'treeViewRowFixedColumns', {
          even: index % 2 === 0,
          odd: index % 2 !== 0,
          isSelected,
          isRightClicked,
        })}
        style={rowHeightStyle}
        onMouseDown={this._onClick}
      >
        {columns.map((col) => {
          const RenderComponent = col.component;
          const text = displayData[col.propName] || '';

          return (
            <span
              className={`treeViewRowColumn treeViewFixedColumn ${col.propName}`}
              key={col.propName}
              title={text}
            >
              {RenderComponent ? (
                <RenderComponent displayData={displayData} />
              ) : (
                reactStringWithHighlightedSubstrings(
                  text,
                  highlightRegExp,
                  'treeViewHighlighting'
                )
              )}
            </span>
          );
        })}
      </div>
    );
  }
}

type TreeViewRowScrolledColumnsProps<DisplayData extends any> = {
  readonly displayData: DisplayData,
  readonly nodeId: NodeIndex,
  readonly depth: number,
  readonly mainColumn: Column<DisplayData>,
  readonly appendageColumn?: Column<DisplayData>,
  readonly index: number,
  readonly canBeExpanded: boolean,
  readonly isExpanded: boolean,
  readonly isSelected: boolean,
  readonly isRightClicked: boolean,
  readonly onToggle: (arg1: NodeIndex, arg2: boolean, arg3: boolean) => unknown,
  readonly onClick: (arg1: NodeIndex, arg2: React.MouseEvent) => unknown,
  readonly highlightRegExp: RegExp | null,
  // React converts height into 'px' values, while lineHeight is valid in
  // non-'px' units.
  readonly rowHeightStyle: {
    height: CssPixels,
    lineHeight: string
  },
  readonly indentWidth: CssPixels
};

// This is a false-positive, as it's used as a generic trait bounds.
class TreeViewRowScrolledColumns<DisplayData extends any> extends React.PureComponent<TreeViewRowScrolledColumnsProps<DisplayData>> {
  /**
   * In this mousedown handler, we use event delegation so we have to use
   * `target` instead of `currentTarget`.
   */
  _onMouseDown = (
    event: {
      target: Element
    } & React.MouseEvent<Element>
  ) => {
    const { nodeId, onClick } = this.props;
    if (!event.target.classList.contains('treeRowToggleButton')) {
      onClick(nodeId, event);
    }
  };

  _onToggleClick = (
    event: {
      target: Element
    } & React.MouseEvent<Element>
  ) => {
    const { nodeId, isExpanded, onToggle } = this.props;
    onToggle(nodeId, !isExpanded, event.altKey === true);
  };

  render() {
    const {
      displayData,
      depth,
      mainColumn,
      appendageColumn,
      index,
      canBeExpanded,
      isExpanded,
      isSelected,
      isRightClicked,
      highlightRegExp,
      rowHeightStyle,
      indentWidth,
      nodeId,
    } = this.props;
    const RenderComponent = mainColumn.component;

    // By default there's no 'aria-expanded' attribute.
    let ariaExpanded = null;

    // if a node can be expanded (has children), and is not expanded yet,
    // aria-expanded is false.
    if (canBeExpanded) {
      ariaExpanded = false;
    }

    // If a node is expanded, ariaExpanded is true.
    if (isExpanded) {
      ariaExpanded = true;
    }
    // Cleaning up self time display so we can use it in aria-label below.
    let selfDisplay = displayData.selfTimeUnit;
    if (selfDisplay === '—') {
      selfDisplay = '0ms';
    }

    return (
      <div
        className={classNames('treeViewRow', 'treeViewRowScrolledColumns', {
          even: index % 2 === 0,
          odd: index % 2 !== 0,
          isSelected,
          isRightClicked,
        })}
        style={rowHeightStyle}
        onMouseDown={this._onMouseDown}
        // The following attributes are important for accessibility.
        aria-expanded={ariaExpanded}
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-label={displayData.ariaLabel}
        // The role and id attributes are used along with aria-activedescendant
        // (set on the parent), to manage the virtual focus of the tree items.
        // The "virtual" focus changes with the arrow keys.
        role="treeitem"
        id={`treeViewRow-${nodeId}`}
      >
        <span
          className="treeRowIndentSpacer"
          style={{ width: `${depth * indentWidth}px` }}
        />
        <span
          className={`treeRowToggleButton ${
            isExpanded ? 'expanded' : 'collapsed'
          } ${canBeExpanded ? 'canBeExpanded' : 'leaf'}`}
          onClick={this._onToggleClick}
        />
        {
          /* The category square is out of the treeview column element because we
            reduce the opacity for that element in some cases (with the "dim"
            class).
          */
          displayData.categoryColor && displayData.categoryName ? (
            <span
              className={`colored-square category-color-${displayData.categoryColor}`}
              title={displayData.categoryName}
            />
          ) : null
        }
        <span
          className={classNames(
            'treeViewRowColumn',
            'treeViewMainColumn',
            mainColumn.propName,
            {
              dim: displayData.isFrameLabel,
            }
          )}
        >
          {displayData.badge ? (
            <Localized
              id={displayData.badge.localizationId}
              vars={displayData.badge.vars}
              attrs={{ title: true }}
            >
              <span
                className={`treeBadge ${displayData.badge.name}`}
                title={displayData.badge.titleFallback}
              >
                {displayData.badge.contentFallback}
              </span>
            </Localized>
          ) : null}
          {RenderComponent ? (
            <RenderComponent displayData={displayData} />
          ) : (
            reactStringWithHighlightedSubstrings(
              displayData[mainColumn.propName],
              highlightRegExp,
              'treeViewHighlighting'
            )
          )}
        </span>
        {appendageColumn ? (
          <span
            className={`treeViewRowColumn treeViewAppendageColumn ${appendageColumn.propName}`}
          >
            {reactStringWithHighlightedSubstrings(
              displayData[appendageColumn.propName],
              highlightRegExp,
              'treeViewHighlighting'
            )}
          </span>
        ) : null}
      </div>
    );
  }
}

interface Tree<DisplayData extends any> {
  getDepth(arg1: NodeIndex): number;
  getRoots(): NodeIndex[];
  getDisplayData(arg1: NodeIndex): DisplayData;
  getParent(arg1: NodeIndex): NodeIndex;
  getChildren(arg1: NodeIndex): NodeIndex[];
  hasChildren(arg1: NodeIndex): boolean;
  getAllDescendants(arg1: NodeIndex): Set<NodeIndex>;
}

type TreeViewProps<DisplayData> = {
  readonly fixedColumns: Column<DisplayData>[],
  readonly mainColumn: Column<DisplayData>,
  readonly tree: Tree<DisplayData>,
  readonly expandedNodeIds: Array<NodeIndex | null>,
  readonly selectedNodeId: NodeIndex | null,
  readonly rightClickedNodeId?: NodeIndex | null,
  readonly onExpandedNodesChange: (arg1: Array<NodeIndex | null>) => unknown,
  readonly highlightRegExp?: RegExp | null,
  readonly appendageColumn?: Column<DisplayData>,
  readonly disableOverscan?: boolean,
  readonly contextMenu?: React.ReactElement<any>,
  readonly contextMenuId?: string,
  readonly maxNodeDepth: number,
  readonly onSelectionChange: (arg1: NodeIndex) => unknown,
  readonly onRightClickSelection?: (arg1: NodeIndex) => unknown,
  readonly onEnterKey?: (arg1: NodeIndex) => unknown,
  readonly onDoubleClick?: (arg1: NodeIndex) => unknown,
  readonly rowHeight: CssPixels,
  readonly indentWidth: CssPixels,
  readonly onKeyDown?: (arg1: React.KeyboardEvent) => void
};

export class TreeView<DisplayData extends any> extends React.PureComponent<TreeViewProps<DisplayData>> {
  _list: VirtualList<NodeIndex> | null = null;
  _takeListRef = (list: VirtualList<NodeIndex> | null) => (this._list = list);

  // The tuple `specialItems` always contains 2 elements: the first element is
  // the selected node id (if any), and the second element is the right clicked
  // id (if any).
  _computeSpecialItemsMemoized = memoize(
    (selectedNodeId: NodeIndex | null, rightClickedNodeId?: NodeIndex | null): [NodeIndex | undefined, NodeIndex | undefined] => [
      selectedNodeId ?? undefined,
      rightClickedNodeId ?? undefined,
    ],
    { limit: 1 }
  );

  _computeExpandedNodesMemoized = memoize(
    (expandedNodeIds: Array<NodeIndex | null>) =>
      new Set<NodeIndex | null>(expandedNodeIds),
    { limit: 1 }
  );

  _computeAllVisibleRowsMemoized = memoize(
    (tree: Tree<DisplayData>, expandedNodes: Set<NodeIndex | null>) => {
      function _addVisibleRowsFromNode(tree: Tree<DisplayData>, expandedNodes: Set<NodeIndex | null>, arr: Array<NodeIndex>, nodeId: NodeIndex) {
        arr.push(nodeId);
        if (!expandedNodes.has(nodeId)) {
          return;
        }
        const children = tree.getChildren(nodeId);
        for (let i = 0; i < children.length; i++) {
          _addVisibleRowsFromNode(tree, expandedNodes, arr, children[i]);
        }
      }

      const roots = tree.getRoots();
      const allRows: Array<NodeIndex> = [];
      for (let i = 0; i < roots.length; i++) {
        _addVisibleRowsFromNode(tree, expandedNodes, allRows, roots[i]);
      }
      return allRows;
    },
    { limit: 1 }
  );

  /* This method is used by users of this component. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  scrollSelectionIntoView() {
    const { selectedNodeId, tree } = this.props;
    if (this._list && selectedNodeId !== null) {
      const list = this._list; // this temp variable so that flow knows that it's non-null
      const rowIndex = this._getAllVisibleRows().indexOf(selectedNodeId);
      const depth = tree.getDepth(selectedNodeId);
      list.scrollItemIntoView(rowIndex, depth * 10);
    }
  }

  _renderRow = (nodeId: NodeIndex, index: number, columnIndex: number) => {
    const {
      tree,
      fixedColumns,
      mainColumn,
      appendageColumn,
      selectedNodeId,
      rightClickedNodeId,
      highlightRegExp,
      rowHeight,
      indentWidth,
    } = this.props;
    const displayData = tree.getDisplayData(nodeId);
    // React converts height into 'px' values, while lineHeight is valid in
    // non-'px' units.
    const rowHeightStyle = { height: rowHeight, lineHeight: `${rowHeight}px` } as const;

    if (columnIndex === 0) {
      return (
        <TreeViewRowFixedColumns
          displayData={displayData}
          columns={fixedColumns}
          nodeId={nodeId}
          index={index}
          isSelected={nodeId === selectedNodeId}
          isRightClicked={nodeId === rightClickedNodeId}
          onClick={this._onRowClicked}
          highlightRegExp={highlightRegExp || null}
          rowHeightStyle={rowHeightStyle}
        />
      );
    }

    const canBeExpanded = tree.hasChildren(nodeId);
    const isExpanded = canBeExpanded && !this._isCollapsed(nodeId);

    return (
      <TreeViewRowScrolledColumns
        rowHeightStyle={rowHeightStyle}
        displayData={displayData}
        mainColumn={mainColumn}
        appendageColumn={appendageColumn}
        depth={tree.getDepth(nodeId)}
        nodeId={nodeId}
        index={index}
        canBeExpanded={canBeExpanded}
        isExpanded={isExpanded}
        isSelected={nodeId === selectedNodeId}
        isRightClicked={nodeId === rightClickedNodeId}
        onToggle={this._toggle}
        onClick={this._onRowClicked}
        highlightRegExp={highlightRegExp || null}
        indentWidth={indentWidth}
      />
    );
  };

  _getExpandedNodes(): Set<NodeIndex | null> {
    return this._computeExpandedNodesMemoized(this.props.expandedNodeIds);
  }

  _getAllVisibleRows(): NodeIndex[] {
    const { tree } = this.props;
    return this._computeAllVisibleRowsMemoized(tree, this._getExpandedNodes());
  }

  _getSpecialItems(): [NodeIndex | undefined, NodeIndex | undefined] {
    const { selectedNodeId, rightClickedNodeId } = this.props;
    return this._computeSpecialItemsMemoized(
      selectedNodeId,
      rightClickedNodeId
    );
  }

  _isCollapsed(nodeId: NodeIndex): boolean {
    return !this._getExpandedNodes().has(nodeId);
  }

  _toggle = (
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId),
    toggleAll: boolean = false
  ) => {
    const newSet = new Set(this._getExpandedNodes());
    if (newExpanded) {
      newSet.add(nodeId);
      if (toggleAll) {
        for (const descendant of this.props.tree.getAllDescendants(nodeId)) {
          newSet.add(descendant);
        }
      }
    } else {
      newSet.delete(nodeId);
    }
    this.props.onExpandedNodesChange(Array.from(newSet.values()));
  };

  _toggleAll(
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId)
  ) {
    this._toggle(nodeId, newExpanded, true);
  }

  _select(nodeId: NodeIndex) {
    this.props.onSelectionChange(nodeId);
  }

  _rightClickSelect(nodeId: NodeIndex) {
    if (this.props.onRightClickSelection) {
      this.props.onRightClickSelection(nodeId);
    } else {
      this._select(nodeId);
    }
  }

  _onRowClicked = (nodeId: NodeIndex, event: React.MouseEvent) => {
    if (event.button === 0) {
      this._select(nodeId);
    } else if (event.button === 2) {
      this._rightClickSelect(nodeId);
    }

    if (event.detail === 2 && event.button === 0) {
      // double click
      if (this.props.onDoubleClick) {
        this.props.onDoubleClick(nodeId);
      } else {
        this._toggle(nodeId);
      }
    }
  };

  _onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    const { tree, selectedNodeId, mainColumn } = this.props;
    if (selectedNodeId) {
      const displayData = tree.getDisplayData(selectedNodeId);
      const clipboardData: DataTransfer = (event as any).clipboardData;
      clipboardData.setData('text/plain', displayData[mainColumn.propName]);
    }
  };

  _onKeyDown = (event: React.KeyboardEvent) => {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event);
    }

    const hasModifier = event.ctrlKey || event.altKey;
    const isNavigationKey =
      event.key.startsWith('Arrow') ||
      event.key.startsWith('Page') ||
      event.key === 'Home' ||
      event.key === 'End';
    const isAsteriskKey = event.key === '*';
    const isEnterKey = event.key === 'Enter';

    if (hasModifier || (!isNavigationKey && !isAsteriskKey && !isEnterKey)) {
      // No key events that we care about were found, so don't try and handle them.
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const selected = this.props.selectedNodeId;
    const visibleRows = this._getAllVisibleRows();
    const selectedRowIndex = visibleRows.findIndex(
      (nodeId) => nodeId === selected
    );

    if (selected === null || selectedRowIndex === -1) {
      // the first condition is redundant, but it makes flow happy
      this._select(visibleRows[0]);
      return;
    }

    if (isNavigationKey) {
      switch (event.key) {
        case 'ArrowUp': {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the Home gesture
            this._select(visibleRows[0]);
            break;
          }

          if (selectedRowIndex > 0) {
            this._select(visibleRows[selectedRowIndex - 1]);
          }
          break;
        }
        case 'ArrowDown': {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the End gesture
            this._select(visibleRows[visibleRows.length - 1]);
            break;
          }

          if (selectedRowIndex < visibleRows.length - 1) {
            this._select(visibleRows[selectedRowIndex + 1]);
          }
          break;
        }
        case 'PageUp': {
          if (selectedRowIndex > 0) {
            const nextRow = Math.max(0, selectedRowIndex - PAGE_KEYS_DELTA);
            this._select(visibleRows[nextRow]);
          }
          break;
        }
        case 'PageDown': {
          if (selectedRowIndex < visibleRows.length - 1) {
            const nextRow = Math.min(
              visibleRows.length - 1,
              selectedRowIndex + PAGE_KEYS_DELTA
            );
            this._select(visibleRows[nextRow]);
          }
          break;
        }
        case 'Home': {
          this._select(visibleRows[0]);
          break;
        }
        case 'End': {
          this._select(visibleRows[visibleRows.length - 1]);
          break;
        }
        case 'ArrowLeft': {
          const isCollapsed = this._isCollapsed(selected);
          if (!isCollapsed) {
            this._toggle(selected);
          } else {
            const parent = this.props.tree.getParent(selected);
            if (parent !== -1) {
              this._select(parent);
            }
          }
          break;
        }
        case 'ArrowRight': {
          const isCollapsed = this._isCollapsed(selected);
          if (isCollapsed) {
            this._toggle(selected);
          } else {
            // Do KEY_DOWN only if the next element is a child
            if (this.props.tree.hasChildren(selected)) {
              this._select(this.props.tree.getChildren(selected)[0]);
            }
          }
          break;
        }
        default:
          throw new Error('Unhandled navigation key.');
      }
    }

    if (isAsteriskKey) {
      this._toggleAll(selected);
    }

    if (isEnterKey) {
      const { onEnterKey, selectedNodeId } = this.props;
      if (onEnterKey && selectedNodeId !== null) {
        onEnterKey(selectedNodeId);
      }
    }
  };

  /* This method is used by users of this component. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus() {
    if (this._list) {
      this._list.focus();
    }
  }

  render() {
    const {
      fixedColumns,
      mainColumn,
      disableOverscan,
      contextMenu,
      contextMenuId,
      maxNodeDepth,
      rowHeight,
      selectedNodeId,
    } = this.props;
    return (
      <div className="treeView">
        <TreeViewHeader fixedColumns={fixedColumns} mainColumn={mainColumn} />
        <ContextMenuTrigger
          id={contextMenuId ?? 'unknown'}
          disable={!contextMenuId}
          attributes={{ className: 'treeViewContextMenu' }}
        >
          <VirtualList
            className="treeViewBody"
            ariaRole="tree"
            ariaLabel="Call tree"
            // This attribute exposes the current active child element,
            // while keeping focus on the parent (call tree).
            ariaActiveDescendant={
              selectedNodeId !== null ? `treeViewRow-${selectedNodeId}` : null
            }
            items={this._getAllVisibleRows()}
            renderItem={this._renderRow}
            itemHeight={rowHeight}
            columnCount={2}
            focusable={true}
            onKeyDown={this._onKeyDown}
            specialItems={this._getSpecialItems()}
            disableOverscan={!!disableOverscan}
            onCopy={this._onCopy}
            // If there is a deep call node depth, expand the width, or else keep it
            // at 3000 wide.
            containerWidth={Math.max(3000, maxNodeDepth * 10 + 2000)}
            ref={this._takeListRef}
          />
        </ContextMenuTrigger>
        {contextMenu}
      </div>
    );
  }
}
