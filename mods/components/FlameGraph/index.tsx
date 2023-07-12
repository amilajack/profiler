/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from "react";

import explicitConnect from "../../utils/connect";
import { FlameGraphCanvas } from "~/components/FFP/components/FlameGraph/Canvas";

import {
  getCategories,
  getCommittedRange,
  getPreviewSelection,
  getScrollToSelectionGeneration,
  getProfileInterval,
  getInnerWindowIDToPageMap,
  getProfileUsesMultipleStackTypes,
  getProfileUsesFrameImplementation,
} from "~/components/FFP/selectors/profile";
import {
  compareThreadSelectors,
  getCallNodeIndexToCompareCallNodeIndexTable,
  selectedThreadSelectors,
} from "~/components/FFP/selectors/per-thread";
import { getSelectedThreadsKey, getInvertCallstack, getIsCompareMode } from "~/components/FFP/selectors/url-state";
import { getCallNodePathFromIndex } from "~/components/FFP/profile-logic/profile-data";
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  updateBottomBoxContentsAndOpen,
  updateBottomBoxContents,
} from "~/components/FFP/actions/profile-view";

import type {
  Thread,
  CategoryList,
  Milliseconds,
  StartEndRange,
  WeightType,
  SamplesLikeTable,
  PreviewSelection,
  CallTreeSummaryStrategy,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  TracedTiming,
  ThreadsKey,
  InnerWindowID,
  Page,
  UnitIntervalOfProfileRange,
  CallNodeIndexToCompareCallNodeIndexTable,
} from "~/components/FFP/types";

import type { FlameGraphTiming } from "~/components/FFP/profile-logic/flame-graph";
import type { CallTree } from "~/components/FFP/profile-logic/call-tree";
import type { ConnectedProps } from "~/components/FFP/utils/connect";
import { JS_TRACER_MAXIMUM_CHART_ZOOM } from "../../app-logic/constants";
import { getIsExpandedMode } from "../../selectors";

const STACK_FRAME_CSS_PIXELS_HEIGHT = 17;

/**
 * How "wide" a call node box needs to be for it to be able to be
 * selected with keyboard navigation. This is a fraction between 0 and
 * 1, where 1 means the box spans the whole viewport.
 */
const SELECTABLE_THRESHOLD = 0.001;

type StateProps = {
  readonly thread: Thread;
  readonly weightType: WeightType;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly unfilteredThread: Thread;
  readonly sampleIndexOffset: number;
  readonly maxStackDepth: number;
  readonly timeRange: StartEndRange;
  readonly previewSelection: PreviewSelection;
  readonly flameGraphTiming: FlameGraphTiming;
  readonly callTree: CallTree;
  readonly compareCallTree: CallTree | null;
  readonly callNodeIndexToCompareCallNodeIndexTable: CallNodeIndexToCompareCallNodeIndexTable | null;
  readonly isCompareMode: boolean;
  readonly isExpandedMode: boolean;
  readonly callNodeInfo: CallNodeInfo;
  readonly threadsKey: ThreadsKey;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly scrollToSelectionGeneration: number;
  readonly categories: CategoryList;
  readonly interval: Milliseconds;
  readonly isInverted: boolean;
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly samples: SamplesLikeTable;
  readonly unfilteredSamples: SamplesLikeTable;
  readonly tracedTiming: TracedTiming | null;
  readonly displayImplementation: boolean;
  readonly displayStackType: boolean;
};
type DispatchProps = {
  readonly changeSelectedCallNode: typeof changeSelectedCallNode;
  readonly changeRightClickedCallNode: typeof changeRightClickedCallNode;
  readonly updateBottomBoxContentsAndOpen: typeof updateBottomBoxContentsAndOpen;
  readonly updateBottomBoxContents: typeof updateBottomBoxContents;
};
type Props = ConnectedProps<Record<any, any>, StateProps, DispatchProps>;

class FlameGraphImpl extends React.PureComponent<Props> {
  _viewport: HTMLDivElement | null = null;

