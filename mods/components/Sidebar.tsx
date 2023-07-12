/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import memoize from "memoize-immutable";
import * as React from "react";

import { getFunctionName } from "~/components/FFP/profile-logic/function-info";
import { getFriendlyStackTypeName } from "~/components/FFP/profile-logic/profile-data";
import { selectedNodeSelectors, selectedThreadSelectors } from "~/components/FFP/selectors/per-thread";
import { getCategories } from "~/components/FFP/selectors/profile";
import explicitConnect from "~/components/FFP/utils/connect";
import { assertExhaustiveCheck } from "~/components/FFP/utils/flow";

import type { CategoryList, IndexIntoCallNodeTable, Milliseconds, WeightType } from "~/components/FFP/types";
import type { ConnectedProps } from "~/components/FFP/utils/connect";

import clsx from "clsx";
import { updateBottomBoxContentsAndOpen } from "~/components/FFP/actions/profile-view";
import { CallTree } from "~/components/FFP/profile-logic/call-tree";
import type {
  BreakdownByCategory,
  BreakdownByImplementation,
  StackImplementation,
  TimingsForPath,
} from "~/components/FFP/profile-logic/profile-data";
import {
  formatBytes,
  formatMilliseconds,
  formatNumber,
  formatPercent,
  ratioToCssPercent,
} from "~/components/FFP/utils/format-numbers";
import { Placeholder } from "~/components/Placeholder";
import { MESSAGES } from "~/constants";
import { Button } from "~/primitives/Button";
import { Text } from "~/primitives/Text";
import { formatPercentage } from "~/utils/time";

const SIDEBAR_DETAIL_ITEM_INDENT = "ml-3";
const SIDEBAR_DETAIL_ITEM_TITLE_STYLE = "col-span-2 min-w-0 truncate text-xs text-gray-500";
const SIDEBAR_TITLE_STYLE = "min-w-0 col-span-3 truncate first:mt-0.5 [&:not(:first-child)]:mt-2 mb-0 !font-medium";
const SIDEBAR_VALUE_STYLE = "whitespace-nowrap text-right text-xs";
const SIDEBAR_HISTOGRAM_STYLE = `col-span-3 bg-gray-200 h-[3px] [&>div]:h-[3px] mb-0.5 ${SIDEBAR_DETAIL_ITEM_INDENT}`;

type SidebarDetailProps = {
  readonly label: React.ReactNode;
  readonly color?: string;
  readonly indent?: boolean;
  readonly value: React.ReactNode;
  readonly percentage?: string | number;
};

function SidebarDetail({ label, value, percentage, indent }: SidebarDetailProps) {
  return (
    <React.Fragment>
      <div className={clsx(SIDEBAR_DETAIL_ITEM_TITLE_STYLE, SIDEBAR_DETAIL_ITEM_INDENT)}>{label}</div>
      {/* <div className={SIDEBAR_VALUE_STYLE}>{value}</div> */}
      <div className={SIDEBAR_VALUE_STYLE}>{percentage}</div>
    </React.Fragment>
  );
}

type ImplementationBreakdownProps = {
  readonly breakdown: BreakdownByImplementation;
  readonly number: (arg1: number) => string;
};

// This component is responsible for displaying the breakdown data specific to
// the JavaScript engine and native code implementation.
class ImplementationBreakdown extends React.PureComponent<ImplementationBreakdownProps> {
  _orderedImplementations: ReadonlyArray<StackImplementation> = [
    "native",
    "interpreter",
    "blinterp",
    "baseline",
    "ion",
    "unknown",
  ];

  render() {
    const { breakdown, number } = this.props;

    const data: Array<{
      readonly group: string;
      readonly value: Milliseconds | number;
    }> = [];

    for (const implementation of this._orderedImplementations) {
      const value = breakdown[implementation];
      if (!value && implementation === "unknown") {
        continue;
      }

      data.push({
        group: getFriendlyStackTypeName(implementation),
        value: value || 0,
      });
    }

    const totalTime = data.reduce<number>((result, item) => result + item.value, 0);

    return data
      .filter(({ value }) => value)
      .map(({ group, value }) => {
        return (
          <React.Fragment key={group}>
            <SidebarDetail label={group} value={number(value)} percentage={formatPercent(value / totalTime)} />
            <div className={SIDEBAR_HISTOGRAM_STYLE}>
              <div className="bg-gray-400" style={{ width: ratioToCssPercent(value / totalTime) }} />
            </div>
          </React.Fragment>
        );
      });
  }
}

