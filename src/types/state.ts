/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Action,
  DataSource,
  PreviewSelection,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  RequestedLib,
  TrackReference,
  TimelineType,
  CheckedSharingOptions,
  Localization,
} from './actions';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { StartEndRange, CssPixels, Milliseconds } from './units';
import type { Profile, ThreadIndex, Pid, TabID } from './profile';

import type {
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
  ActiveTabTimeline,
  OriginsTimeline,
  ThreadsKey,
} from './profile-derived';
import type { Attempt } from '../utils/errors';
import type { TransformStacksPerThread } from './transforms';
import type JSZip from 'jszip';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { PathSet } from '../utils/path.js';
import type { UploadedProfileInformation as ImportedUploadedProfileInformation } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import type { BrowserConnectionStatus } from 'firefox-profiler/app-logic/browser-connection';

export type Reducer<T> = (arg1: T | undefined, arg2: Action) => T;

// This type is defined in uploaded-profiles-db.js because it is very tied to
// the data stored in our local IndexedDB, and we don't want to change it
// lightly, without changing the DB code.
// We reexport this type here mostly for easier access.
export type UploadedProfileInformation = ImportedUploadedProfileInformation;

export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {
  readonly selectedCallNodePath: CallNodePath,
  readonly expandedCallNodePaths: PathSet,
  readonly selectedMarker: MarkerIndex | null,
  readonly selectedNetworkMarker: MarkerIndex | null
};

export type ThreadViewOptionsPerThreads = Partial<Record<ThreadsKey, ThreadViewOptions>>;

export type RightClickedCallNode = {
  readonly threadsKey: ThreadsKey,
  readonly callNodePath: CallNodePath
};

export type MarkerReference = {
  readonly threadsKey: ThreadsKey,
  readonly markerIndex: MarkerIndex
};

/**
 * Full profile view state
 * They should not be used from the active tab view.
 * NOTE: This state is empty for now, but will be used later, do not remove.
 * globalTracks and localTracksByPid states will be here in the future.
 */
export type FullProfileViewState = {
  globalTracks: GlobalTrack[],
  localTracksByPid: Map<Pid, LocalTrack[]>
};

export type OriginsViewState = {
  originsTimeline: OriginsTimeline
};

/**
 * Active tab profile view state
 * They should not be used from the full view.
 */
export type ActiveTabProfileViewState = {
  activeTabTimeline: ActiveTabTimeline
};

/**
 * Profile view state
 */
export type ProfileViewState = {
  readonly viewOptions: {
    perThread: ThreadViewOptionsPerThreads,
    symbolicationStatus: SymbolicationStatus,
    waitingForLibs: Set<RequestedLib>,
    previewSelection: PreviewSelection,
    scrollToSelectionGeneration: number,
    focusCallTreeGeneration: number,
    rootRange: StartEndRange,
    rightClickedTrack: TrackReference | null,
    rightClickedCallNode: RightClickedCallNode | null,
    rightClickedMarker: MarkerReference | null,
    hoveredMarker: MarkerReference | null,
    mouseTimePosition: Milliseconds | null
  },
  readonly profile: Profile | null,
  readonly full: FullProfileViewState,
  readonly activeTab: ActiveTabProfileViewState,
  readonly origins: OriginsViewState
};

export type AppViewState = {
  readonly phase: 'ROUTE_NOT_FOUND'
} | {
  readonly phase: 'TRANSITIONING_FROM_STALE_PROFILE'
} | {
  readonly phase: 'PROFILE_LOADED'
} | {
  readonly phase: 'DATA_LOADED'
} | {
  readonly phase: 'DATA_RELOAD'
} | {
  readonly phase: 'FATAL_ERROR',
  readonly error: Error
} | {
  readonly phase: 'INITIALIZING',
  readonly additionalData?: {
    readonly attempt: Attempt | null,
    readonly message: string
  }
};

export type Phase = AppViewState['phase'];

/**
 * This represents the finite state machine for loading zip files. The phase represents
 * where the state is now.
 */
export type ZipFileState = {
  readonly phase: 'NO_ZIP_FILE',
  readonly zip: null,
  readonly pathInZipFile: null
} | {
  readonly phase: 'LIST_FILES_IN_ZIP_FILE',
  readonly zip: JSZip,
  readonly pathInZipFile: null
} | {
  readonly phase: 'PROCESS_PROFILE_FROM_ZIP_FILE',
  readonly zip: JSZip,
  readonly pathInZipFile: string
} | {
  readonly phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
  readonly zip: JSZip,
  readonly pathInZipFile: string
} | {
  readonly phase: 'FILE_NOT_FOUND_IN_ZIP_FILE',
  readonly zip: JSZip,
  readonly pathInZipFile: string
} | {
  readonly phase: 'VIEW_PROFILE_IN_ZIP_FILE',
  readonly zip: JSZip,
  readonly pathInZipFile: string
};

export type IsOpenPerPanelState = Partial<Record<TabSlug, boolean>>;

export type UrlSetupPhase = 'initial-load' | 'loading-profile' | 'done';

/*
 * Experimental features that are mostly disabled by default. You need to enable
 * them from the DevTools console with `experimental.enable<feature-camel-case>()`,
 * e.g. `experimental.enableEventDelayTracks()`.
 */
export type ExperimentalFlags = {
  readonly eventDelayTracks: boolean,
  readonly cpuGraphs: boolean,
  readonly processCPUTracks: boolean
};

