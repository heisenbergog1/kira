export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url: imgUrl } = req.query;
  if (!imgUrl) {
    return res.status(400).send('Missing url');
  }

  try {
    const upstreamRes = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const buffer = await upstreamRes.arrayBuffer();
    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(upstreamRes.status).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(502).send('Image error');
  }
}
