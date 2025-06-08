import { 
  StremioRequestType, 
  StremioStreamResponse, 
  StremioStream,
  BitmagnetTorrent,
  AddonConfig,
  // ParsedMetadata, // Not directly used here, but through its consumers
  VideoQualityRank,
  StremioItemType,
  SortPreference
} from '../types';
import { standardizeTitle, standardizeYear } from '../utils/standardization';
import { parseTorrentTitle } from './metadataParser';
import { formatStreamForResult, getQualityRank } from './stremioFormatter';
import { fetchTrackers, getCachedTrackers } from './trackerService';
import { queryBitmagnet } from './bitmagnetService';
import { LOW_QUALITY_TERMS, LOW_QUALITY_RESOLUTIONS } from '../constants';

// Initialize trackers on load (simulating server start)
// The trackerService itself has logic to prevent re-fetching too often.
fetchTrackers().catch(err => console.error("[addonService] Failed to fetch initial trackers on load:", err));

async function fetchAndProcessBitmagnetResults(
  searchQuery: string,
  year: number | undefined,
  type: StremioItemType, // Pass type to influence Bitmagnet query if schema supports it
  config: AddonConfig,
  apiKey?: string 
): Promise<BitmagnetTorrent[]> {
  try {
    const contentType = type === 'movie' ? 'MOVIE' : type === 'series' ? 'SERIES' : undefined;
    console.log(`[addonService] Querying Bitmagnet: query="${searchQuery}", year=${year}, type=${contentType}`);
    const results = await queryBitmagnet(
      searchQuery,
      year, 
      50, // limit
      config.bitmagnetPublicGraphQLEndpoint,
      contentType, // Pass content type to Bitmagnet query
      apiKey
    );
    console.log(`[addonService] Bitmagnet returned ${results.length} results for query="${searchQuery}", year=${year}, type=${contentType}`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[addonService] Failed to fetch from Bitmagnet for query "${searchQuery}" (Year: ${year}, Type: ${type}): ${errorMessage}`, error);
    return []; 
  }
}

export const processStreamRequest = async (
  request: StremioRequestType,
  config: AddonConfig,
  apiKey?: string 
): Promise<StremioStreamResponse> => {
  const { type, id, name, year: originalYearFromRequest, season, episode } = request;

  let searchTitle = name;
  let yearForSearch = originalYearFromRequest;

  // If name is generic (like placeholder from server.ts) or missing, it's unreliable.
  // A production addon should use 'id' (IMDB ID) to fetch actual title/year from TMDB/OMDB.
  if (!searchTitle || searchTitle.startsWith("Media for ID")) { 
      console.warn(`[addonService] Request for ID ${id} has a generic or missing title ('${name}'). Fetching metadata for this ID is recommended for better search results. For now, using ID as search query.`);
      // In a real scenario:
      // const metadata = await fetchMetadataFromTMDB(id, type); // You'd build this function
      // searchTitle = metadata.title;
      // yearForSearch = metadata.year;
      searchTitle = id; // Fallback: search Bitmagnet by IMDB ID (its effectiveness depends on Bitmagnet indexing)
  }
  
  const standardizedTitle = searchTitle ? standardizeTitle(searchTitle) : '';
  // Use year from request if available, otherwise year derived from metadata fetching (if implemented)
  const standardizedYear = yearForSearch ? standardizeYear(yearForSearch.toString()) : undefined;

  if (!standardizedTitle) {
    console.warn("[addonService] Title is missing or invalid after standardization. Cannot perform effective search.");
    return { streams: [] };
  }
  
  console.log(`[addonService] Processing request: Title='${standardizedTitle}', Year='${standardizedYear}', Type='${type}', ID='${id}', Season='${season}', Episode='${episode}'`);

  const queryPromises: Promise<BitmagnetTorrent[]>[] = [];

  // Query 1: Title + Year (if year is available)
  if (standardizedTitle && standardizedYear) {
    queryPromises.push(fetchAndProcessBitmagnetResults(standardizedTitle, standardizedYear, type, config, apiKey));
  }

  // Query 2: Title only (crucial for multi-year series or when year is uncertain)
  // Also good if standardizedYear was for series start, but an episode is from a later year.
  if (standardizedTitle) {
    queryPromises.push(fetchAndProcessBitmagnetResults(standardizedTitle, undefined, type, config, apiKey));
  }
  
  // Query 3 (Optional but recommended if title is just ID): Search by IMDB ID directly
  if (standardizedTitle === id) { // If we fell back to searching by ID
     queryPromises.push(fetchAndProcessBitmagnetResults(id, undefined, type, config, apiKey));
  }


  const allResultsNested = await Promise.all(queryPromises);
  const rawResults = allResultsNested.flat();

  const uniqueResults = Array.from(new Map(rawResults.map(item => [item.infoHash, item])).values());
  console.log(`[addonService] Found ${uniqueResults.length} unique torrents from Bitmagnet for '${standardizedTitle}'.`);

  let parsedStreams: StremioStream[] = uniqueResults.map(torrent => {
    const torrentYearFromBitmagnetRelease = torrent.releaseDate ? standardizeYear(torrent.releaseDate) : undefined;
    // Context year for parsing: Bitmagnet release year > standardized year from request > undefined
    const contextYearForParsing = torrentYearFromBitmagnetRelease || standardizedYear;
    const parsedMeta = parseTorrentTitle(torrent.title, standardizedTitle, contextYearForParsing);
    
    if (type === 'series' && season && episode) {
        if (parsedMeta.episodeInfo) { // Torrent title has S/E info
            // Regex to match S<season_num>E<episode_num> or S<season_num> (for season packs)
            // Example: S01E01, S1E1, S01, etc.
            const sePattern = new RegExp(`[Ss](${String(season).padStart(2, '0')}|${season})[Ee](${String(episode).padStart(2, '0')}|${episode})`, 'i');
            const seasonPackPattern = new RegExp(`[Ss](${String(season).padStart(2, '0')}|${season})(?!\\d|([Ee]))`, 'i'); // Matches S01 but not S01E02 or S011

            if (!sePattern.test(parsedMeta.episodeInfo) && !seasonPackPattern.test(parsedMeta.episodeInfo)) {
                 // If specific S/E is requested, and torrent's S/E info doesn't match AND it's not a season pack for the requested season
                 return null;
            }
            // If it's a season pack matching requested season, or specific S/E match, it's a candidate.
        } else {
            // No S/E info in torrent title. This could be a "complete series" pack or a poorly named file.
            // If Bitmagnet's `files` array is populated and reliable, one could iterate through files here
            // to find a match for season/episode. This is complex.
            // For now, if specific S/E is requested and torrent title has no S/E, it's less likely a match.
            // However, some "Complete S01" packs might not have E information in the primary title.
            // Let it pass for now if it's a series request; stremioFormatter might try to set mapIdx if it looks like a pack.
        }
    }
    
    // Enrich with direct data from Bitmagnet if available (e.g., precise resolution)
    // This assumes queryBitmagnet populates these if the schema provides them.
    parsedMeta.resolution = torrent.videoResolution || parsedMeta.resolution;
    parsedMeta.videoCodec = torrent.videoCodec || parsedMeta.videoCodec;
    // parsedMeta.audioCodec = torrent.audioCodec || parsedMeta.audioCodec; // Handled by parser
    parsedMeta.qualitySource = torrent.source || parsedMeta.qualitySource;

    return {
      infoHash: torrent.infoHash,
      parsedMeta: {
        ...parsedMeta,
        seeders: torrent.seeders || parsedMeta.seeders || 0,
        calculatedSize: torrent.size || parsedMeta.calculatedSize,
      },
      seeders: torrent.seeders || parsedMeta.seeders || 0,
      size: torrent.size || parsedMeta.calculatedSize,
    };
  }).filter(stream => stream !== null) as StremioStream[];

  console.log(`[addonService] Parsed ${parsedStreams.length} streams after S/E matching for '${standardizedTitle}'.`);
  
  if (config.minSeeders > 0) {
    parsedStreams = parsedStreams.filter(stream => (stream.seeders || 0) >= config.minSeeders);
    console.log(`[addonService] ${parsedStreams.length} streams after minSeeders (${config.minSeeders}) filter for '${standardizedTitle}'.`);
  }
  
  if (config.filterLowQuality && parsedStreams.length > 0) {
    const hasHighQuality = parsedStreams.some(stream => getQualityRank(stream.parsedMeta) >= VideoQualityRank.HDTV_720P);
    if (hasHighQuality) {
      parsedStreams = parsedStreams.filter(stream => {
        const rank = getQualityRank(stream.parsedMeta);
        if (rank === VideoQualityRank.LOW_QUALITY || rank === VideoQualityRank.UNKNOWN) return false;
        
        const sourceUpper = stream.parsedMeta?.qualitySource?.toUpperCase();
        if (sourceUpper && LOW_QUALITY_TERMS.some(lqTerm => sourceUpper.includes(lqTerm))) return false;
        
        const resUpper = stream.parsedMeta?.resolution?.toUpperCase();
        if (resUpper && LOW_QUALITY_RESOLUTIONS.includes(resUpper) && rank < VideoQualityRank.DVD) return false; // Keep DVDs even if resolution is SD
        
        return true;
      });
      console.log(`[addonService] Filtered low quality (as high quality existed). ${parsedStreams.length} streams remaining for '${standardizedTitle}'.`);
    }
  }

  // Sort streams based on user-defined preferences in config
  parsedStreams.sort((a, b) => {
    for (const preference of config.sortPreference) {
        let comparison = 0;
        switch (preference) {
            case SortPreference.Seeders:
                comparison = (b.seeders || 0) - (a.seeders || 0);
                break;
            case SortPreference.PreferredLanguage:
                const langA = a.parsedMeta?.languages?.join(' ').toUpperCase() || '';
                const langB = b.parsedMeta?.languages?.join(' ').toUpperCase() || '';
                const prefLangUpper = config.preferredLanguage.toUpperCase();
                // Exact match for preferred language is best
                const aHasExactPrefLang = a.parsedMeta?.languages?.map(l=>l.toUpperCase()).includes(prefLangUpper) ?? false;
                const bHasExactPrefLang = b.parsedMeta?.languages?.map(l=>l.toUpperCase()).includes(prefLangUpper) ?? false;

                if (aHasExactPrefLang && !bHasExactPrefLang) comparison = -1;
                else if (!aHasExactPrefLang && bHasExactPrefLang) comparison = 1;
                else { // If both or neither have exact, check for partial / "MULTI"
                    const aHasPrefLang = langA.includes(prefLangUpper);
                    const bHasPrefLang = langB.includes(prefLangUpper);
                    if (aHasPrefLang && !bHasPrefLang) comparison = -1;
                    else if (!aHasPrefLang && bHasPrefLang) comparison = 1;
                }
                break;
            case SortPreference.Quality:
                const qualityRankA = getQualityRank(a.parsedMeta);
                const qualityRankB = getQualityRank(b.parsedMeta);
                comparison = qualityRankB - qualityRankA; // Higher rank is better
                if (comparison === 0 && a.parsedMeta && b.parsedMeta) { 
                    // If ranks are equal, use qualitySortOrder (array of strings, lower index is better)
                    const resAUpper = a.parsedMeta.resolution?.toUpperCase() || 'UNKNOWN';
                    const resBUpper = b.parsedMeta.resolution?.toUpperCase() || 'UNKNOWN';
                    
                    const resAIndex = config.qualitySortOrder.indexOf(resAUpper);
                    const resBIndex = config.qualitySortOrder.indexOf(resBUpper);
                    
                    if (resAIndex !== -1 && resBIndex !== -1) {
                         comparison = resAIndex - resBIndex; // Lower index in qualitySortOrder is better
                    } else if (resAIndex !== -1) comparison = -1; // A is in order, B is not (so A is better)
                    else if (resBIndex !== -1) comparison = 1;  // B is in order, A is not (so B is better)
                }
                break;
            case SortPreference.Size: // Larger files often imply better quality for the same resolution/source
                comparison = (b.size || 0) - (a.size || 0);
                break;
        }
        if (comparison !== 0) return comparison;
    }
    return 0; // If all sorting criteria are equal
  });

  const finalTrackers = getCachedTrackers();
  const formattedStreams = parsedStreams.map(stream =>
    formatStreamForResult(stream, finalTrackers, type, season, episode)
  );
  
  console.log(`[addonService] Returning ${formattedStreams.length} formatted streams for '${standardizedTitle}'.`);

  return {
    streams: formattedStreams,
    cacheMaxAge: 3600, // Stremio cache instruction: 1 hour
    staleRevalidate: 1800, // Stremio instruction: revalidate after 30 mins if cache expires
    staleError: 86400, // Serve stale for 1 day on error if fetch fails
  };
};
