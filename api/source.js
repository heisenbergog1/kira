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

function normalizeM3u8Url(url) {
  if (url && url.includes('megavid.buzz') && url.includes('master.m3u8')) {
    return url.replace('master.m3u8', 'index-f1-v1-a1.m3u8');
  }
  return url;
}

async function fetchMegavidMalSource(id, ep, audioType) {
  try {
    const apiUrl = `https://megavid.buzz/mal/${id}/${ep}/${audioType}/source`;
    const referer = `https://megavid.buzz/mal/${id}/${ep}/${audioType}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
        'Origin': 'https://megavid.buzz',
        'Accept': '*/*'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.source) {
      return {
        status: 'ok',
        server: 'megavid',
        subserver: 'mal',
        malId: id,
        episode: ep,
        type: audioType,
        streamUrl: normalizeM3u8Url(data.source),
        rawSource: data.source,
        tracks: data.tracks || [],
        mega: data.mega || false
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function fetchAniWaveSource(alId, ep, audioType) {
  if (!alId) return null;
  try {
    const apiUrl = `https://megavid.buzz/aniwave/al/${alId}/${ep}/${audioType}/source`;
    const referer = `https://megavid.buzz/aniwave/al/${alId}/${ep}/${audioType}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
        'Origin': 'https://megavid.buzz',
        'Accept': '*/*'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.source) {
      return {
        status: 'ok',
        server: 'megavid',
        subserver: 'aniwave',
        alId: alId,
        episode: ep,
        type: audioType,
        streamUrl: normalizeM3u8Url(data.source),
        rawSource: data.source,
        tracks: data.tracks || [],
        mega: data.mega || false
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function fetchAniSource(alId, ep, audioType) {
  if (!alId) return null;
  try {
    const apiUrl = `https://megavid.buzz/ani/${alId}/${ep}/${audioType}/source`;
    const referer = `https://megavid.buzz/ani/${alId}/${ep}/${audioType}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
        'Origin': 'https://megavid.buzz',
        'Accept': '*/*'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.source) {
      return {
        status: 'ok',
        server: 'megavid',
        subserver: 'ani',
        alId: alId,
        episode: ep,
        type: audioType,
        streamUrl: normalizeM3u8Url(data.source),
        rawSource: data.source,
        tracks: data.tracks || [],
        mega: data.mega || false
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function fetchMegavidSmart(id, alId, ep, audioType, subserver = 'auto') {
  const chosen = (subserver || 'auto').toLowerCase();
  
  if (chosen === 'aniwave') {
    let res = await fetchAniWaveSource(alId || id, ep, audioType);
    if (!res) res = await fetchAniSource(alId || id, ep, audioType);
    if (!res) res = await fetchMegavidMalSource(id, ep, audioType);
    return res;
  }
  
  if (chosen === 'ani') {
    let res = await fetchAniSource(alId || id, ep, audioType);
    if (!res) res = await fetchAniWaveSource(alId || id, ep, audioType);
    if (!res) res = await fetchMegavidMalSource(id, ep, audioType);
    return res;
  }
  
  if (chosen === 'megavid' || chosen === 'mal') {
    let res = await fetchMegavidMalSource(id, ep, audioType);
    if (!res) res = await fetchAniWaveSource(alId || id, ep, audioType);
    if (!res) res = await fetchAniSource(alId || id, ep, audioType);
    return res;
  }

  // Auto (Default): Try MAL -> AniWave -> Ani
  let res = await fetchMegavidMalSource(id, ep, audioType);
  if (!res) res = await fetchAniWaveSource(alId || id, ep, audioType);
  if (!res) res = await fetchAniSource(alId || id, ep, audioType);
  return res;
}

async function fetchHiAnimeSource(id, ep, audioType) {
  const url = `https://zokoanime.video/stream/mal/${id}/${ep}/${audioType}?autostart=false&asi=0`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
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

  const { id, alId, ep = '1', type = 'sub', server = 'megavid', subserver = 'auto' } = req.query;

  if (!id && !alId) {
    return res.status(400).json({ error: 'Missing anime ID (id / alId)' });
  }

  const targetId = id || alId;
  const targetAlId = alId || id;
  const audioType = type.toLowerCase();
  const selectedServer = (server || 'megavid').toLowerCase();

  try {
    let result = null;
    if (selectedServer === 'hianime') {
      result = await fetchHiAnimeSource(targetId, ep, audioType);
      // Fallback to megavid if hianime missing
      if (!result) result = await fetchMegavidSmart(targetId, targetAlId, ep, audioType, subserver);
    } else {
      result = await fetchMegavidSmart(targetId, targetAlId, ep, audioType, subserver);
      // Fallback to hianime if megavid missing
      if (!result) result = await fetchHiAnimeSource(targetId, ep, audioType);
    }

    if (result) {
      return res.status(200).json(result);
    }

    return res.status(404).json({
      status: 'error',
      code: 404,
      message: `Stream not available for ID ${targetId} Episode ${ep} (${audioType})`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
