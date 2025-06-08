// Basic standardization for titles and years.

export const standardizeTitle = (title: string): string => {
  if (!title) return '';
  
  let standardized = title;

  // Normalize case for consistent processing (e.g., to handle "And" vs "and")
  // standardized = standardized.toLowerCase(); // Optional: do this early if it helps later regexes

  // Replace various forms of "and" / "&" with a standard "and"
  standardized = standardized.replace(/\s+&\s+/g, ' and ');
  standardized = standardized.replace(/\s+and\s+/gi, ' and '); // Case insensitive "and"

  // Remove common punctuation used as separators, then normalize spaces
  // Keep apostrophes ' for now. Be careful with hyphens if they are part of words.
  standardized = standardized
    .replace(/[._()[\]]/g, ' ')      // Replace dots, underscores, brackets with space
    .replace(/-/g, ' ')              // Replace hyphens with space (can be aggressive)
    .replace(/\s+/g, ' ')          // Collapse multiple spaces to one
    .trim();

  // Remove potential year or SxxExx patterns if they are at the very end and likely not part of title
  // This is a simple heuristic.
  standardized = standardized.replace(/\s+(?:19[7-9]\d|20[0-2]\d)$/, ''); // Remove trailing year like " 2023" (adjust range as needed)
  standardized = standardized.replace(/\s+[Ss]\d{1,2}[Ee]\d{1,3}(?:-[Ee]?\d{1,3})?$/, ''); // Remove trailing SxxExx or SxxExx-Exx
  standardized = standardized.replace(/\s+Season\s+\d{1,2}$/i, ''); // Remove trailing Season XX
  
  // Remove common edition/version tags that might interfere with basic title matching
  // This can be aggressive. Consider context.
  const commonTags = [
    'EXTENDED', 'UNCUT', 'DIRECTORS CUT', 'REMASTERED', 'SPECIAL EDITION', 
    'THEATRICAL', 'UNRATED', 'PROPER', 'REPACK', 'LIMITED', 'COMPLETE', 'ULTIMATE',
    'FINAL CUT', 'ANNIVERSARY EDITION', 'COLLECTORS EDITION'
  ];
  commonTags.forEach(tag => {
    // Match whole word, case insensitive
    standardized = standardized.replace(new RegExp(`\\s+\\b${tag}\\b`, 'ig'), '');
  });
  
  return standardized.trim();
};

export const standardizeYear = (yearInput?: string | number): number | undefined => {
  if (yearInput === undefined || yearInput === null) return undefined;
  
  const yearString = String(yearInput).trim();
  
  // Regex to find a 4-digit number that looks like a year (e.g., 19xx or 20xx)
  // (?<!\d) and (?!\d) are negative lookbehind and lookahead to ensure it's not part of a larger number.
  const match = yearString.match(/(?<!\d)(?:1[89]\d{2}|20\d{2})(?!\d)/); 
  
  if (match && match[0]) {
    const year = parseInt(match[0], 10);
    // Basic sanity check for a reasonable year range (e.g., 1880 up to current year + 5 for future releases)
    if (year >= 1880 && year <= new Date().getFullYear() + 5) { 
      return year;
    }
  }
  return undefined;
};
