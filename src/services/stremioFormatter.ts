import { StremioStream, ParsedMetadata, VideoQualityRank, TrackerSources, StremioItemType } from '../types'; // Adjusted path
import { EMOJIS, QUALITY_RANK_MAP, LOW_QUALITY_TERMS, LOW_QUALITY_RESOLUTIONS } from '../constants'; // Adjusted path

export const getQualityRank = (parsedMeta?: ParsedMetadata): VideoQualityRank => {
  if (!parsedMeta) return VideoQualityRank.UNKNOWN;

  const resolution = parsedMeta.resolution?.toUpperCase();
  const source = parsedMeta.qualitySource?.toUpperCase();

  // Prioritize explicit low quality terms from title
  if (source && LOW_QUALITY_TERMS.some(lqs => source.includes(lqs.toUpperCase()))) {
    return VideoQualityRank.LOW_QUALITY;
  }
  // Check specific low quality resolutions, but allow DVD/BDRips to be ranked higher
  if (resolution && LOW_QUALITY_RESOLUTIONS.includes(resolution)) {
    if (source && (source.includes("DVD") || source.includes("BDRIP") || source.includes("BRRIP"))) {
      return VideoQualityRank.DVD; // Treat 480p/576p DVD/BDRip as DVD quality
    }
    return VideoQualityRank.SD; // Other SD resolutions
  }
  
  // Combined resolution and source (e.g., "1080P BLURAY")
  if (resolution && source) {
    const combinedKey = `${resolution} ${source.replace(/-/g, '')}`; // Normalize "WEB-DL" to "WEBDL" etc.
    if (QUALITY_RANK_MAP[combinedKey]) return QUALITY_RANK_MAP[combinedKey];
    // Try with only the first part of a multi-word source (e.g. "BLURAY RIP" -> "BLURAY")
    const sourceFirstPart = source.split(/[\s-]/)[0];
    if (QUALITY_RANK_MAP[`${resolution} ${sourceFirstPart}`]) return QUALITY_RANK_MAP[`${resolution} ${sourceFirstPart}`];
  }
  // Source alone (e.g., "BLURAY")
  if (source && QUALITY_RANK_MAP[source.replace(/-/g, '')]) return QUALITY_RANK_MAP[source.replace(/-/g, '')];
  // Resolution alone (e.g., "1080P")
  if (resolution && QUALITY_RANK_MAP[resolution]) return QUALITY_RANK_MAP[resolution];
  
  return VideoQualityRank.UNKNOWN;
};

