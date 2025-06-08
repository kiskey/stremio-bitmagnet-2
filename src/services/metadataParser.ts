import { ParsedMetadata } from '../types'; // Adjusted path
import { REGEX_PATTERNS, COMMON_TRASH_TERMS, LANGUAGE_MAP } from '../constants'; // Adjusted path

function parseSize(sizeStr: string): number | undefined {
  // Use a non-global regex for matching a single size string
  const sizeRegexLocal = /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|TiB|GiB|MiB|KiB)/i;
  const localMatch = sizeStr.match(sizeRegexLocal);

  if (!localMatch || localMatch.length < 3) return undefined;

  const value = parseFloat(localMatch[1]);
  const unit = localMatch[2].toUpperCase();

  if (unit.startsWith('KB') || unit.startsWith('KIB')) return value * 1024;
  if (unit.startsWith('MB') || unit.startsWith('MIB')) return value * 1024 * 1024;
  if (unit.startsWith('GB') || unit.startsWith('GIB')) return value * 1024 * 1024 * 1024;
  if (unit.startsWith('TB') || unit.startsWith('TIB')) return value * 1024 * 1024 * 1024 * 1024;
  return undefined;
}

function cleanTitle(title: string, parsedMeta: Partial<ParsedMetadata>, originalSearchTitle?: string): string {
    let cleaned = title;

    // Terms to remove based on already parsed metadata
    const toRemoveExact = [
        parsedMeta.year?.toString(),
        parsedMeta.resolution,
        parsedMeta.qualitySource,
        parsedMeta.videoCodec,
        // audioCodec is complex; avoid removing generic parts like "5.1" unless very specific
        // Array.isArray(parsedMeta.audioCodec) ? parsedMeta.audioCodec.join(' ') : parsedMeta.audioCodec,
        parsedMeta.isHDR ? (parsedMeta.originalTitle.match(REGEX_PATTERNS.HDR)?.[0] || 'HDR') : undefined, // Remove matched HDR string
        parsedMeta.is3D ? '3D' : undefined,
        parsedMeta.episodeInfo, // S01E01
        parsedMeta.releaseGroup,
        // Remove parsed languages only if they are short codes and not part of a common word
        ...(parsedMeta.languages?.filter(lang => lang.length <= 3 || LANGUAGE_MAP[lang.toUpperCase()]) || [])
    ].filter(Boolean) as string[];

    for (const term of toRemoveExact) {
        // Escape special characters for regex and ensure it matches whole words/tokens
        const escapedTerm = term.replace(/([.+*?^$[\]\\(){}|-])/g, "\\$1");
        // Regex to match term if surrounded by common separators, string boundaries, or inside brackets.
        const termRegex = new RegExp(`(?:^|[.\\s_\\-\\[])${escapedTerm}(?:[.\\s_\\-\\]]|$)`, 'ig');
        cleaned = cleaned.replace(termRegex, ' ');
    }
    
    // Remove common trash terms using pre-compiled regexes from constants
    for (const trashRegex of COMMON_TRASH_TERMS) {
        trashRegex.lastIndex = 0; // Reset global regex state
        cleaned = cleaned.replace(trashRegex, ' ');
    }

    // Final cleanup: replace multiple dots/spaces/underscores with a single space, then trim.
    cleaned = cleaned.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Fallback if cleaning results in a very short or year-like title
    if ((cleaned.length < 5 && title.length > 10) || /^\d{4}$/.test(cleaned)) {
        let fallbackCleaned = originalSearchTitle || title; // Start with original search or full title
        // Simpler cleaning for fallback: remove only year and release group from the original title/search title
        if(parsedMeta.year) fallbackCleaned = fallbackCleaned.replace(new RegExp(`[.\\s_-]?${parsedMeta.year}[.\\s_-]?`, 'ig'), ' ');
        if(parsedMeta.releaseGroup) fallbackCleaned = fallbackCleaned.replace(new RegExp(`[.\\s_-]?${parsedMeta.releaseGroup}[.\\s_-]?`, 'ig'), ' ');
        fallbackCleaned = fallbackCleaned.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
        // If fallback is still bad, return original title, but without release group as a last resort
        if (!fallbackCleaned && parsedMeta.releaseGroup) return title.replace(new RegExp(`[.\\s_-]?${parsedMeta.releaseGroup}[.\\s_-]?`, 'ig'), '').trim();
        return fallbackCleaned || title.trim(); 
    }

    return cleaned;
}


