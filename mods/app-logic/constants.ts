/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { MarkerPhase } from "~/components/FFP/types";
// The current version of the Gecko profile format.
// Please don't forget to update the gecko profile format changelog in
// `docs-developer/CHANGELOG-formats.md`.
export const GECKO_PROFILE_VERSION = 27;
// The current version of the "processed" profile format.
// Please don't forget to update the processed profile format changelog in
// `docs-developer/CHANGELOG-formats.md`.
export const PROCESSED_PROFILE_VERSION = 47;
// JS Tracer has very high fidelity information, and needs a more fine-grained zoom.
export const JS_TRACER_MAXIMUM_CHART_ZOOM = 0.001;
// See the MarkerPhase type for more information.
export const INSTANT: MarkerPhase = 0;
export const INTERVAL: MarkerPhase = 1;
export const INTERVAL_START: MarkerPhase = 2;
export const INTERVAL_END: MarkerPhase = 3;
