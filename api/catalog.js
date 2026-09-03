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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gqlQuery, variables })
    });
    const data = await upstreamRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
