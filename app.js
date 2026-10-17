
'use strict';

// Saturday Edge — Phase 2.5
// Live scores, AP rankings, records, predictions and private ledger.

const $ = id => document.getElementById(id);

const num = id => {
  const value = $(id).value.trim();
  return value === '' ? null : Number(value);
};

const esc = value => String(value ?? '').replace(
  /[&<>"']/g,
  char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]
);

function dateFmt(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function timeFmt(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit'
  }) + ' ET';
}

// Navigation
for (const button of document.querySelectorAll('nav button')) {
  button.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.id === button.dataset.tab);
    });
  });
}

// Scoreboard state
let savedData = null;
let liveData = null;
let lastLiveSuccess = null;
let refreshing = false;

function teamBadge(team) {
  const abbreviation = esc(
    team.abbreviation || team.name?.slice(0, 2) || '?'
  );

  const image = team.logo && /^https:\/\//.test(team.logo)
    ? `<img src="${esc(team.logo)}"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">`
    : '';

  return `
    <span class="teamlogo">
      ${image}
      <span class="logofallback"
        style="${image ? 'display:none' : ''}">
        ${abbreviation}
      </span>
    </span>`;
}

function verifiedAPRank(team) {
  // Only use apRank populated from an explicitly AP-labeled source.
  const rank = Number(team.apRank);

  return Number.isInteger(rank) &&
    rank >= 1 &&
    rank <= 25
      ? rank
      : null;
}

function teamRow(team) {
  const rank = verifiedAPRank(team);

  const record = typeof team.record === 'string' &&
    /^\d+\s*-\s*\d+(?:\s*-\s*\d+)?$/.test(team.record.trim())
      ? team.record.trim()
      : '';

  const rankHTML = rank === null ? '' : `
    <span
      aria-label="AP rank ${rank}"
      title="AP Top 25"
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex-shrink:0;
        min-width:27px;
        padding:2px 5px;
        border-radius:5px;
        background:#3a2026;
        color:#ff6976;
        font-size:12px;
        font-weight:800;
      "
    >${rank}</span>`;

  const recordHTML = record ? `
    <span style="
      font-size:11px;
      color:#a9a9b1;
      font-weight:400;
      white-space:nowrap;
    ">(${esc(record)})</span>` : '';

  return `
    <div class="teamrow">
      ${teamBadge(team)}
      <span style="
        display:flex;
        align-items:center;
        gap:6px;
        flex-wrap:wrap;
        min-width:0;
      ">
        ${rankHTML}
        <strong>${esc(team.name)}</strong>
        ${recordHTML}
      </span>
    </div>`;
}

function normalizeTeam(team, fallbackScore) {
  if (typeof team === 'string') {
    return {
      name: team,
      abbreviation: team.slice(0, 2),
      logo: null,
      score: fallbackScore ?? null,
      apRank: null,
      record: ''
    };
  }

  return team || {
    name: 'Unknown',
    abbreviation: '?',
    logo: null,
    score: null,
    apRank: null,
    record: ''
  };
}

function projectionLabel(game, home, away) {
  const prediction = game.prediction;

  if (
    !prediction ||
    !Number.isFinite(Number(prediction.home_margin))
  ) {
    return '<div class="projection muted">No model projection available</div>';
  }

  if (game.completed) {
    return '<div class="projection muted">Final</div>';
  }

  const margin = Number(prediction.home_margin);
  const favorite = margin >= 0 ? home : away;

  const spread = margin === 0
    ? 'PK'
    : '-' + Math.abs(margin).toFixed(1);

  return `
    <div class="projection">
      Experimental model: ${esc(favorite.name)} ${spread}
    </div>`;
}

function quarterLabel(period) {
  const number = Number(period);

  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }

  if (number <= 4) return 'Q' + number;

  return number === 5
    ? 'OT'
    : (number - 4) + 'OT';
}

function gamePhase(game) {
  if (game.completed || game.gamePhase === 'final') {
    return 'final';
  }

  if (game.gamePhase === 'live') return 'live';
  if (game.gamePhase === 'pregame') return 'pregame';

  const status = String(game.status || '').toLowerCase();

  if (
    status.includes('final') ||
    status.includes('completed')
  ) {
    return 'final';
  }

  if (
    status.includes('progress') ||
    status.includes('quarter') ||
    status.includes('half') ||
    status.includes('overtime') ||
    status.includes('live')
  ) {
    return 'live';
  }

  return 'pregame';
}

function liveStatus(game) {
  const phase = gamePhase(game);

  if (phase === 'final') return 'FINAL';
  if (phase === 'pregame') return 'PREGAME';

  const statusName = String(
    game.statusName || ''
  ).toLowerCase();

  const detail = String(
    game.statusDetail || game.status || ''
  );

  if (
    statusName.includes('halftime') ||
    detail.toLowerCase().includes('halftime')
  ) {
    return 'HALFTIME';
  }

  const quarter = quarterLabel(game.period);
  const clock = String(game.clock || '').trim();

  if (quarter && clock) {
    return quarter + ' · ' + clock;
  }

  if (quarter) return quarter;

  return detail || 'LIVE';
}

