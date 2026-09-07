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
    // Dynamic referrer injection based on host domain
    let referer = 'https://megavid.buzz/';
    let origin = 'https://megavid.buzz';

    if (targetStreamUrl.includes('aniwatchtv.uk') || targetStreamUrl.includes('zokoanime.video')) {
      referer = 'https://zokoanime.video/';
      origin = 'https://zokoanime.video';
    } else if (targetStreamUrl.includes('megaplay.buzz') || targetStreamUrl.includes('imgnex.top')) {
      referer = 'https://megaplay.buzz/';
      origin = 'https://megaplay.buzz';
    } else if (targetStreamUrl.includes('megavid.buzz') || targetStreamUrl.includes('api-webs.com')) {
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
    const upstreamContentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
    const isM3u8 = targetStreamUrl.includes('.m3u8') || upstreamContentType.includes('mpegurl') || upstreamContentType.includes('application/x-mpegurl');

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
        // Media segment playlist (.ts / .jpg list)
        const lines = playlistContent.split('\n');
        const rewrittenLines = lines.map(line => {
          line = line.trim();
          if (!line) return line;
          if (line.startsWith('#')) {
            if (line.includes('URI=')) {
              return line.replace(/URI=["']([^"']+)["']/g, (m, u) => {
                let abs = u;
                if (!u.startsWith('http://') && !u.startsWith('https://')) {
                  abs = baseUrl + u;
                }
                return `URI="${prefix}/api/stream?url=${encodeURIComponent(abs)}"`;
              });
            }
            return line;
          }
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
      
      // Force correct MIME type: Megavid chunks end in .jpg but are MPEG-TS video
      let contentType = 'video/mp2t';
      if (targetStreamUrl.includes('.vtt')) {
        contentType = 'text/vtt';
      } else if (targetStreamUrl.includes('.key')) {
        contentType = 'application/octet-stream';
      }
      
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
