/* ============================================================
   Movies Dashboard — app.js
   Fetches CSV files listed in data/index.json, parses them
   client-side, and renders the dashboard.
   Works on any static host (Netlify, Vercel, GitHub Pages).
   ============================================================ */

const TMDB_BASE = 'https://image.tmdb.org/t/p/w300';

// ── State ───────────────────────────────────────────────────
let allMovies = [];
let filtered  = [];

// ── DOM refs ────────────────────────────────────────────────
const emptyState   = document.getElementById('empty-state');
const dashboard    = document.getElementById('dashboard');
const movieGrid    = document.getElementById('movie-grid');
const searchInput  = document.getElementById('search');
const genreFilter  = document.getElementById('genre-filter');
const langFilter   = document.getElementById('lang-filter');
const statusFilter = document.getElementById('status-filter');
const sortFilter   = document.getElementById('sort-filter');
const yearFrom     = document.getElementById('year-from');
const yearTo       = document.getElementById('year-to');
const clearBtn     = document.getElementById('clear-filters');
const resultsCount = document.getElementById('results-count');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const modalClose   = document.getElementById('modal-close');
const statusDot    = document.getElementById('status-dot');
const statusText   = document.getElementById('status-text');
const scTotal      = document.getElementById('sc-total');
const scPopularity = document.getElementById('sc-popularity');
const scRating     = document.getElementById('sc-rating');
const scBudget     = document.getElementById('sc-budget');
const scRevenue    = document.getElementById('sc-revenue');

// ── Status indicator ────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = `dot dot-${state}`;
  statusText.textContent = text;
}

// ── CSV files to load from the data/ folder ─────────────────
// To add more files, just add their names to this array.
// e.g. ['movies.csv', 'movies2.csv']
const CSV_FILES = [
  'movies.csv'
];

// ── Boot: fetch all CSV files ────────────────────────────────
async function init() {
  setStatus('loading', 'Loading data…');
  try {
    const results = await Promise.all(
      CSV_FILES.map(name =>
        fetch(`data/${name}`)
          .then(r => { if (!r.ok) throw new Error(`${name} not found`); return r.text(); })
          .then(parseCSV)
          .catch(() => [])
      )
    );
    allMovies = results.flat().filter(m => m.title || m.original_title);

    if (!allMovies.length) {
      setStatus('idle', 'No data found — upload a CSV to the data/ folder');
      return;
    }

    setStatus('live', `${allMovies.length.toLocaleString()} movies loaded`);
    buildFilters();
    applyFilters();
    emptyState.classList.add('hidden');
    dashboard.classList.remove('hidden');

  } catch (err) {
    setStatus('error', 'Could not load data');
    console.error(err);
  }
}