function mergeGames() {
  const saved = savedData?.games || [];
  const live = liveData?.games || [];

  const byId = new Map(
    live.map(game => [String(game.id), game])
  );

  const merged = saved.map(game => {
    const update = byId.get(String(game.id));

    if (!update) return game;

    byId.delete(String(game.id));

    const home = normalizeTeam(
      game.home,
      game.home_score
    );

    const away = normalizeTeam(
      game.away,
      game.away_score
    );

    return {
      ...game,
      status: update.status,
      completed: update.completed,
      kickoff: update.kickoff || game.kickoff,

      gamePhase: update.gamePhase,
      period: update.period,
      clock: update.clock,
      statusDetail: update.statusDetail,
      statusName: update.statusName,

      home: {
        ...home,
        score: update.home?.score ?? home.score,
        logo: home.logo || update.home?.logo,
        apRank: update.home?.apRank ?? home.apRank ?? null,
        record: update.home?.record || home.record || ''
      },

      away: {
        ...away,
        score: update.away?.score ?? away.score,
        logo: away.logo || update.away?.logo,
        apRank: update.away?.apRank ?? away.apRank ?? null,
        record: update.away?.record || away.record || ''
      },

      // Preserve the existing experimental prediction.
      prediction: game.prediction
    };
  });

  for (const game of byId.values()) {
    merged.push(game);
  }

  merged.sort((a, b) =>
    String(a.kickoff || '').localeCompare(
      String(b.kickoff || '')
    )
  );

  return merged;
}

function renderGames() {
  const games = mergeGames();

  $('gamecount').textContent = games.length;

  $('lastupdate').textContent = lastLiveSuccess
    ? timeFmt(lastLiveSuccess)
    : savedData?.updated_at
      ? timeFmt(savedData.updated_at)
      : 'Unavailable';

  $('modelinfo').textContent =
    `Custom ratings: ${savedData?.training_games ?? 0} completed training games | ` +
    `${savedData?.model_status || 'not yet refreshed'} | ` +
    `Experimental projections`;

  $('gamecards').innerHTML = games.length
    ? games.map(game => {
        const home = normalizeTeam(
          game.home,
          game.home_score
        );

        const away = normalizeTeam(
          game.away,
          game.away_score
        );

        const phase = gamePhase(game);
        const status = liveStatus(game);

        let scoreBox;

        if (phase === 'live' || phase === 'final') {
          scoreBox = `
            <div class="score">
              ${away.score == null ? '—' : esc(away.score)}
              :
              ${home.score == null ? '—' : esc(home.score)}
              <small>${esc(status)}</small>
            </div>`;
        } else {
          scoreBox = `
            <div class="score">
              <small>PREGAME</small>
            </div>`;
        }

        const updateNote =
          phase === 'live' && lastLiveSuccess
            ? `<div class="fine">
                Score checked ${esc(timeFmt(lastLiveSuccess))}
              </div>`
            : '';

        return `
          <div class="game">
            <div class="matchup">
              ${teamRow(away)}
              ${teamRow(home)}
              <p>
                ${esc(dateFmt(game.kickoff))}
                |
                ${esc(game.status || 'Scheduled')}
              </p>
              ${projectionLabel(game, home, away)}
              ${updateNote}
            </div>
            ${scoreBox}
          </div>`;
      }).join('')
    : '<div class="panel">No games available. Try Refresh.</div>';
}

async function loadSavedGames() {
  try {
    const response = await fetch(
      './data/games.json?cache=' + Date.now(),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Saved feed unavailable');
    }

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

    if (
      typeof window.SaturdayEdgeRefreshLive !== 'function'
    ) {
      throw new Error('Live-score module not loaded');
    }

    const success =
      await window.SaturdayEdgeRefreshLive();

    $('sync').textContent = success
      ? 'Live updated ' + timeFmt(lastLiveSuccess)
      : 'Using saved game feed';

  } catch (error) {
    console.warn('Live refresh failed:', error);
    $('sync').textContent = 'Using saved game feed';

  } finally {
    refreshing = false;
    button.disabled = false;
    button.textContent = 'Refresh';
    renderGames();
  }
}

window.addEventListener(
  'saturday-edge-live-updated',
  event => {
    const detail = event.detail;

    if (!detail || !Array.isArray(detail.games)) {
      return;
    }

    liveData = detail;

    lastLiveSuccess =
      detail.updatedAt || new Date().toISOString();

    $('sync').textContent =
      'Live updated ' + timeFmt(lastLiveSuccess);

    renderGames();
  }
);

