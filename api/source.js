import https from 'https';
import crypto from 'crypto';

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

const MEGAPLAY_KEY = Buffer.alloc(32);
MEGAPLAY_KEY.set(Buffer.from("i?LMTAx0Q6,:}50U", 'utf8').subarray(0, 32));
const MEGAPLAY_IV = Buffer.from("W0;27ToaUpl_P%'c", 'utf8');

function decryptMegaPlay(encString) {
  try {
    let b64 = encString.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const cipherBuffer = Buffer.from(b64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', MEGAPLAY_KEY, MEGAPLAY_IV);
    let decrypted = decipher.update(cipherBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    return null;
  }
}

const MEGAPLAY_CDN_KEY = Buffer.from("MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s", 'utf8');

function attachMegaPlayCdnToken(url) {
  if (!url || typeof url !== 'string' || url.includes('token=')) return url;
  const match = url.match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
  if (!match) return url;
  const pathPair = `${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
  const expiry = Math.floor(Date.now() / 1000) + 86400;
  const message = `${expiry}|${pathPair}`;
  const hmac = crypto.createHmac('sha256', MEGAPLAY_CDN_KEY);
  hmac.update(Buffer.from(message, 'utf8'));
  const b64Msg = Buffer.from(message, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const b64Sig = hmac.digest().toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const token = `${b64Msg}.${b64Sig}`;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

async function fetchMegaPlaySource(id, ep, audioType) {
  try {
    const embedUrl = `https://megaplay.buzz/stream/mal/${id}/${ep}/${audioType}?autostart=false`;
    const embedRes = await fetch(embedUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://anikoto.cz/',
        'Accept': '*/*'
      }
    });

    if (!embedRes.ok) return null;

    const html = await embedRes.text();
    let fileId = null;
    const matchTitle = html.match(/File\s+(\d+)/i);
    if (matchTitle) {
      fileId = matchTitle[1];
    } else {
      const matchData = html.match(/data-(?:realid|id|ep-id)=["'](\d+)["']/i);
      if (matchData) fileId = matchData[1];
    }

    if (!fileId) return null;

    const sourcesUrl = `https://megaplay.buzz/stream/getSources?id=${fileId}&id=${fileId}`;
    const sourcesRes = await fetch(sourcesUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': embedUrl,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      }
    });

    if (!sourcesRes.ok) return null;

    const sourcesData = await sourcesRes.json();
    let streamUrl = null;

    if (sourcesData.enc) {
      const decrypted = decryptMegaPlay(sourcesData.enc);
      if (decrypted) streamUrl = decrypted.file || decrypted.url || null;
    } else if (sourcesData.file || sourcesData.source) {
      streamUrl = sourcesData.file || sourcesData.source;
    }

    if (streamUrl) {
      return {
        status: 'ok',
        server: 'megaplay',
        malId: id,
        episode: ep,
        type: audioType,
        streamUrl: normalizeM3u8Url(attachMegaPlayCdnToken(streamUrl)),
        tracks: sourcesData.tracks || [],
        intro: sourcesData.intro || null,
        outro: sourcesData.outro || null
      };
    }
  } catch (err) {
    return null;
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
    if (selectedServer === 'megaplay' || selectedServer === 'anikoto') {
      result = await fetchMegaPlaySource(targetId, ep, audioType);
      // Fallback cascade to megavid -> hianime if megaplay missing
      if (!result) result = await fetchMegavidSmart(targetId, targetAlId, ep, audioType, subserver);
      if (!result) result = await fetchHiAnimeSource(targetId, ep, audioType);
    } else if (selectedServer === 'hianime') {
      result = await fetchHiAnimeSource(targetId, ep, audioType);
      // Fallback to megavid -> megaplay if hianime missing
      if (!result) result = await fetchMegavidSmart(targetId, targetAlId, ep, audioType, subserver);
      if (!result) result = await fetchMegaPlaySource(targetId, ep, audioType);
    } else {
      result = await fetchMegavidSmart(targetId, targetAlId, ep, audioType, subserver);
      // Fallback to hianime -> megaplay if megavid missing
      if (!result) result = await fetchHiAnimeSource(targetId, ep, audioType);
      if (!result) result = await fetchMegaPlaySource(targetId, ep, audioType);
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
