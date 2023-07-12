/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import memoize from "memoize-immutable";
import * as React from "react";
import { Viewport, WithChartViewport, withChartViewport } from "~/components/FFP/components/shared/chart/Viewport";
import { FastFillStyle } from "~/components/FFP/utils";
import { mapCategoryColorNameToStackChartStyles, mapTimeToCompareColor } from "~/components/FFP/utils/colors";
import { formatComparePercent } from "~/components/FFP/utils/format-numbers";
import TextMeasurement from "~/components/FFP/utils/text-measurement";
import { ChartCanvas } from "../shared/chart/Canvas";
import MixedTupleMap from "mixedtuplemap";
import { getTimingsForCallNodeIndex } from "~/components/FFP/profile-logic/profile-data";

import type {
  CallNodeIndexToCompareCallNodeIndexTable,
  CallNodeInfo,
  CallTreeSummaryStrategy,
  CategoryList,
  CssPixels,
  DevicePixels,
  IndexIntoCallNodeTable,
  InnerWindowID,
  Milliseconds,
  Page,
  SamplesLikeTable,
  StartEndRange,
  Thread,
  TracedTiming,
  UnitIntervalOfProfileRange,
  WeightType,
} from "~/components/FFP/types";

import type {
  FlameGraphDepth,
  FlameGraphTiming,
  IndexIntoFlameGraphTiming,
} from "~/components/FFP/profile-logic/flame-graph";

import { FlameGraphTooltip } from "~/components/FFP/components/FlameGraph/Tooltip";
import type { CallTree } from "~/components/FFP/profile-logic/call-tree";

const TEXT_CSS_PIXELS_OFFSET_START = 4;
const TEXT_CSS_PIXELS_OFFSET_TOP = 11;
const BORDER_RIGHT_DEVICE_PIXELS = 1;
const FONT_SIZE = 10;
const BORDER_RIGHT_OPACITY = 0;
const MARGIN_X = 12;
const SELECTION_BORDER = -1;