$('reload').addEventListener(
  'click',
  refreshScores
);

loadSavedGames().then(() => {
  if (window.SaturdayEdgeLive) {
    liveData = window.SaturdayEdgeLive;

    lastLiveSuccess =
      liveData.updatedAt || new Date().toISOString();

    renderGames();
  }
});

// live-scores.js handles automatic polling.
// Do not create another timer here.

// Five-model research calculator
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
  })).filter(item =>
    item.value !== null &&
    Number.isFinite(item.value)
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
    (odds > -100 && odds < 100) ||
    !sd ||
    sd <= 0
  ) {
    $('modelresult').textContent =
      'INCOMPLETE — Enter at least 3 model margins, ' +
      'a valid spread, American odds and positive uncertainty SD.';
    return;
  }

  const total = inputs.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  const margin = inputs.reduce(
    (sum, item) => sum + item.value * item.weight,
    0
  ) / total;

  const range =
    Math.max(...inputs.map(item => item.value)) -
    Math.min(...inputs.map(item => item.value));

  const cover = normalCDF(
    (margin + spread) / sd
  );

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

Probabilities are NOT calibrated. Verify sportsbook prices,
injuries, weather and source freshness.`;
});

// Private betting ledger
// Keep this exact key to preserve existing wagers.
const key = 'saturday-edge-private-ledger-v1';

let bets = [];

try {
  const value = JSON.parse(
    localStorage.getItem(key) || '[]'
  );

  bets = Array.isArray(value) ? value : [];

} catch (error) {
  console.warn('Ledger could not be read:', error);
}

function profit(bet) {
  if (bet.status === 'push') return 0;
  if (bet.status === 'loss') return -bet.stake;

  if (bet.status === 'win') {
    return bet.stake * (
      bet.odds > 0
        ? bet.odds / 100
        : 100 / -bet.odds
    );
  }

  return null;
}

function renderLedger() {
  $('betcount').textContent = bets.length;

  $('netunits').textContent = bets.reduce(
    (sum, bet) => sum + (profit(bet) || 0),
    0
  ).toFixed(2);

  $('betlist').innerHTML = bets.length
    ? bets.slice().reverse().map(bet => `
      <div class="bet">
        <div>
          <strong>${esc(bet.description)}</strong>
          <p>
            ${esc(bet.date)}
            |
            ${esc(bet.status.toUpperCase())}
            |
            ${esc(bet.stake)}u
            |
            ${bet.odds > 0 ? '+' : ''}${esc(bet.odds)}
            |
            ${profit(bet) === null
              ? 'Pending'
              : profit(bet).toFixed(2) + 'u'}
          </p>
        </div>
        <button data-delete="${esc(bet.id)}">
          Delete
        </button>
      </div>
    `).join('')
    : '<div class="panel">No wagers saved on this device.</div>';

  document.querySelectorAll(
    '[data-delete]'
  ).forEach(button => {
    button.addEventListener('click', () => {
      if (confirm('Delete this wager?')) {
        bets = bets.filter(
          bet => bet.id !== button.dataset.delete
        );

        saveLedger();
      }
    });
  });
}

function saveLedger() {
  localStorage.setItem(
    key,
    JSON.stringify(bets)
  );

  renderLedger();
}

renderLedger();

$('betdate').value =
  new Date().toISOString().slice(0, 10);

$('addbet').addEventListener('click', () => {
  const description =
    $('betname').value.trim();

  const odds = num('betodds');
  const stake = num('stake');

  if (
    !description ||
    !odds ||
    !stake ||
    stake <= 0
  ) {
    alert(
      'Enter a wager, nonzero odds and positive stake.'
    );
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
  const blob = new Blob(
    [data],
    { type: mime }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = name;
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 500);
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
    'date',
    'description',
    'odds',
    'stake',
    'status',
    'profit'
  ];

  const quote = value =>
    '"' + String(value ?? '')
      .replace(/"/g, '""') + '"';

  const csv = [
    fields.join(','),
    ...bets.map(bet =>
      [
        bet.date,
        bet.description,
        bet.odds,
        bet.stake,
        bet.status,
        profit(bet)
      ].map(quote).join(',')
    )
  ].join('\n');

  download(
    'saturday-edge-ledger.csv',
    csv,
    'text/csv'
  );
});

$('import').addEventListener(
  'change',
  async event => {
    const file = event.target.files[0];

    if (!file) return;

    try {
      const value = JSON.parse(
        await file.text()
      );

      if (
        !Array.isArray(value) ||
        !value.every(bet =>
          bet.description &&
          bet.id &&
          Number.isFinite(Number(bet.stake))
        )
      ) {
        throw new Error(
          'Invalid ledger format'
        );
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
      alert(
        'Import failed: ' + error.message
      );
    }

    event.target.value = '';
  }
);

// Progressive web app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .catch(() => {});
}
