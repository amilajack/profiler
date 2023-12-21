/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { Fragment, PureComponent } from 'react';
import { Localized } from '@fluent/react';

import {
  changeImplementationFilter,
  changeInvertCallstack,
  changeCallTreeSearchString,
  changeCallTreeSummaryStrategy,
  changeShowUserTimings,
  toggleCategoriesFilter,
} from 'firefox-profiler/actions/profile-view';
import {
  getImplementationFilter,
  getCategoriesFilter,
  getInvertCallstack,
  getSelectedTab,
  getShowUserTimings,
  getCurrentSearchString,
} from 'firefox-profiler/selectors/url-state';
import { PanelSearch } from './PanelSearch';

import {
  toValidImplementationFilter,
  toValidCallTreeSummaryStrategy,
} from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import {
  getProfileUsesMultipleStackTypes,
  getCategories,
} from 'firefox-profiler/selectors/profile';

import './StackSettings.css';

import type {
  ImplementationFilter,
  CallTreeSummaryStrategy,
  CategoryList,
  CategoriesFilter,
} from 'firefox-profiler/types';

type CategoryFilterItem = {|
  name: string,
  value: string[],
  color: string,
|};

const CATEGORY_FILTERS: Array<CategoryFilterItem> = [
  {
    name: 'Source Code',
    value: ['JavaScript'],
    color: 'category-color-yellow',
  },
  { name: 'Dependency', value: ['Dependency'], color: 'category-color-brown' },
  { name: 'React', value: ['React'], color: 'category-color-purple' },
  {
    name: 'Other',
    value: ['Other', 'Idle'],
    color: 'category-color-transparent',
  },
];

type OwnProps = {|
  +hideInvertCallstack?: true,
|};

type StateProps = {|
  +implementationFilter: ImplementationFilter,
  +categories: CategoryList,
  +categoriesFilter: CategoriesFilter,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +selectedTab: string,
  +invertCallstack: boolean,
  +showUserTimings: boolean,
  +currentSearchString: string,
  +hasJsAllocations: boolean,
  +hasNativeAllocations: boolean,
  +canShowRetainedMemory: boolean,
  +allowSwitchingStackType: boolean,
|};