export type OwnProps = {
  readonly timeRange: StartEndRange;
  readonly thread: Thread;
  readonly weightType: WeightType;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly unfilteredThread: Thread;
  readonly sampleIndexOffset: number;
  readonly maxStackDepth: number;
  readonly flameGraphTiming: FlameGraphTiming;
  readonly callNodeInfo: CallNodeInfo;
  readonly callTree: CallTree;
  readonly compareCallTree: CallTree | null;
  readonly callNodeIndexToCompareCallNodeIndexTable: CallNodeIndexToCompareCallNodeIndexTable | null;
  readonly isCompareMode: boolean;
  readonly stackFrameHeight: CssPixels;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly onSelectionChange: (arg1: IndexIntoCallNodeTable | null) => void;
  readonly onRightClick: (arg1: IndexIntoCallNodeTable | null) => void;
  readonly onDoubleClick: (arg1: IndexIntoCallNodeTable | null) => void;
  readonly shouldDisplayTooltips: () => boolean;
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

type Props = OwnProps & {
  // Bring in the viewport props from the higher order Viewport component.
  readonly viewport: Viewport;
};

type HoveredStackTiming = {
  readonly depth: FlameGraphDepth;
  readonly flameGraphTimingIndex: IndexIntoFlameGraphTiming;
};

class FlameGraphCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;

  componentDidUpdate(prevProps: Props) {
    // We want to scroll the selection into view when this component
    // is mounted, but using componentDidMount won't work here as the
    // viewport will not have completed setting its size by
    // then. Instead, look for when the viewport's isSizeSet prop
    // changes to true.
    const viewportDidMount = !prevProps.viewport.isSizeSet && this.props.viewport.isSizeSet;
    if (viewportDidMount || this.props.scrollToSelectionGeneration > prevProps.scrollToSelectionGeneration) {
      this._scrollSelectionIntoView();
    }
  }

  _scrollSelectionIntoView = () => {
    const {
      stackFrameHeight,
      selectedCallNodeIndex,
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (selectedCallNodeIndex === null) return;

    const depth = callNodeTable.depth[selectedCallNodeIndex];
    const y = depth * stackFrameHeight;

    if (y < this.props.viewport.viewportTop) {
      this.props.viewport.moveViewport(0, this.props.viewport.viewportTop - y);
    } else if (y + stackFrameHeight > this.props.viewport.viewportBottom) {
      this.props.viewport.moveViewport(0, this.props.viewport.viewportBottom - (y + stackFrameHeight));
    }
  };

  _drawCanvas = (ctx: CanvasRenderingContext2D, hoveredItem: HoveredStackTiming | null) => {
    const {
      thread,
      flameGraphTiming,
      callNodeInfo: { callNodeTable },
      stackFrameHeight,
      rightClickedCallNodeIndex,
      selectedCallNodeIndex,
      categories,
      isCompareMode,
      timeRange: { start: rangeStart, end: rangeEnd },
      viewport: { containerWidth, containerHeight, viewportLeft, viewportRight, viewportTop, viewportBottom },
      callNodeIndexToCompareCallNodeIndexTable,
      compareCallTree,
    } = this.props;

    const { devicePixelRatio } = window;
    const devicePixelsWidth = containerWidth * devicePixelRatio;
    const devicePixelsHeight = containerHeight * devicePixelRatio;

    // Prepare the canvas for drawing.
    ctx.font = `${FONT_SIZE * devicePixelRatio}px ${window
      .getComputedStyle(document.body)
      .getPropertyValue("font-family")}`;

    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx.
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    const textMeasurement = this._textMeasurement;
    const fastFillStyle = new FastFillStyle(ctx);
    fastFillStyle.set("#ffffff");
    ctx.fillRect(0, 0, devicePixelsWidth, devicePixelsHeight);

    const startDepth = Math.floor(viewportTop / stackFrameHeight);
    const endDepth = Math.ceil(viewportBottom / stackFrameHeight);

    const rangeLength = rangeEnd - rangeStart;

    const viewportLength: UnitIntervalOfProfileRange = viewportRight - viewportLeft;
    const viewportDevicePixelsTop = viewportTop * devicePixelRatio;

    // Calculate inner container for adding margins on the left and right.
    const innerContainerWidth = containerWidth - MARGIN_X * 2;
    const innerDevicePixelsWidth = innerContainerWidth * devicePixelRatio;

    const pixelsInViewport = viewportLength * innerDevicePixelsWidth;
    const timePerPixel = rangeLength / pixelsInViewport;

    // Decide which samples to actually draw
    const timeAtStart: Milliseconds = rangeStart + rangeLength * viewportLeft - timePerPixel;
    const timeAtEnd: Milliseconds = rangeStart + rangeLength * viewportRight;

    // Apply the device pixel ratio to various CssPixel constants.
    const rowDevicePixelsHeight = stackFrameHeight * devicePixelRatio;
    const oneCssPixelInDevicePixels = 1 * devicePixelRatio;
    const textDevicePixelsOffsetStart = TEXT_CSS_PIXELS_OFFSET_START * devicePixelRatio;
    const textDevicePixelsOffsetTop = TEXT_CSS_PIXELS_OFFSET_TOP * devicePixelRatio;

    let selectedItem: {
      intX: number;
      intY: number;
      intW: number;
      intH: number;
      foregroundColor: string;
    } | null = null;

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = flameGraphTiming[depth];

      if (!stackTiming) continue;

      let lastDrawnPixelX = 0;
      for (let i = 0; i < stackTiming.length; i++) {
        // Draw a box, but increase the size by a small portion in order to draw
        // a single pixel at the end with a slight opacity.
        //
        // Legend:
        // |======|  A stack frame's timing.
        // |O|       A single fully opaque pixel.
        // |.|       A slightly transparent pixel.
        // | |       A fully transparent pixel.
        //
        // Drawing strategy:
        //
        // Frame timing   |=====||========|    |=====|    |=|     |=|=|=|=|
        // Device Pixels  |O|O|.|O|O|O|O|.| | |O|O|O|.| | |O|.| | |O|.|O|.|
        // CSS Pixels     |   |   |   |   |   |   |   |   |   |   |   |   |
        // First compute the left and right sides of the box.

        const startTime = stackTiming.start[i];
        const endTime = stackTiming.end[i];

        // Only draw samples that are in bounds.
        if (startTime < timeAtStart && endTime < timeAtStart) continue;
        if (startTime > timeAtEnd && endTime > timeAtEnd) continue;

        const viewportAtStartTime: UnitIntervalOfProfileRange = (startTime - rangeStart) / rangeLength;
        const viewportAtEndTime: UnitIntervalOfProfileRange = (endTime - rangeStart) / rangeLength;
        const floatX =
          devicePixelRatio * // The right hand side of this formula is all in CSS pixels.
          (MARGIN_X + ((viewportAtStartTime - viewportLeft) * innerContainerWidth) / viewportLength);
        const floatW: DevicePixels =
          ((viewportAtEndTime - viewportAtStartTime) * innerDevicePixelsWidth) / viewportLength - 1;

        // Determine if there is enough pixel space to draw this box, and snap the
        // box to the pixels.
        const { snappedFloatX, snappedFloatW, skipDraw } = (() => {
          let snappedFloatX = floatX;
          let snappedFloatW = floatW;
          let skipDraw = true;

          if (floatX >= lastDrawnPixelX) {
            // The x value is past the last lastDrawnPixelX, so it can be drawn.
            skipDraw = false;
          } else if (floatX + floatW > lastDrawnPixelX) {
            // The left side of the box is before the lastDrawnPixelX value, but the
            // right hand side is within a range to be drawn. Truncate the box a little
            // bit in order to draw it to the screen in the free space.
            snappedFloatW = floatW - (lastDrawnPixelX - floatX);
            snappedFloatX = lastDrawnPixelX;
            skipDraw = false;
          }

          return { snappedFloatX, snappedFloatW, skipDraw };
        })();

        // Skip sending draw calls for sufficiently small boxes.
        if (snappedFloatW < 1 || skipDraw) continue;

        // Convert or compute all of the integer values for drawing the box.
        // Note, this should all be Math.round instead of floor and ceil, but some
        // off by one errors appear to be creating gaps where there shouldn't be any.
        const intX = Math.floor(snappedFloatX); // snappedFloatX
        const intY = Math.round(depth * rowDevicePixelsHeight - viewportDevicePixelsTop);
        const intW = Math.ceil(Math.max(2, snappedFloatW)); // snappedFloatW
        const intH = Math.round(rowDevicePixelsHeight - oneCssPixelInDevicePixels);

        const callNodeIndex = stackTiming.callNode[i];
        const isSelected = selectedCallNodeIndex === callNodeIndex;
        const isRightClicked = rightClickedCallNodeIndex === callNodeIndex;
        const isHovered = hoveredItem && depth === hoveredItem.depth && i === hoveredItem.flameGraphTimingIndex;
        const isHighlighted = isSelected || isRightClicked || isHovered;

        const colorStyles = (() => {
          if (!isCompareMode) {
            const categoryIndex = callNodeTable.category[callNodeIndex];
            return mapCategoryColorNameToStackChartStyles(categories[categoryIndex].color);
          }

          const compareCallNodeIndex = callNodeIndexToCompareCallNodeIndexTable?.get(callNodeIndex);
          if (compareCallNodeIndex == null) return mapTimeToCompareColor(0);
          const { totalRelative } = compareCallTree?.getNodeTotal(compareCallNodeIndex) ?? {};

          if (totalRelative == null) return mapTimeToCompareColor(0);
          return mapTimeToCompareColor(totalRelative);
        })();

        const background = isSelected
          ? colorStyles.selectedFillStyle
          : isHighlighted
          ? colorStyles.selectedFillStyle
          : colorStyles.unselectedFillStyle;

        if (isSelected) {
          selectedItem = { intX, intY, intW, intH, foregroundColor: colorStyles.selectedFillStyle };
        }

        fastFillStyle.set(background);
        // Add on a bit of padding to the end of the width, to draw a partial
        // pixel. This will effectively draw a transparent version of the fill color
        // without having to change the fill color. At the time of this writing it
        // was the same performance cost as only providing integer values here.
        ctx.fillRect(intX, intY, intW + BORDER_RIGHT_OPACITY - BORDER_RIGHT_DEVICE_PIXELS, intH);
        // The border on the right is 1 device pixel wide.
        lastDrawnPixelX = intX + intW - BORDER_RIGHT_DEVICE_PIXELS;

        // Draw the text label if it fits. Use the original float values here so that
        // the text doesn't snap around when moving. Only the boxes should snap.
        const textX: DevicePixels = Math.max(floatX, 0) + textDevicePixelsOffsetStart; // Constrain the x coordinate to the leftmost area.
        const textW: DevicePixels = Math.max(0, floatW - (textX - floatX));

        if (textW > textMeasurement.minWidth) {
          const funcIndex = callNodeTable.func[callNodeIndex];
          const funcName = thread.stringTable.getString(thread.funcTable.name[funcIndex]);
          const fittedText = textMeasurement.getFittedText(funcName, textW);

          if (fittedText) {
            fastFillStyle.set(isHighlighted ? "white" : colorStyles.foregroundColor);
            ctx.fillText(fittedText, textX, intY + textDevicePixelsOffsetTop);
          }
        }
      }
    }

    // Draw a border around the selected item.
    if (selectedItem !== null) {
      ctx.strokeStyle = selectedItem.foregroundColor;
      ctx.lineWidth = SELECTION_BORDER * devicePixelRatio;
      ctx.strokeRect(
        selectedItem.intX - SELECTION_BORDER * devicePixelRatio,
        selectedItem.intY - SELECTION_BORDER * devicePixelRatio,
        Math.max(selectedItem.intW, 2) +
          BORDER_RIGHT_OPACITY -
          BORDER_RIGHT_DEVICE_PIXELS +
          SELECTION_BORDER * 2 * devicePixelRatio,
        selectedItem.intH + SELECTION_BORDER * 2 * devicePixelRatio
      );
    }
  };

  // Properly memoize this derived information for the Tooltip component.
  _getTimingsForCallNodeIndex = memoize(getTimingsForCallNodeIndex, {
    cache: new MixedTupleMap(),
  });

  _getHoveredStackInfo = ({ depth, flameGraphTimingIndex }: HoveredStackTiming): React.ReactNode | null => {
    const {
      thread,
      flameGraphTiming,
      callTree,
      callNodeInfo: { callNodeTable },
      shouldDisplayTooltips,
      categories,
      isCompareMode,
      callNodeIndexToCompareCallNodeIndexTable,
      compareCallTree,
    } = this.props;

    if (!shouldDisplayTooltips()) {
      return null;
    }

    const stackTiming = flameGraphTiming[depth];
    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];

    const funcIndex = callNodeTable.func[callNodeIndex];
    const funcName = thread.stringTable.getString(thread.funcTable.name[funcIndex]);

    const categoryIndex = callNodeTable.category[callNodeIndex];
    const category = categories[categoryIndex];

    const displayData = callTree.getDisplayData(callNodeIndex);

    const { selfPercentCompare, totalPercentCompare, selfCompareColor, totalCompareColor } = (() => {
      if (!isCompareMode)
        return {
          selfPercentCompare: null,
          totalPercentCompare: null,
          selfCompareColor: undefined,
          totalCompareColor: undefined,
        };

      const emptyState = {
        selfPercentCompare: "0.00%",
        totalPercentCompare: "0.00%",
        selfCompareColor: undefined,
        totalCompareColor: undefined,
      };
      const compareCallNodeIndex = callNodeIndexToCompareCallNodeIndexTable?.get(callNodeIndex);
      if (compareCallNodeIndex == null) return emptyState;
      const compareDisplayData = compareCallTree?.getDisplayData(compareCallNodeIndex);
      if (!compareDisplayData) return emptyState;

      const selfPercentCompare = formatComparePercent(compareDisplayData.selfRelative);
      const totalPercentCompare = formatComparePercent(compareDisplayData.totalRelative);

      const totalRelative = compareDisplayData.totalRelative;
      const selfRelative = compareDisplayData.selfRelative;

      const totalColorStyle = mapTimeToCompareColor(totalRelative);
      const selfColorStyle = mapTimeToCompareColor(selfRelative);

      const totalCompareColor = totalColorStyle.soloForegroundColor;
      const selfCompareColor = selfColorStyle.soloForegroundColor;

      return { selfPercentCompare, totalPercentCompare, selfCompareColor, totalCompareColor };
    })();

    return (
      <FlameGraphTooltip
        funcName={funcName}
        lib={displayData.lib}
        isCompareMode={isCompareMode}
        totalPercent={displayData.totalPercent}
        selfPercent={displayData.selfPercent}
        totalPercentCompare={totalPercentCompare}
        selfPercentCompare={selfPercentCompare}
        totalCompareColor={totalCompareColor}
        selfCompareColor={selfCompareColor}
        categoryColor={category.color}
        categoryName={category.name}
      />
    );
  };

  _getCallNodeIndexFromHoveredItem(hoveredItem: HoveredStackTiming | null): IndexIntoCallNodeTable | null {
    if (hoveredItem === null) {
      return null;
    }

    const { depth, flameGraphTimingIndex } = hoveredItem;
    const { flameGraphTiming } = this.props;
    const stackTiming = flameGraphTiming[depth];
    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];
    return callNodeIndex;
  }

  _onSelectItem = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onSelectionChange(callNodeIndex);
  };

  _onRightClick = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onRightClick(callNodeIndex);
  };

  _onDoubleClick = (hoveredItem: HoveredStackTiming | null) => {
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onDoubleClick(callNodeIndex);
  };

  _hitTest = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const {
      flameGraphTiming,
      stackFrameHeight,
      timeRange: { start: rangeStart, end: rangeEnd },
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;
    const innerDevicePixelsWidth = containerWidth - MARGIN_X * 2;
    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange = viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft + viewportLength * ((x - MARGIN_X) / innerDevicePixelsWidth);
    const pos: Milliseconds = rangeStart + unitIntervalTime * rangeLength;

    const depth = Math.floor((y + viewportTop) / stackFrameHeight);
    const stackTiming = flameGraphTiming[depth];

    if (!stackTiming) return null;

    for (let i = 0; i < stackTiming.length; i++) {
      const start = stackTiming.start[i];
      const end = stackTiming.end[i];
      if (start < pos && end > pos) {
        return { depth, flameGraphTimingIndex: i };
      }
    }

    return null;
  };

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="absolute left-0 top-0"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        scaleCtxToCssPixels={false}
        onDoubleClickItem={this._onDoubleClick}
        getHoveredItemInfo={this._getHoveredStackInfo}
        drawCanvas={this._drawCanvas}
        hitTest={this._hitTest}
        onSelectItem={this._onSelectItem}
        onRightClick={this._onRightClick}
        drawCanvasAfterRaf={false}
      />
    );
  }
}

export const FlameGraphCanvas = (withChartViewport as WithChartViewport<OwnProps, Props>)(FlameGraphCanvasImpl);
