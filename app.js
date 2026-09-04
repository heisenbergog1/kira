/**
 * CINESTREAM • ANIME STREAMING APP
 * Complete Real Aired Episode Counter, Instant Search Handler & Interactive Action Controls
 */

var state = {
  currentView: 'home',
  selectedAnime: null,
  currentEpisode: 1,
  audioType: 'sub',
  currentServer: 'megavid',
  episodesSortAsc: true,
  currentChunk: 0,
  chunkSize: 24,
  watchlist: [],
  notifications: [],
  continueWatching: [],
  hlsPlayer: null,
  currentStreamUrl: '',
  availableQualities: [],
  selectedQuality: 'Auto'
};

try {
  state.watchlist = JSON.parse(localStorage.getItem('cinestream_watchlist') || '[]');
  state.notifications = JSON.parse(localStorage.getItem('cinestream_notifs') || '[]');
  state.continueWatching = JSON.parse(localStorage.getItem('cinestream_continue') || '[]');
} catch (e) {
  state.watchlist = [];
  state.notifications = [];
  state.continueWatching = [];
}

var API_BASE = window.location.origin;

function getProp(obj, path, fallback) {
  if (!obj) return fallback !== undefined ? fallback : '';
  var parts = path.split('.');
  var curr = obj;
  for (var i = 0; i < parts.length; i++) {
    if (curr === null || curr === undefined || typeof curr !== 'object') {
      return fallback !== undefined ? fallback : '';
    }
    curr = curr[parts[i]];
  }
  return curr !== undefined && curr !== null ? curr : (fallback !== undefined ? fallback : '');
}

function getCoverImage(a) {
  if (!a) return '';
  return getProp(a, 'coverImage.extraLarge') ||
         getProp(a, 'coverImage.large') ||
         getProp(a, 'coverImage.medium') ||
         getProp(a, 'images.webp.large_image_url') ||
         getProp(a, 'images.webp.image_url') ||
         getProp(a, 'images.jpg.large_image_url') ||
         getProp(a, 'images.jpg.image_url') ||
         getProp(a, 'image') ||
         '';
}

function getBannerImage(a) {
  if (!a) return '';
  return a.bannerImage ||
         getProp(a, 'images.webp.large_image_url') ||
         getProp(a, 'images.jpg.large_image_url') ||
         getCoverImage(a);
}

function httpGet(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 10000;
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          callback(null, data);
        } catch (e) {
          callback(e, null);
        }
      } else {
        callback(new Error('HTTP ' + xhr.status), null);
      }
    }
  };
  xhr.ontimeout = function() { callback(new Error('Timeout'), null); };
  xhr.onerror = function() { callback(new Error('Network Error'), null); };
  xhr.send();
}

function httpPostJson(url, payload, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 10000;
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          callback(null, data);
        } catch (e) {
          callback(e, null);
        }
      } else {
        callback(new Error('HTTP ' + xhr.status), null);
      }
    }
  };
  xhr.ontimeout = function() { callback(new Error('Timeout'), null); };
  xhr.onerror = function() { callback(new Error('Network Error'), null); };
  xhr.send(JSON.stringify(payload));
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast';
  setTimeout(function() {
    toast.className = 'toast hidden';
  }, 3000);
}

function fetchCatalog(params, callback) {
  var qs = [];
  if (params.type) qs.push('type=' + encodeURIComponent(params.type));
  if (params.q) qs.push('q=' + encodeURIComponent(params.q));
  if (params.id) qs.push('id=' + encodeURIComponent(params.id));
  var proxyUrl = API_BASE + '/api/catalog?' + qs.join('&');

  httpGet(proxyUrl, function(err, data) {
    if (!err && data && data.data) {
      return callback(null, data.data);
    }
    // Direct Fallback to AniList
    var gqlQuery = '';
    var variables = {};
    if (params.id) {
      gqlQuery = 'query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { id idMal title { romaji english } description(asHtml: false) episodes nextAiringEpisode { episode timeUntilAiring } seasonYear averageScore genres bannerImage coverImage { extraLarge large medium } streamingEpisodes { title thumbnail url } characters(sort: ROLE, perPage: 12) { edges { role node { id name { full } image { large } } voiceActors(language: JAPANESE) { name { full } image { large } } } } } }';
      variables = { idMal: parseInt(params.id, 10) };
    } else if (params.q) {
      gqlQuery = 'query ($search: String) { Page(page: 1, perPage: 24) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id idMal title { romaji english } description(asHtml: false) episodes nextAiringEpisode { episode } seasonYear averageScore genres coverImage { extraLarge large medium } bannerImage } } }';
      variables = { search: params.q };
    } else {
      var sort = 'TRENDING_DESC';
      var format = undefined;
      if (params.type === 'top_airing') sort = 'POPULARITY_DESC';
      if (params.type === 'popular') sort = 'FAVOURITES_DESC';
      if (params.type === 'movies') { sort = 'SCORE_DESC'; format = 'MOVIE'; }
      gqlQuery = 'query ($sort: [MediaSort], $format: MediaFormat) { Page(page: 1, perPage: 24) { media(type: ANIME, sort: $sort, format: $format) { id idMal title { romaji english } description(asHtml: false) episodes nextAiringEpisode { episode } seasonYear averageScore genres coverImage { extraLarge large medium } bannerImage } } }';
      variables = { sort: [sort], format: format };
    }

    httpPostJson('https://graphql.anilist.co', { query: gqlQuery, variables: variables }, function(err2, data2) {
      if (!err2 && data2 && data2.data) {
        return callback(null, data2.data);
      }
      callback(err2 || err || new Error('Failed to load anime catalog'), null);
    });
  });
}