// ── CSV Parser ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── TMDB JSON field helpers ──────────────────────────────────
function extractNames(str) {
  if (!str) return [];
  try {
    const arr = JSON.parse(str.replace(/'/g, '"'));
    if (Array.isArray(arr)) return arr.map(o => o.name).filter(Boolean);
  } catch (_) {}
  const m1 = [...str.matchAll(/'name':\s*'([^']+)'/g)];
  if (m1.length) return m1.map(m => m[1]);
  return [...str.matchAll(/"name":\s*"([^"]+)"/g)].map(m => m[1]);
}

function extractDirectors(str) {
  if (!str) return [];
  try {
    const arr = JSON.parse(str.replace(/'/g, '"'));
    if (Array.isArray(arr))
      return arr.filter(p => p.job === 'Director').map(p => p.name).filter(Boolean);
  } catch (_) {}
  const jobs  = [...str.matchAll(/'job':\s*'([^']+)'/g)].map(m => m[1]);
  const names = [...str.matchAll(/'name':\s*'([^']+)'/g)].map(m => m[1]);
  return jobs.reduce((a, j, i) => { if (j === 'Director' && names[i]) a.push(names[i]); return a; }, []);
}

// ── Helpers ──────────────────────────────────────────────────
function fmtMoney(v) {
  const n = parseFloat(v);
  if (!n || isNaN(n)) return 'N/A';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K';
  return '$' + n;
}
function fmtRuntime(m) {
  if (!m || isNaN(m)) return 'N/A';
  const h = Math.floor(m/60), mn = m%60;
  return h > 0 ? `${h}h ${mn}m` : `${mn}m`;
}
function releaseYear(d) { return d ? (d.split('-')[0] || d.slice(0,4)) : ''; }
function avgField(arr, key) {
  const vals = arr.map(m => parseFloat(m[key])).filter(v => v && !isNaN(v) && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function sumField(arr, key) {
  return arr.reduce((s, m) => { const v = parseFloat(m[key]); return s + (v && !isNaN(v) ? v : 0); }, 0);
}
function posterSrc(p) {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return TMDB_BASE + (p.startsWith('/') ? p : '/' + p);
}
function escH(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Build filter dropdowns ───────────────────────────────────
function buildFilters() {
  const genres = new Set(), langs = new Set(), statuses = new Set();
  allMovies.forEach(m => {
    extractNames(m.genres).forEach(g => genres.add(g));
    if (m.original_language) langs.add(m.original_language.toUpperCase());
    if (m.status) statuses.add(m.status);
  });
  const rebuild = (el, items, label) => {
    const prev = el.value;
    el.innerHTML = `<option value="">${label}</option>`;
    [...items].sort().forEach(v => {
      const o = document.createElement('option');
      o.value = v.toLowerCase(); o.textContent = v;
      el.appendChild(o);
    });
    el.value = prev;
  };
  rebuild(genreFilter,  genres,   'All Genres');
  rebuild(langFilter,   langs,    'All Languages');
  rebuild(statusFilter, statuses, 'All Statuses');
}

// ── Scorecards ───────────────────────────────────────────────
function updateScorecards(movies) {
  scTotal.textContent      = movies.length.toLocaleString();
  scPopularity.textContent = sumField(movies, 'popularity').toFixed(0);
  scRating.textContent     = avgField(movies, 'vote_average').toFixed(1) + ' ★';
  scBudget.textContent     = fmtMoney(avgField(movies, 'budget'));
  scRevenue.textContent    = fmtMoney(avgField(movies, 'revenue'));
}

// ── Filter + sort ────────────────────────────────────────────
function applyFilters() {
  const q      = searchInput.value.toLowerCase();
  const genre  = genreFilter.value;
  const lang   = langFilter.value;
  const status = statusFilter.options[statusFilter.selectedIndex].text;
  const sort   = sortFilter.value;
  const yFrom  = yearFrom.value ? parseInt(yearFrom.value, 10) : null;
  const yTo    = yearTo.value   ? parseInt(yearTo.value,   10) : null;

  filtered = allMovies.filter(m => {
    if (q) {
      const hay = [m.title, m.original_title,
        ...extractNames(m.cast).slice(0,5),
        ...extractDirectors(m.crew)
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (genre  && !extractNames(m.genres).map(g=>g.toLowerCase()).includes(genre)) return false;
    if (lang   && (m.original_language||'').toLowerCase() !== lang) return false;
    if (statusFilter.value && m.status !== status) return false;
    const yr = parseInt(releaseYear(m.release_date), 10);
    if (yFrom && yr && yr < yFrom) return false;
    if (yTo   && yr && yr > yTo)   return false;
    return true;
  });

  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'rating-desc':     return (parseFloat(b.vote_average)||0) - (parseFloat(a.vote_average)||0);
        case 'rating-asc':      return (parseFloat(a.vote_average)||0) - (parseFloat(b.vote_average)||0);
        case 'year-desc':       return (parseInt(releaseYear(b.release_date))||0) - (parseInt(releaseYear(a.release_date))||0);
        case 'year-asc':        return (parseInt(releaseYear(a.release_date))||0) - (parseInt(releaseYear(b.release_date))||0);
        case 'popularity-desc': return (parseFloat(b.popularity)||0) - (parseFloat(a.popularity)||0);
        case 'revenue-desc':    return (parseFloat(b.revenue)||0)    - (parseFloat(a.revenue)||0);
        case 'title-asc':       return (a.title||'').localeCompare(b.title||'');
        default: return 0;
      }
    });
  }

  resultsCount.textContent = filtered.length.toLocaleString();
  updateScorecards(filtered);
  renderGrid(filtered);
}

searchInput.addEventListener('input',   applyFilters);
genreFilter.addEventListener('change',  applyFilters);
langFilter.addEventListener('change',   applyFilters);
statusFilter.addEventListener('change', applyFilters);
sortFilter.addEventListener('change',   applyFilters);
yearFrom.addEventListener('input',      applyFilters);
yearTo.addEventListener('input',        applyFilters);
clearBtn.addEventListener('click', () => {
  searchInput.value = genreFilter.value = langFilter.value =
  statusFilter.value = sortFilter.value = yearFrom.value = yearTo.value = '';
  applyFilters();
});

// ── Render grid ──────────────────────────────────────────────
function renderGrid(movies) {
  movieGrid.innerHTML = '';
  if (!movies.length) {
    movieGrid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:3rem 0;">No movies match your filters.</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  movies.forEach((m, idx) => {
    const card   = document.createElement('div');
    card.className = 'movie-card';
    const src    = posterSrc(m.poster_path);
    const year   = releaseYear(m.release_date);
    const rating = parseFloat(m.vote_average) || 0;
    const genres = extractNames(m.genres).slice(0, 2);

    card.innerHTML = `
      ${src
        ? `<img class="movie-poster" src="${escH(src)}" alt="${escH(m.title||'')}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="poster-fallback" style="display:none">🎬</div>`
        : `<div class="poster-fallback">🎬</div>`}
      <div class="movie-info">
        <div class="movie-title">${escH(m.title||m.original_title||'Untitled')}</div>
        <div class="movie-meta">
          ${rating ? `<span class="badge rating">★ ${rating.toFixed(1)}</span>` : ''}
          ${year   ? `<span>${year}</span>` : ''}
        </div>
        ${genres.length ? `<div class="movie-meta">${genres.map(g=>`<span class="badge">${escH(g)}</span>`).join('')}</div>` : ''}
      </div>`;
    card.addEventListener('click', () => openModal(idx));
    frag.appendChild(card);
  });
  movieGrid.appendChild(frag);
}

// ── Modal ────────────────────────────────────────────────────
function openModal(idx) {
  const m        = filtered[idx];
  const src      = posterSrc(m.poster_path);
  const year     = releaseYear(m.release_date);
  const genres   = extractNames(m.genres);
  const cast     = extractNames(m.cast).slice(0, 8);
  const dirs     = extractDirectors(m.crew);
  const kws      = extractNames(m.keywords).slice(0, 12);
  const comps    = extractNames(m.production_companies).slice(0, 4);
  const cntrys   = extractNames(m.production_countries);
  const langs    = extractNames(m.spoken_languages);
  const runtime  = parseFloat(m.runtime);
  const budget   = parseFloat(m.budget);
  const revenue  = parseFloat(m.revenue);
  const votes    = parseInt(m.vote_count, 10);
  const rating   = parseFloat(m.vote_average);

  modalContent.innerHTML = `
    <div class="modal-top">
      <div class="modal-poster">
        ${src
          ? `<img src="${escH(src)}" alt="${escH(m.title||'')}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="poster-fallback" style="display:none">🎬</div>`
          : `<div class="poster-fallback">🎬</div>`}
      </div>
      <div class="modal-meta">
        <h2>${escH(m.title||m.original_title||'Untitled')}</h2>
        ${m.original_title && m.original_title !== m.title
          ? `<div style="color:var(--muted);font-size:.85rem;margin-bottom:.4rem">${escH(m.original_title)}</div>` : ''}
        ${m.tagline ? `<div class="tagline">"${escH(m.tagline)}"</div>` : ''}
        <div class="modal-stats">
          ${rating  ? `<div class="stat-pill">⭐ <strong>${rating.toFixed(1)}</strong> / 10</div>` : ''}
          ${votes   ? `<div class="stat-pill">🗳️ <strong>${votes.toLocaleString()}</strong> votes</div>` : ''}
          ${year    ? `<div class="stat-pill">📅 <strong>${year}</strong></div>` : ''}
          ${runtime && !isNaN(runtime) ? `<div class="stat-pill">⏱ <strong>${fmtRuntime(runtime)}</strong></div>` : ''}
          ${budget  > 0 ? `<div class="stat-pill">💰 Budget <strong>${fmtMoney(budget)}</strong></div>` : ''}
          ${revenue > 0 ? `<div class="stat-pill">💵 Revenue <strong>${fmtMoney(revenue)}</strong></div>` : ''}
          ${m.original_language ? `<div class="stat-pill">🌐 <strong>${m.original_language.toUpperCase()}</strong></div>` : ''}
          ${m.status ? `<div class="stat-pill">${escH(m.status)}</div>` : ''}
        </div>
        ${genres.length ? `<div class="tag-row">${genres.map(g=>`<span class="tag">${escH(g)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
    ${m.overview   ? `<p class="overview">${escH(m.overview)}</p>` : ''}
    ${dirs.length  ? `<div class="detail-section"><h4>Director${dirs.length>1?'s':''}</h4><p>${dirs.map(escH).join(', ')}</p></div>` : ''}
    ${cast.length  ? `<div class="detail-section"><h4>Cast</h4><p>${cast.map(escH).join(', ')}</p></div>` : ''}
    ${comps.length ? `<div class="detail-section"><h4>Production</h4><p>${comps.map(escH).join(', ')}</p></div>` : ''}
    ${cntrys.length? `<div class="detail-section"><h4>Countries</h4><p>${cntrys.map(escH).join(', ')}</p></div>` : ''}
    ${langs.length ? `<div class="detail-section"><h4>Spoken Languages</h4><p>${langs.map(escH).join(', ')}</p></div>` : ''}
    ${kws.length   ? `<div class="detail-section"><h4>Keywords</h4><div class="tag-row">${kws.map(k=>`<span class="tag">${escH(k)}</span>`).join('')}</div></div>` : ''}
    ${m.homepage   ? `<div class="detail-section"><h4>Homepage</h4><p><a href="${escH(m.homepage)}" target="_blank" rel="noopener" style="color:var(--accent)">${escH(m.homepage)}</a></p></div>` : ''}
  `;
  modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Start ────────────────────────────────────────────────────
init();
