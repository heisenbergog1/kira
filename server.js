import http from 'http';
import https from 'https';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.vtt': 'text/vtt; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t'
};

function fetchUrl(targetUrl, headers = {}, postData = null, isBinary = false, range = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': isBinary ? '*/*' : '*/*',
      'Referer': 'https://megavid.buzz/',
      'Origin': 'https://megavid.buzz',
      ...headers
    };

    if (range) {
      reqHeaders['Range'] = range;
    }

    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = client.request(targetUrl, {
      method: postData ? 'POST' : 'GET',
      headers: reqHeaders
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, headers, postData, isBinary, range));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: isBinary ? buffer : buffer.toString('utf-8')
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

function resolveDirectM3u8(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return sourceUrl;
  // Only rename master.m3u8 for megavid.buzz — HiAnime uses master.m3u8 natively
  if (sourceUrl.includes('megavid.buzz') && sourceUrl.includes('master.m3u8')) {
    return sourceUrl.replace('master.m3u8', 'index-f1-v1-a1.m3u8');
  }
  return sourceUrl;
}

function transformKitsuItem(item, mappingsDict, explicitMalId) {
  if (!item) return null;
  const attr = item.attributes || {};
  const kitsuId = item.id;

  let malId = explicitMalId;
  if (!malId && item.relationships && item.relationships.mappings && item.relationships.mappings.data) {
    for (const m of item.relationships.mappings.data) {
      if (mappingsDict[m.id]) {
        malId = mappingsDict[m.id];
        break;
      }
    }
  }

  const numericMalId = parseInt(malId || kitsuId, 10) || 0;
  const titles = attr.titles || {};
  const poster = attr.posterImage || {};
  const cover = attr.coverImage || {};

  const posterUrl = poster.large || poster.original || poster.medium || '';
  const coverUrl = cover.large || cover.original || posterUrl;

  let year = null;
  if (attr.startDate && attr.startDate.length >= 4) {
    const y = parseInt(attr.startDate.slice(0, 4), 10);
    if (!isNaN(y)) year = y;
  }

  let avgScore = null;
  if (attr.averageRating) {
    const s = Math.round(parseFloat(attr.averageRating));
    if (!isNaN(s)) avgScore = s;
  }

  return {
    id: parseInt(kitsuId, 10) || numericMalId,
    idMal: numericMalId,
    title: {
      romaji: attr.canonicalTitle || titles.en_jp || '',
      english: titles.en || titles.en_us || attr.canonicalTitle || '',
      native: titles.ja_jp || ''
    },
    description: attr.synopsis || '',
    episodes: attr.episodeCount || 12,
    nextAiringEpisode: null,
    duration: attr.episodeLength || 24,
    seasonYear: year,
    averageScore: avgScore,
    genres: [],
    bannerImage: coverUrl,
    coverImage: {
      extraLarge: poster.original || posterUrl,
      large: poster.large || posterUrl,
      medium: poster.medium || posterUrl
    },
    streamingEpisodes: [],
    characters: { edges: [] }
  };
}

