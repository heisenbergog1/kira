export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id, ep = '1', type = 'sub' } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing MAL ID (id)' });
  }

  const audioType = type.toLowerCase();
  const apiUrl = `https://megavid.buzz/mal/${id}/${ep}/${audioType}/source`;
  const referer = `https://megavid.buzz/mal/${id}/${ep}/${audioType}`;

  try {
    const upstreamRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
        'Accept': '*/*'
      }
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        status: 'error',
        code: upstreamRes.status,
        message: `Stream not available for MAL ID ${id} Episode ${ep} (${audioType})`
      });
    }

    const data = await upstreamRes.json();

    if (data && data.source) {
      let streamUrl = data.source;
      if (streamUrl.includes('master.m3u8')) {
        streamUrl = streamUrl.replace('master.m3u8', 'index-f1-v1-a1.m3u8');
      }

      return res.status(200).json({
        status: 'ok',
        malId: id,
        episode: ep,
        type: audioType,
        streamUrl,
        rawSource: data.source,
        tracks: data.tracks || [],
        mega: data.mega || false
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