type DispatchProps = {|
  +changeImplementationFilter: typeof changeImplementationFilter,
  +changeInvertCallstack: typeof changeInvertCallstack,
  +changeShowUserTimings: typeof changeShowUserTimings,
  +changeCallTreeSearchString: typeof changeCallTreeSearchString,
  +changeCallTreeSummaryStrategy: typeof changeCallTreeSummaryStrategy,
  +toggleCategoriesFilter: typeof toggleCategoriesFilter,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackSettingsImpl extends PureComponent<Props> {
  _onImplementationFilterChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.currentTarget.value)
    );
  };

  _onCallTreeSummaryStrategyChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeCallTreeSummaryStrategy(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidCallTreeSummaryStrategy(e.currentTarget.value)
    );
  };

  _onInvertCallstackClick = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  };

  _onShowUserTimingsClick = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeShowUserTimings(e.currentTarget.checked);
  };

  _onSearch = (value: string) => {
    this.props.changeCallTreeSearchString(value);
  };

  _renderImplementationRadioButton(
    labelL10Id: string,
    implementationFilter: ImplementationFilter
  ) {
    return (
      <label className="photon-label photon-label-micro stackSettingsFilterLabel">
        <input
          type="radio"
          className="photon-radio photon-radio-micro stackSettingsFilterInput"
          value={implementationFilter}
          name="stack-settings-filter"
          title="Filter stack frames to a type."
          onChange={this._onImplementationFilterChange}
          checked={this.props.implementationFilter === implementationFilter}
        />
        <Localized id={labelL10Id}></Localized>
      </label>
    );
  }

  _renderCategoryFilterButton({ name, value, color }: CategoryFilterItem) {
    const categoryIndices = value.map((v) =>
      this.props.categories.findIndex((c) => c.name === v)
    );
    const isCategoryActive = !categoryIndices.every((categoryIndex) =>
      this.props.categoriesFilter.some(
        (categoryFilterIndex) => categoryFilterIndex === categoryIndex
      )
    );

    return (
      <button
        className="stackSettingsCategoryFilter"
        type="button"
        // eslint-disable-next-line react/jsx-no-bind
        onClick={() => this.props.toggleCategoriesFilter(categoryIndices)}
      >
        <span
          className={isCategoryActive ? color : undefined}
          data-state={isCategoryActive ? 'active' : 'inactive'}
        />
        {name}
      </button>
    );
  }

  _renderCallTreeStrategyOption(
    labelL10nId: string,
    strategy: CallTreeSummaryStrategy
  ) {
    return (
      <Localized id={labelL10nId} attrs={{ title: true }}>
        <option key={strategy} value={strategy}></option>
      </Localized>
    );
  }

  render() {
    const {
      invertCallstack,
      selectedTab,
      showUserTimings,
      hideInvertCallstack,
      currentSearchString,
      // hasJsAllocations,
      // hasNativeAllocations,
      // canShowRetainedMemory,
      // callTreeSummaryStrategy,
    } = this.props;

    // const hasAllocations = hasJsAllocations || hasNativeAllocations;

    return (
      <div className="stackSettings">
        <ul className="stackSettingsList">
          <li className="stackSettingsListItem">
            {CATEGORY_FILTERS.map((categoryFilter) => (
              <Fragment key={categoryFilter.name}>
                {this._renderCategoryFilterButton(categoryFilter)}
              </Fragment>
            ))}
          </li>
          {/* <li className="stackSettingsListItem stackSettingsFilter">
            {this._renderImplementationRadioButton(
              'StackSettings--implementation-all-stacks',
              'combined'
            )}
            {this._renderImplementationRadioButton(
              'StackSettings--implementation-javascript',
              'js'
            )}
            {this._renderImplementationRadioButton(
              'StackSettings--implementation-native',
              'cpp'
            )}
          </li>
          {hasAllocations ? (
            <li className="stackSettingsListItem stackSettingsFilter">
              <label>
                <Localized id="StackSettings--use-data-source-label" />{' '}
                <select
                  className="stackSettingsSelect"
                  onChange={this._onCallTreeSummaryStrategyChange}
                  value={callTreeSummaryStrategy}
                >
                  {this._renderCallTreeStrategyOption(
                    'StackSettings--call-tree-strategy-timing',
                    'timing'
                  )}
                  {hasJsAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-js-allocations',
                        'js-allocations'
                      )
                    : null}
                  {canShowRetainedMemory
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-retained-allocations',
                        'native-retained-allocations'
                      )
                    : null}
                  {hasNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-native-allocations',
                        'native-allocations'
                      )
                    : null}
                  {canShowRetainedMemory
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-deallocations-memory',
                        'native-deallocations-memory'
                      )
                    : null}
                  {hasNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-deallocations-sites',
                        'native-deallocations-sites'
                      )
                    : null}
                </select>
              </label>
            </li>
          ) : null} */}
          {hideInvertCallstack ? null : (
            <li className="stackSettingsListItem">
              <label className="photon-label photon-label-micro stackSettingsLabel">
                <input
                  type="checkbox"
                  className="photon-checkbox photon-checkbox-micro stackSettingsCheckbox"
                  onChange={this._onInvertCallstackClick}
                  checked={invertCallstack}
                />
                <Localized
                  id="StackSettings--invert-call-stack"
                  attrs={{ title: true }}
                >
                  <span>Invert call stack</span>
                </Localized>
              </label>
            </li>
          )}
          {selectedTab !== 'stack-chart' ? null : (
            <li className="stackSettingsListItem">
              <label className="photon-label photon-label-micro stackSettingsLabel">
                <input
                  type="checkbox"
                  className="photon-checkbox photon-checkbox-micro stackSettingsCheckbox"
                  onChange={this._onShowUserTimingsClick}
                  checked={showUserTimings}
                />
                <Localized id="StackSettings--show-user-timing">
                  Show user timing
                </Localized>
              </label>
            </li>
          )}
        </ul>
        <Localized
          id="StackSettings--panel-search"
          attrs={{ label: true, title: true }}
        >
          <PanelSearch
            className="stackSettingsSearchField"
            label="Filter stacks:"
            title="Only display stacks which contain a function whose name matches this substring"
            currentSearchString={currentSearchString}
            onSearch={this._onSearch}
          />
        </Localized>
      </div>
    );
  }
}

export const StackSettings = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    invertCallstack: getInvertCallstack(state),
    selectedTab: getSelectedTab(state),
    showUserTimings: getShowUserTimings(state),
    implementationFilter: getImplementationFilter(state),
    categories: getCategories(state),
    categoriesFilter: getCategoriesFilter(state),
    currentSearchString: getCurrentSearchString(state),
    hasJsAllocations: selectedThreadSelectors.getHasJsAllocations(state),
    hasNativeAllocations:
      selectedThreadSelectors.getHasNativeAllocations(state),
    canShowRetainedMemory:
      selectedThreadSelectors.getCanShowRetainedMemory(state),
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
    allowSwitchingStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
    changeInvertCallstack,
    changeCallTreeSearchString,
    changeCallTreeSummaryStrategy,
    changeShowUserTimings,
    toggleCategoriesFilter,
  },
  component: StackSettingsImpl,
});
