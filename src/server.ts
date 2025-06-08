
import express from 'express';
// Use 'import type' for type-only imports from Express
import type { Request, Response, NextFunction } from 'express';
import { processStreamRequest } from './services/addonService';
import { AddonConfig, SortPreference, StremioItemType, StremioRequestType } from './types';
import { APP_VERSION } from './constants'; // APP_VERSION is from constants

const app = express();

// Environment variables with defaults
const PORT = process.env.PORT || 7000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const ADDON_SERVER_ID = 'com.yourname.stremio.bitmagnet2.server'; // Customize this
const ADDON_SERVER_NAME = 'Bitmagnet 2'; // Customize this

// --- Addon Configuration ---
// Load configuration from environment variables or defaults
const addonConfig: AddonConfig = {
  bitmagnetPublicGraphQLEndpoint: process.env.BITMAGNET_GRAPHQL_ENDPOINT || '',
  preferredLanguage: process.env.PREFERRED_LANGUAGE || 'ENG',
  qualitySortOrder: (process.env.QUALITY_SORT_ORDER || '2160P,1080P,720P,480P,SD,SCR,CAM,UNKNOWN').split(',').map(q => q.trim().toUpperCase()),
  filterLowQuality: (process.env.FILTER_LOW_QUALITY || 'true').toLowerCase() === 'true',
  minSeeders: parseInt(process.env.MIN_SEEDERS || '0', 10),
  sortPreference: (process.env.SORT_PREFERENCES || 'seeders,preferredLanguage,quality').split(',').map(s => s.trim() as SortPreference),
};

if (!addonConfig.bitmagnetPublicGraphQLEndpoint && process.env.NODE_ENV !== 'test') { // Added NODE_ENV check
  console.error("CRITICAL: BITMAGNET_GRAPHQL_ENDPOINT environment variable is not set. Addon will not function.");
}

// Simple logger based on LOG_LEVEL
const logger = {
    log: (level: string, message: string, ...args: any[]) => {
        const levels: { [key: string]: number } = { error: 0, warn: 1, info: 2, debug: 3 };
        if (levels[level] <= (levels[LOG_LEVEL] ?? levels.info)) {
            const timestamp = new Date().toISOString();
            if (args.length > 0 && typeof args[args.length -1] === 'object' && args[args.length -1] instanceof Error) {
                const err = args.pop();
                console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args, `${err.name}: ${err.message}`, err.stack ? `\nStack: ${err.stack}`: '');
            } else {
                console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
            }
        }
    },
    info: (message: string, ...args: any[]) => logger.log('info', message, ...args),
    warn: (message: string, ...args: any[]) => logger.log('warn', message, ...args),
    error: (message: string, ...args: any[]) => logger.log('error', message, ...args),
    debug: (message: string, ...args: any[]) => logger.log('debug', message, ...args),
};


// Middleware
app.use(express.json()); 

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// --- Manifest Route ---
app.get('/manifest.json', (req: Request, res: Response) => {
  logger.info(`Manifest requested from ${req.ip}`);
  const manifest = {
    id: ADDON_SERVER_ID,
    version: APP_VERSION,
    name: ADDON_SERVER_NAME,
    description: "Provides P2P streams from Bitmagnet. Queries via GraphQL, parses metadata, and sorts results.",
    resources: ['stream' as const], // Explicitly type as 'stream' literal
    types: ['movie' as StremioItemType, 'series' as StremioItemType],
    idPrefixes: ['tt'], 
    catalogs: [], 
    behaviorHints: {
      configurable: true, // Set to true if you provide a /configure endpoint Stremio can use
      configurationRequired: !addonConfig.bitmagnetPublicGraphQLEndpoint, 
    }
  };
  res.json(manifest);
});

// --- Configuration Route (Example) ---
// This endpoint would be used by Stremio if configurable is true and user clicks "Configure"
app.get('/configure', (req: Request, res: Response) => {
    // This should ideally serve an HTML page where user can input configuration
    // For a server-side addon, configuration is typically done via environment variables.
    // This is a placeholder. You might redirect to a docs page or show current config.
    res.setHeader('Content-Type', 'text/html');
    res.send(`
        <h1>${ADDON_SERVER_NAME} Configuration</h1>
        <p>This addon is configured using environment variables on the server.</p>
        <h2>Current Effective Configuration (sensitive values omitted):</h2>
        <ul>
            <li>Bitmagnet Endpoint Set: ${addonConfig.bitmagnetPublicGraphQLEndpoint ? 'Yes' : '<b>No - CRITICAL!</b>'}</li>
            <li>Preferred Language: ${addonConfig.preferredLanguage}</li>
            <li>Filter Low Quality: ${addonConfig.filterLowQuality}</li>
            <li>Min Seeders: ${addonConfig.minSeeders}</li>
            <li>Sort Preferences: ${addonConfig.sortPreference.join(', ')}</li>
            <li>Quality Sort Order: ${addonConfig.qualitySortOrder.join(', ')}</li>
        </ul>
        <p>Please refer to the addon documentation for details on setting these environment variables.</p>
    `);
});


