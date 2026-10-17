
'use strict';

const $ = id => document.getElementById(id);
const num = id => {
  const v = $(id).value.trim();
  return v === '' ? null : Number(v);
};
const esc = s => String(s ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]
);

const dateFmt = v => {
  if (!v) return 'Unknown';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
};

for (const b of document.querySelectorAll('nav button')) {
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(x => {
      x.classList.toggle('active', x === b);
    });
    document.querySelectorAll('.tab').forEach(x => {
      x.classList.toggle('active', x.id === b.dataset.tab);
    });
  });
}

let savedData = null;
let liveData = null;
let lastLiveSuccess = null;
let refreshing = false;

function teamBadge(t) {
  const ab = esc(t.abbreviation || t.name?.slice(0, 2) || '?');
  const img = t.logo && /^https:\/\//.test(t.logo)
    ? `<img src="${esc(t.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">`
    : '';

  return `<span class="teamlogo">${img}<span class="logofallback" style="${img ? 'display:none' : ''}">${ab}</span></span>`;
}

function teamRow(t) {
  return `<div class="teamrow">${teamBadge(t)}<strong>${esc(t.name)}</strong></div>`;
}

function projectionLabel(g, home, away) {
  const p = g.prediction;
  if (!p || !Number.isFinite(Number(p.home_margin))) {
    return '<div class="projection muted">No model projection available</div>';
  }
  if (g.completed) {
    return '<div class="projection muted">Final — no pregame projection displayed</div>';
  }

  const margin = Number(p.home_margin);
  const favorite = margin >= 0 ? home : away;

  return `<div class="projection">Experimental model: ${esc(favorite.name)} ${margin === 0 ? 'PK' : '-' + Math.abs(margin).toFixed(1)}</div>`;
}

function normalizeTeam(t, score) {
  if (typeof t === 'string') {
    return {
      name: t,
      abbreviation: t.slice(0, 2),
      logo: null,
      score
    };
  }
  return t || {
    name: 'Unknown',
    abbreviation: '?',
    logo: null,
    score: null
  };
}

function isLiveGame(g) {
  const s = String(g.status || '').toLowerCase();

  if (g.completed) return false;

  if (
    s.includes('scheduled') ||
    s.includes('pregame') ||
    s.includes('pre-game') ||
    s.includes('postponed') ||
    s.includes('delayed') ||
    s.includes('canceled')
  ) return false;

  return (
    s.includes('progress') ||
    s.includes('quarter') ||
    s.includes('half') ||
    s.includes('period') ||
    s.includes('end of') ||
    s.includes('overtime') ||
    s.includes('live')
  );
}

function mergeGames() {
  const saved = savedData?.games || [];
  const live = liveData?.games || [];

  const byId = new Map(
    live.map(g => [String(g.id), g])
  );

  const merged = saved.map(g => {
    const update = byId.get(String(g.id));
    if (!update) return g;

    byId.delete(String(g.id));

    const home = normalizeTeam(g.home, g.home_score);
    const away = normalizeTeam(g.away, g.away_score);

    return {
      ...g,
      status: update.status,
      completed: update.completed,
      kickoff: update.kickoff || g.kickoff,
      home: {
        ...home,
        score: update.home?.score ?? home.score,
        logo: home.logo || update.home?.logo
      },
      away: {
        ...away,
        score: update.away?.score ?? away.score,
        logo: away.logo || update.away?.logo
      }
    };
  });

  // Include newly discovered ESPN games without inventing projections.
  for (const g of byId.values()) {
    merged.push(g);
  }

  merged.sort((a, b) =>
    String(a.kickoff || '').localeCompare(String(b.kickoff || ''))
  );

  return merged;
}

function renderGames() {
  const games = mergeGames();

  $('gamecount').textContent = games.length;
  $('lastupdate').textContent = lastLiveSuccess
    ? dateFmt(lastLiveSuccess)
    : savedData?.updated_at
      ? dateFmt(savedData.updated_at)
      : 'Unavailable';

  $('modelinfo').textContent =
    `Custom ratings: ${savedData?.training_games ?? 0} completed training games | ${savedData?.model_status || 'not yet refreshed'} | Experimental projections`;

  $('gamecards').innerHTML = games.length
    ? games.map(g => {
        const home = normalizeTeam(g.home, g.home_score);
        const away = normalizeTeam(g.away, g.away_score);
        const live = isLiveGame(g);

        let scoreBox;

        if (g.completed || live) {
          scoreBox = `
            <div class="score">
              ${away.score == null ? '—' : esc(away.score)}
              :
              ${home.score == null ? '—' : esc(home.score)}
              <small>${g.completed ? 'Final' : 'Live'}</small>
            </div>`;
        } else {
          scoreBox = '<div class="score"><small>Pregame</small></div>';
        }

        return `
          <div class="game">
            <div class="matchup">
              ${teamRow(away)}
              ${teamRow(home)}
              <p>${esc(dateFmt(g.kickoff))} | ${esc(g.status || 'Scheduled')}</p>
              ${projectionLabel(g, home, away)}
            </div>
            ${scoreBox}
          </div>`;
      }).join('')
    : '<div class="panel">No games available. Try Refresh or check GitHub Actions.</div>';
}

