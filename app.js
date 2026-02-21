/* ========================================================
   SPORTS 408 — Bay Area Sports TV
   Main application logic
   ======================================================== */

// ─── Team config ───
const TEAMS = {
  warriors:   { name: 'Warriors',    abbrev: 'GS',   color: '#1D428A', accent: '#FFC72C' },
  giants:     { name: 'Giants',      abbrev: 'SF',   color: '#FD5A1E', accent: '#27251F' },
  sharks:     { name: 'Sharks',      abbrev: 'SJ',   color: '#006D75', accent: '#000000' },
  '49ers':    { name: '49ers',       abbrev: 'SF',   color: '#AA0000', accent: '#B3995D' },
  stanford:   { name: 'Stanford',    abbrev: 'SU',   color: '#8C1515', accent: '#FFFFFF' },
  cal:        { name: 'Cal',         abbrev: 'CAL',  color: '#003262', accent: '#FDB515' },
  santaclara: { name: 'Santa Clara', abbrev: 'SCU',  color: '#862633', accent: '#FFFFFF' },
  sjsu:       { name: 'San Jose St', abbrev: 'SJSU', color: '#0055A2', accent: '#E5A823' },
  earthquakes:{ name: 'Earthquakes', abbrev: 'SJ',  color: '#0067B1', accent: '#000000' },
};

// ─── Channel order (only teams with content get a channel) ───
const CHANNEL_ORDER = ['warriors', 'giants', '49ers', 'sharks', 'earthquakes', 'cal', 'santaclara'];

// ─── State ───
let moments = {};
let todayMoments = [];
let allMoments = [];
let activePlaylist = [];
let currentIndex = -1;
let player = null;
let playerReady = false;
let progressInterval = null;
let pendingVideoId = null;
let channels = [];
let currentChannel = 0;

// ─── URL Routing ───
function getDateKeyFromURL() {
  const path = window.location.pathname;
  const match = path.match(/^\/thisday\/(\d{2}-\d{2})$/);
  if (match) return match[1];
  return null;
}

function getActiveDate() {
  return getDateKeyFromURL() || getTodayKey();
}

function formatDateLabel(mmdd) {
  const [mm, dd] = mmdd.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  return `${months[mm - 1]} ${dd}`;
}

function updatePageTitle(mmdd) {
  const label = formatDateLabel(mmdd);
  document.title = `This Day in the 408 — ${label} | SPORTS 408`;
}

// ─── Init ───
async function init() {
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Load moments data
  const res = await fetch('/data/moments.json');
  moments = await res.json();

  // Flatten all moments — only include entries that have a video
  allMoments = Object.entries(moments).flatMap(([date, items]) =>
    items.filter(m => m.youtubeId).map(m => ({ ...m, date }))
  );

  // Get active date from URL or today — only moments with videos
  const activeDate = getActiveDate();
  todayMoments = (moments[activeDate] || [])
    .filter(m => m.youtubeId)
    .map(m => ({ ...m, date: activeDate }));

  // Update page title
  updatePageTitle(activeDate);

  // Update banner with date context
  const bannerText = document.querySelector('.banner-text');
  if (bannerText) {
    bannerText.textContent = `THIS DAY IN THE 408 — ${formatDateLabel(activeDate).toUpperCase()}`;
  }

  // Render initial random moments
  renderRandomCards();

  // Load YouTube IFrame API
  loadYouTubeAPI();

  // Build channel list, populate dropdown, and activate CH 1 (THIS DAY)
  buildChannels();
  renderChannelSelector();
  currentChannel = 0;
  activePlaylist = todayMoments;
  renderPlaylist();
  updateChannelDisplay();

  // Wire up controls
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-random').addEventListener('click', renderRandomCards);
  document.getElementById('ch-prev').addEventListener('click', () => switchChannel(-1));
  document.getElementById('ch-next').addEventListener('click', () => switchChannel(1));
  document.getElementById('btn-volume').addEventListener('click', toggleMute);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-hd').addEventListener('click', toggleHD);
  initScrubbing();

  // Auto-play first moment from the active playlist
  if (activePlaylist.length > 0) {
    window.selectMoment(0);
  } else if (allMoments.length > 0) {
    // No moments for this date — pick a random one
    const pick = allMoments[Math.floor(Math.random() * allMoments.length)];
    loadMoment(pick);
  }
}

