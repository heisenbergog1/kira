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
      const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.ok) {
        const data = await res.json();
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
    const res = await fetch(kitsuUrl, {
      headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': 'Mozilla/5.0' }
    });

    if (res.ok) {
      const data = await res.json();
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { type = 'trending', q = '', id = '', page = 1 } = req.query;

  let gqlQuery = '';
  let variables = {};

  if (id) {
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
    variables = { idMal: parseInt(id, 10) };
  } else if (q) {
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
    variables = { search: q, page: parseInt(page, 10) };
  } else {
    let sort = 'TRENDING_DESC';
    let format = undefined;
    if (type === 'top_airing') sort = 'POPULARITY_DESC';
    if (type === 'popular') sort = 'FAVOURITES_DESC';
    if (type === 'movies') { sort = 'SCORE_DESC'; format = 'MOVIE'; }

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

  try {
    const upstreamRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://anilist.co/',
        'Origin': 'https://anilist.co'
      },
      body: JSON.stringify({ query: gqlQuery, variables })
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      if (data && data.data && (data.data.Page || data.data.Media)) {
        return res.status(200).json(data);
      }
    }

    // Fallback to Kitsu if AniList returned non-200 or errors
    const fallbackData = await fetchKitsuFallback(id, q, type, page);
    return res.status(200).json(fallbackData);
  } catch (err) {
    const fallbackData = await fetchKitsuFallback(id, q, type, page);
    return res.status(200).json(fallbackData);
  }
}