async function loadSavedGames() {
  try {
    const response = await fetch(
      './data/games.json?cache=' + Date.now(),
      { cache: 'no-store' }
    );

    if (!response.ok) throw new Error('Saved feed unavailable');

    savedData = await response.json();
    renderGames();
    return true;
  } catch (error) {
    console.warn('Saved game feed unavailable:', error);
    return false;
  }
}

async function refreshScores() {
  if (refreshing) return;

  refreshing = true;

  const button = $('reload');
  button.disabled = true;
  button.textContent = 'Updating...';
  $('sync').textContent = 'Checking live scores...';

  try {
    await loadSavedGames();

    if (typeof window.SaturdayEdgeRefreshLive !== 'function') {
      throw new Error('Live-score module not loaded');
    }

    await window.SaturdayEdgeRefreshLive();

    if (liveData) {
      $('sync').textContent = 'Live updated ' +
        new Date(lastLiveSuccess).toLocaleTimeString(
          'en-US',
          {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit'
          }
        ) + ' ET';
    } else {
      $('sync').textContent = 'Saved feed only';
    }
  } catch (error) {
    console.warn('Live refresh failed:', error);
    $('sync').textContent = 'Saved feed only';
  } finally {
    refreshing = false;
    button.disabled = false;
    button.textContent = 'Refresh';
    renderGames();
  }
}

window.addEventListener('saturday-edge-live-updated', event => {
  const detail = event.detail;

  if (!detail || !Array.isArray(detail.games)) return;

  liveData = detail;
  lastLiveSuccess = detail.updatedAt || new Date().toISOString();

  $('sync').textContent = 'Live scores updated';
  renderGames();
});

$('reload').addEventListener('click', refreshScores);

loadSavedGames().then(() => {
  if (window.SaturdayEdgeLive) {
    liveData = window.SaturdayEdgeLive;
    lastLiveSuccess = liveData.updatedAt || new Date().toISOString();
    renderGames();
  }
});

// The live-scores.js module handles its own 60-second polling.
// Do not start a second polling loop here.

function normalCDF(x) {
  const t = 1 / (1 + .2316419 * Math.abs(x));
  const d = .3989422804014327 * Math.exp(-x * x / 2);
  const p = 1 - d * t * (
    .319381530 + t * (
      -.356563782 + t * (
        1.781477937 + t * (
          -1.821255978 + t * 1.330274429
        )
      )
    )
  );
  return x >= 0 ? p : 1 - p;
}

$('calculate').addEventListener('click', () => {
  const inputs = [
    ['sp', .25],
    ['fpi', .25],
    ['fei', .15],
    ['action', .15],
    ['cfbd', .20]
  ].map(([id, weight]) => ({
    value: num(id),
    weight
  })).filter(x =>
    x.value !== null && Number.isFinite(x.value)
  );

  const spread = num('spread');
  const odds = num('odds');
  const sd = num('sd');

  if (
    inputs.length < 3 ||
    spread === null ||
    !Number.isFinite(spread) ||
    odds === null ||
    !Number.isFinite(odds) ||
    odds === 0 ||
    odds > -100 && odds < 100 ||
    !sd || sd <= 0
  ) {
    $('modelresult').textContent =
      'INCOMPLETE — Enter at least 3 model margins, a valid spread, American odds and positive uncertainty SD.';
    return;
  }

  const total = inputs.reduce((a, x) => a + x.weight, 0);
  const margin = inputs.reduce(
    (a, x) => a + x.value * x.weight, 0
  ) / total;

  const range =
    Math.max(...inputs.map(x => x.value)) -
    Math.min(...inputs.map(x => x.value));

  const cover = normalCDF((margin + spread) / sd);
  const breakeven = odds < 0
    ? -odds / (100 - odds)
    : 100 / (odds + 100);

  const edge = cover - breakeven;
  const roi = cover *
    (odds > 0 ? odds / 100 : 100 / -odds) -
    (1 - cover);

  const advantage = margin + spread;
  const verified =
    $('personnel').value === 'verified' &&
    $('weather').value === 'verified';

  const candidate =
    verified &&
    range <= 7 &&
    advantage >= 2.5 &&
    edge >= .035;

  const state = !verified
    ? 'VERIFY PERSONNEL / WEATHER'
    : candidate
      ? 'RESEARCH CANDIDATE — NOT A BET'
      : 'PASS';

  $('modelresult').textContent =
    `${state}
Consensus: ${margin >= 0 ? '+' : ''}${margin.toFixed(1)} points
Spread advantage: ${advantage >= 0 ? '+' : ''}${advantage.toFixed(1)} points
Estimated cover: ${(cover * 100).toFixed(1)}%
Break-even: ${(breakeven * 100).toFixed(1)}%
Estimated edge: ${(edge * 100).toFixed(1)} percentage points
Estimated ROI: ${(roi * 100).toFixed(1)}%
Model disagreement: ${range.toFixed(1)} pts (${inputs.length}/5 available)

Probabilities are NOT calibrated. Verify sportsbook prices, injuries, weather and source freshness.`;
});

