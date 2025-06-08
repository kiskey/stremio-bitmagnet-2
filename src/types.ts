export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  resources: Array<'stream' | 'catalog' | 'meta' | 'subtitles'>;
  types: StremioItemType[];
  idPrefixes?: string[];
  catalogs: StremioCatalog[];
  behaviorHints?: {
    configurable?: boolean;
    configurationRequired?: boolean;
  };
}

export interface StremioCatalog {
  type: StremioItemType;
  id: string;
  name: string;
  extra?: Array<{ name: string; isRequired?: boolean; options?: string[]; optionsLimit?: number }>;
}

export type StremioItemType = 'movie' | 'series' | 'channel' | 'tv';

export interface StremioRequestType {
  type: StremioItemType;
  id: string; // Typically IMDB ID, e.g., tt123456
  name?: string; // Name of the movie or series
  year?: number; // Release year
  season?: number; // For series
  episode?: number; // For series
  config?: Record<string, any>; // User config from Stremio
}

export interface StremioStream {
  infoHash?: string; // Required for torrents
  mapIdx?: number; // For series episodes from same torrent file (0-based index)
  name?: string; // "Bitmagnet - 🧲 - Resolution" (Displayed in Stremio stream selection list)
  title?: string; // Multi-line rich description with emojis (Displayed as tooltip or details for the stream)
  sources?: {
    // Key is type, e.g., "url", "player_url", "yt_id", "externalUrl", "tracker"
    // For torrents, infoHash is primary, but trackers can be listed here.
    // Stremio typically uses infoHash and then might use its own tracker mechanisms or trackers from `sources`.
    [type: string]: string[] | { url: string; quality?: number }[]; 
    // Example for torrents, though infoHash is usually enough and trackers are often added by Stremio client/core
    // "tracker:"?: string[]; // Array of tracker URLs
  };
  behaviorHints?: {
    bingeGroup?: string; // Groups episodes from same torrent for continuous playback
    countryWhitelist?: string[];
    notWebReady?: boolean; // If true, Stremio might try to open with external player directly
    // UHD?: boolean; // For 4K content, helps Stremio UI. Often inferred from title/resolution.
  };
  // Optional metadata, parsed if possible, used for sorting and display enrichment
  parsedMeta?: ParsedMetadata; 
  // Fields primarily for internal sorting before formatting for Stremio
  seeders?: number;
  size?: number; // in bytes
}

export interface StremioStreamResponse {
  streams: StremioStream[];
  cacheMaxAge?: number; // Cache time in seconds for Stremio client
  staleRevalidate?: number; // Time after which Stremio should revalidate in background
  staleError?: number; // Time to serve stale content on error before failing
  error?: string; // Optional error message to Stremio
}

export interface BitmagnetTorrent {
  infoHash: string;
  title: string; // Raw title from Bitmagnet (could be 'name' field from GraphQL response)
  name?: string; // Bitmagnet often uses 'name' for the release title
  seeders?: number;
  leechers?: number;
  size?: number; // Size in bytes
  source?: string; // e.g. "BLURAY", "WEB" - if available directly from Bitmagnet
  videoResolution?: string; // e.g. "1080p" - if available
  videoCodec?: string; // e.g. "x265" - if available
  audioCodec?: string | string[]; // if available
  releaseDate?: string; // e.g. "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ssZ"
  filesStatus?: string; // e.g. "COMPLETED"
  filesCount?: number;
  tags?: string[]; // Generic tags from Bitmagnet
  // Hypothetical structure for more detailed metadata directly from Bitmagnet
  metadata?: { 
    video_resolution?: string;
    video_codec?: string;
    audio_codec?: string | string[];
    video_source?: string; // Potentially more specific than top-level 'source'
  };
  files?: { // For series packs, to determine mapIdx
      items: Array<{ path: string; size: number; fileIndex?: number }>; // fileIndex is 0-based from torrent
  };
  [key: string]: any; // Allow other properties that might come from Bitmagnet
}


export interface BitmagnetSearchResponse {
  data?: {
    // Adapt this to your Bitmagnet's GraphQL schema (e.g., searchContent, torrents, etc.)
    searchTorrents?: { 
      items: BitmagnetTorrent[];
      totalCount?: number;
    };
    searchContent?: { 
      items: BitmagnetTorrent[];
      count?: number; // Might be 'totalCount' or similar depending on schema
    };
    // Add other potential top-level data structures from your schema if needed
  };
  items?: BitmagnetTorrent[]; // Fallback if data is not nested under searchContent/searchTorrents
  errors?: Array<{ message: string; [key: string]: any }>; // Standard GraphQL errors
}

export interface ParsedMetadata {
  originalTitle: string;
  cleanedTitle?: string; // Title after removing metadata tags
  year?: number;
  resolution?: string; // e.g., 1080p, 720p, 2160p, SD
  qualitySource?: string; // e.g., BluRay, WEB-DL, BDRip, DVD, CAM, TS, SCR
  videoCodec?: string; // e.g., x264, x265, HEVC, AV1
  audioCodec?: string | string[]; // e.g., DTS, AC3, AAC, TrueHD, Atmos + channels (5.1, 7.1)
  languages?: string[]; // e.g., ENG, FRA, SPA, Multi, Dual
  isHDR?: boolean;
  is3D?: boolean;
  releaseGroup?: string;
  episodeInfo?: string; // e.g., S01E01, S01, E01-E03
  rawSize?: string; // e.g., "1.2GB" as parsed from title
  calculatedSize?: number; // Size in bytes, either from Bitmagnet or calculated from rawSize
  seeders?: number; // From Bitmagnet if available, or parsed (less common from title)
}

// Defines the quality hierarchy for sorting. Higher number = better.
export enum VideoQualityRank {
  UHD_BLURAY = 10,     // 2160p+ BluRay/Remux
  BLURAY_1080P = 9,    // 1080p BluRay/Remux
  WEBDL_2160P = 8,     // 2160p+ WEB-DL/WEBRip
  WEBDL_1080P = 7,     // 1080p WEB-DL/WEBRip
  BLURAY_720P = 6,     // 720p BluRay/Remux
  WEBDL_720P = 5,      // 720p WEB-DL/WEBRip
  HDTV_1080P = 4,      // HDTV 1080p
  DVD = 3,             // DVD, BDRip/BRRip (typically 480p/576p from DVD source)
  HDTV_720P = 2,       // HDTV 720p (can be lower bitrate than WEB/BluRay)
  SD = 1,              // 480p, 576p (non-DVD/BDRip source), other standard definition
  LOW_QUALITY = 0,     // SCR, CAM, TS, TC (Telesync, Telecine)
  UNKNOWN = -1
}

export enum SortPreference {
  Seeders = 'seeders',
  PreferredLanguage = 'preferredLanguage',
  Quality = 'quality', // Based on VideoQualityRank and then qualitySortOrder strings
  Size = 'size' // Can be 'asc' or 'desc' based on further config if needed
}

export interface AddonConfig {
  bitmagnetPublicGraphQLEndpoint: string;
  preferredLanguage: string; // e.g., 'ENG'
  // Array of quality strings (UPPERCASE), from best to worst.
  // Used as a tie-breaker if VideoQualityRank is the same.
  qualitySortOrder: string[]; 
  filterLowQuality: boolean; // Remove CAM, TS etc. if better qualities exist
  minSeeders: number;
  sortPreference: SortPreference[]; // Defines the order of sorting criteria
}

// For categorizing fetched trackers
export interface TrackerSources {
  http?: string[];
  udp?: string[];
  ws?: string[];
}
