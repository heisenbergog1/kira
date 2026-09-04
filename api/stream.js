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
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(upstreamRes.status).send(modifiedBody);
    } else {
      const buffer = await upstreamRes.arrayBuffer();
      const contentType = upstreamRes.headers.get('content-type') || (targetStreamUrl.includes('.jpg') ? 'video/mp2t' : 'video/mp2t');
      res.setHeader('Content-Type', contentType);
      
      if (upstreamRes.headers.get('content-range')) {
        res.setHeader('Content-Range', upstreamRes.headers.get('content-range'));
      }
      if (upstreamRes.headers.get('accept-ranges')) {
        res.setHeader('Accept-Ranges', upstreamRes.headers.get('accept-ranges'));
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(upstreamRes.status).send(Buffer.from(buffer));
    }
  } catch (err) {
    return res.status(502).send('Stream Proxy Error: ' + err.message);
  }
}