// ─── Date helpers ───
function getTodayKey() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function updateDateTime() {
  const now = new Date();
  document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  }).toUpperCase();
  document.getElementById('current-time').textContent =
    now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' PT';
}

// ─── Playlist ───
function renderPlaylist() {
  const container = document.getElementById('playlist');

  if (activePlaylist.length === 0) {
    const ch = channels[currentChannel] || {};
    const msg = ch.type === 'thisday'
      ? 'No highlights found for today.'
      : ch.type === 'team'
      ? `No moments for ${ch.label}.`
      : 'No moments loaded.';
    container.innerHTML = `
      <div class="playlist-empty">
        <span class="empty-icon">📺</span>
        <p>${msg}</p>
        <p class="empty-hint">Try another channel!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = activePlaylist.map((m, i) => {
    const team = TEAMS[m.team] || { name: m.team, abbrev: '?', color: '#4a90d9' };
    const isActive = i === currentIndex;
    return `
      <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${i}" onclick="selectMoment(${i})">
        <span class="year-badge">${m.year}</span>
        <span class="team-logo" style="background: ${team.color}">${team.abbrev}</span>
        <div class="item-details">
          <div class="item-title">${m.title}</div>
          <div class="item-subtitle">${m.subtitle}</div>
          ${isActive ? '<span class="now-indicator">NOW PLAYING ▶</span>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Select & play a moment ───
window.selectMoment = function(index) {
  currentIndex = index;
  const moment = activePlaylist[index];
  if (!moment) return;

  loadMoment(moment);
  renderPlaylist();
};

function loadMoment(moment) {
  const team = TEAMS[moment.team] || { name: moment.team, color: '#4a90d9' };
  const overlay = document.getElementById('video-overlay');

  // Update overlay score
  const scoreEl = document.getElementById('overlay-score');
  scoreEl.textContent = moment.score || moment.title;

  // Update overlay game info
  const gameEl = document.getElementById('overlay-game');
  gameEl.textContent = `${moment.subtitle}${moment.year ? ' · ' + moment.year : ''}`;

  // Update YouTube link
  const ytLink = document.getElementById('overlay-yt');
  if (moment.youtubeId) {
    ytLink.href = `https://www.youtube.com/watch?v=${moment.youtubeId}`;
    ytLink.style.display = '';
  } else {
    ytLink.style.display = 'none';
  }

  // Show overlay
  overlay.classList.add('visible');

  // Load video or show alternative display
  if (moment.noEmbed && moment.youtubeId) {
    // Blocked from embedding — show preview card with YouTube link
    if (playerReady && player.stopVideo) player.stopVideo();
    clearInterval(progressInterval);
    document.getElementById('progress-fill').style.width = '0%';
    const noSignal = document.getElementById('no-signal');
    noSignal.classList.remove('hidden');
    noSignal.querySelector('.no-signal-text').innerHTML = `
      <div class="no-embed-card">
        <span class="no-embed-icon">🏈</span>
        <p class="no-embed-title">${moment.score || moment.title}</p>
        <p class="no-embed-sub">${moment.subtitle} · ${moment.year}</p>
        <p class="no-embed-desc">${moment.description}</p>
        <a class="no-embed-yt-btn" href="https://www.youtube.com/watch?v=${moment.youtubeId}" target="_blank" rel="noopener">
          ▶ Watch on YouTube
        </a>
      </div>
    `;
  } else if (moment.youtubeId && playerReady) {
    document.getElementById('no-signal').classList.add('hidden');
    player.loadVideoById(moment.youtubeId);
    startProgress();
  } else if (moment.youtubeId) {
    // Player not ready yet — queue it for when API loads
    pendingVideoId = moment.youtubeId;
    document.getElementById('no-signal').classList.add('hidden');
  } else {
    // No YouTube ID — show moment description
    const noSignal = document.getElementById('no-signal');
    noSignal.classList.remove('hidden');
    noSignal.querySelector('.no-signal-text').innerHTML = `
      <span class="signal-icon">🏟️</span>
      <p>${moment.year} · ${team.name}</p>
      <p class="signal-sub">${moment.description}</p>
    `;
  }
}

// ─── Navigation ───
function playNext() {
  if (activePlaylist.length === 0) return;
  const newIndex = currentIndex >= activePlaylist.length - 1 ? 0 : currentIndex + 1;
  window.selectMoment(newIndex);
}

function togglePlay() {
  if (!playerReady || !player) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
    document.getElementById('btn-play').textContent = '▶';
  } else {
    player.playVideo();
    document.getElementById('btn-play').textContent = '⏸';
  }
}

// ─── Volume ───
function toggleMute() {
  if (!playerReady || !player) return;
  const btn = document.getElementById('btn-volume');
  if (player.isMuted()) {
    player.unMute();
    btn.textContent = '🔊';
  } else {
    player.mute();
    btn.textContent = '🔇';
  }
}

// ─── Fullscreen ───
function toggleFullscreen() {
  const container = document.querySelector('.crt-glass');
  if (!container) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    container.requestFullscreen().catch(() => {});
  }
}

// ─── HD Quality ───
function toggleHD() {
  if (!playerReady || !player) return;
  const btn = document.getElementById('btn-hd');
  const quality = player.getPlaybackQuality();
  if (quality === 'hd720' || quality === 'hd1080') {
    player.setPlaybackQuality('default');
    btn.classList.remove('active');
  } else {
    player.setPlaybackQuality('hd720');
    btn.classList.add('active');
  }
}

// ─── Progress bar ───
function startProgress() {
  clearInterval(progressInterval);
  const fill = document.getElementById('progress-fill');
  fill.style.width = '0%';

  progressInterval = setInterval(() => {
    if (!playerReady || !player) return;
    const duration = player.getDuration();
    const current = player.getCurrentTime();
    if (duration > 0) {
      fill.style.width = `${(current / duration) * 100}%`;
    }
  }, 500);
}

function seekToPosition(e) {
  if (!playerReady || !player) return;
  const track = document.querySelector('.progress-track');
  const rect = track.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const duration = player.getDuration();
  if (duration > 0) {
    player.seekTo(ratio * duration, true);
    document.getElementById('progress-fill').style.width = `${ratio * 100}%`;
  }
}

function initScrubbing() {
  const track = document.querySelector('.progress-track');
  let dragging = false;

  track.addEventListener('click', seekToPosition);

  track.addEventListener('mousedown', (e) => {
    dragging = true;
    seekToPosition(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (dragging) seekToPosition(e);
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });
}

// ─── Channels ───
function buildChannels() {
  // CH 1: THIS DAY (special)
  const list = [
    { number: 1, type: 'thisday', label: 'THIS DAY', color: '#4a90d9' },
  ];

  // CH 2–N: Team channels (only teams with video moments)
  const teamSet = new Set(allMoments.map(m => m.team));
  let n = 2;
  for (const teamKey of CHANNEL_ORDER) {
    if (!teamSet.has(teamKey)) continue;
    const team = TEAMS[teamKey];
    list.push({
      number: n++,
      type: 'team',
      teamKey,
      team,
      label: team.name.toUpperCase(),
      color: channelColor(team),
    });
  }

  // Last CH: RANDOM (special)
  list.push({ number: n, type: 'random', label: 'RANDOM', color: '#e0e0e0' });

  channels = list;
}

// Pick a visible color for dark backgrounds (use accent if bright enough, else primary color)
function channelColor(team) {
  const dark = ['#000000', '#000', '#27251F'];
  if (dark.includes(team.accent)) return team.color;
  return team.accent || team.color;
}

function getChannelMoments(ch) {
  if (ch.type === 'thisday') return todayMoments;
  if (ch.type === 'random') return [...allMoments].sort(() => Math.random() - 0.5);
  // team channel
  return allMoments.filter(m => m.team === ch.teamKey);
}

function renderChannelSelector() {
  const select = document.getElementById('channel-select');
  select.innerHTML = channels.map((ch, i) =>
    `<option value="${i}">CH ${ch.number} \u00b7 ${ch.label}</option>`
  ).join('');

  select.addEventListener('change', () => {
    currentChannel = parseInt(select.value, 10);
    activateChannel();
  });
}

function syncChannelDropdown() {
  const select = document.getElementById('channel-select');
  if (select) select.value = currentChannel;
}

function switchChannel(direction) {
  if (channels.length === 0) return;
  currentChannel = (currentChannel + direction + channels.length) % channels.length;
  activateChannel();
}

function activateChannel() {
  const ch = channels[currentChannel];
  const clr = ch.color;

  // Update CRT channel display
  const display = document.getElementById('ch-display');
  display.textContent = `CH ${ch.number} \u00b7 ${ch.label}`;
  display.style.color = clr;
  display.style.textShadow = `0 0 8px ${clr}88, 0 0 20px ${clr}44`;

  // Sync sidebar dropdown
  syncChannelDropdown();

  // Build this channel's playlist
  activePlaylist = getChannelMoments(ch);
  currentIndex = 0;
  renderPlaylist();

  // Auto-play first moment
  if (activePlaylist.length > 0) {
    window.selectMoment(0);
  }
}

function updateChannelDisplay() {
  if (channels.length === 0) return;
  const ch = channels[currentChannel];
  const clr = ch.color;
  const display = document.getElementById('ch-display');
  display.textContent = `CH ${ch.number} \u00b7 ${ch.label}`;
  display.style.color = clr;
  display.style.textShadow = `0 0 8px ${clr}88, 0 0 20px ${clr}44`;
  syncChannelDropdown();
}

// ─── Random moments ───
function renderRandomCards() {
  const container = document.getElementById('random-cards');
  if (allMoments.length === 0) {
    container.innerHTML = '<span style="color:#6a7a8a;font-size:11px">No moments loaded</span>';
    return;
  }

  // Pick 3 random unique moments
  const shuffled = [...allMoments].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, 3);

  container.innerHTML = picks.map(m => {
    const team = TEAMS[m.team] || { name: m.team, abbrev: '?', color: '#4a90d9' };
    // Dark gradient with team color tint as placeholder for photos
    const bgStyle = `background: linear-gradient(135deg, ${team.color}dd 0%, ${team.color}88 40%, #1a2a3a 100%)`;
    return `
      <div class="random-card" onclick="loadRandomMoment('${m.id}')">
        <div class="card-bg" style="${bgStyle}"></div>
        <div class="card-content">
          <span class="card-year-badge">${m.year}</span>
          <div class="card-bottom">
            <span class="card-team-logo" style="background: ${team.color}">${team.abbrev}</span>
            <div class="card-text">
              <div class="card-title">${m.title.split(' vs ')[0] || team.name}</div>
              <div class="card-player">${m.player || ''}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.loadRandomMoment = function(id) {
  const moment = allMoments.find(m => m.id === id);
  if (!moment) return;

  currentIndex = -1;
  loadMoment(moment);
  renderRandomCards();
};

// ─── YouTube IFrame API ───
function loadYouTubeAPI() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
  player = new YT.Player('youtube-player', {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      fs: 1,
    },
    events: {
      onReady: () => {
        playerReady = true;
        console.log('[408sports] YouTube player ready');
        // Load any video that was queued before player was ready
        if (pendingVideoId) {
          player.cueVideoById(pendingVideoId);
          pendingVideoId = null;
        }
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          document.getElementById('btn-play').textContent = '⏸';
        } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
          document.getElementById('btn-play').textContent = '▶';
        }
        if (e.data === YT.PlayerState.ENDED) {
          playNext();
        }
      },
    },
  });
};

// ─── Boot ───
init();
