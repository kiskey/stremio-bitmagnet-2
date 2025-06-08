import { VideoQualityRank } from './types'; // Adjusted path for server structure

export const APP_VERSION = '1.0.1'; // Updated version slightly

// ADDON_ID_LIB and ADDON_NAME_LIB are for library use if this becomes a shared module.
// The server.ts file defines its own ADDON_SERVER_ID and ADDON_SERVER_NAME.
export const ADDON_ID_LIB = 'com.yourname.bitmagnet2.lib'; // Customize 'yourname'
export const ADDON_NAME_LIB = 'Bitmagnet 2 Library';

// Regex patterns for metadata parsing from torrent titles.
// Order of application might matter. Case-insensitive.
export const REGEX_PATTERNS = {
  YEAR: /\b((?:19[89]|20[0-2])\d)\b/g, // Years 1980-2029. Consider expanding range or making dynamic.
  RESOLUTION: /\b(4K|2160p|1080p|720p|576p|480p|360p|SD)\b/ig, // Added 4K explicitly
  QUALITY_SOURCE: /\b(BluRay|Blu-Ray|BDRip|BRRip|WEB-DL|WEBDL|WEB-Rip|WEBRIP|WEB|HDRip|DVDRip|DVD-R|DVDScr|SCREENER|SCR|TS|TELESYNC|TC|TELECINE|CAM|HDTV|PDTV|SATRip|DSR|REMUX|Complete|REPACK|PROPER)\b/ig, // Added WEB, WEBRIP
  VIDEO_CODEC: /\b(x26[45]|H\.?26[45]|HEVC|AV1|AVC|XViD|DiVX|VP9)\b/ig, // Added VP9
  AUDIO_CODEC: /\b(Atmos|TrueHD|DTS-HD(?:[\s.]?MA)?|DTS(?:-ES|-EX|-X)?|Dolby Digital Plus|DD\+|EAC3|AC3|AAC(?:-LC|-HE)?|MP3|Opus|FLAC|PCM|Vorbis|DD\+?P?5\.1|DD\+?P?7\.1|5\.1|7\.1|2\.0|LiNE|AUD|STEREO)\b/ig, // More comprehensive audio
  HDR: /\b(HDR10(?:Plus|\+)?|HDR|Dolby Vision|DV|HLG)\b/ig, // Added HLG
  THREE_D: /\b(3D)\b/ig,
  LANGUAGES: /\b(English|ENG|Spanish|SPA|ESP|French|FRE|FRA|FR|German|GER|DEU|DE|Italian|ITA|IT|Russian|RUS|RU|Japanese|JPN|JP|Korean|KOR|KO|Chinese|CHI|ZH|Mandarin|Cantonese|Hindi|HIN|HI|Tamil|TAM|TA|Telugu|TEL|TE|Malayalam|MAL|ML|Dual[\s.]Audio|Multi[\s.]Audio|VOSTFR|SUBFRENCH|ENGSUB|SUBBED)\b/ig, // Added shorter lang codes and sub variants
  SEASON_EPISODE: /[Ss](\d{1,3})[Ee](\d{1,4})(?:-[Ee]?(\d{1,4}))?|[Ss](\d{1,3})(?!\d|p|K)|[Ee][Pp]?(\d{1,4})(?!\d|p|K)|PART\.?(\d{1,2})/gi, // S01E01, S01E01-E02, S01, E01, Part.01. More robust, avoids matching resolution like 1080p.
  RELEASE_GROUP: /(?:^|[\s.\-_\[])([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?)$/i, // Tries to get group from very end if alphanumeric, possibly with one hyphen.
  SIZE: /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|TiB|GiB|MiB|KiB)/ig, // Added Terabytes
};

// Emojis for formatting stream titles
export const EMOJIS = {
  TITLE: '🎬',
  QUALITY: '🌟', // Changed for general quality
  RESOLUTION: '📺',
  LANGUAGE: '🗣️',
  AUDIO: '🔊',
  SEEDERS: '🌱',
  PEERS: '🔗', // Not directly used, but good to have
  SIZE: '💾',
  INFO: 'ℹ️',
  CALENDAR: '🗓️', // For year/date
  SOURCE: '💿', // For BluRay, WEB etc.
  CODEC: '⚙️', // For video/audio codec
  HDR: '✨',
  MAGNET: '🧲',
  EPISODE: '🎞️', // For S/E info
};

// Map common quality terms to a standardized rank/term
// Ensure keys are UPPERCASE and normalized (e.g., no hyphens if regex removes them for matching)
export const QUALITY_RANK_MAP: Record<string, VideoQualityRank> = {
  // 2160p / 4K
  '2160P BLURAY': VideoQualityRank.UHD_BLURAY, '4K BLURAY': VideoQualityRank.UHD_BLURAY,
  '2160P REMUX': VideoQualityRank.UHD_BLURAY, '4K REMUX': VideoQualityRank.UHD_BLURAY,
  '2160P WEB-DL': VideoQualityRank.WEBDL_2160P, '2160P WEBDL': VideoQualityRank.WEBDL_2160P,
  '4K WEB-DL': VideoQualityRank.WEBDL_2160P, '4K WEBDL': VideoQualityRank.WEBDL_2160P,
  '2160P WEB': VideoQualityRank.WEBDL_2160P, '4K WEB': VideoQualityRank.WEBDL_2160P,
  '2160P WEBRIP': VideoQualityRank.WEBDL_2160P, '4K WEBRIP': VideoQualityRank.WEBDL_2160P,
  // 1080p
  '1080P BLURAY': VideoQualityRank.BLURAY_1080P,
  '1080P REMUX': VideoQualityRank.BLURAY_1080P,
  '1080P WEB-DL': VideoQualityRank.WEBDL_1080P, '1080P WEBDL': VideoQualityRank.WEBDL_1080P,
  '1080P WEB': VideoQualityRank.WEBDL_1080P, '1080P WEBRIP': VideoQualityRank.WEBDL_1080P,
  '1080P BDRIP': VideoQualityRank.BLURAY_1080P, '1080P BRRIP': VideoQualityRank.BLURAY_1080P,
  '1080P HDTV': VideoQualityRank.HDTV_1080P,
  // 720p
  '720P BLURAY': VideoQualityRank.BLURAY_720P,
  '720P REMUX': VideoQualityRank.BLURAY_720P,
  '720P WEB-DL': VideoQualityRank.WEBDL_720P, '720P WEBDL': VideoQualityRank.WEBDL_720P,
  '720P WEB': VideoQualityRank.WEBDL_720P, '720P WEBRIP': VideoQualityRank.WEBDL_720P,
  '720P BDRIP': VideoQualityRank.BLURAY_720P, '720P BRRIP': VideoQualityRank.BLURAY_720P,
  '720P HDTV': VideoQualityRank.HDTV_720P,
  // DVD / SD
  'DVDRIP': VideoQualityRank.DVD, 'DVD-R': VideoQualityRank.DVD,
  '480P DVD': VideoQualityRank.DVD, '576P DVD': VideoQualityRank.DVD, // Specific for DVD source at SD
  '480P BDRIP': VideoQualityRank.DVD, '576P BDRIP': VideoQualityRank.DVD, // SD BDRips are from DVD equivalent
  '480P': VideoQualityRank.SD, '576P': VideoQualityRank.SD, 'SD': VideoQualityRank.SD,
  // Low Quality
  'DVDSCR': VideoQualityRank.LOW_QUALITY, 'SCREENER': VideoQualityRank.LOW_QUALITY, 'SCR': VideoQualityRank.LOW_QUALITY,
  'TS': VideoQualityRank.LOW_QUALITY, 'TELESYNC': VideoQualityRank.LOW_QUALITY,
  'TC': VideoQualityRank.LOW_QUALITY, 'TELECINE': VideoQualityRank.LOW_QUALITY,
  'CAM': VideoQualityRank.LOW_QUALITY, 'CAMRIP': VideoQualityRank.LOW_QUALITY,
  // Default for general terms (these are broad, specific resolution+source is better)
  'BLURAY': VideoQualityRank.BLURAY_1080P, // Assume 1080p if only BluRay specified
  'WEB-DL': VideoQualityRank.WEBDL_1080P, 'WEBDL': VideoQualityRank.WEBDL_1080P, // Assume 1080p
  'WEB': VideoQualityRank.WEBDL_1080P, 'WEBRIP': VideoQualityRank.WEBDL_1080P,
  'BDRIP': VideoQualityRank.BLURAY_720P, 'BRRIP': VideoQualityRank.BLURAY_720P, // Assume 720p for generic BDRip
  'HDTV': VideoQualityRank.HDTV_720P, // Assume 720p
  'UNKNOWN': VideoQualityRank.UNKNOWN,
};

// List of terms indicating low quality (case-insensitive matching will be used)
export const LOW_QUALITY_TERMS = ['CAM', 'CAMRIP', 'TS', 'TELESYNC', 'TC', 'TELECINE', 'SCR', 'SCREENER', 'DVDSCR', 'PDVD'];
// Resolutions considered low quality if no better alternatives exist (case-insensitive)
export const LOW_QUALITY_RESOLUTIONS = ['480P', '360P', 'SD']; 

export const BEST_TRACKERS_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt';

// Fallback trackers if fetching fails
export const FALLBACK_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://tracker.internetwarriors.net:1337/announce",
  "udp://tracker.leechers-paradise.org:6969/announce",
  "udp://tracker.coppersurfer.tk:6969/announce",
  "udp://exodus.desync.com:6969/announce",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  // Add a few more reliable ones
  "udp://tracker.dler.org:6969/announce",
  "udp://public.popcorn-tracker.org:6969/announce",
];

