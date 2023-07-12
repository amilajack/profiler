/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// This file uses extensive use of Object generic trait bounds, which is a false
// positive for this rule.

import * as React from "react";
import memoize from "memoize-immutable";

import { VirtualList } from "~/components/FFP/components/shared/VirtualList";
import type { CallNodeIndexToCompareCallNodeIndexTable, CssPixels, TableViewOptions } from "~/components/FFP/types";
import clsx from "clsx";
import { Separator } from "~/primitives/Separator";
import { MiniChevronDownIcon } from "~/primitives/icons/MiniChevronDown";
import { mapTimeToCompareColor } from "~/components/FFP/utils/colors";
import { formatComparePercent } from "~/components/FFP/utils/format-numbers";

/**
 * This number is used to decide how many lines the selection moves when the
 * user presses PageUp or PageDown.
 * It's big enough to be useful, but small enough to always be less than one
 * window. Of course the correct number should depend on the height of the
 * viewport, but this is more complex, and an hardcoded number is good enough in
 * this case.
 */
const PAGE_KEYS_DELTA = 15;

const TREE_VIEW_HEADER_COLUMN_STYLE = "relative text-xs leading-none whitespace-nowrap text-gray-500";
const TREE_VIEW_FIXED_COLUMN_STYLE = "overflow-hidden flex-none";
const TREE_VIEW_ROW_STYLE =
  "even:bg-grayA-75 odd:bg-white flex flex-row flex-nowrap whitespace-nowrap items-center select-none";
const TREE_VIEW_ROW_COLUMN_STYLE = "text-gray-900 text-xs leading-none";
const TREE_VIEW_SELECTED_ROW_STYLE = "!bg-blue/20";
const TREE_ROW_TOGGLE_CLASS = "treeRowToggleButton";
const TREE_VIEW_COLUMN_DIVIDER = "flex-0 flex h-full w-4 items-center justify-center";
const TREE_VIEW_COLUMN_DIVIDER_CONTENT =
  "before:h-4 before:w-px before:bg-gray-200 data-[resize-handle-active]:before:bg-gray-900 hover:before:bg-gray-900 before:transition-colors";
const TREE_VIEW_HIGHLIGHT = "bg-yellow rounded-xs -my-px py-px text-black";

// This is used for the result of RegExp.prototype.exec because Flow doesn't do it.
// See https://github.com/facebook/flow/issues/4099
type RegExpResult =
  | null
  | ({
      index: number;
      input: string;
    } & string[]);
type NodeIndex = number;
type TableViewOptionsWithDefault = {
  fixedColumnWidths: Array<CssPixels>;
};

export type Column<DisplayData extends any> = {
  readonly propName: string;
  readonly title: string;
  readonly component?: React.ComponentType<{
    displayData: DisplayData;
  }>;
};

export type MaybeResizableColumn<DisplayData extends any> = Column<DisplayData> & {
  /** defaults to initialWidth */
  readonly minWidth?: CssPixels;
  /** This is the initial width, this can be changed in resizable columns */
  readonly initialWidth: CssPixels;
  /** found width + adjustment = width of header column */
  readonly headerWidthAdjustment?: CssPixels;
  // false by default
  readonly resizable?: boolean;
  // is the divider after the column hidden? false by default
  readonly hideDividerAfter?: boolean;
};

type TreeViewHeaderProps<DisplayData extends any> = {
  readonly fixedColumns: MaybeResizableColumn<DisplayData>[];
  readonly mainColumn: Column<DisplayData>;
  readonly viewOptions: TableViewOptionsWithDefault;
  readonly isResizingColumns: TreeViewState["isResizingColumns"];
  // called when the users moves the divider right of the column,
  // passes the column index and the start x coordinate
  readonly onColumnWidthChangeStart: (arg1: number, arg2: CssPixels) => void;
  readonly onColumnWidthReset: (arg1: number) => void;
};