type CategoryBreakdownOwnProps = {
  /** for total or self breakdown */
  readonly kind: "total" | "self";
  readonly breakdown: BreakdownByCategory;
  readonly categoryList: CategoryList;
  readonly number: (arg1: number) => string;
};
type CategoryBreakdownStateProps = {};
type CategoryBreakdownDispatchProps = {};
type CategoryBreakdownAllProps = ConnectedProps<
  CategoryBreakdownOwnProps,
  CategoryBreakdownStateProps,
  CategoryBreakdownDispatchProps
>;

class CategoryBreakdownImpl extends React.PureComponent<CategoryBreakdownAllProps> {
  render() {
    const { breakdown, categoryList, number, kind } = this.props;

    const data = breakdown
      .map((oneCategoryBreakdown, categoryIndex) => {
        const category = categoryList[categoryIndex];
        return {
          categoryIndex,
          category,
          value: Math.abs(oneCategoryBreakdown.entireCategoryValue) || 0,
          subcategories: category.subcategories
            .map((subcategoryName, subcategoryIndex) => ({
              index: subcategoryIndex,
              name: subcategoryName,
              value: oneCategoryBreakdown.subcategoryBreakdown[subcategoryIndex],
            }))
            // sort subcategories in descending order
            .sort(({ value: valueA }, { value: valueB }) => valueB - valueA)
            .filter(({ value }) => value),
        };
      })
      // sort categories in descending order
      .sort(({ value: valueA }, { value: valueB }) => valueB - valueA)
      .filter(({ value }) => value);

    // Values can be negative for diffing tracks, that's why we use the absolute
    // value to compute the total time. Indeed even if all values average out,
    // we want to display a sensible percentage.
    const totalTime = data.reduce((accum, { value }) => accum + Math.abs(value), 0);

    return (
      <>
        {data.map(({ category, value, categoryIndex }) => {
          return (
            <React.Fragment key={`category-${categoryIndex}`}>
              <SidebarDetail
                label={category.name}
                value={number(value)}
                percentage={formatPercent(value / totalTime)}
              />

              {/* Draw a histogram bar, colored by the category. */}
              <div className={SIDEBAR_HISTOGRAM_STYLE}>
                <div
                  // The grey/transparent category color are the same as the background color, use `bg-gray-400` instead.
                  className={`sidebar-histogram-bar-color [&.category-color-grey]:bg-gray-400 [&.category-color-transparent]:bg-gray-400 category-color-${category.color}`}
                  style={{ width: ratioToCssPercent(value / totalTime) }}
                />
              </div>
            </React.Fragment>
          );
        })}
      </>
    );
  }
}

export const CategoryBreakdown = explicitConnect<
  CategoryBreakdownOwnProps,
  CategoryBreakdownStateProps,
  CategoryBreakdownDispatchProps
>({
  component: CategoryBreakdownImpl,
});

type StateProps = {
  readonly selectedNodeIndex: IndexIntoCallNodeTable | null;
  readonly name: string;
  readonly lib: string;
  readonly callTree: CallTree;
  readonly timings: TimingsForPath;
  readonly categoryList: CategoryList;
  readonly weightType: WeightType;
  // readonly tracedTiming: TracedTiming | null;
};

type DispatchProps = {
  readonly updateBottomBoxContentsAndOpen: typeof updateBottomBoxContentsAndOpen;
};

type Props = ConnectedProps<Record<any, any>, StateProps, DispatchProps>;

type WeightDetails = {
  readonly running: string;
  readonly self: string;
  readonly number: (n: number) => string;
};

class CallTreeSidebarImpl extends React.PureComponent<Props> {
  _getWeightTypeDetails = memoize(
    (weightType: WeightType): WeightDetails => {
      switch (weightType) {
        case "tracing-ms":
          return {
            running: "Running time",
            self: "Self time",
            number: (n) => formatMilliseconds(n, 3, 1),
          };
        case "samples":
          return {
            running: "Running samples",
            self: "Self samples",
            number: (n) => formatNumber(n, 0),
          };
        case "bytes":
          return {
            running: "Running size",
            self: "Self size",
            number: (n) => formatBytes(n),
          };
        default:
          throw assertExhaustiveCheck(weightType, "Unhandled WeightType.");
      }
    },
    { cache: new Map() }
  );