const formatSize = (bytes?: number): string | undefined => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <=0) return undefined;
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // Handle cases where i might be out of bounds for extremely small/large numbers if not already caught by bytes <= 0
  if (i < 0 || i >= sizes.length) return Math.round(bytes) + ' Bytes'; 
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatStreamForResult = (
  stream: StremioStream,
  trackers: TrackerSources,
  itemType: StremioItemType,
  seasonNum?: number, // From Stremio request
  episodeNum?: number // From Stremio request
): StremioStream => {
  const meta = stream.parsedMeta || ({} as ParsedMetadata);
  
  // Stream Name for Stremio List (Concise)
  const nameParts: string[] = ['Bitmagnet 2', EMOJIS.MAGNET]; 
  if (meta.resolution) nameParts.push(meta.resolution);
  else if (meta.qualitySource) nameParts.push(meta.qualitySource.split(/[\s-]/)[0]); // First word of source
  else nameParts.push("Stream");
  if (meta.isHDR) nameParts.push("HDR");

  // Stream Title for Stremio Details (Rich & Multi-line)
  const titleLines: string[] = [];

  // Main Title Line: Cleaned Title (Year)
  const displayTitle = meta.cleanedTitle || meta.originalTitle.split(/(\d{4}|S\d{2}E\d{2})/)[0].replace(/[._]/g, ' ').trim() || "Unknown Title";
  const displayYear = meta.year || "";
  titleLines.push(`${EMOJIS.TITLE} ${displayTitle}${displayYear ? ` (${displayYear})` : ''}`);
  
  // Episode Info Line (for series)
  if (itemType === 'series') {
      let episodeString = meta.episodeInfo; // Parsed from torrent title SxxExx
      if (!episodeString && seasonNum && episodeNum) { // Fallback to request S/E
        episodeString = `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;
      }
      if (episodeString) {
        titleLines.push(`${EMOJIS.EPISODE} ${episodeString}`);
      }
  }

  // Quality Details Line
  let qualityDetails = [];
  if (meta.resolution) qualityDetails.push(meta.resolution);
  if (meta.qualitySource) qualityDetails.push(meta.qualitySource);
  if (meta.videoCodec) qualityDetails.push(meta.videoCodec);
  if (meta.isHDR) qualityDetails.push("HDR");
  if (qualityDetails.length > 0) {
    titleLines.push(`${EMOJIS.QUALITY} ${qualityDetails.join(' | ')}`);
  }

  // Language Line
  if (meta.languages && meta.languages.length > 0) {
    const langStr = meta.languages.slice(0, 3).join(', ') + (meta.languages.length > 3 ? '...' : '');
    titleLines.push(`${EMOJIS.LANGUAGE} ${langStr}`);
  }

  // Audio Line
  let audioDisplay = "";
  if (typeof meta.audioCodec === 'string' && meta.audioCodec.trim() !== '') {
    audioDisplay = meta.audioCodec;
  } else if (Array.isArray(meta.audioCodec) && meta.audioCodec.length > 0) {
     audioDisplay = meta.audioCodec.join(' ');
  }
  if (audioDisplay) titleLines.push(`${EMOJIS.AUDIO} ${audioDisplay}`);
  
  // Seeders Line
  const seeders = stream.seeders || meta.seeders;
  if (seeders !== undefined && seeders !== null) { // Check for null as well
      titleLines.push(`${EMOJIS.SEEDERS} ${seeders} seeds`);
  }

  // Size Line
  const formattedSize = formatSize(stream.size || meta.calculatedSize);
  if (formattedSize) {
    titleLines.push(`${EMOJIS.SIZE} ${formattedSize}`);
  }
  
  // Release Group Line (Optional)
  // if (meta.releaseGroup) {
  //     titleLines.push(`${EMOJIS.INFO} ${meta.releaseGroup}`);
  // }

  // Combine all available tracker URLs
  const allTrackers = [
    ...(trackers.http || []),
    ...(trackers.udp || []),
    ...(trackers.ws || []),
  ].filter(Boolean); // Ensure no null/empty strings


  const stremioFormattedStream: StremioStream = {
    infoHash: stream.infoHash,
    name: nameParts.join(' - '),
    title: titleLines.join('\n'),
    // Stremio typically handles trackers itself if infoHash is provided.
    // Providing them in `sources` can be a fallback or for specific player needs.
    sources: { 
      // 'tracker:': allTrackers // Stremio might not directly use this array if it has its own tracker resolution
    },
    behaviorHints: {},
    // Keep parsedMeta for potential internal use, but it's not directly sent to Stremio in this structure
    // parsedMeta: meta, 
    seeders: stream.seeders, // Stremio might use this for display if available
    // size: stream.size, // Stremio might use this
  };
  
  // Add `fileIdx` (Stremio uses `fileIdx` for torrents with multiple files, not `mapIdx`)
  // This is a very basic heuristic. Proper fileIdx requires Bitmagnet to provide an ordered file list
  // from the torrent, and then matching the requested episode (S/E) to a file in that list.
  if (itemType === 'series' && episodeNum !== undefined && seasonNum !== undefined) {
    // Heuristic: if torrent title indicates a pack (e.g. "S01 Complete") or lacks specific episode info,
    // and we are looking for a specific episode, we might assume the episode number (1-based) can map to fileIdx (0-based).
    const isLikelyPack = (meta.qualitySource?.toUpperCase().includes("COMPLETE") || meta.qualitySource?.toUpperCase().includes("SEASON")) ||
                         (meta.episodeInfo && meta.episodeInfo.toUpperCase() === `S${String(seasonNum).padStart(2,'0')}` && !meta.episodeInfo.toUpperCase().includes('E'));
    
    if (isLikelyPack) {
       // stremioFormattedStream.fileIdx = episodeNum -1; // 0-based index
       // stremioFormattedStream.behaviorHints.bingeGroup = `${stream.infoHash}_S${String(seasonNum).padStart(2,'0')}`;
       // console.log(`[stremioFormatter] Potential pack detected for ${meta.originalTitle}, S${seasonNum}E${episodeNum}. Not setting fileIdx due to unreliability without file list.`);
       // It's safer NOT to set fileIdx unless you have the actual file list from the torrent
       // and can reliably map the episode to a file index. Stremio players often auto-select well.
    }
  }


  return stremioFormattedStream;
};