function loadHomeContent() {
  fetchCatalog({ type: 'trending' }, function(err, data) {
    if (!err && data && data.Page && data.Page.media && data.Page.media.length > 0) {
      setupHero(data.Page.media[0]);
      renderMediaGrid(data.Page.media, 'main-media-grid');
    }
  });

  fetchCatalog({ type: 'movies' }, function(err, data) {
    if (!err && data && data.Page && data.Page.media) {
      renderHorizontalRow(data.Page.media, 'top-movies-row');
    }
  });

  fetchCatalog({ type: 'popular' }, function(err, data) {
    if (!err && data && data.Page && data.Page.media) {
      renderHorizontalRow(data.Page.media, 'top-series-row');
    }
  });

  renderContinueWatching();
}

function setupHero(anime) {
  var backdrop = document.getElementById('hero-backdrop');
  var title = document.getElementById('hero-title');
  var genre = document.getElementById('hero-genre');
  var desc = document.getElementById('hero-desc');

  var imgUrl = getBannerImage(anime);
  if (backdrop && imgUrl) {
    backdrop.style.backgroundImage = 'url("' + imgUrl + '")';
  }
  var animeTitle = getProp(anime, 'title.english') || getProp(anime, 'title.romaji') || 'Featured Anime';
  if (title) title.textContent = animeTitle;

  var genres = anime.genres || [];
  var genreText = (genres.slice(0, 2).join(' • ') || 'Anime') + ' • ' + (anime.seasonYear || '2024');
  if (genre) genre.textContent = genreText;

  var rawDesc = (anime.description || '').replace(/<[^>]*>?/gm, '');
  if (desc) desc.textContent = rawDesc || 'Watch latest episodes.';

  var malId = anime.idMal || anime.id;
  var btnPlay = document.getElementById('hero-btn-play');
  if (btnPlay) {
    btnPlay.onclick = function() { openAnimeDetails(malId, true); };
  }
  var btnInfo = document.getElementById('hero-btn-info');
  if (btnInfo) {
    btnInfo.onclick = function() { openAnimeDetails(malId); };
  }
  var btnWatchlist = document.getElementById('hero-btn-watchlist');
  if (btnWatchlist) {
    updateWatchlistBtn(btnWatchlist, malId);
    btnWatchlist.onclick = function() { toggleWatchlist(anime); };
  }
}

