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
  if (sourceUrl.includes('master.m3u8')) {
    return sourceUrl.replace('master.m3u8', 'index-f1-v1-a1.m3u8');
  }
  return sourceUrl;
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
      const response = await fetchUrl(targetStreamUrl, {}, null, !isM3u8, req.headers.range);
      
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

        // Rewrite relative URLs inside M3U8 so segments route through proxy
        const baseUrl = targetStreamUrl.substring(0, targetStreamUrl.lastIndexOf('/') + 1);
        const lines = playlistContent.split('\n');
        const rewrittenLines = lines.map(line => {
          line = line.trim();
          if (!line || line.startsWith('#')) return line;
          let absoluteSegmentUrl = line;
          if (!line.startsWith('http://') && !line.startsWith('https://')) {
            absoluteSegmentUrl = baseUrl + line;
          }
          return `/api/stream?url=${encodeURIComponent(absoluteSegmentUrl)}`;
        });

        const modifiedBody = rewrittenLines.join('\n');
        resHeaders['Content-Length'] = Buffer.byteLength(modifiedBody);
        res.writeHead(response.status, resHeaders);
        res.end(modifiedBody);
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
        cache.set(cacheKey, { time: Date.now(), data: response.body });
      }

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
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