export type AppState = {
  readonly view: AppViewState,
  readonly urlSetupPhase: UrlSetupPhase,
  readonly hasZoomedViaMousewheel: boolean,
  readonly isSidebarOpenPerPanel: IsOpenPerPanelState,
  readonly panelLayoutGeneration: number,
  readonly lastVisibleThreadTabSlug: TabSlug,
  readonly trackThreadHeights: Partial<Record<ThreadsKey, CssPixels>>,
  readonly isNewlyPublished: boolean,
  readonly isDragAndDropDragging: boolean,
  readonly isDragAndDropOverlayRegistered: boolean,
  readonly experimental: ExperimentalFlags,
  readonly currentProfileUploadedInformation: UploadedProfileInformation | null,
  readonly browserConnectionStatus: BrowserConnectionStatus
};

export type UploadPhase = 'local' | 'compressing' | 'uploading' | 'uploaded' | 'error';

export type UploadState = {
  phase: UploadPhase,
  uploadProgress: number,
  error: Error | unknown,
  abortFunction: () => void,
  generation: number
};

export type PublishState = {
  readonly checkedSharingOptions: CheckedSharingOptions,
  readonly upload: UploadState,
  readonly isHidingStaleProfile: boolean,
  readonly hasSanitizedProfile: boolean,
  readonly prePublishedState: State | null
};

export type ZippedProfilesState = {
  zipFile: ZipFileState,
  error: Error | null,
  selectedZipFileIndex: IndexIntoZipFileTable | null,
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>
};

export type SourceViewState = {
  activationGeneration: number,
  file: string | null
};

export type FileSourceStatus = {
  type: 'LOADING',
  source: FileSourceLoadingSource
} | {
  type: 'ERROR',
  errors: SourceLoadingError[]
} | {
  type: 'AVAILABLE',
  source: string
};

export type FileSourceLoadingSource = {
  type: 'URL',
  url: string
} | {
  type: 'BROWSER_CONNECTION'
};

export type SourceLoadingError = {
  type: 'NO_KNOWN_CORS_URL'
} | {
  type: 'NETWORK_ERROR',
  url: string,
  networkErrorMessage: string
} | {
  type: 'NOT_PRESENT_IN_ARCHIVE',
  url: string,
  pathInArchive: string
} | {
  type: 'ARCHIVE_PARSING_ERROR',
  url: string,
  parsingErrorMessage: string
} | {
  type: 'SYMBOL_SERVER_API_ERROR',
  apiErrorMessage: string
} | {
  type: 'BROWSER_CONNECTION_ERROR',
  browserConnectionErrorMessage: string
} | {
  type: 'BROWSER_API_ERROR',
  apiErrorMessage: string
};

/**
 * Full profile specific url state
 * They should not be used from the active tab view.
 */
export type FullProfileSpecificUrlState = {
  globalTrackOrder: TrackIndex[],
  hiddenGlobalTracks: Set<TrackIndex>,
  hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
  localTrackOrderByPid: Map<Pid, TrackIndex[]>,
  showJsTracerSummary: boolean,
  legacyThreadOrder: ThreadIndex[] | null,
  legacyHiddenThreads: ThreadIndex[] | null
};

/**
 * Active tab profile specific url state
 * They should not be used from the full view.
 */
export type ActiveTabSpecificProfileUrlState = {
  isResourcesPanelOpen: boolean
};

export type ProfileSpecificUrlState = {
  selectedThreads: Set<ThreadIndex> | null,
  implementation: ImplementationFilter,
  lastSelectedCallTreeSummaryStrategy: CallTreeSummaryStrategy,
  invertCallstack: boolean,
  showUserTimings: boolean,
  committedRanges: StartEndRange[],
  callTreeSearchString: string,
  markersSearchString: string,
  networkSearchString: string,
  transforms: TransformStacksPerThread,
  timelineType: TimelineType,
  sourceView: SourceViewState,
  isBottomBoxOpenPerPanel: IsOpenPerPanelState,
  full: FullProfileSpecificUrlState,
  activeTab: ActiveTabSpecificProfileUrlState
};

/**
 * Determines how the timeline's tracks are organized.
 */
export type TimelineTrackOrganization = {
  readonly type: 'full'
} | {
  readonly type: 'active-tab',
  readonly tabID: TabID | null
} | {
  readonly type: 'origins'
};

export type UrlState = {
  readonly dataSource: DataSource,
  // This is used for the "public" dataSource".
  readonly hash: string,
  // This is used for the "from-url" dataSource.
  readonly profileUrl: string,
  // This is used for the "compare" dataSource, to compare 2 profiles.
  readonly profilesToCompare: string[] | null,
  readonly selectedTab: TabSlug,
  readonly pathInZipFile: string | null,
  readonly profileName: string | null,
  readonly timelineTrackOrganization: TimelineTrackOrganization,
  readonly profileSpecific: ProfileSpecificUrlState,
  readonly symbolServerUrl: string | null
};

/**
 * Localization State
 */
export type PseudoStrategy = null | 'bidi' | 'accented';
export type L10nState = {
  readonly requestedLocales: string[] | null,
  readonly pseudoStrategy: PseudoStrategy,
  readonly localization: Localization,
  readonly primaryLocale: string | null,
  readonly direction: 'ltr' | 'rtl'
};

export type IconState = Set<string>;

export type State = {
  readonly app: AppState,
  readonly profileView: ProfileViewState,
  readonly urlState: UrlState,
  readonly icons: IconState,
  readonly zippedProfiles: ZippedProfilesState,
  readonly publish: PublishState,
  readonly l10n: L10nState,
  readonly sources: Map<string, FileSourceStatus>
};

export type IconWithClassName = {
  readonly icon: string,
  readonly className: string
};