export const parseTorrentTitle = (
    title: string, 
    originalSearchTitle?: string, // The title used for searching Bitmagnet (often standardized)
    torrentYearFromBitmagnet?: number // Year if known directly from Bitmagnet data (e.g. releaseDate)
): ParsedMetadata => {
  const metadata: ParsedMetadata = { originalTitle: title };
  let workTitle = title; // Title to operate on for parsing, may be modified

  // Helper to extract first match and optionally transform it
  const extractFirstMatch = (regex: RegExp, field: keyof ParsedMetadata, transform?: (val: string) => any) => {
    regex.lastIndex = 0; 
    const match = regex.exec(workTitle);
    if (match) {
      const valueToSet = match[1] || match[0]; // Prefer captured group
      const processedValue = transform ? transform(valueToSet) : valueToSet.toUpperCase();
      if (!(metadata as any)[field]) { // Set only if not already set (e.g. by direct Bitmagnet data)
        (metadata as any)[field] = processedValue;
      }
      // Tentatively remove matched part to avoid re-parsing. This is tricky.
      // workTitle = workTitle.replace(match[0], ' '); 
    }
  };
  
  // Helper to extract all matches, optionally unique
  const extractAllMatches = (regex: RegExp, field: keyof ParsedMetadata, unique: boolean = true, transform?: (val: string) => any) => {
    let values: string[] = [];
    let m;
    regex.lastIndex = 0;
    while ((m = regex.exec(workTitle)) !== null) {
        if (m.index === regex.lastIndex) regex.lastIndex++; // Avoid infinite loops with zero-width matches
        const val = m[1] || m[0]; // Prefer captured group
        values.push(transform ? transform(val) : val.toUpperCase());
    }
    if (values.length > 0) {
      const finalValues = unique ? Array.from(new Set(values)) : values;
      // Set only if not already set or current value is empty array
      if (!(metadata as any)[field] || ((metadata as any)[field]?.length === 0) ) {
         (metadata as any)[field] = finalValues.length === 1 && unique ? finalValues[0] : finalValues;
      }
    }
  };

  // Order of parsing can be important. Specific items first.

  // 1. Year (prioritize Bitmagnet-provided year)
  if (torrentYearFromBitmagnet) {
      metadata.year = torrentYearFromBitmagnet;
  } else {
      extractFirstMatch(REGEX_PATTERNS.YEAR, 'year', (val) => parseInt(val, 10));
  }

  // 2. Season/Episode Info
  extractFirstMatch(REGEX_PATTERNS.SEASON_EPISODE, 'episodeInfo', (val) => val.toUpperCase());

  // 3. Resolution
  extractFirstMatch(REGEX_PATTERNS.RESOLUTION, 'resolution');
  
  // 4. Quality Source
  extractFirstMatch(REGEX_PATTERNS.QUALITY_SOURCE, 'qualitySource');
  
  // 5. Video Codec
  extractFirstMatch(REGEX_PATTERNS.VIDEO_CODEC, 'videoCodec');
  
  // 6. Audio Codecs (can be multiple)
  extractAllMatches(REGEX_PATTERNS.AUDIO_CODEC, 'audioCodec', true);
  if (Array.isArray(metadata.audioCodec)) { // Consolidate into a string if it's an array
    metadata.audioCodec = metadata.audioCodec.join(' ');
  }

  // 7. HDR and 3D
  REGEX_PATTERNS.HDR.lastIndex = 0; // Reset global regex
  if (REGEX_PATTERNS.HDR.test(workTitle)) metadata.isHDR = true;
  
  REGEX_PATTERNS.THREE_D.lastIndex = 0;
  if (REGEX_PATTERNS.THREE_D.test(workTitle)) metadata.is3D = true;

  // 8. Languages
  let foundLanguages: string[] = [];
  let langMatch;
  REGEX_PATTERNS.LANGUAGES.lastIndex = 0;
  while((langMatch = REGEX_PATTERNS.LANGUAGES.exec(workTitle)) !== null) {
    const langKeyPart = langMatch[1] || langMatch[0]; 
    const langKey = langKeyPart.toUpperCase().replace(/[\s.]AUDIO/, '').replace(/SUB$/, '').trim(); // Clean "DUAL AUDIO" to "DUAL", "ENGSUB" to "ENG"
    
    if (LANGUAGE_MAP[langKey]) {
        foundLanguages.push(LANGUAGE_MAP[langKey]);
    } else if (langKey.includes('+') || langKey.includes(',')) { // Handle "ENG+TAM", "ENG,TAM"
        const subLangs = langKey.split(/[+,]/).map(sl => sl.trim());
        subLangs.forEach(sl => {
            if(LANGUAGE_MAP[sl]) foundLanguages.push(LANGUAGE_MAP[sl]);
            else if (sl.length >= 2 && sl.length <= 7) foundLanguages.push(sl); // Store short unknown codes
        });
    } else if (langKey.length >= 2 && langKey.length <= 7) { // Store other short codes if not generic like "AUDIO"
        foundLanguages.push(langKey);
    }
  }
  if (foundLanguages.length > 0) {
    // Prioritize known mapped languages, then unique codes.
    metadata.languages = Array.from(new Set(foundLanguages.filter(l => l.length > 1 && !l.includes("AUDIO"))));
  }


  // 9. Release Group (often at the end)
  extractFirstMatch(REGEX_PATTERNS.RELEASE_GROUP, 'releaseGroup', (val) => val.startsWith('-') ? val.substring(1) : val);

  // 10. Size (if present in title, less common than from Bitmagnet direct data)
  REGEX_PATTERNS.SIZE.lastIndex = 0; 
  const sizeMatchInTitle = REGEX_PATTERNS.SIZE.exec(title); // Use original title for size match
  if (sizeMatchInTitle && sizeMatchInTitle[0]) {
    metadata.rawSize = sizeMatchInTitle[0];
    if(!metadata.calculatedSize) metadata.calculatedSize = parseSize(sizeMatchInTitle[0]); // Only if not set by Bitmagnet
  }
  
  // 11. Cleaned Title (after all other metadata is extracted)
  metadata.cleanedTitle = cleanTitle(title, metadata, originalSearchTitle);

  // Final check for year if still missing and originalSearchTitle has one
  if (!metadata.year && originalSearchTitle) {
    REGEX_PATTERNS.YEAR.lastIndex = 0;
    const yearMatchInOriginalSearch = REGEX_PATTERNS.YEAR.exec(originalSearchTitle);
    if (yearMatchInOriginalSearch && yearMatchInOriginalSearch[0]) {
        metadata.year = parseInt(yearMatchInOriginalSearch[0], 10);
    }
  }

  return metadata;
};