  /**
   * Determine the maximum amount available to zoom in.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    return JS_TRACER_MAXIMUM_CHART_ZOOM;
  }

  componentDidMount() {
    document.addEventListener("copy", this._onCopy, false);
  }

  componentWillUnmount() {
    document.removeEventListener("copy", this._onCopy, false);
  }

  _onSelectedCallNodeChange = (callNodeIndex: IndexIntoCallNodeTable | null) => {
    const { callTree, callNodeInfo, threadsKey, changeSelectedCallNode, updateBottomBoxContents } = this.props;
    changeSelectedCallNode(threadsKey, getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable));

    if (callNodeIndex === null) return;
    const bottomBoxInfo = callTree.getBottomBoxInfoForCallNode(callNodeIndex);
    updateBottomBoxContents(bottomBoxInfo);
  };

  _onRightClickedCallNodeChange = (callNodeIndex: IndexIntoCallNodeTable | null) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;
    changeRightClickedCallNode(threadsKey, getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable));
  };

  _onCallNodeEnterOrDoubleClick = (callNodeIndex: IndexIntoCallNodeTable | null) => {
    if (callNodeIndex === null) return;
    const { callTree, updateBottomBoxContentsAndOpen } = this.props;
    const bottomBoxInfo = callTree.getBottomBoxInfoForCallNode(callNodeIndex);
    updateBottomBoxContentsAndOpen(bottomBoxInfo);
  };

  _shouldDisplayTooltips = () => this.props.rightClickedCallNodeIndex === null;

  _takeViewportRef = (viewport: HTMLDivElement | null) => {
    this._viewport = viewport;
  };

  /* This method is called from MaybeFlameGraph. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus = () => {
    if (this._viewport) {
      this._viewport.focus();
    }
  };

  /**
   * Is the box for this call node wide enough to be selected?
   */
  _wideEnough = (callNodeIndex: IndexIntoCallNodeTable): boolean => {
    const {
      flameGraphTiming,
      callNodeInfo: { callNodeTable },
    } = this.props;

    const depth = callNodeTable.depth[callNodeIndex];
    const row = flameGraphTiming[depth];
    const columnIndex = row.callNode.indexOf(callNodeIndex);
    return row.end[columnIndex] - row.start[columnIndex] > SELECTABLE_THRESHOLD;
  };

  /**
   * Return next keyboard selectable callNodeIndex along one
   * horizontal direction.
   *
   * `direction` should be either -1 (left) or 1 (right).
   *
   * Returns undefined if no selectable callNodeIndex can be found.
   * This means we're already at the end, or the boxes of all
   * candidate call nodes are too narrow to be selected.
   */
  _nextSelectableInRow = (
    startingCallNodeIndex: IndexIntoCallNodeTable,
    direction: 1 | -1
  ): IndexIntoCallNodeTable | undefined => {
    const {
      flameGraphTiming,
      callNodeInfo: { callNodeTable },
    } = this.props;

    let callNodeIndex = startingCallNodeIndex;

    const depth = callNodeTable.depth[callNodeIndex];
    const row = flameGraphTiming[depth];
    let columnIndex = row.callNode.indexOf(callNodeIndex);

    do {
      columnIndex += direction;
      callNodeIndex = row.callNode[columnIndex];
      if (row.end[columnIndex] - row.start[columnIndex] > SELECTABLE_THRESHOLD) {
        // The box for this callNodeIndex is wide enough. We've found
        // a candidate.
        break;
      }
    } while (callNodeIndex !== undefined);

    return callNodeIndex;
  };

  _handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const {
      threadsKey,
      callTree,
      callNodeInfo: { callNodeTable },
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      changeSelectedCallNode,
    } = this.props;

    if (
      // Please do not forget to update the switch/case below if changing the array to allow more keys.
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      event.stopPropagation();
      event.preventDefault();

      if (selectedCallNodeIndex === null) {
        // Just select the "root" node if we've got no prior selection.
        changeSelectedCallNode(threadsKey, getCallNodePathFromIndex(0, callNodeTable));
        return;
      }

      switch (event.key) {
        case "ArrowDown": {
          const [callNodeIndex] = callTree.getChildren(selectedCallNodeIndex);
          // The call nodes returned from getChildren are sorted by
          // total time in descending order.  The first one in the
          // array, which is the one we pick, has the longest time and
          // thus the widest box.

          if (callNodeIndex !== undefined && this._wideEnough(callNodeIndex)) {
            changeSelectedCallNode(threadsKey, getCallNodePathFromIndex(callNodeIndex, callNodeTable));
          }
          break;
        }
        case "ArrowUp": {
          const prefix = callNodeTable.prefix[selectedCallNodeIndex];
          if (prefix !== -1) {
            changeSelectedCallNode(threadsKey, getCallNodePathFromIndex(prefix, callNodeTable));
          }
          break;
        }
        case "ArrowLeft":
        case "ArrowRight": {
          const callNodeIndex = this._nextSelectableInRow(selectedCallNodeIndex, event.key === "ArrowLeft" ? -1 : 1);

          if (callNodeIndex !== undefined) {
            changeSelectedCallNode(threadsKey, getCallNodePathFromIndex(callNodeIndex, callNodeTable));
          }
          break;
        }
        default:
          // We shouldn't arrive here, thanks to the if block at the top.
          console.error(`An unknown key "${event.key}" was pressed, this shouldn't happen.`);
      }
      return;
    }

    // Otherwise, handle shortcuts for the call node transforms.
    const nodeIndex = rightClickedCallNodeIndex !== null ? rightClickedCallNodeIndex : selectedCallNodeIndex;
    if (nodeIndex === null) {
      return;
    }

