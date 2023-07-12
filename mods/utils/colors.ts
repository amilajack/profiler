/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * These are the colors from Photon. They are inlined to provide easy access. If updating
 * please change the CSS variables as well.
 *
 * Firefox Colors v1.0.3
 * https://github.com/FirefoxUX/photon-colors/blob/master/photon-colors.js
 */
import { PERCENT_NEGLIGIBLE_DELTA } from "~/components/FFP/utils/format-numbers";
import { PROFILER } from "~/utils/theme";

export const MAGENTA_60 = "#ed00b5";
export const BLUE_40 = "#45a1ff";
export const GREEN_50 = "#30e60b";
export const RED_60 = "#d70022";
export const RED_70 = "#a4000f";
export const ORANGE_50 = "#ff9400";
export const GREY_30 = "#d7d7db";

type ColorStyles = {
  readonly selectedFillStyle: string;
  readonly unselectedFillStyle: string;
  readonly foregroundColor: string;
};
const GRAY_STYLE = {
  selectedFillStyle: PROFILER.GRAY["background-highlight"],
  unselectedFillStyle: PROFILER.GRAY["background"],
  foregroundColor: PROFILER.GRAY["foreground"],
  className: "category-color-grey",
};
const STYLE_MAP: Record<string, ColorStyles> = {
  transparent: {
    selectedFillStyle: PROFILER.GRAY["background-highlight"],
    unselectedFillStyle: PROFILER.GRAY["background"],
    foregroundColor: PROFILER.GRAY["foreground"],
  },
  lightblue: {
    selectedFillStyle: BLUE_40,
    unselectedFillStyle: BLUE_40 + "60",
    foregroundColor: "#000",
  },
  red: {
    selectedFillStyle: RED_60,
    unselectedFillStyle: RED_60 + "60",
    foregroundColor: "#fff",
  },
  lightred: {
    selectedFillStyle: RED_70 + "60",
    unselectedFillStyle: RED_70 + "30",
    foregroundColor: "#000",
  },
  orange: {
    selectedFillStyle: ORANGE_50,
    unselectedFillStyle: ORANGE_50 + "60",
    foregroundColor: "#fff",
  },
  blue: {
    selectedFillStyle: PROFILER.BLUE["background-highlight"],
    unselectedFillStyle: PROFILER.BLUE["background"],
    foregroundColor: PROFILER.BLUE["foreground"],
  },
  green: {
    selectedFillStyle: PROFILER.GREEN["background-highlight"],
    unselectedFillStyle: PROFILER.GREEN["background"],
    foregroundColor: PROFILER.GREEN["foreground"],
  },
  purple: {
    selectedFillStyle: PROFILER.PURPLE["background-highlight"],
    unselectedFillStyle: PROFILER.PURPLE["background"],
    foregroundColor: PROFILER.PURPLE["foreground"],
  },
  yellow: {
    selectedFillStyle: PROFILER.YELLOW["background-highlight"],
    unselectedFillStyle: PROFILER.YELLOW["background"],
    foregroundColor: PROFILER.YELLOW["foreground"],
  },
  pink: {
    selectedFillStyle: PROFILER.PINK["background-highlight"],
    unselectedFillStyle: PROFILER.PINK["background"],
    foregroundColor: PROFILER.PINK["foreground"],
  },
  // Workaround https://github.com/amilajack/profiler/blob/p/src/utils/colors.js#L152-L158
  brown: {
    selectedFillStyle: PROFILER.PINK["background-highlight"],
    unselectedFillStyle: PROFILER.PINK["background"],
    foregroundColor: PROFILER.PINK["foreground"],
  },
  magenta: {
    selectedFillStyle: MAGENTA_60,
    unselectedFillStyle: MAGENTA_60 + "60",
    foregroundColor: "#fff",
  },
  lightgreen: {
    selectedFillStyle: GREEN_50,
    unselectedFillStyle: GREEN_50 + "60",
    foregroundColor: "#fff",
  },
  gray: GRAY_STYLE,
  grey: GRAY_STYLE,
  darkgray: GRAY_STYLE,
  darkgrey: GRAY_STYLE,
};

