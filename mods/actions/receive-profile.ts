/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fatalError } from "~/components/FFP/actions/errors";
import { mergeProfilesForDiffing } from "~/components/FFP/profile-logic/merge-compare";
import { unserializeProfileOfArbitraryFormat } from "~/components/FFP/profile-logic/process-profile";
import { initializeSelectedThreadIndex } from "~/components/FFP/profile-logic/tracks";

import type {
  Action,
  ImplementationFilter,
  Profile,
  ThunkAction,
  TimelineTrackOrganization,
  TransformStacksPerThread,
} from "~/components/FFP/types";
import { FatalError } from "~/components/FFP/utils/errors";
import { MESSAGES } from "~/constants";
import { TabSlug } from "../app-logic/tabs-handling";

/**
 * Call this function once the profile has been fetched and pre-processed from whatever
 * source (url, browser, file, etc).
 */
export function loadProfile(
  profile: Profile,
  config: Partial<{
    timelineTrackOrganization: TimelineTrackOrganization;
    pathInZipFile: string;
    implementationFilter: ImplementationFilter;
    transformStacks: TransformStacksPerThread;
    browserConnection: null;
    skipSymbolication: boolean; // Please use this in tests only.
    selectedTab: TabSlug;
    isCompareMode: boolean;
  }> = {},
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    if (profile.threads.length === 0) {
      console.error("This profile has no threads.", profile);
      dispatch(fatalError(new FatalError(MESSAGES.PROFILER_DATA_NONE, MESSAGES.PROFILER_DATA_NONE_DESCRIPTION)));
      return;
    }

    // We have a 'PROFILE_LOADED' dispatch here and a second dispatch for
    // `finalizeProfileView`. Normally this is an anti-pattern but that was
    // necessary for initial load url handling. We are not dispatching
    // `finalizeProfileView` here if it's initial load, instead are getting the
    // url, upgrading the url and then creating a UrlState that we can use
    // first. That is necessary because we need a UrlState inside `finalizeProfileView`.
    // If this is not the initial load, we are dispatching both of them.
    dispatch({
      type: "PROFILE_LOADED",
      profile,
      pathInZipFile: config.pathInZipFile,
      implementationFilter: config.implementationFilter,
      transformStacks: config.transformStacks,
      selectedThreadIndexes: initializeSelectedThreadIndex(config.selectedTab ?? "calltree", config.isCompareMode),
      isCompareMode: config.isCompareMode,
    });
  };
}

export function waitingForProfileFromUrl(profileUrl?: string): Action {
  return {
    type: "WAITING_FOR_PROFILE_FROM_URL",
    profileUrl,
  };
}

function waitingForProfileFromFile(): Action {
  return {
    type: "WAITING_FOR_PROFILE_FROM_FILE",
  };
}

export function retrieveProfile(
  _profile: unknown,
  config: {
    selectedTab: TabSlug;
  }
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    // Notify the UI that we are loading and parsing a profile. This can take
    // a little bit of time.
    dispatch(waitingForProfileFromFile());

    try {
      const profile = await unserializeProfileOfArbitraryFormat(_profile);
      if (profile === undefined) throw new Error("Unable to parse the profile.");

      if (isProfileEmpty(profile)) {
        throw new FatalError(MESSAGES.PROFILER_DATA_NONE, MESSAGES.PROFILER_DATA_NONE_DESCRIPTION);
      }

      await dispatch(loadProfile(profile, { browserConnection: null, selectedTab: config.selectedTab }, false));
    } catch (error: any) {
      dispatch(fatalError(error));
    }
  };
}

/**
 * This action retrieves several profiles and push them into 1 profile using the
 * information contained in the query.
 */
export function retrieveProfilesToCompare(
  _profiles: unknown[],
  config: {
    selectedTab: TabSlug;
  }
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    dispatch(waitingForProfileFromUrl());

    try {
      // Then we retrieve the profiles from the online store, and unserialize
      // and process them if needed.
      const profiles = await Promise.all(
        _profiles.map(async (profile: unknown, index) => {
          const sanitizedProfile = await unserializeProfileOfArbitraryFormat(profile);

          if (isProfileEmpty(sanitizedProfile)) {
            throw new FatalError(
              index === 0 ? MESSAGES.PROFILER_FILTER_DATA_NONE : MESSAGES.PROFILER_COMPARE_FILTER_DATA_NONE,
              index === 0
                ? MESSAGES.PROFILER_FILTER_DATA_NONE_DESCRIPTION
                : MESSAGES.PROFILER_COMPARE_FILTER_DATA_NONE_DESCRIPTION
            );
          }

          return sanitizedProfile;
        })
      );

      const { profile: resultProfile, implementationFilters, transformStacks } = mergeProfilesForDiffing(profiles);

      // We define an implementationFilter if both profiles agree with the value.
      let implementationFilter;
      if (implementationFilters[0] === implementationFilters[1]) {
        implementationFilter = implementationFilters[0];
      }

      await dispatch(
        loadProfile(
          resultProfile,
          {
            transformStacks,
            implementationFilter,
            isCompareMode: true,
            selectedTab: config.selectedTab,
          },
          false
        )
      );
    } catch (error: any) {
      dispatch(fatalError(error));
    }
  };
}

const isProfileEmpty = (profile: Profile) => {
  const { threads } = profile;
  if (threads.length === 0) return true;

  // Iterate through the threads and check for relevant data
  for (const thread of threads) {
    if (
      // Check if the thread has samples and a non-empty samples array
      (thread.samples && thread.samples.length > 0) ||
      // Check if the thread has markers and a non-empty markers array
      (thread.markers && thread.markers.length > 0)
    ) {
      // If any thread contains relevant data, the profile is not empty
      return false;
    }
  }

  return true;
};