// Language code mapping (simple). Keys should be uppercase.
export const LANGUAGE_MAP: Record<string, string> = {
  ENG: "English", ENGLISH: "English", EN: "English",
  SPA: "Spanish", ESPANOL: "Spanish", ESP: "Spanish", ES: "Spanish",
  FRE: "French", FRENCH: "French", FRA: "French", FR: "French",
  GER: "German", GERMAN: "German", DEU: "German", DE: "German",
  ITA: "Italian", ITALIAN: "Italian", IT: "Italian",
  RUS: "Russian", RUSSIAN: "Russian", RU: "Russian",
  JPN: "Japanese", JAPANESE: "Japanese", JP: "Japanese",
  KOR: "Korean", KOREAN: "Korean", KO: "Korean",
  CHI: "Chinese", CHINESE: "Chinese", ZH: "Chinese",
  HIN: "Hindi", HINDI: "Hindi", HI: "Hindi",
  TAM: "Tamil", TA: "Tamil",
  TEL: "Telugu", TE: "Telugu",
  MAL: "Malayalam", ML: "Malayalam",
  DUALAUDIO: "Dual Audio", MULTIAUDIO: "Multi Audio", DUAL: "Dual Audio", MULTI: "Multi Audio",
  VOSTFR: "French (VOSTFR)", SUBFRENCH: "French (Subbed)", ENGSUB:"English Subtitles", SUBBED:"Subbed"
};

// Common terms to remove from titles after primary metadata extraction.
// These regexes are designed to match whole words/terms.
export const COMMON_TRASH_TERMS = [
    'REQ', 'REQUEST', 'RARBG', /*'EXTREME',*/ 'PROPER', 'REPACK', 'REAL', 'FINAL',
    'UNRATED', 'DIRECTORS CUT', 'EXTENDED', 'LIMITED', 'CRITERION', 'COLLECTION',
    'INTERNAL', 'COMPLETE', 'SUBBED', 'SUBS', 'SUBTITLE', 'SUBTITLES',
    '\\[[a-zA-Z0-9\\s\\-]+\\]' // Generic bracketed content e.g. [HorribleSubs], [Team-Name]
].map(term => {
    if (term.startsWith('\\[')) return new RegExp(term, 'ig'); // Already a regex string
    return new RegExp(`\\b${term}\\b`, 'ig');
});
