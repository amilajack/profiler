/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { BottomBoxTabSlug, TabSlug } from "~/components/FFP/app-logic/tabs-handling";
import type {
  Action,
  CallTreeSummaryStrategy,
  DataSource,
  ImplementationFilter,
  LastNonShiftClickInformation,
  PreviewSelection,
  RequestedLib,
  TimelineType,
  TrackReference,
} from "~/components/FFP/types/actions";
import type { IndexIntoLibs, Pid, Profile, TabID, ThreadIndex } from "~/components/FFP/types/profile";
import type { Address, CssPixels, Milliseconds, StartEndRange } from "~/components/FFP/types/units";

import type {
  ActiveTabTimeline,
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  MarkerIndex,
  NativeSymbolInfo,
  OriginsTimeline,
  ThreadsKey,
  TrackIndex,
} from "~/components/FFP/types/profile-derived";
import type { TransformStacksPerThread } from "~/components/FFP/types/transforms";
import type { Attempt, FatalError } from "~/components/FFP/utils/errors";
import type { PathSet } from "~/components/FFP/utils/path.js";

export type Reducer<T> = (arg1: T | undefined, arg2: Action) => T;

export type SymbolicationStatus = "DONE" | "SYMBOLICATING";
export type ThreadViewOptions = {
  readonly selectedCallNodePath: CallNodePath;
  readonly expandedCallNodePaths: PathSet;
  readonly selectedMarker: MarkerIndex | null;
  readonly selectedNetworkMarker: MarkerIndex | null;
};

export type ThreadViewOptionsPerThreads = Partial<Record<ThreadsKey, ThreadViewOptions>>;

export type TableViewOptions = {
  readonly fixedColumnWidths: Array<CssPixels> | null;
};

export type TableViewOptionsPerTab = Partial<Record<TabSlug, TableViewOptions>>;

export type RightClickedCallNode = {
  readonly threadsKey: ThreadsKey;
  readonly callNodePath: CallNodePath;
};

export type MarkerReference = {
  readonly threadsKey: ThreadsKey;
  readonly markerIndex: MarkerIndex;
};

/**
 * Full profile view state
 * They should not be used from the active tab view.
 * NOTE: This state is empty for now, but will be used later, do not remove.
 * globalTracks and localTracksByPid states will be here in the future.
 */
export type FullProfileViewState = {
  globalTracks: GlobalTrack[];
  localTracksByPid: Map<Pid, LocalTrack[]>;
};

export type OriginsViewState = {
  originsTimeline: OriginsTimeline;
};

/**
 * Active tab profile view state
 * They should not be used from the full view.
 */
export type ActiveTabProfileViewState = {
  activeTabTimeline: ActiveTabTimeline;
};

/**
 * Profile view state
 */
export type ProfileViewState = {
  readonly viewOptions: {
    perThread: ThreadViewOptionsPerThreads;
    symbolicationStatus: SymbolicationStatus;
    waitingForLibs: Set<RequestedLib>;
    previewSelection: PreviewSelection;
    scrollToSelectionGeneration: number;
    focusCallTreeGeneration: number;
    rootRange: StartEndRange;
    lastNonShiftClick: LastNonShiftClickInformation | null;
    rightClickedTrack: TrackReference | null;
    rightClickedCallNode: RightClickedCallNode | null;
    rightClickedMarker: MarkerReference | null;
    hoveredMarker: MarkerReference | null;
    mouseTimePosition: Milliseconds | null;
    perTab: TableViewOptionsPerTab;
  };
  readonly profile: Profile | null;
  readonly full: FullProfileViewState;
  readonly activeTab: ActiveTabProfileViewState;
  readonly origins: OriginsViewState;
};

export type AppViewState =
  | {
      readonly phase: "ROUTE_NOT_FOUND";
    }
  | {
      readonly phase: "TRANSITIONING_FROM_STALE_PROFILE";
    }
  | {
      readonly phase: "PROFILE_LOADED";
    }
  | {
      readonly phase: "DATA_LOADED";
    }
  | {
      readonly phase: "DATA_RELOAD";
    }
  | {
      readonly phase: "FATAL_ERROR";
      readonly error: FatalError;
    }
  | {
      readonly phase: "INITIALIZING";
      readonly additionalData?: {
        readonly attempt: Attempt | null;
        readonly message: string;
      };
    };