// Private ledger — existing storage key retained.
const key = 'saturday-edge-private-ledger-v1';
let bets = [];

try {
  const value = JSON.parse(localStorage.getItem(key) || '[]');
  bets = Array.isArray(value) ? value : [];
} catch (error) {
  console.warn('Ledger could not be read:', error);
}

function profit(b) {
  if (b.status === 'push') return 0;
  if (b.status === 'loss') return -b.stake;
  if (b.status === 'win') {
    return b.stake *
      (b.odds > 0 ? b.odds / 100 : 100 / -b.odds);
  }
  return null;
}

function renderLedger() {
  $('betcount').textContent = bets.length;

  $('netunits').textContent = bets.reduce(
    (a, b) => a + (profit(b) || 0), 0
  ).toFixed(2);

  $('betlist').innerHTML = bets.length
    ? bets.slice().reverse().map(b => `
      <div class="bet">
        <div>
          <strong>${esc(b.description)}</strong>
          <p>${esc(b.date)} | ${esc(b.status.toUpperCase())} |
          ${esc(b.stake)}u |
          ${b.odds > 0 ? '+' : ''}${esc(b.odds)} |
          ${profit(b) === null ? 'Pending' : profit(b).toFixed(2) + 'u'}</p>
        </div>
        <button data-delete="${esc(b.id)}">Delete</button>
      </div>
    `).join('')
    : '<div class="panel">No wagers saved on this device.</div>';

  document.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => {
      if (confirm('Delete this wager?')) {
        bets = bets.filter(b => b.id !== button.dataset.delete);
        saveLedger();
      }
    });
  });
}

function saveLedger() {
  localStorage.setItem(key, JSON.stringify(bets));
  renderLedger();
}

renderLedger();
$('betdate').value = new Date().toISOString().slice(0, 10);

$('addbet').addEventListener('click', () => {
  const description = $('betname').value.trim();
  const odds = num('betodds');
  const stake = num('stake');

  if (!description || !odds || !stake || stake <= 0) {
    alert('Enter a wager, nonzero odds and positive stake.');
    return;
  }

  bets.push({
    id: Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2),
    date: $('betdate').value,
    description,
    odds,
    stake,
    status: $('betstatus').value
  });

  saveLedger();
  $('betname').value = '';
});

function download(name, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

$('backup').addEventListener('click', () => {
  download(
    'saturday-edge-private-ledger.json',
    JSON.stringify(bets, null, 2),
    'application/json'
  );
});

$('export').addEventListener('click', () => {
  const fields = [
    'date', 'description', 'odds',
    'stake', 'status', 'profit'
  ];

  const quote = value =>
    '"' + String(value ?? '').replace(/"/g, '""') + '"';

  const csv = [
    fields.join(','),
    ...bets.map(b =>
      [
        b.date,
        b.description,
        b.odds,
        b.stake,
        b.status,
        profit(b)
      ].map(quote).join(',')
    )
  ].join('\n');

  download('saturday-edge-ledger.csv', csv, 'text/csv');
});

$('import').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const value = JSON.parse(await file.text());

    if (
      !Array.isArray(value) ||
      !value.every(b =>
        b.description &&
        b.id &&
        Number.isFinite(Number(b.stake))
      )
    ) {
      throw new Error('Invalid ledger format');
    }

    if (
      confirm(
        `Replace this device ledger with ${value.length} imported wagers?`
      )
    ) {
      bets = value;
      saveLedger();
    }
  } catch (error) {
    alert('Import failed: ' + error.message);
  }

  event.target.value = '';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