// --- Stream Route ---
app.get('/stream/:type/:idWithOpts.json', async (req: Request, res: Response) => {
  const { type, idWithOpts } = req.params;
  logger.info(`Stream request received: type=${type}, idWithOpts=${idWithOpts} from ${req.ip}`);

  let imdbId = idWithOpts;
  let season: number | undefined;
  let episode: number | undefined;

  if (idWithOpts.includes(':')) {
    const parts = idWithOpts.split(':');
    imdbId = parts[0];
    if (parts[1]) season = parseInt(parts[1], 10);
    if (parts[2]) episode = parseInt(parts[2], 10);
  }

  if (!type || !imdbId.startsWith('tt') || 
      (type === 'series' && (season === undefined || episode === undefined || isNaN(season) || isNaN(episode)))) {
    logger.warn('Invalid stream request parameters:', { type, imdbId, season, episode });
    return res.status(400).json({ error: 'Invalid request parameters. Ensure type, IMDB ID (ttxxxx), season, and episode are correct.' });
  }
  
  if (!addonConfig.bitmagnetPublicGraphQLEndpoint && process.env.NODE_ENV !== 'test') {
    logger.error('Bitmagnet GraphQL endpoint is not configured. Cannot process stream request.');
    return res.status(500).json({ streams: [], error: 'Addon not configured. Missing Bitmagnet GraphQL endpoint.' });
  }

  const stremioRequest: StremioRequestType = {
    type: type as StremioItemType,
    id: imdbId,
    name: `Media for ID ${imdbId}`, // Placeholder: addonService should fetch real title/year if needed
    season: season,
    episode: episode,
  };

  try {
    const bitmagnetApiKey = process.env.BITMAGNET_API_KEY;
    logger.debug(`Processing stream request for ID ${imdbId}, S${season}E${episode} with config:`, addonConfig);
    const result = await processStreamRequest(stremioRequest, addonConfig, bitmagnetApiKey);
    
    if (result.streams.length === 0) {
        logger.info(`No streams found for ${imdbId}${season !== undefined ? ` S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}` : ''}`);
    } else {
        logger.info(`Found ${result.streams.length} streams for ${imdbId}${season !== undefined ? ` S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}` : ''}`);
    }
    res.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error processing stream request for ${imdbId}:`, err);
    res.status(500).json({ streams: [], error: 'Failed to fetch streams.', details: err.message });
  }
});

// Basic root route
app.get('/', (req: Request, res: Response) => {
  res.send(`Stremio Bitmagnet 2 Addon Server is running. Manifest available at /manifest.json. Current time: ${new Date().toISOString()}`);
});

// Global error handler (optional, for unhandled errors)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: 'An unexpected internal server error occurred.', details: err.message });
});


// Start server
if (process.env.NODE_ENV !== 'test') { // Do not start server during tests
    app.listen(PORT, () => {
      logger.info(`Stremio Bitmagnet 2 Addon Server listening on http://localhost:${PORT}`);
      logger.info(`Manifest URL: http://localhost:${PORT}/manifest.json`);
      logger.info(`Current Configuration Loaded:`);
      logger.info(`  BITMAGNET_GRAPHQL_ENDPOINT: ${addonConfig.bitmagnetPublicGraphQLEndpoint || 'NOT SET - CRITICAL!'}`);
      logger.info(`  PREFERRED_LANGUAGE: ${addonConfig.preferredLanguage}`);
      logger.info(`  FILTER_LOW_QUALITY: ${addonConfig.filterLowQuality}`);
      logger.info(`  MIN_SEEDERS: ${addonConfig.minSeeders}`);
      logger.info(`  SORT_PREFERENCES: ${addonConfig.sortPreference.join(', ')}`);
      logger.info(`  QUALITY_SORT_ORDER: ${addonConfig.qualitySortOrder.join(', ')}`);
      if (!addonConfig.bitmagnetPublicGraphQLEndpoint) {
        logger.warn("⚠️ CRITICAL WARNING: BITMAGNET_GRAPHQL_ENDPOINT is not set. The addon will not be able to query Bitmagnet.");
      }
    });
}

export default app; // Export for testing purposes