export type Phase = AppViewState["phase"];

/**
 * This represents the finite state machine for loading zip files. The phase represents
 * where the state is now.
 */
export type ZipFileState =
  | {
      readonly phase: "NO_ZIP_FILE";
      readonly zip: null;
      readonly pathInZipFile: null;
    }
  | {
      readonly phase: "LIST_FILES_IN_ZIP_FILE";
      readonly zip: unknown;
      readonly pathInZipFile: null;
    }
  | {
      readonly phase: "PROCESS_PROFILE_FROM_ZIP_FILE";
      readonly zip: unknown;
      readonly pathInZipFile: string;
    }
  | {
      readonly phase: "FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE";
      readonly zip: unknown;
      readonly pathInZipFile: string;
    }
  | {
      readonly phase: "FILE_NOT_FOUND_IN_ZIP_FILE";
      readonly zip: unknown;
      readonly pathInZipFile: string;
    }
  | {
      readonly phase: "VIEW_PROFILE_IN_ZIP_FILE";
      readonly zip: unknown;
      readonly pathInZipFile: string;
    };

export type IsOpenPerPanelState = Partial<Record<TabSlug, boolean>>;

export type UrlSetupPhase = "initial-load" | "loading-profile" | "done";

export type AppState = {
  readonly view: AppViewState;
  readonly urlSetupPhase: UrlSetupPhase;
  readonly hasZoomedViaMousewheel: boolean;
  readonly isSidebarOpenPerPanel: IsOpenPerPanelState;
  readonly sidebarOpenCategories: Map<string, Set<number>>;
  readonly panelLayoutGeneration: number;
  readonly trackThreadHeights: Partial<Record<ThreadsKey, CssPixels>>;
  readonly isExpandedMode: boolean;
};

export type UploadPhase = "local" | "compressing" | "uploading" | "uploaded" | "error";

export type UploadState = {
  phase: UploadPhase;
  uploadProgress: number;
  error: Error | unknown;
  abortFunction: () => void;
  generation: number;
};

export type SourceViewState = {
  scrollGeneration: number;
  // Non-null if this source file was opened for a function from native code.
  // In theory, multiple different libraries can have source files with the same
  // path but different content.
  // Null if the source file is not for native code or if the lib is not known,
  // for example if the source view was opened via the URL (the source URL param
  // currently discards the libIndex).
  libIndex: IndexIntoLibs | null;
  // The path to the source file. Null if a function without a file path was
  // double clicked.
  sourceFile: string | null;
};

export type AssemblyViewState = {
  // Whether the assembly view panel is open within the bottom box. This can be
  // true even if the bottom box itself is closed.
  isOpen: boolean;
  // When this is incremented, the assembly view scrolls to the "hotspot" line.
  scrollGeneration: number;
  // The native symbol for which the assembly code is being shown at the moment.
  // Null if the initiating call node did not have a native symbol.
  nativeSymbol: NativeSymbolInfo | null;
  // The set of native symbols which contributed samples to the initiating call
  // node. Often, this will just be one element (the same as `nativeSymbol`),
  // but it can also be multiple elements, for example when double-clicking a
  // function like `Vec::push` in an inverted call tree, if that function has
  // been inlined into multiple different callers.
  allNativeSymbolsForInitiatingCallNode: NativeSymbolInfo[];
};

export type DecodedInstruction = {
  address: Address;
  decodedString: string;
};

export type SourceCodeStatus =
  | {
      type: "LOADING";
      source: CodeLoadingSource;
    }
  | {
      type: "ERROR";
      errors: SourceCodeLoadingError[];
    }
  | {
      type: "AVAILABLE";
      code: string;
    };

export type AssemblyCodeStatus =
  | {
      type: "LOADING";
      source: CodeLoadingSource;
    }
  | {
      type: "ERROR";
      errors: ApiQueryError[];
    }
  | {
      type: "AVAILABLE";
      instructions: DecodedInstruction[];
    };

export type CodeLoadingSource =
  | {
      type: "URL";
      url: string;
    }
  | {
      type: "BROWSER_CONNECTION";
    };

