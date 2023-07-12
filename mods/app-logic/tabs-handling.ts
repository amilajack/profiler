/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This object contains all our tab slugs with their associated title l10n Ids.
 * This is the "main list of tabs". This is in object form because that's how we
 * can easily derive the TabSlug type with Flow.
 */
export const tabsWithTitleL10nId = {
  calltree: "TabBar--calltree-tab",
  "flame-graph": "TabBar--flame-graph-tab",
  "stack-chart": "TabBar--stack-chart-tab",
  "marker-chart": "TabBar--marker-chart-tab",
  "marker-table": "TabBar--marker-table-tab",
  "network-chart": "TabBar--network-tab",
  "js-tracer": "TabBar--js-tracer-tab",
} as const;

export type TabSlug = keyof typeof tabsWithTitleL10nId;

/**
 * This array contains the list of all tab slugs that we use as codes throughout
 * the codebase, and especially in the URL.
 */
export const tabSlugs: ReadonlyArray<TabSlug> =
  // getOwnPropertyNames is guaranteed to keep the order in which properties
  // were defined, and this order is important for us.
  Object.getOwnPropertyNames(tabsWithTitleL10nId) as TabSlug[];

export const tabsShowingSampleData: ReadonlyArray<TabSlug> = ["calltree", "flame-graph", "stack-chart"];

export type BottomBoxTabSlug = "source-code" | "user-sessions";
