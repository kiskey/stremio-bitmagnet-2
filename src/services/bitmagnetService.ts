import { BitmagnetTorrent, BitmagnetSearchResponse } from '../types'; // Adjusted path

// This is a HYPOTHETICAL GraphQL query. You MUST adapt it to your Bitmagnet instance's actual schema.
// Check your Bitmagnet GraphQL schema (e.g., via its GraphiQL interface if available).
// Common Bitmagnet schemas might use 'contents' instead of 'torrents', and different filter/sort arguments.
// This example includes contentType and year as potential filter variables.
const ACTIVE_BITMAGNET_GRAPHQL_QUERY = `
  query SearchContentActive(
    $query: String!, 
    $limit: Int, 
    $contentType: ContentType, # Make sure ContentType enum (MOVIE, SERIES, etc.) exists in your Bitmagnet schema
    $year: Int 
  ) {
    searchContent( # Or searchTorrents, contents, etc.
        query: $query, 
        limit: $limit, 
        filter: { 
            # Note: The exact filter structure depends heavily on your Bitmagnet's schema.
            # This is an example assuming 'contentType' and 'year' are direct filter fields.
            contentType: $contentType,
            # Some schemas might support 'year' directly on the content:
            # year: $year,
            # Others might require filtering on 'releaseDate' for year:
            # releaseDate: { gte: "${'$year'}-01-01T00:00:00Z", lte: "${'$year'}-12-31T23:59:59Z" }
            # The above date range example is complex to inject safely with variables;
            # direct year filter or post-fetch filtering is often simpler if available.
            # This query assumes your schema *might* use $year in some way, 
            # but it's commented out to prevent errors if not supported.
            # Modify according to your schema's capabilities for year filtering.
        }, 
        orderBy: {seeders: DESC} # Or { field: SEEDERS, direction: DESC } or similar
    ) {
      items {
        infoHash
        name # Bitmagnet often uses 'name' for the release title
        title # Some schemas might use 'title' instead of 'name'
        seeders
        leechers
        size # Size in bytes
        source # e.g. "BLURAY", "WEB" - if your schema provides this directly
        releaseDate # Can be used to extract year. e.g. "2023-10-26T00:00:00Z" or "2023-10-26"
        filesStatus # Useful to know if files are indexed, e.g., for series packs
        filesCount
        # For richer data directly from Bitmagnet (highly recommended if available in your schema):
        # videoResolution: videoResolution # replace with actual field name
        # videoCodec: videoCodec           # replace with actual field name
        # audioCodec: audioCodec           # replace with actual field name
        # tags: tags                       # if your schema has a tags field
        # files(limit: 10, orderBy: {path: ASC}) { # If you need file list for series packs
        #   items { path size fileIndex }
        # }
      }
      count # Or totalCount, depending on your schema
    }
  }
`;


export const queryBitmagnet = async (
  query: string,
  year: number | undefined,
  limit: number = 50,
  endpoint: string,
  contentType?: 'MOVIE' | 'SERIES' | string, // More specific type
  apiKey?: string
): Promise<BitmagnetTorrent[]> => {
  if (!endpoint || endpoint.trim() === '' || endpoint === 'https://api.example.com/graphql') {
    console.warn("[bitmagnetService] Bitmagnet GraphQL endpoint is not configured or is set to a placeholder. Returning empty results.");
    return [];
  }
  
  const variables: { 
    query: string; 
    limit: number; 
    contentType?: 'MOVIE' | 'SERIES' | string; 
    year?: number;
  } = {
    query,
    limit,
  };

  if (contentType) {
    variables.contentType = contentType;
  }
  // Only add year to variables if it's defined AND your GraphQL query is adapted to use a $year variable.
  if (year !== undefined) {
    variables.year = year; // This will be sent; its use depends on ACTIVE_BITMAGNET_GRAPHQL_QUERY.
  }
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`; // Or your specific auth scheme
  }

  console.debug(`[bitmagnetService] Sending GraphQL query to ${endpoint}. Query: ${query}, Year: ${year}, ContentType: ${contentType}, Limit: ${limit}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        query: ACTIVE_BITMAGNET_GRAPHQL_QUERY,
        variables: variables,
      }),
      signal: AbortSignal.timeout(20000) // 20 second timeout for the request
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[bitmagnetService] Bitmagnet API error: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 1000)}`);
      throw new Error(`Bitmagnet API request failed: ${response.status} ${response.statusText}.`);
    }

    const jsonResponse: BitmagnetSearchResponse = await response.json();

    if (jsonResponse.errors && jsonResponse.errors.length > 0) {
        const errorMessages = jsonResponse.errors.map((e: any) => e.message || 'Unknown GraphQL error').join('; ');
        console.error("[bitmagnetService] Bitmagnet GraphQL Errors:", errorMessages, JSON.stringify(jsonResponse.errors, null, 2));
        throw new Error(`GraphQL query failed: ${errorMessages}`);
    }
    
    const items = jsonResponse.data?.searchContent?.items || jsonResponse.data?.searchTorrents?.items || jsonResponse.items || [];
    
    return items.map(item => ({
        ...item,
        // Prefer 'name' for title, fallback to 'title' field if 'name' is not present or empty
        title: item.name || item.title || "Unknown Title", 
        // Ensure direct mappings match your schema if you uncomment these
        // videoResolution: item.videoResolution_from_schema, 
        // videoCodec: item.videoCodec_from_schema,
    }));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[bitmagnetService] Error querying Bitmagnet:', errorMessage, error);
    throw error; // Re-throw to be caught by the calling service (addonService)
  }
};


// Example Mock Data (useful for testing addonService logic without a live Bitmagnet endpoint)
export const MOCK_BITMAGNET_RESULTS_FOR_TESTING: BitmagnetTorrent[] = [
  { infoHash: 'mockhash1', title: 'Test Movie 2023 1080p BluRay x264 DTS-ENG', name: 'Test Movie 2023 1080p BluRay x264 DTS-ENG', seeders: 100, leechers: 10, size: 8000000000, source: 'BluRay', videoResolution: '1080p', releaseDate: "2023-01-01" },
  { infoHash: 'mockhash2', title: 'Test Movie 2023 720p WEB-DL x265 AAC-ENG', name: 'Test Movie 2023 720p WEB-DL x265 AAC-ENG', seeders: 50, leechers: 5, size: 2000000000, source: 'WEB-DL', videoResolution: '720p', releaseDate: "2023-01-02" },
  { infoHash: 'mockhash6', title: 'Test Series S01E01 1080p WEB-DL x264-ENG', name: 'Test Series S01E01 1080p WEB-DL x264-ENG', seeders: 200, leechers: 20, size: 500000000, source: 'WEB-DL', videoResolution: '1080p', releaseDate: "2023-03-01"},
  { infoHash: 'mockhash8', title: 'Test Series S01 Complete 1080p BluRay x265-ENG', name: 'Test Series S01 Complete 1080p BluRay x265-ENG', seeders: 90, leechers: 5, size: 20000000000, source: 'BluRay', videoResolution: '1080p', releaseDate: "2023-03-10"},
];