export type ApiQueryError = // Used when the symbol server reported an error, for example because our
  // request was bad.
  | {
      type: "NETWORK_ERROR";
      url: string;
      networkErrorMessage: string;
    } // Used when the symbol server's response was bad.
  | {
      type: "SYMBOL_SERVER_API_ERROR";
      apiErrorMessage: string;
    } // Used when the browser API reported an error, for example because our
  // request was bad.
  | {
      type: "SYMBOL_SERVER_API_MALFORMED_RESPONSE";
      errorMessage: string;
    } // Used when the browser's response was bad.
  | {
      type: "BROWSER_CONNECTION_ERROR";
      browserConnectionErrorMessage: string;
    }
  | {
      type: "BROWSER_API_ERROR";
      apiErrorMessage: string;
    }
  | {
      type: "BROWSER_API_MALFORMED_RESPONSE";
      errorMessage: string;
    };

export type SourceCodeLoadingError =
  | ApiQueryError
  | {
      type: "NO_KNOWN_CORS_URL";
    }
  | {
      type: "NOT_PRESENT_IN_ARCHIVE";
      url: string;
      pathInArchive: string;
    }
  | {
      type: "ARCHIVE_PARSING_ERROR";
      url: string;
      parsingErrorMessage: string;
    };

/**
 * Full profile specific url state
 * They should not be used from the active tab view.
 */
export type FullProfileSpecificUrlState = {
  globalTrackOrder: TrackIndex[];
  hiddenGlobalTracks: Set<TrackIndex>;
  hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>;
  localTrackOrderByPid: Map<Pid, TrackIndex[]>;
  localTrackOrderChangedPids: Set<Pid>;
  showJsTracerSummary: boolean;
  legacyThreadOrder: ThreadIndex[] | null;
  legacyHiddenThreads: ThreadIndex[] | null;
};

/**
 * Active tab profile specific url state
 * They should not be used from the full view.
 */
export type ActiveTabSpecificProfileUrlState = {
  isResourcesPanelOpen: boolean;
};

export type ProfileSpecificUrlState = {
  selectedThreads: Set<ThreadIndex> | null;
  implementation: ImplementationFilter;
  lastSelectedCallTreeSummaryStrategy: CallTreeSummaryStrategy;
  invertCallstack: boolean;
  showUserTimings: boolean;
  committedRanges: StartEndRange[];
  callTreeSearchString: string;
  markersSearchString: string;
  networkSearchString: string;
  transforms: TransformStacksPerThread;
  timelineType: TimelineType;
  sourceView: SourceViewState;
  assemblyView: AssemblyViewState;
  isBottomBoxOpenPerPanel: IsOpenPerPanelState;
  full: FullProfileSpecificUrlState;
  activeTab: ActiveTabSpecificProfileUrlState;
  isCompareMode: boolean;
  fetchRetryGeneration: number;
};

/**
 * Determines how the timeline's tracks are organized.
 */
export type TimelineTrackOrganization =
  | {
      readonly type: "full";
    }
  | {
      readonly type: "active-tab";
      readonly tabID: TabID | null;
    }
  | {
      readonly type: "origins";
    };

export type UrlState = {
  readonly dataSource: DataSource;
  // This is used for the "public" dataSource".
  readonly hash: string;
  // This is used for the "from-url" dataSource.
  readonly profileUrl: string;
  // This is used for the "compare" dataSource, to compare 2 profiles.
  readonly profilesToCompare: string[] | null;
  readonly selectedTab: TabSlug;
  readonly selectedBottomBoxTab: BottomBoxTabSlug;
  readonly pathInZipFile: string | null;
  readonly profileName: string | null;
  readonly timelineTrackOrganization: TimelineTrackOrganization;
  readonly profileSpecific: ProfileSpecificUrlState;
  readonly symbolServerUrl: string | null;
};

/**
 * Localization State
 */
export type PseudoStrategy = null | "bidi" | "accented";

export type CodeState = {
  readonly sourceCodeCache: Map<string, SourceCodeStatus>;
  readonly assemblyCodeCache: Map<string, AssemblyCodeStatus>;
};

export type State = {
  readonly app: AppState;
  readonly profileView: ProfileViewState;
  readonly urlState: UrlState;
  readonly code: CodeState;
};

export type IconWithClassName = {
  readonly icon: string;
  readonly className: string;
};