class TreeViewHeader<DisplayData extends any> extends React.PureComponent<TreeViewHeaderProps<DisplayData>> {
  _isHeaderResizing = false;

  _onDividerMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    this._isHeaderResizing = true;
    this.props.onColumnWidthChangeStart(Number(event.currentTarget.dataset.columnIndex), event.clientX);
  };

  _onDividerMouseUp = (event: React.MouseEvent<HTMLElement>) => {
    this._isHeaderResizing = false;
  };

  _onDividerDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    this.props.onColumnWidthReset(Number(event.currentTarget.dataset.columnIndex));
  };

  render() {
    const { fixedColumns, mainColumn, viewOptions, isResizingColumns } = this.props;
    const columnWidths = viewOptions.fixedColumnWidths;
    if (fixedColumns.length === 0 && !mainColumn.title) {
      // If there is nothing to display in the header, do not render it.
      return null;
    }
    return (
      <>
        <div className="flex h-6 flex-row flex-nowrap items-center justify-start whitespace-nowrap bg-gray-50 px-[var(--card-x-inset)]">
          {fixedColumns.map((col, i) => {
            const width =
              (fixedColumns[i].title !== "" ? columnWidths[i] : 0) +
              (col.headerWidthAdjustment || 0) +
              (i + 1 < fixedColumns.length && fixedColumns[i + 1].title === "" ? columnWidths[i + 1] : 0);
            return (
              <React.Fragment key={col.propName}>
                <span
                  style={{ width }}
                  className={clsx(TREE_VIEW_HEADER_COLUMN_STYLE, TREE_VIEW_FIXED_COLUMN_STYLE, col.propName)}
                >
                  {col.title}
                </span>
                {col.hideDividerAfter !== true ? (
                  <span
                    key={col.propName + "Divider"}
                    className={clsx(
                      TREE_VIEW_COLUMN_DIVIDER,
                      TREE_VIEW_COLUMN_DIVIDER_CONTENT,
                      col.resizable && "cursor-col-resize select-none"
                    )}
                    onMouseDown={col.resizable ? this._onDividerMouseDown : undefined}
                    onMouseUp={col.resizable ? this._onDividerMouseUp : undefined}
                    onDoubleClick={col.resizable ? this._onDividerDoubleClick : undefined}
                    {...(isResizingColumns === i ? { "data-resize-handle-active": true } : { undefined })}
                    data-column-index={i}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
          <span className={clsx(TREE_VIEW_HEADER_COLUMN_STYLE, "flex-1", mainColumn.propName)}>{mainColumn.title}</span>
        </div>
        <Separator margin={0} decorative />
      </>
    );
  }
}

function reactStringWithHighlightedSubstrings(string: string, regExp: RegExp | null, className: string) {
  if (!regExp) {
    return string;
  }

  // Since the regexp is reused and likely global, let's make sure we reset it.
  regExp.lastIndex = 0;

  const highlighted = [];
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
  readonly displayData: DisplayData;
  readonly nodeId: NodeIndex;
  readonly columns: MaybeResizableColumn<DisplayData>[];
  readonly index: number;
  readonly isSelected: boolean;
  readonly isRightClicked: boolean;
  readonly onClick: (arg1: NodeIndex, arg2: React.MouseEvent) => unknown;
  readonly highlightRegExp: RegExp | null;
  readonly rowHeightStyle: {
    height: CssPixels;
    lineHeight: string;
  };
  readonly viewOptions: TableViewOptionsWithDefault;
  readonly columnsColor: Record<string, string | undefined>;
};

class TreeViewRowFixedColumns<DisplayData extends any> extends React.PureComponent<
  TreeViewRowFixedColumnsProps<DisplayData>
> {
  _onClick = (event: React.MouseEvent) => {
    const { nodeId, onClick } = this.props;
    onClick(nodeId, event);
  };

  render() {
    const { displayData, columns, viewOptions, isSelected, highlightRegExp, rowHeightStyle, columnsColor } = this.props;
    const columnWidths = viewOptions.fixedColumnWidths;

    return (
      <div
        className={clsx(TREE_VIEW_ROW_STYLE, "pl-3", isSelected && TREE_VIEW_SELECTED_ROW_STYLE)}
        style={rowHeightStyle}
        onMouseDown={this._onClick}
      >
        {columns.map((col, i) => {
          const RenderComponent = col.component;
          // @ts-ignore-next-line
          const text = displayData[col.propName] || "";
          return (
            <React.Fragment key={col.propName}>
              <span
                className={clsx(TREE_VIEW_FIXED_COLUMN_STYLE, TREE_VIEW_ROW_COLUMN_STYLE, col.propName)}
                title={text}
                style={{ width: columnWidths[i], color: columnsColor[col.propName] }}
              >
                {RenderComponent ? (
                  <RenderComponent displayData={displayData} />
                ) : (
                  reactStringWithHighlightedSubstrings(text, highlightRegExp, TREE_VIEW_HIGHLIGHT)
                )}
              </span>
              {col.hideDividerAfter !== true && i < columns.length - 1 ? (
                <span className={TREE_VIEW_COLUMN_DIVIDER} />
              ) : null}
              {col.hideDividerAfter !== true && i + 1 === columns.length && (
                <span className="flex-0 before before:bg-grayA-200 flex h-full w-[8.5px] items-center justify-end before:h-full before:w-px" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }
}

type TreeViewRowScrolledColumnsProps<DisplayData extends any> = {
  readonly displayData: DisplayData;
  readonly categoryClassName: string | undefined;
  readonly categoryName: string | undefined;
  readonly nodeId: NodeIndex;
  readonly depth: number;
  readonly mainColumn: Column<DisplayData>;
  readonly appendageColumn?: Column<DisplayData>;
  readonly index: number;
  readonly canBeExpanded: boolean;
  readonly isExpanded: boolean;
  readonly isSelected: boolean;
  readonly isRightClicked: boolean;
  readonly onToggle: (arg1: NodeIndex, arg2: boolean, arg3: boolean) => unknown;
  readonly onClick: (arg1: NodeIndex, arg2: React.MouseEvent) => unknown;
  readonly highlightRegExp: RegExp | null;
  // React converts height into 'px' values, while lineHeight is valid in
  // non-'px' units.
  readonly rowHeightStyle: {
    height: CssPixels;
    lineHeight: string;
  };
  readonly indentWidth: CssPixels;
};

class TreeViewRowScrolledColumns<DisplayData extends any> extends React.PureComponent<
  TreeViewRowScrolledColumnsProps<DisplayData>
> {
  /**
   * In this mousedown handler, we use event delegation so we have to use
   * `target` instead of `currentTarget`.
   */
  _onMouseDown = (
    event: {
      target: Element;
    } & React.MouseEvent<Element>
  ) => {
    const { nodeId, onClick } = this.props;
    if (!event.target.classList.contains(TREE_ROW_TOGGLE_CLASS)) {
      onClick(nodeId, event);
    }
  };

  _onToggleClick = (
    event: {
      target: Element;
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
      canBeExpanded,
      isExpanded,
      isSelected,
      highlightRegExp,
      rowHeightStyle,
      indentWidth,
      nodeId,
      categoryClassName,
      categoryName,
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
    // @ts-ignore-next-line
    let selfDisplay = displayData.selfTimeUnit;
    if (selfDisplay === "—") {
      selfDisplay = "0ms";
    }

    return (
      <div
        className={clsx(TREE_VIEW_ROW_STYLE, isSelected && TREE_VIEW_SELECTED_ROW_STYLE, "relative")}
        style={rowHeightStyle}
        // @ts-ignore-next-line
        onMouseDown={this._onMouseDown}
        // The following attributes are important for accessibility.
        aria-expanded={ariaExpanded}
        aria-level={depth + 1}
        aria-selected={isSelected}
        // @ts-ignore-next-line
        aria-label={displayData.ariaLabel}
        // The role and id attributes are used along with aria-activedescendant
        // (set on the parent), to manage the virtual focus of the tree items.
        // The "virtual" focus changes with the arrow keys.
        role="treeitem"
        id={`treeViewRow-${nodeId}`}
      >
        <span className="h-full w-[7.5px] bg-transparent" />
        {/* indent spacer */}
        <span className="shrink-0" style={{ width: `${depth * indentWidth}px` }} />
        <span
          className={clsx(
            TREE_ROW_TOGGLE_CLASS,
            "-rotate-90 text-gray-500 [&>svg]:pointer-events-none",
            isExpanded && "rotate-0",
            !canBeExpanded && "invisible"
          )}
          // @ts-ignore-next-line
          onClick={this._onToggleClick}
        >
          <MiniChevronDownIcon />
        </span>
        {categoryClassName && (
          <span
            // @ts-ignore-next-line
            className={`${categoryClassName} ml-[5px] mr-1.5 h-2 min-h-[0.5rem] w-2 min-w-[0.5rem] rounded-full border`}
            // @ts-ignore-next-line
            {...(categoryName && { title: categoryName })}
          />
        )}

        <span className={clsx(TREE_VIEW_ROW_COLUMN_STYLE, "!text-black", mainColumn.propName)}>
          {RenderComponent ? (
            <RenderComponent displayData={displayData} />
          ) : (
            reactStringWithHighlightedSubstrings(
              // @ts-ignore-next-line
              displayData[mainColumn.propName],
              highlightRegExp,
              TREE_VIEW_HIGHLIGHT
            )
          )}
        </span>

        {appendageColumn ? (
          <span className={clsx(TREE_VIEW_ROW_COLUMN_STYLE, "ml-1.5 !text-gray-500", `${appendageColumn.propName}`)}>
            {reactStringWithHighlightedSubstrings(
              // @ts-ignore-next-line
              displayData[appendageColumn.propName],
              highlightRegExp,
              TREE_VIEW_HIGHLIGHT
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
  getNodeTotalRelative(arg1: NodeIndex): number;
}

type TreeViewProps<DisplayData> = {
  readonly fixedColumns: MaybeResizableColumn<DisplayData>[];
  readonly mainColumn: Column<DisplayData>;
  readonly tree: Tree<DisplayData>;
  readonly compareTree: Tree<DisplayData> | null;
  readonly callNodeIndexToCompareCallNodeIndexTable: CallNodeIndexToCompareCallNodeIndexTable | null;
  readonly isCompareMode: boolean;
  readonly expandedNodeIds: Array<NodeIndex | null>;
  readonly selectedNodeId: NodeIndex | null;
  readonly rightClickedNodeId?: NodeIndex | null;
  readonly onExpandedNodesChange: (arg1: Array<NodeIndex | null>) => unknown;
  readonly highlightRegExp?: RegExp | null;
  readonly appendageColumn?: Column<DisplayData>;
  readonly disableOverscan?: boolean;
  readonly maxNodeDepth: number;
  readonly onSelectionChange: (
    arg1: NodeIndex,
    arg2: {
      source: "keyboard" | "pointer";
    }
  ) => unknown;
  readonly onRightClickSelection?: (arg1: NodeIndex) => unknown;
  readonly onEnterKey?: (arg1: NodeIndex) => unknown;
  readonly onDoubleClick?: (arg1: NodeIndex) => unknown;
  readonly rowHeight: CssPixels;
  readonly indentWidth: CssPixels;
  readonly onKeyDown?: (arg1: React.KeyboardEvent) => void;
  readonly viewOptions: TableViewOptions;
  readonly onViewOptionsChange?: (arg1: TableViewOptions) => void;
};

type TreeViewState = {
  readonly fixedColumnWidths: Array<CssPixels> | null;
  readonly isResizingColumns?: number;
};

export class TreeView<DisplayData extends any> extends React.PureComponent<TreeViewProps<DisplayData>, TreeViewState> {
  _list: VirtualList<NodeIndex> | null = null;
  _takeListRef = (list: VirtualList<NodeIndex> | null) => (this._list = list);

  // This contains the information about the current column resizing happening currently.
  _currentMovedColumnState: {
    columnIndex: number;
    startX: CssPixels;
    initialWidth: CssPixels;
  } | null = null;

  state = {
    // This contains the current widths, while or after the user resizes them.
    fixedColumnWidths: null,

    // This contains the column index which is being resized. If none, than it's undefined.
    isResizingColumns: undefined,
  };

  // This is incremented when a column changed its size. We use this to force a
  // rerender of the VirtualList component.
  _columnSizeChangedCounter: number = 0;

  // The tuple `specialItems` always contains 2 elements: the first element is
  // the selected node id (if any), and the second element is the right clicked
  // id (if any).
  _computeSpecialItemsMemoized = memoize(
    (
      selectedNodeId: NodeIndex | null,
      rightClickedNodeId?: NodeIndex | null
    ): [NodeIndex | undefined, NodeIndex | undefined] => [selectedNodeId ?? undefined, rightClickedNodeId ?? undefined],
    { limit: 1 }
  );

  _computeExpandedNodesMemoized = memoize(
    (expandedNodeIds: Array<NodeIndex | null>) => new Set<NodeIndex | null>(expandedNodeIds),
    { limit: 1 }
  );

  _computeInitialColumnWidthsMemoized = memoize((fixedColumns: Array<MaybeResizableColumn<DisplayData>>): CssPixels[] =>
    fixedColumns.map((c) => c.initialWidth)
  );

  // This returns the column widths from several possible sources, in this order:
  // * the current state (this means the user changed them recently, or is
  //   currently changing them)
  // * the view options (this comes from the redux state, this means the user
  //   changed them in the past)
  // * or finally the initial values from the fixedColumns information.
  _getCurrentFixedColumnWidths = (): Array<CssPixels> => {
    return (
      this.state.fixedColumnWidths ||
      this.props.viewOptions.fixedColumnWidths ||
      this._computeInitialColumnWidthsMemoized(this.props.fixedColumns)
    );
  };

  _getCurrentViewOptions = (): TableViewOptionsWithDefault => {
    return {
      fixedColumnWidths: this._getCurrentFixedColumnWidths(),
    };
  };

  _onColumnWidthChangeStart = (columnIndex: number, startX: CssPixels) => {
    this._currentMovedColumnState = {
      columnIndex,
      startX,
      initialWidth: this._getCurrentFixedColumnWidths()[columnIndex],
    };
    this.setState({ isResizingColumns: columnIndex });
    window.addEventListener("mousemove", this._onColumnWidthChangeMouseMove);
    window.addEventListener("mouseup", this._onColumnWidthChangeMouseUp);
  };

  _cleanUpMouseHandlers = () => {
    window.removeEventListener("mousemove", this._onColumnWidthChangeMouseMove);
    window.removeEventListener("mouseup", this._onColumnWidthChangeMouseUp);
  };

  _onColumnWidthChangeMouseMove = (event: MouseEvent) => {
    const columnState = this._currentMovedColumnState;
    if (columnState !== null) {
      const { columnIndex, startX, initialWidth } = columnState;
      const column = this.props.fixedColumns[columnIndex];
      const fixedColumnWidths = this._getCurrentFixedColumnWidths();
      const diff = event.clientX - startX;
      const newWidth = Math.max(initialWidth + diff, column.minWidth || 10);
      this.setState((prevState) => {
        this._columnSizeChangedCounter++;
        const newFixedColumnWidths = (prevState.fixedColumnWidths || fixedColumnWidths).slice();
        newFixedColumnWidths[columnIndex] = newWidth;
        return {
          fixedColumnWidths: newFixedColumnWidths,
        };
      });
    }
  };

  _onColumnWidthChangeMouseUp = () => {
    this.setState({ isResizingColumns: undefined });
    this._cleanUpMouseHandlers();
    this._currentMovedColumnState = null;
    this._propagateColumnWidthChange(this._getCurrentFixedColumnWidths());
  };

  componentWillUnmount = () => {
    this._cleanUpMouseHandlers();
  };

  _onColumnWidthReset = (columnIndex: number) => {
    const column = this.props.fixedColumns[columnIndex];
    const fixedColumnWidths = this._getCurrentFixedColumnWidths();
    const newFixedColumnWidths = fixedColumnWidths.slice();
    newFixedColumnWidths[columnIndex] = column.initialWidth || 10;
    this._columnSizeChangedCounter++;
    this.setState({ fixedColumnWidths: newFixedColumnWidths });
    this._propagateColumnWidthChange(newFixedColumnWidths);
  };

  // triggers a re-render
  _propagateColumnWidthChange = (fixedColumnWidths: Array<CssPixels>) => {
    const { onViewOptionsChange, viewOptions } = this.props;
    if (onViewOptionsChange) {
      onViewOptionsChange({
        ...viewOptions,
        fixedColumnWidths,
      });
    }
  };

  _computeAllVisibleRowsMemoized = memoize(
    (tree: Tree<DisplayData>, expandedNodes: Set<NodeIndex | null>) => {
      function _addVisibleRowsFromNode(
        tree: Tree<DisplayData>,
        expandedNodes: Set<number | null>,
        arr: number[],
        nodeId: number
      ) {
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
      const allRows: number[] = [];
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
    const list = this._list; // this temp variable so that flow knows that it's non-null later
    if (list) {
      if (selectedNodeId === null) {
        list.scrollItemIntoView(0, 0);
      } else {
        const rowIndex = this._getAllVisibleRows().indexOf(selectedNodeId);
        const depth = tree.getDepth(selectedNodeId);
        const totalFixedColumnWidth = this._getCurrentFixedColumnWidths().reduce((a, b) => a + b, 0);
        list.scrollItemIntoView(rowIndex, depth * 10, totalFixedColumnWidth);
      }
    }
  }

  _renderRow = (nodeId: NodeIndex, index: number, columnIndex: number) => {
    const {
      tree,
      compareTree,
      isCompareMode,
      callNodeIndexToCompareCallNodeIndexTable,
      fixedColumns,
      mainColumn,
      appendageColumn,
      selectedNodeId,
      rightClickedNodeId,
      highlightRegExp,
      rowHeight,
      indentWidth,
    } = this.props;
    // React converts height into 'px' values, while lineHeight is valid in
    // non-'px' units.
    const rowHeightStyle = { height: rowHeight, lineHeight: `${rowHeight}px` } as const;

    const { displayData, categoryClassName, categoryName, columnsColor } = (() => {
      const displayData = tree.getDisplayData(nodeId);

      if (!isCompareMode || !compareTree)
        return {
          displayData, // @ts-ignore-next-line
          categoryClassName: `category-color-${displayData.categoryColor}`,
          // @ts-ignore-next-line
          categoryName: displayData.categoryName,
          columnsColor: {},
        };

      const compareCallNodeIndex = callNodeIndexToCompareCallNodeIndexTable?.get(nodeId);
      const compareDisplayData = compareCallNodeIndex != null ? compareTree.getDisplayData(compareCallNodeIndex) : null;

      // @ts-ignore-next-line
      const totalRelative = compareDisplayData ? compareDisplayData.totalRelative : null;
      // @ts-ignore-next-line
      const selfRelative = compareDisplayData ? compareDisplayData.selfRelative : null;

      const totalColorStyle = mapTimeToCompareColor(totalRelative ?? 0);
      const selfColorStyle = mapTimeToCompareColor(selfRelative ?? 0);

      const categoryClassName = totalColorStyle.className;
      const categoryName = undefined;

      const columnsColor = {
        totalPercentCompare: totalColorStyle.soloForegroundColor,
        selfPercentCompare: selfColorStyle.soloForegroundColor,
      };

      return {
        displayData: {
          // @ts-ignore-next-line
          ...displayData,
          // @ts-ignore-next-line
          selfPercentCompare: compareDisplayData ? formatComparePercent(compareDisplayData.selfRelative) : "0.00%",
          // @ts-ignore-next-line
          totalPercentCompare: compareDisplayData ? formatComparePercent(compareDisplayData.totalRelative) : "0.00%",
        },
        categoryClassName,
        categoryName,
        columnsColor,
      };
    })();

    if (columnIndex === 0) {
      return (
        <TreeViewRowFixedColumns
          displayData={displayData}
          columns={fixedColumns}
          viewOptions={this._getCurrentViewOptions()}
          nodeId={nodeId}
          index={index}
          isSelected={nodeId === selectedNodeId}
          isRightClicked={nodeId === rightClickedNodeId}
          onClick={this._onRowClicked}
          highlightRegExp={highlightRegExp || null}
          rowHeightStyle={rowHeightStyle}
          columnsColor={columnsColor}
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
        categoryClassName={categoryClassName}
        categoryName={categoryName}
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
    return this._computeSpecialItemsMemoized(selectedNodeId, rightClickedNodeId);
  }

  _isCollapsed(nodeId: NodeIndex): boolean {
    return !this._getExpandedNodes().has(nodeId);
  }

  _toggle = (nodeId: NodeIndex, newExpanded: boolean = this._isCollapsed(nodeId), toggleAll: boolean = false) => {
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

  _toggleAll(nodeId: NodeIndex, newExpanded: boolean = this._isCollapsed(nodeId)) {
    this._toggle(nodeId, newExpanded, true);
  }

  _selectWithMouse(nodeId: NodeIndex) {
    this.props.onSelectionChange(nodeId, { source: "pointer" });
  }

  _rightClickSelect(nodeId: NodeIndex) {
    if (this.props.onRightClickSelection) {
      this.props.onRightClickSelection(nodeId);
    } else {
      this._selectWithMouse(nodeId);
    }
  }

  _onRowClicked = (nodeId: NodeIndex, event: React.MouseEvent) => {
    if (event.button === 0) {
      this._selectWithMouse(nodeId);
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
      // @ts-ignore-next-line
      clipboardData.setData("text/plain", displayData[mainColumn.propName]);
    }
  };

  _selectWithKeyboard(nodeId: NodeIndex) {
    this.props.onSelectionChange(nodeId, { source: "keyboard" });
  }

  _onKeyDown = (event: React.KeyboardEvent) => {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event);
    }

    const hasModifier = event.ctrlKey || event.altKey;
    const isNavigationKey =
      event.key.startsWith("Arrow") || event.key.startsWith("Page") || event.key === "Home" || event.key === "End";
    const isAsteriskKey = event.key === "*";
    const isEnterKey = event.key === "Enter";

    if (hasModifier || (!isNavigationKey && !isAsteriskKey && !isEnterKey)) {
      // No key events that we care about were found, so don't try and handle them.
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const selected = this.props.selectedNodeId;
    const visibleRows = this._getAllVisibleRows();
    const selectedRowIndex = visibleRows.findIndex((nodeId) => nodeId === selected);

    if (selected === null || selectedRowIndex === -1) {
      // the first condition is redundant, but it makes flow happy
      this._selectWithKeyboard(visibleRows[0]);
      return;
    }

    if (isNavigationKey) {
      switch (event.key) {
        case "ArrowUp": {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the Home gesture
            this._selectWithKeyboard(visibleRows[0]);
            break;
          }

          if (selectedRowIndex > 0) {
            this._selectWithKeyboard(visibleRows[selectedRowIndex - 1]);
          }
          break;
        }
        case "ArrowDown": {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the End gesture
            this._selectWithKeyboard(visibleRows[visibleRows.length - 1]);
            break;
          }

          if (selectedRowIndex < visibleRows.length - 1) {
            this._selectWithKeyboard(visibleRows[selectedRowIndex + 1]);
          }
          break;
        }
        case "PageUp": {
          if (selectedRowIndex > 0) {
            const nextRow = Math.max(0, selectedRowIndex - PAGE_KEYS_DELTA);
            this._selectWithKeyboard(visibleRows[nextRow]);
          }
          break;
        }
        case "PageDown": {
          if (selectedRowIndex < visibleRows.length - 1) {
            const nextRow = Math.min(visibleRows.length - 1, selectedRowIndex + PAGE_KEYS_DELTA);
            this._selectWithKeyboard(visibleRows[nextRow]);
          }
          break;
        }
        case "Home": {
          this._selectWithKeyboard(visibleRows[0]);
          break;
        }
        case "End": {
          this._selectWithKeyboard(visibleRows[visibleRows.length - 1]);
          break;
        }
        case "ArrowLeft": {
          const isCollapsed = this._isCollapsed(selected);
          if (!isCollapsed) {
            this._toggle(selected);
          } else {
            const parent = this.props.tree.getParent(selected);
            if (parent !== -1) {
              this._selectWithKeyboard(parent);
            }
          }
          break;
        }
        case "ArrowRight": {
          const isCollapsed = this._isCollapsed(selected);
          if (isCollapsed) {
            this._toggle(selected);
          } else {
            // Do KEY_DOWN only if the next element is a child
            if (this.props.tree.hasChildren(selected)) {
              this._selectWithKeyboard(this.props.tree.getChildren(selected)[0]);
            }
          }
          break;
        }
        default:
          throw new Error("Unhandled navigation key.");
      }
    }

    const { rightClickedNodeId } = this.props;
    const focusedNodeId = rightClickedNodeId ?? selected;
    if (isAsteriskKey) {
      this._toggleAll(focusedNodeId);
    }

    if (isEnterKey) {
      const { onEnterKey } = this.props;
      if (onEnterKey && focusedNodeId !== null) {
        onEnterKey(focusedNodeId);
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
    const { fixedColumns, mainColumn, disableOverscan, maxNodeDepth, rowHeight, selectedNodeId } = this.props;
    const { isResizingColumns } = this.state;
    return (
      <div
        className={clsx(
          "treeView relative z-0 flex flex-1 flex-col flex-nowrap overflow-auto outline-0 will-change-scroll",
          {
            isResizingColumns,
          }
        )}
      >
        <TreeViewHeader
          fixedColumns={fixedColumns}
          mainColumn={mainColumn}
          isResizingColumns={isResizingColumns}
          viewOptions={this._getCurrentViewOptions()}
          onColumnWidthChangeStart={this._onColumnWidthChangeStart}
          onColumnWidthReset={this._onColumnWidthReset}
        />
        <VirtualList
          className="treeViewBody"
          ariaRole="tree"
          ariaLabel="Call tree"
          // This attribute exposes the current active child element,
          // while keeping focus on the parent (call tree).
          ariaActiveDescendant={selectedNodeId !== null ? `treeViewRow-${selectedNodeId}` : null}
          items={this._getAllVisibleRows()}
          renderItem={this._renderRow}
          itemHeight={rowHeight}
          columnCount={2}
          focusable={true}
          onKeyDown={this._onKeyDown}
          specialItems={this._getSpecialItems()}
          disableOverscan={!!disableOverscan || !!isResizingColumns}
          onCopy={this._onCopy}
          // If there is a deep call node depth, expand the width, or else keep it
          // at 3000 wide.
          containerWidth={Math.max(3000, maxNodeDepth * 10 + 2000)}
          ref={this._takeListRef}
          forceRender={this._columnSizeChangedCounter}
        />
      </div>
    );
  }
}