async function fetchKitsuFallback(id, q, type, page = 1) {
  try {
    if (id) {
      const params = new URLSearchParams({
        'filter[external_site]': 'myanimelist/anime',
        'filter[external_id]': String(id),
        'include': 'item'
      });
      const url = `https://kitsu.io/api/edge/mappings?${params.toString()}`;
      const response = await fetchUrl(url, { 'Accept': 'application/vnd.api+json' });
      if (response.status === 200) {
        const data = JSON.parse(response.body);
        if (data.included && data.included.length > 0) {
          const anime = data.included[0];
          return {
            data: {
              Media: transformKitsuItem(anime, {}, parseInt(id, 10))
            }
          };
        }
      }
    }

    const queryParams = new URLSearchParams({
      'page[limit]': '20',
      'page[offset]': String((page - 1) * 20),
      'include': 'mappings'
    });

    let endpoint = 'https://kitsu.io/api/edge/anime';
    if (q) {
      queryParams.set('filter[text]', q);
    } else {
      if (type === 'top_airing') {
        queryParams.set('filter[status]', 'current');
        queryParams.set('sort', '-userCount');
      } else if (type === 'popular') {
        queryParams.set('sort', '-userCount');
      } else if (type === 'movies') {
        queryParams.set('filter[subtype]', 'movie');
        queryParams.set('sort', '-userCount');
      } else {
        queryParams.set('sort', '-userCount');
      }
    }

    const kitsuUrl = `${endpoint}?${queryParams.toString()}`;
    const response = await fetchUrl(kitsuUrl, { 'Accept': 'application/vnd.api+json' });
    if (response.status === 200) {
      const data = JSON.parse(response.body);
      const mappingsDict = {};
      if (Array.isArray(data.included)) {
        for (const inc of data.included) {
          if (inc.type === 'mappings' && inc.attributes && inc.attributes.externalSite === 'myanimelist/anime') {
            mappingsDict[inc.id] = inc.attributes.externalId;
          }
        }
      }

      const mediaList = (data.data || [])
        .map(item => transformKitsuItem(item, mappingsDict))
        .filter(Boolean);

      return {
        data: {
          Page: {
            media: mediaList
          }
        }
      };
    }
  } catch (err) {
    console.error('Kitsu fallback error:', err);
  }

  return { data: { Page: { media: [] } } };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Stream Proxy (/api/stream?url=...)
  if (pathname === '/api/stream') {
    const targetStreamUrl = parsedUrl.query.url;
    if (!targetStreamUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing stream url parameter');
      return;
    }

    try {
      const isM3u8 = targetStreamUrl.includes('.m3u8');
      let pRef = 'https://megavid.buzz/';
      let pOrig = 'https://megavid.buzz';
      if (targetStreamUrl.includes('aniwatchtv.uk') || targetStreamUrl.includes('zokoanime.video')) {
        pRef = 'https://zokoanime.video/';
        pOrig = 'https://zokoanime.video';
      }
      const pHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': pRef,
        'Origin': pOrig
      };
      const response = await fetchUrl(targetStreamUrl, pHeaders, null, !isM3u8, req.headers.range);
      
      const upstreamHeaders = response.headers;
      const resHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Cache-Control': 'public, max-age=3600'
      };

      if (upstreamHeaders['content-type']) resHeaders['Content-Type'] = upstreamHeaders['content-type'];
      if (upstreamHeaders['content-range']) resHeaders['Content-Range'] = upstreamHeaders['content-range'];
      if (upstreamHeaders['accept-ranges']) resHeaders['Accept-Ranges'] = upstreamHeaders['accept-ranges'];

      if (isM3u8) {
        resHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
        let playlistContent = response.body;
        const baseUrl = targetStreamUrl.substring(0, targetStreamUrl.lastIndexOf('/') + 1);
        const hostHeader = req.headers.host || `localhost:${PORT}`;
        const prefix = `http://${hostHeader}`;

        if (playlistContent.includes('#EXT-X-STREAM-INF')) {
          // Master playlist with multiple quality ladders (e.g. HiAnime 360p, 720p, 1080p)
          // Sort descending by bandwidth so Apple AVPlayer / new tab starts immediately in full 1080p
          const lines = playlistContent.split('\n');
          const headerLines = [];
          const variants = [];
          let currentInf = null;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith('#EXT-X-STREAM-INF')) {
              currentInf = line;
            } else if (currentInf) {
              let absoluteSegmentUrl = line;
              if (!line.startsWith('http://') && !line.startsWith('https://')) {
                absoluteSegmentUrl = baseUrl + line;
              }
              const bwMatch = currentInf.match(/BANDWIDTH=(\d+)/);
              const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
              variants.push({
                inf: currentInf,
                url: `${prefix}/api/stream?url=${encodeURIComponent(absoluteSegmentUrl)}`,
                bw: bw
              });
              currentInf = null;
            } else {
              headerLines.push(line);
            }
          }

          // Sort 1080p > 720p > 360p
          variants.sort((a, b) => b.bw - a.bw);

          const outLines = [...headerLines];
          for (const v of variants) {
            outLines.push(v.inf);
            outLines.push(v.url);
          }

          const modifiedBody = outLines.join('\n');
          resHeaders['Content-Length'] = Buffer.byteLength(modifiedBody);
          res.writeHead(response.status, resHeaders);
          res.end(modifiedBody);
        } else {
          // Media segment playlist (.ts list)
          const lines = playlistContent.split('\n');
          const rewrittenLines = lines.map(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return line;
            let absoluteSegmentUrl = line;
            if (!line.startsWith('http://') && !line.startsWith('https://')) {
              absoluteSegmentUrl = baseUrl + line;
            }
            return `${prefix}/api/stream?url=${encodeURIComponent(absoluteSegmentUrl)}`;
          });

          const modifiedBody = rewrittenLines.join('\n');
          resHeaders['Content-Length'] = Buffer.byteLength(modifiedBody);
          res.writeHead(response.status, resHeaders);
          res.end(modifiedBody);
        }
      } else {
        res.writeHead(response.status, resHeaders);
        res.end(response.body);
      }
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Stream Proxy Error: ' + err.message);
    }
    return;
  }

  // Image Proxy
  if (pathname === '/api/img') {
    const imgUrl = parsedUrl.query.url;
    if (!imgUrl) {
      res.writeHead(400);
      res.end('Missing url');
      return;
    }
    try {
      const response = await fetchUrl(imgUrl, {}, null, true);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(response.body);
    } catch (err) {
      res.writeHead(502);
      res.end('Image error');
    }
    return;
  }

  // Stream Source API
  if (pathname === '/api/source') {
    const malId = parsedUrl.query.id;
    const ep = parsedUrl.query.ep || '1';
    const type = (parsedUrl.query.type || 'sub').toLowerCase();

    if (!malId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing MAL ID (id)' }));
      return;
    }

    const apiUrl = `https://megavid.buzz/mal/${malId}/${ep}/${type}/source`;
    const referer = `https://megavid.buzz/mal/${malId}/${ep}/${type}`;

    try {
      const response = await fetchUrl(apiUrl, { 'Referer': referer });
      if (response.status !== 200) {
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          code: response.status,
          message: `Stream not available for MAL ID ${malId} Ep ${ep} (${type}).`
        }));
        return;
      }

      let data;
      try {
        data = JSON.parse(response.body);
      } catch (e) {
        data = { status: 'error', raw: response.body };
      }

      if (data && data.source) {
        const directUrl = resolveDirectM3u8(data.source);
        const proxiedStreamUrl = `/api/stream?url=${encodeURIComponent(directUrl)}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          malId,
          episode: ep,
          type,
          streamUrl: directUrl,
          proxiedUrl: proxiedStreamUrl,
          rawSource: data.source,
          tracks: data.tracks || [],
          mega: data.mega || false
        }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Catalog API
  if (pathname === '/api/catalog') {
    const queryType = parsedUrl.query.type || 'trending';
    const searchQuery = parsedUrl.query.q || '';
    const malId = parsedUrl.query.id || '';
    const page = parsedUrl.query.page || 1;

    let gqlQuery = '';
    let variables = {};

    if (malId) {
      gqlQuery = `
        query ($idMal: Int) {
          Media(idMal: $idMal, type: ANIME) {
            id
            idMal
            title { romaji english native }
            description(asHtml: false)
            episodes
            nextAiringEpisode { episode timeUntilAiring }
            duration
            seasonYear
            averageScore
            genres
            bannerImage
            coverImage { extraLarge large medium }
            streamingEpisodes { title thumbnail url site }
            characters(sort: ROLE, perPage: 12) {
              edges {
                role
                node { id name { full } image { large } }
                voiceActors(language: JAPANESE) { name { full } image { large } }
              }
            }
          }
        }
      `;
      variables = { idMal: parseInt(malId, 10) };
    } else if (searchQuery) {
      gqlQuery = `
        query ($search: String, $page: Int) {
          Page(page: $page, perPage: 24) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              id
              idMal
              title { romaji english }
              description(asHtml: false)
              episodes
              nextAiringEpisode { episode }
              seasonYear
              averageScore
              genres
              coverImage { large medium }
              bannerImage
            }
          }
        }
      `;
      variables = { search: searchQuery, page: parseInt(page, 10) };
    } else {
      let sort = 'TRENDING_DESC';
      let format = undefined;
      if (queryType === 'top_airing') sort = 'POPULARITY_DESC';
      if (queryType === 'popular') sort = 'FAVOURITES_DESC';
      if (queryType === 'movies') { sort = 'SCORE_DESC'; format = 'MOVIE'; }

      gqlQuery = `
        query ($sort: [MediaSort], $format: MediaFormat) {
          Page(page: 1, perPage: 24) {
            media(type: ANIME, sort: $sort, format: $format) {
              id
              idMal
              title { romaji english }
              description(asHtml: false)
              episodes
              nextAiringEpisode { episode }
              seasonYear
              averageScore
              genres
              coverImage { extraLarge large medium }
              bannerImage
            }
          }
        }
      `;
      variables = { sort: [sort], format };
    }

    const cacheKey = JSON.stringify({ gqlQuery, variables });
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(cached.data);
      return;
    }

    try {
      const response = await fetchUrl(
        'https://graphql.anilist.co',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ query: gqlQuery, variables })
      );

      if (response.status === 200) {
        try {
          const parsedData = JSON.parse(response.body);
          if (parsedData && parsedData.data && (parsedData.data.Page || parsedData.data.Media)) {
            cache.set(cacheKey, { time: Date.now(), data: response.body });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(response.body);
            return;
          }
        } catch (e) {}
      }

      // If AniList returns non-200 or is down, fall back to Kitsu
      const fallbackData = await fetchKitsuFallback(malId, searchQuery, queryType, parseInt(page, 10) || 1);
      const fallbackJson = JSON.stringify(fallbackData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fallbackJson);
    } catch (err) {
      const fallbackData = await fetchKitsuFallback(malId, searchQuery, queryType, parseInt(page, 10) || 1);
      const fallbackJson = JSON.stringify(fallbackData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fallbackJson);
    }
    return;
  }

  // Static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`CineStream Server running at http://localhost:${PORT}`);
});
