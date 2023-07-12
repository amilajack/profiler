/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { GlobalTrack, LocalTrack, Pid, ThreadIndex, TrackIndex } from "~/components/FFP/types";
import { TabSlug } from "../app-logic/tabs-handling";

export type TracksWithOrder = {
  readonly globalTracks: GlobalTrack[];
  readonly globalTrackOrder: TrackIndex[];
  readonly localTracksByPid: Map<Pid, LocalTrack[]>;
  readonly localTrackOrderByPid: Map<Pid, TrackIndex[]>;
};

export type HiddenTracks = {
  readonly hiddenGlobalTracks: Set<TrackIndex>;
  readonly hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>;
};

/**
 * This file collects all the logic that goes into validating URL-encoded view options.
 * It also selects the default view options for things like track hiding, ordering,
 * and selection.
 */

// Returns the selected thread (set), intersected with the set of visible threads.
// Falls back to the default thread selection.
export function initializeSelectedThreadIndex(selectedTab: TabSlug, isCompareMode?: boolean): Set<ThreadIndex> {
  /**
   * 1. If we are in compare mode:
   *  1.1 and selectedTab is calltree, select thread 2 (which is the merge thread)
   *  1.2 and selectedTab is flame-graph, select thread 1 (which is the compareFilters profile)
   * 2. If we are not in compare mode, select thread 0 (which is the main thread)
   *
   * Note: In compare mode, we always have 3 threads.
   */
  if (isCompareMode && selectedTab === "calltree") {
    return new Set([2]);
  } else if (isCompareMode && selectedTab === "flame-graph") {
    return new Set([1]);
  }
  return new Set([0]);
}