function renderContinueWatching() {
  var container = document.getElementById('continue-watching-row');
  if (!container) return;

  var items = state.continueWatching;
  if (items.length === 0) {
    items = [
      { malId: 51105, ep: 12, title: 'NieR:Automata Ver1.1a', image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx143859-uM29JvF6t4Vz.jpg' },
      { malId: 54492, ep: 1, title: 'Whisper Me A Love Song', image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163076-oR6c6JtHkFf0.jpg' },
      { malId: 47160, ep: 1, title: 'Summer Time Rendering', image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx129201-Pq5m1E4V7S4M.jpg' }
    ];
  }

  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var img = it.image || '';
    html += '<div class="continue-card" onclick="openAnimeDetails(' + it.malId + ', true, ' + it.ep + ')">' +
      '<div class="continue-thumb-wrapper" style="background-image: url(\'' + img + '\')">' +
        '<img src="' + img + '" alt="' + it.title + '" onerror="this.style.display=\'none\'">' +
        '<div class="play-circle-overlay">' +
          '<div class="play-circle-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>' +
        '</div>' +
      '</div>' +
      '<div class="continue-title">' + it.title + (it.ep ? ' (Ep ' + it.ep + ')' : '') + '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

function renderMediaGrid(animeList, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!animeList || animeList.length === 0) {
    container.innerHTML = '<div style="padding: 24px; color: #94a3b8; width: 100%; text-align: center;">No anime found.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < animeList.length; i++) {
    var a = animeList[i];
    var score = a.averageScore ? (a.averageScore / 10).toFixed(1) : (a.score ? Number(a.score).toFixed(1) : '7.5');
    var img = getCoverImage(a);
    var title = getProp(a, 'title.english') || getProp(a, 'title.romaji') || getProp(a, 'title') || 'Anime';
    var malId = a.idMal || a.mal_id || a.id;

    html += '<div class="anime-card" onclick="selectAnimeFromGrid(' + malId + ')">' +
      '<div class="anime-card-poster" style="background-image: url(\'' + img + '\')">' +
        '<img src="' + img + '" alt="' + title + '" onerror="this.style.display=\'none\'">' +
        '<div class="card-rating-badge">★ ' + score + '</div>' +
      '</div>' +
      '<div class="anime-card-info">' +
        '<h4 class="anime-card-title">' + title + '</h4>' +
      '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

// Handler for clicking any anime card (automatically hides search if open)
window.selectAnimeFromGrid = function(malId) {
  var searchOverlay = document.getElementById('search-results-section');
  if (searchOverlay) {
    searchOverlay.className = 'search-overlay hidden';
  }
  var searchInput = document.getElementById('global-search-input');
  if (searchInput) searchInput.value = '';

  openAnimeDetails(malId);
};

function renderHorizontalRow(animeList, containerId) {
  var container = document.getElementById(containerId);
  if (!container || !animeList) return;

  var html = '';
  for (var i = 0; i < animeList.length; i++) {
    var a = animeList[i];
    var score = a.averageScore ? (a.averageScore / 10).toFixed(1) : (a.score ? Number(a.score).toFixed(1) : '8.0');
    var img = getCoverImage(a);
    var title = getProp(a, 'title.english') || getProp(a, 'title.romaji') || getProp(a, 'title') || 'Anime';
    var malId = a.idMal || a.mal_id || a.id;

    html += '<div class="continue-card" onclick="selectAnimeFromGrid(' + malId + ')">' +
      '<div class="continue-thumb-wrapper" style="background-image: url(\'' + img + '\')">' +
        '<img src="' + img + '" alt="' + title + '" onerror="this.style.display=\'none\'">' +
        '<div class="card-rating-badge">★ ' + score + '</div>' +
      '</div>' +
      '<div class="continue-title">' + title + '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

// Accurate real aired episode calculator
function calculateTotalEpisodes(anime) {
  if (!anime) return 12;
  // 1. If currently airing, check nextAiringEpisode (latest aired episode = next - 1)
  if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode) {
    return Math.max(1, anime.nextAiringEpisode.episode - 1);
  }
  // 2. If completed/explicit count exists
  if (anime.episodes && anime.episodes > 0) {
    return anime.episodes;
  }
  // 3. Check streamingEpisodes length
  if (anime.streamingEpisodes && anime.streamingEpisodes.length > 0) {
    return anime.streamingEpisodes.length;
  }
  return 12;
}

function openAnimeDetails(malId, autoPlay, targetEp) {
  targetEp = targetEp || 1;
  state.currentChunk = 0;
  switchView('details');
  window.scrollTo(0, 0);

  var titleEl = document.getElementById('details-title');
  var synopsisEl = document.getElementById('details-synopsis');
  var yearEl = document.getElementById('details-year');
  var typeEl = document.getElementById('details-type');
  var scoreEl = document.getElementById('details-score');
  var genresContainer = document.getElementById('details-genres-row');
  var castRow = document.getElementById('details-cast-row');

  if (titleEl) titleEl.textContent = 'Loading Anime Details...';
  if (synopsisEl) synopsisEl.textContent = 'Loading synopsis...';

  fetchCatalog({ id: malId }, function(err, data) {
    var anime = data && data.Media ? data.Media : null;

    if (!anime) {
      if (titleEl) titleEl.textContent = 'Anime #' + malId;
      if (synopsisEl) synopsisEl.textContent = 'Stream this anime episode below.';
      loadEpisodesList(malId, 12, autoPlay, targetEp, null);
      return;
    }

    state.selectedAnime = anime;
    state.currentEpisode = targetEp;

    var backdropUrl = getBannerImage(anime);
    var backdrop = document.getElementById('details-backdrop');
    if (backdrop && backdropUrl) backdrop.style.backgroundImage = 'url("' + backdropUrl + '")';

    var title = getProp(anime, 'title.english') || getProp(anime, 'title.romaji') || 'Anime';
    if (titleEl) titleEl.textContent = title;

    if (yearEl) yearEl.textContent = anime.seasonYear || '2024';
    if (typeEl) typeEl.textContent = anime.format || 'Anime';
    var score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : '7.5';
    if (scoreEl) scoreEl.textContent = score + '/10.0';

    var rawDesc = (anime.description || 'Stream in high definition.').replace(/<[^>]*>?/gm, '');
    if (synopsisEl) {
      synopsisEl.textContent = rawDesc;
      synopsisEl.className = 'synopsis-text clamped';
    }

    var genres = anime.genres || [];
    var gHtml = '';
    for (var g = 0; g < genres.length; g++) {
      gHtml += '<span class="genre-pill">' + genres[g] + '</span>';
    }
    if (genresContainer) genresContainer.innerHTML = gHtml;

    if (castRow) {
      var edges = getProp(anime, 'characters.edges', []);
      if (edges.length > 0) {
        var cHtml = '';
        for (var c = 0; c < Math.min(10, edges.length); c++) {
          var charNode = edges[c].node;
          var charName = getProp(charNode, 'name.full', 'Character');
          var charImg = getProp(charNode, 'image.large', '');
          var va = edges[c].voiceActors && edges[c].voiceActors.length > 0 ? edges[c].voiceActors[0] : null;
          var vaName = va ? va.name.full : 'Voice Actor';
          var role = edges[c].role || 'Main';

          cHtml += '<div class="cast-card">' +
            '<div class="cast-avatar" style="background-image: url(\'' + charImg + '\')"><img src="' + charImg + '" alt="' + charName + '" onerror="this.style.display=\'none\'"></div>' +
            '<div class="cast-char-name">' + charName + '</div>' +
            '<div class="cast-va-name">' + vaName + '</div>' +
            '<div class="cast-role">' + role + '</div>' +
          '</div>';
        }
        castRow.innerHTML = cHtml;
      } else {
        castRow.innerHTML = '<div style="color:#64748b;font-size:12px;">Cast info not available.</div>';
      }
    }

    var totalEps = calculateTotalEpisodes(anime);
    renderQualityDropdown();
    loadEpisodesList(malId, totalEps, autoPlay, targetEp, anime);
    updateFavoriteBtn(malId);
    updateBellBtn(malId);
  });
}

function loadEpisodesList(malId, totalEpisodes, autoPlay, targetEp, anime) {
  var container = document.getElementById('details-episodes-list');
  var countLabel = document.getElementById('details-episode-count');
  if (!container) return;

  var count = totalEpisodes || 12;
  if (countLabel) countLabel.textContent = count + ' Episodes';

  var defaultThumb = anime ? (getProp(anime, 'coverImage.extraLarge') || getProp(anime, 'coverImage.large')) : '';
  var defaultSynopsis = anime ? (anime.description || '').replace(/<[^>]*>?/gm, '') : 'Stream this episode in direct HD.';
  var streamingEps = (anime && anime.streamingEpisodes) ? anime.streamingEpisodes : [];

  var list = [];
  for (var i = 1; i <= count; i++) {
    var epThumb = defaultThumb;
    var epTitle = 'Episode ' + i;
    
    if (streamingEps.length >= i) {
      var sEp = streamingEps[i - 1];
      if (sEp.title) epTitle = sEp.title;
      if (sEp.thumbnail) epThumb = sEp.thumbnail;
    }

    list.push({
      epNum: i,
      title: epTitle,
      airDate: 'Available',
      synopsis: defaultSynopsis,
      thumbnail: epThumb
    });
  }

  if (!state.episodesSortAsc) {
    list.reverse();
  }

  var totalChunks = Math.ceil(list.length / state.chunkSize);
  var chunkHtml = '';
  if (totalChunks > 1) {
    chunkHtml += '<div class="category-tabs" style="margin-bottom: 14px;">';
    for (var ch = 0; ch < totalChunks; ch++) {
      var start = ch * state.chunkSize + 1;
      var end = Math.min((ch + 1) * state.chunkSize, list.length);
      var activeClass = ch === state.currentChunk ? ' active' : '';
      chunkHtml += '<button class="tab-pill' + activeClass + '" onclick="switchEpisodeChunk(' + ch + ')">' + start + '-' + end + '</button>';
    }
    chunkHtml += '</div>';
  }

  var startIdx = state.currentChunk * state.chunkSize;
  var endIdx = Math.min(startIdx + state.chunkSize, list.length);
  var currentSlice = list.slice(startIdx, endIdx);

  var html = chunkHtml;
  for (var j = 0; j < currentSlice.length; j++) {
    var ep = currentSlice[j];
    var safeTitle = encodeURIComponent(ep.title);
    html += '<div class="episode-card" onclick="playEpisodeDirect(' + malId + ', ' + ep.epNum + ', \'' + safeTitle + '\')">' +
      '<div class="episode-card-top">' +
        '<div class="episode-thumb-wrapper" style="background-image: url(\'' + ep.thumbnail + '\')">' +
          '<img src="' + ep.thumbnail + '" alt="' + ep.title + '" onerror="this.style.display=\'none\'">' +
          '<div class="ep-play-overlay">' +
            '<div class="ep-play-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>' +
          '</div>' +
        '</div>' +
        '<div class="episode-meta">' +
          '<h4 class="episode-title">' + ep.title + '</h4>' +
          '<span class="episode-air-date">' + ep.airDate + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="episode-synopsis">' + ep.synopsis + '</p>' +
    '</div>';
  }
  container.innerHTML = html;

  if (autoPlay) {
    playEpisodeDirect(malId, targetEp || 1, encodeURIComponent('Episode ' + (targetEp || 1)));
  }
}

window.switchEpisodeChunk = function(chunkIdx) {
  state.currentChunk = chunkIdx;
  if (state.selectedAnime) {
    var malId = state.selectedAnime.idMal || state.selectedAnime.id;
    var totalEps = calculateTotalEpisodes(state.selectedAnime);
    loadEpisodesList(malId, totalEps, false, 1, state.selectedAnime);
  }
};

function playEpisodeDirect(malId, episode, encodedTitle) {
  var modal = document.getElementById('video-player-modal');
  var video = document.getElementById('main-video');
  var loader = document.getElementById('player-loader');
  var errorOverlay = document.getElementById('player-error');
  var titleEl = document.getElementById('player-title');
  var subtitleEl = document.getElementById('player-subtitle');
  var streamUrlInput = document.getElementById('stream-url-display');

  var title = decodeURIComponent(encodedTitle);
  if (titleEl) titleEl.textContent = title;
  var animeName = state.selectedAnime ? (getProp(state.selectedAnime, 'title.english') || getProp(state.selectedAnime, 'title.romaji')) : 'Anime';
  if (subtitleEl) subtitleEl.textContent = animeName + ' • Ep ' + episode + ' (' + state.audioType.toUpperCase() + ')';

  if (modal) modal.className = 'player-modal';
  if (loader) loader.className = 'player-loader';
  if (errorOverlay) errorOverlay.className = 'player-error-overlay hidden';
  if (streamUrlInput) streamUrlInput.value = 'Resolving direct M3U8 stream...';

  state.currentEpisode = episode;
  saveContinueWatching(malId, episode);

  var sourceApiUrl = API_BASE + '/api/source?id=' + malId + '&ep=' + episode + '&type=' + state.audioType + '&server=' + state.currentServer;
  httpGet(sourceApiUrl, function(err, data) {
    if (!err && data && data.status === 'ok' && data.streamUrl) {
      var streamUrl = data.streamUrl;
      
      // Only convert master.m3u8 to index-f1-v1-a1 on megavid.buzz (HiAnime/aniwatchtv keeps master.m3u8)
      if (streamUrl.indexOf('megavid.buzz') !== -1 && streamUrl.indexOf('master.m3u8') !== -1) {
        streamUrl = streamUrl.replace('master.m3u8', 'index-f1-v1-a1.m3u8');
      }

      // Route streams requiring specific Referer (megavid.buzz/vid/ or aniwatchtv.uk) through proxy
      var playbackUrl = streamUrl;
      if (streamUrl.indexOf('megavid.buzz/vid/') !== -1 || streamUrl.indexOf('aniwatchtv.uk') !== -1 || streamUrl.indexOf('zokoanime') !== -1) {
        playbackUrl = API_BASE + '/api/stream?url=' + encodeURIComponent(streamUrl);
      }

      state.currentStreamUrl = playbackUrl;
      if (streamUrlInput) streamUrlInput.value = playbackUrl;

      startHlsPlayback(playbackUrl, data.tracks || []);
    } else {
      if (loader) loader.className = 'player-loader hidden';
      if (errorOverlay) errorOverlay.className = 'player-error-overlay';
      var errText = document.getElementById('player-error-msg');
      if (errText) errText.textContent = (data && data.message) ? data.message : 'Stream not available for this episode / audio type.';
    }
  });
}


function getQualityNumber(label) {
  if (!label || label === 'Auto') return 0;
  var num = parseInt(label.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function getBestQualityUrl(qualities, preferredLabel, masterFallbackUrl) {
  if (!qualities || qualities.length === 0) return masterFallbackUrl;
  if (preferredLabel === 'Auto' || !preferredLabel) return masterFallbackUrl;

  // 1. Exact match
  for (var i = 0; i < qualities.length; i++) {
    if (qualities[i].label === preferredLabel && qualities[i].url) {
      return qualities[i].url;
    }
  }

  // 2. Highest available fallback if requested quality doesn't exist
  var sorted = qualities.slice().sort(function(a, b) {
    return getQualityNumber(b.label) - getQualityNumber(a.label);
  });

  return sorted[0] && sorted[0].url ? sorted[0].url : masterFallbackUrl;
}

function renderQualityDropdown(qualities) {
  var dContainer = document.getElementById('details-quality-container');
  var dLabel = document.getElementById('details-quality-label');
  var dMenu = document.getElementById('details-quality-menu');
  var pContainer = document.getElementById('quality-selector-container');
  var pLabel = document.getElementById('quality-label');
  var pMenu = document.getElementById('quality-dropdown-menu');

  var options = qualities && qualities.length > 0 ? qualities : [
    { label: '1080p' },
    { label: '720p' },
    { label: '480p' },
    { label: '360p' }
  ];

  state.availableQualities = options;

  var currentText = state.selectedQuality === 'Auto' ? 'Quality: Auto' : ('Quality: ' + state.selectedQuality);
  if (dLabel) dLabel.textContent = currentText;
  if (pLabel) pLabel.textContent = state.selectedQuality;

  if (dContainer) dContainer.className = 'quality-selector-container';
  if (pContainer) pContainer.className = 'quality-selector-container';

  var html = '<div class="quality-option' + (state.selectedQuality === 'Auto' ? ' active' : '') + '" onclick="chooseQualityOption(-1, \'Auto\')">Auto (Best)</div>';
  for (var q = 0; q < options.length; q++) {
    var item = options[q];
    var isSel = state.selectedQuality === item.label;
    html += '<div class="quality-option' + (isSel ? ' active' : '') + '" onclick="chooseQualityOption(' + q + ', \'' + item.label + '\')">' + item.label + '</div>';
  }

  if (dMenu) dMenu.innerHTML = html;
  if (pMenu) pMenu.innerHTML = html;

  window.chooseQualityOption = function(idx, label) {
    state.selectedQuality = label;
    var dDisp = label === 'Auto' ? 'Quality: Auto' : ('Quality: ' + label);
    if (dLabel) dLabel.textContent = dDisp;
    if (pLabel) pLabel.textContent = label;
    if (dMenu) dMenu.className = 'quality-dropdown hidden';
    if (pMenu) pMenu.className = 'quality-dropdown hidden';
    showToast('Preferred Quality: ' + label);

    // If currently playing, live switch quality
    if (state.hlsPlayer && idx >= 0) {
      state.hlsPlayer.currentLevel = idx;
    } else if (state.hlsPlayer && idx === -1) {
      state.hlsPlayer.currentLevel = -1;
    } else {
      var video = document.getElementById('main-video');
      if (video && !video.paused && state.currentStreamUrl) {
        var bestUrl = getBestQualityUrl(state.availableQualities, state.selectedQuality, state.currentStreamUrl);
        var playbackUrl = API_BASE + '/api/stream?url=' + encodeURIComponent(bestUrl);
        var currTime = video.currentTime;
        video.src = playbackUrl;
        video.onloadedmetadata = function() {
          video.currentTime = currTime;
          video.play();
        };
      }
    }
  };
}


function startHlsPlayback(streamUrl, tracks, isRetryProxy) {
  var video = document.getElementById('main-video');
  var loader = document.getElementById('player-loader');
  var errorOverlay = document.getElementById('player-error');
  if (!video) return;

  if (state.hlsPlayer) {
    state.hlsPlayer.destroy();
    state.hlsPlayer = null;
  }

  var handlePlaybackError = function() {
    if (!isRetryProxy) {
      // Auto-fallback to Proxy URL if direct stream encounters 403 / CORS
      var proxiedUrl = API_BASE + '/api/stream?url=' + encodeURIComponent(streamUrl);
      startHlsPlayback(proxiedUrl, tracks, true);
    } else {
      if (loader) loader.className = 'player-loader hidden';
      if (errorOverlay) errorOverlay.className = 'player-error-overlay';
      var errText = document.getElementById('player-error-msg');
      if (errText) errText.textContent = 'Stream error. Please try switching between Sub/Dub.';
    }
  };

  if (window.Hls && Hls.isSupported()) {
    var hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
    state.hlsPlayer = hls;
    hls.loadSource(streamUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
      if (loader) loader.className = 'player-loader hidden';
      video.play().catch(function() {});

      if (data && data.levels && data.levels.length > 1) {
        var hlsQualities = [];
        for (var i = 0; i < data.levels.length; i++) {
          var lvl = data.levels[i];
          var h = lvl.height ? (lvl.height + 'p') : ('Quality ' + (i + 1));
          var qUrl = (lvl.url && lvl.url.length > 0) ? lvl.url[0] : (lvl.uri || '');
          hlsQualities.push({ label: h, index: i, url: qUrl });
        }
        renderQualityDropdown(hlsQualities);
      }
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.destroy();
            handlePlaybackError();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            handlePlaybackError();
            break;
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native Safari / iPad iOS 9
    video.src = streamUrl;
    video.onloadedmetadata = function() {
      if (loader) loader.className = 'player-loader hidden';
      video.play().catch(function() {});
    };
    video.onerror = function() {
      handlePlaybackError();
    };
  } else {
    video.src = streamUrl;
    if (loader) loader.className = 'player-loader hidden';
  }
}

function saveContinueWatching(malId, episode) {
  if (!state.selectedAnime) return;
  var title = getProp(state.selectedAnime, 'title.english') || getProp(state.selectedAnime, 'title.romaji') || 'Anime';
  var image = getCoverImage(state.selectedAnime);

  var item = {
    malId: malId,
    ep: episode,
    title: title,
    image: image,
    updatedAt: Date.now()
  };

  var filtered = [];
  for (var i = 0; i < state.continueWatching.length; i++) {
    if (state.continueWatching[i].malId !== malId) {
      filtered.push(state.continueWatching[i]);
    }
  }
  state.continueWatching = [item].concat(filtered).slice(0, 10);
  try {
    localStorage.setItem('cinestream_continue', JSON.stringify(state.continueWatching));
  } catch (e) {}
  renderContinueWatching();
}

function switchView(viewName) {
  state.currentView = viewName;
  var screens = document.querySelectorAll('.view-screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].className = 'view-screen hidden';
  }

  var activeEl = document.getElementById(viewName + '-view');
  if (activeEl) activeEl.className = 'view-screen active';

  var navBtns = document.querySelectorAll('.nav-item');
  for (var j = 0; j < navBtns.length; j++) {
    var isCurrent = navBtns[j].getAttribute('data-view') === viewName;
    navBtns[j].className = isCurrent ? 'nav-item active' : 'nav-item';
  }
}

// Watchlist / Favorites toggle
function toggleWatchlist(anime) {
  var malId = anime.idMal || anime.mal_id || anime.id;
  var index = -1;
  for (var i = 0; i < state.watchlist.length; i++) {
    if (state.watchlist[i].mal_id === malId || state.watchlist[i].idMal === malId) { index = i; break; }
  }

  if (index >= 0) {
    state.watchlist.splice(index, 1);
    showToast('Removed from Watchlist');
  } else {
    state.watchlist.push({
      mal_id: malId,
      idMal: malId,
      title: anime.title,
      coverImage: anime.coverImage,
      averageScore: anime.averageScore
    });
    showToast('Added to Watchlist ❤️');
  }

  try {
    localStorage.setItem('cinestream_watchlist', JSON.stringify(state.watchlist));
  } catch (e) {}
  updateWatchlistBtn(document.getElementById('hero-btn-watchlist'), malId);
  updateFavoriteBtn(malId);
}

function updateWatchlistBtn(btn, malId) {
  if (!btn) return;
  var isSaved = false;
  for (var i = 0; i < state.watchlist.length; i++) {
    if (state.watchlist[i].mal_id === malId || state.watchlist[i].idMal === malId) { isSaved = true; break; }
  }
  var text = document.getElementById('hero-watchlist-text');
  if (text) text.textContent = isSaved ? 'In Watchlist' : 'Watchlist';
}

function updateFavoriteBtn(malId) {
  var btn = document.getElementById('btn-details-favorite');
  if (!btn) return;
  var isSaved = false;
  for (var i = 0; i < state.watchlist.length; i++) {
    if (state.watchlist[i].mal_id === malId || state.watchlist[i].idMal === malId) { isSaved = true; break; }
  }
  btn.style.color = isSaved ? '#ef4444' : '#ffffff';
}

function toggleNotification(malId) {
  var index = state.notifications.indexOf(malId);
  if (index >= 0) {
    state.notifications.splice(index, 1);
    showToast('Episode notifications turned OFF');
  } else {
    state.notifications.push(malId);
    showToast('🔔 Notifications turned ON for new episodes!');
  }
  try {
    localStorage.setItem('cinestream_notifs', JSON.stringify(state.notifications));
  } catch (e) {}
  updateBellBtn(malId);
}

function updateBellBtn(malId) {
  var btn = document.getElementById('btn-details-bell');
  if (!btn) return;
  var isNotif = state.notifications.indexOf(malId) >= 0;
  btn.style.color = isNotif ? '#fbbf24' : '#ffffff';
}

// Share Anime
function shareCurrentAnime() {
  if (!state.selectedAnime) return;
  var title = getProp(state.selectedAnime, 'title.english') || getProp(state.selectedAnime, 'title.romaji') || 'Anime';
  var malId = state.selectedAnime.idMal || state.selectedAnime.id;
  var shareUrl = window.location.origin + '/?id=' + malId;

  if (navigator.share) {
    navigator.share({
      title: 'Watch ' + title + ' on CineStream',
      text: 'Watch ' + title + ' in direct HD without ads on CineStream!',
      url: shareUrl
    }).catch(function() {});
  } else {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      showToast('Anime share link copied to clipboard!');
    } else {
      showToast('Share: ' + title);
    }
  }
}

// Cast to Device
function triggerCast() {
  var video = document.getElementById('main-video');
  if (video && video.webkitShowPlaybackTargetPicker) {
    video.webkitShowPlaybackTargetPicker();
  } else {
    showToast('AirPlay / Cast ready. Start playing an episode to cast.');
  }
}

// Quick Jump / List
function triggerEpisodeListJump() {
  var epSection = document.getElementById('details-episodes-list');
  if (epSection) {
    epSection.scrollIntoView({ behavior: 'smooth' });
    showToast('Scrolled to Episodes');
  }
}

var searchTimer = null;
function handleSearch(query) {
  var overlay = document.getElementById('search-results-section');
  var grid = document.getElementById('search-results-grid');
  if (!overlay || !grid) return;

  if (!query || query.trim().length < 2) {
    overlay.className = 'search-overlay hidden';
    return;
  }

  overlay.className = 'search-overlay';
  grid.innerHTML = '<div style="padding: 24px; text-align: center; color: #94a3b8; width: 100%;">Searching catalog for "' + query + '"...</div>';

  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    fetchCatalog({ q: query }, function(err, data) {
      if (!err && data && data.Page && data.Page.media && data.Page.media.length > 0) {
        renderMediaGrid(data.Page.media, 'search-results-grid');
      } else {
        grid.innerHTML = '<div style="padding: 24px; text-align: center; color: #94a3b8; width: 100%;">No anime found for "' + query + '".</div>';
      }
    });
  }, 250);
}

function setupEvents() {
  var navBtns = document.querySelectorAll('.nav-item');
  for (var i = 0; i < navBtns.length; i++) {
    (function(btn) {
      btn.onclick = function() {
        var view = btn.getAttribute('data-view');
        if (view === 'home') switchView('home');
        else if (view === 'library') {
          switchView('library');
          renderMediaGrid(state.watchlist, 'library-media-grid');
        } else if (view === 'search') {
          var input = document.getElementById('global-search-input');
          if (input) input.focus();
        }
      };
    })(navBtns[i]);
  }

  // Back button
  var btnBack = document.getElementById('btn-details-back');
  if (btnBack) {
    btnBack.onclick = function() { switchView('home'); };
  }

  // Details Top Action Buttons
  var btnCast = document.getElementById('btn-details-cast');
  if (btnCast) btnCast.onclick = triggerCast;

  var btnBell = document.getElementById('btn-details-bell');
  if (btnBell) {
    btnBell.onclick = function() {
      if (state.selectedAnime) {
        var malId = state.selectedAnime.idMal || state.selectedAnime.id;
        toggleNotification(malId);
      }
    };
  }

  var btnFav = document.getElementById('btn-details-favorite');
  if (btnFav) {
    btnFav.onclick = function() {
      if (state.selectedAnime) {
        toggleWatchlist(state.selectedAnime);
      }
    };
  }

  var btnShare = document.getElementById('btn-details-share');
  if (btnShare) btnShare.onclick = shareCurrentAnime;

  var btnSearch = document.getElementById('btn-details-search');
  if (btnSearch) {
    btnSearch.onclick = function() {
      switchView('home');
      var input = document.getElementById('global-search-input');
      if (input) input.focus();
    };
  }

  var btnList = document.getElementById('btn-details-list');
  if (btnList) btnList.onclick = triggerEpisodeListJump;

  // Search input
  var btnSearchToggle = document.getElementById('btn-search-toggle');
  var searchInput = document.getElementById('global-search-input');
  if (btnSearchToggle && searchInput) {
    btnSearchToggle.onclick = function() { searchInput.focus(); };
  }

  if (searchInput) {
    searchInput.oninput = function(e) { handleSearch(e.target.value); };
    searchInput.onkeyup = function(e) { if (e.keyCode === 13) handleSearch(searchInput.value); };
  }

  var btnCloseSearch = document.getElementById('btn-close-search');
  if (btnCloseSearch) {
    btnCloseSearch.onclick = function() {
      var overlay = document.getElementById('search-results-section');
      if (overlay) overlay.className = 'search-overlay hidden';
      if (searchInput) searchInput.value = '';
    };
  }

  var btnSynToggle = document.getElementById('btn-synopsis-toggle');
  if (btnSynToggle) {
    btnSynToggle.onclick = function() {
      var syn = document.getElementById('details-synopsis');
      if (!syn) return;
      if (syn.className.indexOf('clamped') !== -1) {
        syn.className = 'synopsis-text';
        btnSynToggle.textContent = 'Less';
      } else {
        syn.className = 'synopsis-text clamped';
        btnSynToggle.textContent = 'More';
      }
    };
  }

  var serverBtns = document.querySelectorAll('.server-btn');
  for (var s = 0; s < serverBtns.length; s++) {
    (function(btn) {
      var serverHandler = function(e) {
        if (e && e.preventDefault && e.type === 'touchend') e.preventDefault();
        for (var k = 0; k < serverBtns.length; k++) { serverBtns[k].className = 'server-btn'; }
        btn.className = 'server-btn active';
        state.currentServer = btn.getAttribute('data-server');
        var serverName = state.currentServer === 'hianime' ? 'HiAnime' : 'Megavid';
        showToast('Server: ' + serverName);
        if (state.selectedAnime && state.currentEpisode) {
          var malId = state.selectedAnime.idMal || state.selectedAnime.id;
          playEpisodeDirect(malId, state.currentEpisode, encodeURIComponent('Episode ' + state.currentEpisode));
        }
      };
      btn.onclick = serverHandler;
      btn.ontouchend = serverHandler;
    })(serverBtns[s]);
  }

  var audioBtns = document.querySelectorAll('.audio-btn');
  for (var a = 0; a < audioBtns.length; a++) {
    (function(btn) {
      var audioHandler = function(e) {
        if (e && e.preventDefault && e.type === 'touchend') e.preventDefault();
        for (var k = 0; k < audioBtns.length; k++) { audioBtns[k].className = 'audio-btn'; }
        btn.className = 'audio-btn active';
        state.audioType = btn.getAttribute('data-type');
        showToast('Audio set to ' + state.audioType.toUpperCase());
        if (state.selectedAnime && state.currentEpisode) {
          var malId = state.selectedAnime.idMal || state.selectedAnime.id;
          playEpisodeDirect(malId, state.currentEpisode, encodeURIComponent('Episode ' + state.currentEpisode));
        }
      };
      btn.onclick = audioHandler;
      btn.ontouchend = audioHandler;
    })(audioBtns[a]);
  }

  var btnSort = document.getElementById('btn-sort-episodes');
  if (btnSort) {
    btnSort.onclick = function() {
      state.episodesSortAsc = !state.episodesSortAsc;
      var label = document.getElementById('sort-ep-label');
      if (label) label.textContent = state.episodesSortAsc ? 'Ep ↑' : 'Ep ↓';
      if (state.selectedAnime) {
        var malId = state.selectedAnime.idMal || state.selectedAnime.id;
        var totalEps = calculateTotalEpisodes(state.selectedAnime);
        loadEpisodesList(malId, totalEps, false, 1, state.selectedAnime);
      }
    };
  }

  var tabPills = document.querySelectorAll('.tab-pill');
  for (var t = 0; t < tabPills.length; t++) {
    (function(pill) {
      pill.onclick = function() {
        for (var p = 0; p < tabPills.length; p++) { tabPills[p].className = 'tab-pill'; }
        pill.className = 'tab-pill active';
        var filter = pill.getAttribute('data-filter');

        if (filter === 'watchlist') {
          renderMediaGrid(state.watchlist, 'main-media-grid');
        } else {
          fetchCatalog({ type: filter }, function(err, data) {
            if (!err && data && data.Page && data.Page.media) {
              renderMediaGrid(data.Page.media, 'main-media-grid');
            }
          });
        }
      };
    })(tabPills[t]);
  }

  var btnDetailsQuality = document.getElementById('btn-details-quality');
  var detailsQualityMenu = document.getElementById('details-quality-menu');
  if (btnDetailsQuality && detailsQualityMenu) {
    var toggleDetailsMenu = function(e) {
      if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault && e.type === 'touchend') e.preventDefault();
      }
      if (detailsQualityMenu.className.indexOf('hidden') !== -1) {
        detailsQualityMenu.className = 'quality-dropdown';
      } else {
        detailsQualityMenu.className = 'quality-dropdown hidden';
      }
    };
    btnDetailsQuality.onclick = toggleDetailsMenu;
    btnDetailsQuality.ontouchend = toggleDetailsMenu;
  }

  var btnQuality = document.getElementById('btn-quality-toggle');
  var qualityMenu = document.getElementById('quality-dropdown-menu');
  if (btnQuality && qualityMenu) {
    btnQuality.onclick = function(e) {
      e.stopPropagation();
      if (qualityMenu.className.indexOf('hidden') !== -1) {
        qualityMenu.className = 'quality-dropdown';
      } else {
        if (qualityMenu) qualityMenu.className = 'quality-dropdown hidden';
      var dMenu = document.getElementById('details-quality-menu');
      if (dMenu) dMenu.className = 'quality-dropdown hidden';
      }
    };
    document.addEventListener('click', function() {
      if (qualityMenu) qualityMenu.className = 'quality-dropdown hidden';
      var dMenu = document.getElementById('details-quality-menu');
      if (dMenu) dMenu.className = 'quality-dropdown hidden';
    });
  }

  var btnPlayerBack = document.getElementById('btn-player-back');
  if (btnPlayerBack) {
    btnPlayerBack.onclick = function() {
      var modal = document.getElementById('video-player-modal');
      var video = document.getElementById('main-video');
      if (modal) modal.className = 'player-modal hidden';
      if (video) video.pause();
      if (state.hlsPlayer) {
        state.hlsPlayer.destroy();
        state.hlsPlayer = null;
      }
    };
  }

  var doCopy = function() {
    if (!state.currentStreamUrl) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(state.currentStreamUrl);
    }
    showToast('Copied M3U8 link!');
  };
  var btnCopy = document.getElementById('btn-copy-m3u8');
  var btnCopyBar = document.getElementById('btn-copy-stream-url');
  if (btnCopy) btnCopy.onclick = doCopy;
  if (btnCopyBar) btnCopyBar.onclick = doCopy;

  var btnOpenExt = document.getElementById('btn-open-external');
  if (btnOpenExt) {
    btnOpenExt.onclick = function() {
      if (state.currentStreamUrl) {
        var targetUrl = state.currentStreamUrl;
        if (state.selectedQuality && state.selectedQuality !== 'Auto' && state.availableQualities && state.availableQualities.length > 0) {
          targetUrl = getBestQualityUrl(state.availableQualities, state.selectedQuality, state.currentStreamUrl);
        }
        var a = document.createElement('a');
        a.href = targetUrl;
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        showToast('Stream is resolving...');
      }
    };
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setupEvents();
  loadHomeContent();
} else {
  window.onload = function() {
    setupEvents();
    loadHomeContent();
  };
}
