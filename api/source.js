import https from 'https';

const OBF_KEY = 'otaku-embed-v1';

function deobfuscateZoko(blob) {
  try {
    const decodedB64 = Buffer.from(blob, 'base64').toString('latin1');
    const out = [];
    for (let i = 0; i < decodedB64.length; i++) {
      const k = OBF_KEY[i % OBF_KEY.length];
      out.push(String.fromCharCode(decodedB64.charCodeAt(i) ^ k.charCodeAt(0)));
    }
    const rawStr = out.join('');
    return JSON.parse(decodeURIComponent(rawStr));
  } catch (e) {
    return null;
  }
}

async function fetchMegavidSource(id, ep, audioType) {
  const apiUrl = `https://megavid.buzz/mal/${id}/${ep}/${audioType}/source`;
  const referer = `https://megavid.buzz/mal/${id}/${ep}/${audioType}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer,
      'Accept': '*/*'
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.source) {
    let streamUrl = data.source;
    if (streamUrl.includes('megavid.buzz') && streamUrl.includes('master.m3u8')) {
      streamUrl = streamUrl.replace('master.m3u8', 'index-f1-v1-a1.m3u8');
    }
    return {
      status: 'ok',
      server: 'megavid',
      malId: id,
      episode: ep,
      type: audioType,
      streamUrl,
      rawSource: data.source,
      tracks: data.tracks || [],
      mega: data.mega || false
    };
  }
  return null;
}

async function fetchHiAnimeSource(id, ep, audioType) {
  const url = `https://zokoanime.video/stream/mal/${id}/${ep}/${audioType}?autostart=false&asi=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://hianimes.se/',
      'Accept': '*/*'
    }
  });
  if (!res.ok) return null;
  const html = await res.text();
  if (html.includes('window.__P="')) {
    const blob = html.split('window.__P="')[1].split('"')[0];
    const payload = deobfuscateZoko(blob);
    if (payload && payload.src) {
      return {
        status: 'ok',
        server: 'hianime',
        malId: id,
        episode: ep,
        type: audioType,
        streamUrl: payload.src,
        subtitles: payload.subtitles || [],
        skip: payload.skip || null
      };
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id, ep = '1', type = 'sub', server = 'megavid' } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing MAL ID (id)' });
  }

  const audioType = type.toLowerCase();
  const selectedServer = (server || 'megavid').toLowerCase();

  try {
    let result = null;
    if (selectedServer === 'hianime') {
      result = await fetchHiAnimeSource(id, ep, audioType);
      // Fallback to megavid if hianime missing
      if (!result) result = await fetchMegavidSource(id, ep, audioType);
    } else {
      result = await fetchMegavidSource(id, ep, audioType);
      // Fallback to hianime if megavid missing
      if (!result) result = await fetchHiAnimeSource(id, ep, audioType);
    }

    if (result) {
      return res.status(200).json(result);
    }

    return res.status(404).json({
      status: 'error',
      code: 404,
      message: `Stream not available for MAL ID ${id} Episode ${ep} (${audioType})`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
