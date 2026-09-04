export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url: targetStreamUrl } = req.query;
  if (!targetStreamUrl) {
    return res.status(400).send('Missing url');
  }

  try {
    const isM3u8 = targetStreamUrl.includes('.m3u8');
    
    // Dynamic referrer injection based on host domain
    let referer = 'https://megavid.buzz/';
    let origin = 'https://megavid.buzz';

    if (targetStreamUrl.includes('aniwatchtv.uk') || targetStreamUrl.includes('zokoanime.video')) {
      referer = 'https://zokoanime.video/';
      origin = 'https://zokoanime.video';
    } else if (targetStreamUrl.includes('megavid.buzz')) {
      referer = 'https://megavid.buzz/';
      origin = 'https://megavid.buzz';
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer,
      'Origin': origin,
      'Accept': '*/*'
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const upstreamRes = await fetch(targetStreamUrl, { headers });

    if (isM3u8) {
      const playlistContent = await upstreamRes.text();
      const baseUrl = targetStreamUrl.substring(0, targetStreamUrl.lastIndexOf('/') + 1);
      
      // Determine host for absolute URL rewriting so iOS Safari AVPlayer in new tabs resolves every segment correctly
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const prefix = host ? `${proto}://${host}` : '';

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
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(upstreamRes.status).send(modifiedBody);
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
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(upstreamRes.status).send(modifiedBody);
      }
    } else {
      const buffer = await upstreamRes.arrayBuffer();
      const contentType = upstreamRes.headers.get('content-type') || (targetStreamUrl.includes('.jpg') ? 'video/mp2t' : 'video/mp2t');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      
      const contentRange = upstreamRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      
      const nodeBuf = Buffer.from(buffer);
      res.setHeader('Content-Length', nodeBuf.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(upstreamRes.status).send(nodeBuf);
    }
  } catch (err) {
    return res.status(502).send('Stream Proxy Error: ' + err.message);
  }
}