export const COMPARE_STEPS = [
  {
    soloForegroundColor: PROFILER.COMPARE.RED[4]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.RED[4]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.RED[4]["background"],
    foregroundColor: PROFILER.COMPARE.RED[4]["foreground"],
    value: +20,
    className: "category-color-red-4",
  },
  {
    soloForegroundColor: PROFILER.COMPARE.RED[3]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.RED[3]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.RED[3]["background"],
    foregroundColor: PROFILER.COMPARE.RED[3]["foreground"],
    className: "category-color-red-3",
    value: +15,
  },
  {
    soloForegroundColor: PROFILER.COMPARE.RED[2]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.RED[2]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.RED[2]["background"],
    foregroundColor: PROFILER.COMPARE.RED[2]["foreground"],
    className: "category-color-red-2",
    value: +10,
  },
  {
    soloForegroundColor: PROFILER.COMPARE.RED[1]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.RED[1]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.RED[1]["background"],
    foregroundColor: PROFILER.COMPARE.RED[1]["foreground"],
    className: "category-color-red-1",
    value: +5,
  },
  {
    ...STYLE_MAP["grey"],
    className: "category-color-grey",
    value: 0,
  },
  {
    soloForegroundColor: PROFILER.COMPARE.GREEN[1]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.GREEN[1]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.GREEN[1]["background"],
    foregroundColor: PROFILER.COMPARE.GREEN[1]["foreground"],
    className: "category-color-green-1",
    value: -5,
  },
  {
    soloForegroundColor: PROFILER.COMPARE.GREEN[2]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.GREEN[2]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.GREEN[2]["background"],
    foregroundColor: PROFILER.COMPARE.GREEN[2]["foreground"],
    className: "category-color-green-2",
    value: -10,
  },
  {
    soloForegroundColor: PROFILER.COMPARE.GREEN[3]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.GREEN[3]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.GREEN[3]["background"],
    foregroundColor: PROFILER.COMPARE.GREEN[3]["foreground"],
    className: "category-color-green-3",
    value: -15,
  },
  {
    soloForegroundColor: PROFILER.COMPARE.GREEN[4]["foreground-solo"],
    selectedFillStyle: PROFILER.COMPARE.GREEN[4]["background-highlight"],
    unselectedFillStyle: PROFILER.COMPARE.GREEN[4]["background"],
    foregroundColor: PROFILER.COMPARE.GREEN[4]["foreground"],
    className: "category-color-green-4",
    value: -20,
  },
];

/**
 * Map a color name, which comes from Gecko, into a CSS style color. These colors cannot
 * be changed without considering the values coming from Gecko, and from old profiles
 * that already have their category colors saved into the profile.
 *
 * Category color names come from:
 * https://searchfox.org/mozilla-central/rev/9193635dca8cfdcb68f114306194ffc860456044/js/public/ProfilingCategory.h#33
 */
export function mapCategoryColorNameToStyles(colorName: string): ColorStyles {
  const colorStyles = STYLE_MAP[colorName];

  if (colorStyles !== undefined) {
    return colorStyles;
  }

  console.error(`Unknown color name '${colorName}' encountered. Consider updating this code to handle it.`);
  return GRAY_STYLE;
}

/**
 * This function tweaks the colors for the stack chart, but re-uses most
 * of the logic from `mapCategoryColorNameToStyles`.
 */
export function mapCategoryColorNameToStackChartStyles(colorName: string): ColorStyles {
  if (colorName === "transparent") {
    return GRAY_STYLE;
  }

  return mapCategoryColorNameToStyles(colorName);
}

export function mapTimeToCompareColor(
  totalTime: number
): ColorStyles & { className: string; soloForegroundColor?: string } {
  const formattedTotalTime = Math.abs(totalTime) < PERCENT_NEGLIGIBLE_DELTA ? 0 : totalTime * 100;

  for (let step = 0; step < COMPARE_STEPS.length; step++) {
    const { value } = COMPARE_STEPS[step];

    // first step manual check
    if (step === 0) {
      if (formattedTotalTime >= value) return COMPARE_STEPS[step];
      continue;
    }

    // zero step manual check
    if (value === 0) {
      if (formattedTotalTime === value) return COMPARE_STEPS[step];
      continue;
    }

    // last step manual check
    if (step === COMPARE_STEPS.length - 1) {
      if (formattedTotalTime <= value) return COMPARE_STEPS[step];
      continue;
    }

    // range exception for 10 > x > 0 and 0 > x > -10
    if (COMPARE_STEPS[step + 1].value === 0 || COMPARE_STEPS[step - 1].value === 0) {
      if (COMPARE_STEPS[step - 1].value > formattedTotalTime && formattedTotalTime > COMPARE_STEPS[step + 1].value) {
        return COMPARE_STEPS[step];
      }
      continue;
    }

    // in between steps check
    if (value < 0 && value >= formattedTotalTime && formattedTotalTime > COMPARE_STEPS[step + 1].value) {
      return COMPARE_STEPS[step];
    } else if (value > 0 && COMPARE_STEPS[step - 1].value > formattedTotalTime && formattedTotalTime >= value) {
      return COMPARE_STEPS[step];
    }
  }

  return GRAY_STYLE;
}