    if (event.key === "Enter") {
      this._onCallNodeEnterOrDoubleClick(nodeIndex);
      return;
    }
  };

  _onCopy = (event: ClipboardEvent) => {
    if (document.activeElement === this._viewport) {
      event.preventDefault();
      const {
        callNodeInfo: { callNodeTable },
        selectedCallNodeIndex,
        thread,
      } = this.props;
      if (selectedCallNodeIndex !== null) {
        const funcIndex = callNodeTable.func[selectedCallNodeIndex];
        const funcName = thread.stringTable.getString(thread.funcTable.name[funcIndex]);
        event.clipboardData?.setData("text/plain", funcName);
      }
    }
  };

  render() {
    const {
      thread,
      unfilteredThread,
      sampleIndexOffset,
      threadsKey,
      maxStackDepth,
      flameGraphTiming,
      callTree,
      callNodeInfo,
      timeRange,
      previewSelection,
      rightClickedCallNodeIndex,
      selectedCallNodeIndex,
      scrollToSelectionGeneration,
      callTreeSummaryStrategy,
      categories,
      interval,
      isInverted,
      innerWindowIDToPageMap,
      weightType,
      samples,
      unfilteredSamples,
      tracedTiming,
      displayImplementation,
      displayStackType,
      compareCallTree,
      callNodeIndexToCompareCallNodeIndexTable,
      isCompareMode,
      isExpandedMode,
    } = this.props;

    const maxViewportHeight = maxStackDepth * STACK_FRAME_CSS_PIXELS_HEIGHT;

    return (
      <div className="flex flex-1 flex-row outline-0" onKeyDown={this._handleKeyDown}>
        <FlameGraphCanvas
          key={threadsKey}
          // ChartViewport props
          viewportProps={{
            timeRange,
            maxViewportHeight,
            maximumZoom: this.getMaximumZoom(),
            previewSelection,
            startsAtBottom: false,
            disableHorizontalMovement: !isExpandedMode,
            viewportNeedsUpdate,
            marginLeft: 0,
            marginRight: 0,
            containerRef: this._takeViewportRef,
          }}
          // FlameGraphCanvas props
          chartProps={{
            timeRange,
            thread,
            innerWindowIDToPageMap,
            weightType,
            unfilteredThread,
            sampleIndexOffset,
            maxStackDepth,
            flameGraphTiming,
            callTree,
            compareCallTree,
            callNodeIndexToCompareCallNodeIndexTable,
            isCompareMode,
            callNodeInfo,
            categories,
            selectedCallNodeIndex,
            rightClickedCallNodeIndex,
            scrollToSelectionGeneration,
            callTreeSummaryStrategy,
            stackFrameHeight: STACK_FRAME_CSS_PIXELS_HEIGHT,
            onSelectionChange: this._onSelectedCallNodeChange,
            onRightClick: this._onRightClickedCallNodeChange,
            onDoubleClick: this._onCallNodeEnterOrDoubleClick,
            shouldDisplayTooltips: this._shouldDisplayTooltips,
            interval,
            isInverted,
            samples,
            unfilteredSamples,
            tracedTiming,
            displayImplementation,
            displayStackType,
          }}
        />
      </div>
    );
  }
}

function viewportNeedsUpdate() {
  // By always returning false we prevent the viewport from being
  // reset and scrolled all the way to the bottom when doing
  // operations like changing the time selection or applying a
  // transform.
  return false;
}

export const FlameGraph = explicitConnect<Record<any, any>, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    const isCompareMode = getIsCompareMode(state);
    return {
      thread: selectedThreadSelectors.getFilteredThread(state),
      unfilteredThread: selectedThreadSelectors.getThread(state),
      weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
      sampleIndexOffset: selectedThreadSelectors.getSampleIndexOffsetFromCommittedRange(state),
      // Use the filtered call node max depth, rather than the preview filtered one, so
      // that the viewport height is stable across preview selections.
      maxStackDepth: selectedThreadSelectors.getFilteredCallNodeMaxDepth(state),
      flameGraphTiming: selectedThreadSelectors.getFlameGraphTiming(state),
      callTree: selectedThreadSelectors.getCallTree(state),
      compareCallTree: isCompareMode ? compareThreadSelectors.getCallTree(state) : null,
      callNodeIndexToCompareCallNodeIndexTable: isCompareMode
        ? getCallNodeIndexToCompareCallNodeIndexTable(state)
        : null,
      isCompareMode,
      isExpandedMode: getIsExpandedMode(state),
      timeRange: getCommittedRange(state),
      previewSelection: getPreviewSelection(state),
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      categories: getCategories(state),
      threadsKey: getSelectedThreadsKey(state),
      selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(state),
      rightClickedCallNodeIndex: selectedThreadSelectors.getRightClickedCallNodeIndex(state),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      interval: getProfileInterval(state),
      isInverted: getInvertCallstack(state),
      callTreeSummaryStrategy: selectedThreadSelectors.getCallTreeSummaryStrategy(state),
      innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
      samples: selectedThreadSelectors.getPreviewFilteredSamplesForCallTree(state),
      unfilteredSamples: selectedThreadSelectors.getUnfilteredSamplesForCallTree(state),
      tracedTiming: selectedThreadSelectors.getTracedTiming(state),
      displayImplementation: getProfileUsesFrameImplementation(state),
      displayStackType: getProfileUsesMultipleStackTypes(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    updateBottomBoxContentsAndOpen,
    updateBottomBoxContents,
  },
  options: { forwardRef: true },
  component: FlameGraphImpl,
});