  render() {
    const {
      selectedNodeIndex,
      name,
      timings,
      lib,
      categoryList,
      weightType,
      callTree,
      updateBottomBoxContentsAndOpen,
    } = this.props;
    const {
      forPath: { selfTime, totalTime },
      rootTime,
    } = timings;

    if (selectedNodeIndex === null) {
      return (
        <div className="h-full px-[var(--card-x-inset)] py-[var(--card-y-inset)]">
          <Placeholder
            title={MESSAGES.PROFILER_SELECTION_NONE}
            description={MESSAGES.PROFILER_SELECTION_NONE_DESCRIPTION}
            className="h-full"
          />
        </div>
      );
    }

    const { number, running, self } = this._getWeightTypeDetails(weightType);

    // FFP rounds percentages to the nearest integer. In order to keep consistency
    // with <CallTree> timings, we use the same formatter in both places (`formatPercent`).
    // const totalTimePercent = Math.round((totalTime.value / rootTime) * 100);
    // const selfTimePercent = Math.round((selfTime.value / rootTime) * 100);
    const totalTimePercent = formatPercentage(totalTime.value / rootTime);
    const selfTimePercent = formatPercentage(selfTime.value / rootTime);

    const totalTimeBreakdownByCategory = totalTime.breakdownByCategory;
    const selfTimeBreakdownByCategory = selfTime.breakdownByCategory;

    return (
      <aside className="sidebar-calltree relative flex h-full flex-col flex-nowrap overflow-auto bg-white">
        <header className="z-40 flex shrink-0 flex-col items-start px-[var(--card-x-inset)] pb-2 pt-2">
          <Text
            as="h3"
            size="sm"
            color="primary"
            weight="medium"
            truncate
            margin="mb-0.5"
            className="leading-0 min-w-0"
          >
            {name}
          </Text>
          <p className={clsx("w-full break-all text-xs text-gray-500")}>{lib}</p>
        </header>

        <div className="grid w-full grid-cols-[1fr_min-content] items-center gap-x-1 gap-y-0.5 px-[var(--card-x-inset)] pb-2 pt-1">
          {/* <Text as="h4" size="xs" color="primary" className={SIDEBAR_TITLE_STYLE}>
              Details
            </Text>
            <SidebarDetail
              label={running}
              value={totalTime.value ? `${number(totalTime.value)}` : "—"}
              percentage={totalTimePercent}
            />
            <SidebarDetail
              label={self}
              value={selfTime.value ? `${number(selfTime.value)}` : "—"}
              percentage={selfTimePercent === "0.0%" ? "-" : selfTimePercent}
            /> */}
          {totalTimeBreakdownByCategory ? (
            <>
              <Text as="h4" size="xs" color="primary" className={clsx(SIDEBAR_TITLE_STYLE, "sidebar-title-label")}>
                Stack Categories
              </Text>
              <CategoryBreakdown
                kind="total"
                breakdown={totalTimeBreakdownByCategory}
                categoryList={categoryList}
                number={number}
              />
            </>
          ) : null}
          {/* {selfTimeBreakdownByCategory ? (
              <>
                <Text as="h4" size="xs" color="primary" className={clsx(SIDEBAR_TITLE_STYLE, "sidebar-title-label")}>
                  Categories
                </Text>
                <CategoryBreakdown
                  kind="self"
                  breakdown={selfTimeBreakdownByCategory}
                  categoryList={categoryList}
                  number={number}
                />
              </>
            ) : null} */}
        </div>
        <div className="px-[var(--card-x-inset)] pt-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              const bottomBoxInfo = callTree.getBottomBoxInfoForCallNode(selectedNodeIndex);
              updateBottomBoxContentsAndOpen(bottomBoxInfo);
            }}
          >
            Show Source Code
          </Button>
          <p className="pt-1 text-xs text-gray-500">
            <span className="font-medium">Hint</span>: Double click a function to see its source code or user sessions.
          </p>
        </div>
      </aside>
    );
  }
}

export const Sidebar = explicitConnect<Record<any, any>, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    selectedNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(state),
    name: getFunctionName(selectedNodeSelectors.getName(state)),
    lib: selectedNodeSelectors.getLib(state),
    callTree: selectedThreadSelectors.getCallTree(state),
    timings: selectedNodeSelectors.getTimingsForSidebar(state),
    categoryList: getCategories(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    // since sample times are set to 0 traced timings are always gonna be 0
    // tracedTiming: selectedThreadSelectors.getTracedTiming(state),
  }),
  mapDispatchToProps: {
    updateBottomBoxContentsAndOpen,
  },
  component: CallTreeSidebarImpl,
});
