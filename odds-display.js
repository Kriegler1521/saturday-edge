
'use strict';

// Saturday Edge — Sportsbook Comparison v2
// Uses saved odds snapshots, never a browser-side API key.
// Does not alter scores, predictions, or the private ledger.

(() => {
  const ODDS_URL = './data/odds.json';
  const DEFAULT_STALE_MINUTES = 15;
  const DISPLAY_REFRESH_MS = 60000;

  let oddsFeed = null;

  const escapeHTML = value => String(value ?? '')
    .replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  const normalize = value => String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

  const validNumber = value =>
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value));

  const money = value => {
    if (!validNumber(value)) return 'N/A';
    const number = Number(value);
    return number > 0 ? '+' + number : String(number);
  };

  const points = value => {
    if (!validNumber(value)) return 'N/A';
    const number = Number(value);
    return number > 0 ? '+' + number : String(number);
  };

  const ageMinutes = value => {
    const timestamp = new Date(value).getTime();

    return Number.isFinite(timestamp)
      ? Math.max(0, (Date.now() - timestamp) / 60000)
      : Infinity;
  };

  const dateLabel = value => {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) return 'Unknown';

    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  function stale() {
    const configured = Number(oddsFeed?.stale_after_minutes);

    const threshold = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STALE_MINUTES;

    return !oddsFeed ||
      oddsFeed.status === 'stale' ||
      ageMinutes(oddsFeed.updated_at) > threshold;
  }

  function bookmakerName(book) {
    return book.title || book.key || 'Sportsbook';
  }

  function findBook(game, key) {
    return (game.bookmakers || []).find(book =>
      String(book.key || '').toLowerCase() === key
    ) || null;
  }

  function marketOutcome(book, market, name) {
    return (book?.markets?.[market]?.outcomes || [])
      .find(item => normalize(item.name) === normalize(name)) || null;
  }

  function availablePrices(game, market, name) {
    const prices = [];

    for (const book of game.bookmakers || []) {
      const item = marketOutcome(book, market, name);

      if (!item || !validNumber(item.price)) continue;

      if (
        (market === 'spreads' || market === 'totals') &&
        !validNumber(item.point)
      ) {
        continue;
      }

      prices.push({
        book: bookmakerName(book),
        key: book.key,
        price: Number(item.price),
        point: validNumber(item.point)
          ? Number(item.point)
          : null,
        updatedAt:
          book.markets?.[market]?.last_update ||
          book.last_update ||
          oddsFeed.updated_at
      });
    }

    return prices;
  }

  function bestPrice(prices, market, side) {
    if (!prices.length) return null;

    const sorted = [...prices].sort((a, b) => {
      if (market === 'spreads') {
        return b.point - a.point || b.price - a.price;
      }

      if (market === 'totals') {
        return side === 'Over'
          ? a.point - b.point || b.price - a.price
          : b.point - a.point || b.price - a.price;
      }

      return b.price - a.price;
    });

    return sorted[0];
  }

  function priceText(item, market) {
    if (!item) return '—';

    if (market === 'h2h') {
      return money(item.price);
    }

    const line = market === 'spreads'
      ? points(item.point)
      : String(item.point);

    return line + ' (' + money(item.price) + ')';
  }

  function comparisonRow(label, game, market, name) {
    const prices = availablePrices(game, market, name);
    const best = bestPrice(prices, market, name);

    const fanduel = prices.find(item =>
      item.key === 'fanduel'
    );

    const draftkings = prices.find(item =>
      item.key === 'draftkings'
    );

    if (!prices.length) return '';

    return `
      <div style="
        padding:10px 0;
        border-bottom:1px solid #3c3c42;
      ">
        <div style="
          font-weight:750;
          color:#ffffff;
          margin-bottom:7px;
        ">
          ${escapeHTML(label)}
        </div>

        <div style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
          margin-bottom:7px;
        ">
          <div style="
            background:#17171b;
            border:1px solid #44444a;
            border-radius:8px;
            padding:8px;
          ">
            <div style="
              color:#b8b8c0;
              font-size:11px;
            ">FanDuel</div>
            <strong style="font-size:13px">
              ${escapeHTML(priceText(fanduel, market))}
            </strong>
          </div>

          <div style="
            background:#17171b;
            border:1px solid #44444a;
            border-radius:8px;
            padding:8px;
          ">
            <div style="
              color:#b8b8c0;
              font-size:11px;
            ">DraftKings</div>
            <strong style="font-size:13px">
              ${escapeHTML(priceText(draftkings, market))}
            </strong>
          </div>
        </div>

        <div style="
          font-size:12px;
          color:#ff6976;
        ">
          Best available:
          <strong>
            ${escapeHTML(priceText(best, market))}
          </strong>
          · ${escapeHTML(best.book)}
        </div>
      </div>`;
  }

  function marketDisagreement(game) {
    const notes = [];

    for (const name of [
      game.away_team,
      game.home_team
    ]) {
      const spreads = availablePrices(
        game, 'spreads', name
      );

      if (spreads.length >= 2) {
        const values = spreads.map(item => item.point);

        const range = Math.max(...values) -
          Math.min(...values);

        if (range >= 1.5) {
          notes.push(
            name + ': ' + range.toFixed(1) +
            '-point spread difference'
          );
        }
      }
    }

    const totals = availablePrices(
      game, 'totals', 'Over'
    );

    if (totals.length >= 2) {
      const values = totals.map(item => item.point);

      const range = Math.max(...values) -
        Math.min(...values);

      if (range >= 2.5) {
        notes.push(
          range.toFixed(1) +
          '-point totals difference'
        );
      }
    }

    if (!notes.length) return '';

    return `
      <div style="
        margin-top:10px;
        padding:9px;
        background:#321b21;
        border-left:3px solid #e32636;
        border-radius:6px;
        font-size:12px;
      ">
        <strong>MARKET DISAGREEMENT — RESEARCH ONLY</strong>
        <div>${notes.map(escapeHTML).join('<br>')}</div>
        <div style="opacity:.8;margin-top:4px">
          Differences can reflect stale or suspended markets.
          Not proof of a betting edge.
        </div>
      </div>`;
  }

  function matchGame(awayName, homeName) {
    if (!Array.isArray(oddsFeed?.games)) return null;

    const away = normalize(awayName);
    const home = normalize(homeName);

    return oddsFeed.games.find(game =>
      normalize(game.away_team) === away &&
      normalize(game.home_team) === home
    ) || null;
  }

  function gameOddsHTML(game, phase) {
    const rows = [
      comparisonRow(
        game.away_team + ' spread',
        game, 'spreads', game.away_team
      ),
      comparisonRow(
        game.home_team + ' spread',
        game, 'spreads', game.home_team
      ),
      comparisonRow(
        game.away_team + ' moneyline',
        game, 'h2h', game.away_team
      ),
      comparisonRow(
        game.home_team + ' moneyline',
        game, 'h2h', game.home_team
      ),
      comparisonRow(
        'Over',
        game, 'totals', 'Over'
      ),
      comparisonRow(
        'Under',
        game, 'totals', 'Under'
      )
    ].filter(Boolean).join('');

    if (!rows) return '';

    const phaseWarning = phase === 'live'
      ? 'GAME IN PROGRESS — NOT VERIFIED LIVE BETTING ODDS'
      : phase === 'final'
        ? 'GAME FINAL — HISTORICAL SNAPSHOT'
        : 'PREGAME MARKET SNAPSHOT';

    return `
      <div class="sportsbook-odds"
        style="
          margin-top:12px;
          padding:12px;
          border:1px solid #44444a;
          border-radius:10px;
          font-size:13px;
          line-height:1.5;
        ">
        <strong>Sportsbook comparison</strong>

        <div style="
          font-size:11px;
          color:${stale() ? '#ff6976' : '#b8b8c0'};
          margin:5px 0 8px;
        ">
          ${stale() ? 'STALE SNAPSHOT · ' : ''}
          ${phaseWarning}
        </div>

        ${rows}

        ${marketDisagreement(game)}

        <div style="
          margin-top:10px;
          font-size:11px;
          color:#b8b8c0;
        ">
          Snapshot: ${escapeHTML(dateLabel(oddsFeed.updated_at))}
          <br>
          Prices are not guaranteed current.
          Verify in the sportsbook before betting.
        </div>
      </div>`;
  }

  function renderBanner() {
    if (!oddsFeed) return;

    const cards = document.getElementById('gamecards');
    if (!cards) return;

    let banner = document.getElementById('odds-status');

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'odds-status';
      banner.style.cssText = [
        'padding:12px',
        'margin-bottom:12px',
        'border:1px solid #44444a',
        'border-radius:10px',
        'font-size:13px',
        'line-height:1.6'
      ].join(';');

      cards.parentNode.insertBefore(banner, cards);
    }

    const remaining = oddsFeed.quota?.remaining ?? 'Unknown';
    const reserve = oddsFeed.quota?.reserve ?? 30;

    banner.innerHTML = `
      <strong>Sportsbook odds</strong>
      <div>
        ${stale()
          ? '⚠️ STALE — Prices require verification'
          : 'Latest saved market snapshot'}
      </div>
      <div>
        Updated: ${escapeHTML(dateLabel(oddsFeed.updated_at))}
      </div>
      <div>
        Free credits remaining:
        <strong>${escapeHTML(remaining)}</strong>
        · Reserve: ${escapeHTML(reserve)}
      </div>
      <div style="font-size:11px;opacity:.75">
        Odds update on the GitHub schedule.
        Refreshing scores does not request new odds.
      </div>`;
  }

  function gamePhase(card) {
    const text = card.querySelector('.score')?.textContent || '';

    if (/final/i.test(text)) return 'final';

    if (
      /q[1-4]|halftime|overtime|\bot\b/i.test(text)
    ) {
      return 'live';
    }

    return 'pregame';
  }

  function renderOdds() {
    if (!oddsFeed) return;

    const cards = document.getElementById('gamecards');
    if (!cards) return;

    renderBanner();

    for (const card of cards.querySelectorAll('.game')) {
      const names = [
        ...card.querySelectorAll('.teamrow strong')
      ].map(node => node.textContent.trim());

      if (names.length !== 2) continue;

      const game = matchGame(names[0], names[1]);
      const existing = card.querySelector('.sportsbook-odds');

      if (!game) {
        if (existing) existing.remove();
        continue;
      }

      const html = gameOddsHTML(game, gamePhase(card));

      if (!html) {
        if (existing) existing.remove();
        continue;
      }

      if (existing) {
        if (existing.outerHTML !== html) {
          existing.outerHTML = html;
        }
      } else {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        card.appendChild(wrapper.firstElementChild);
      }
    }
  }

  async function loadOdds() {
    try {
      const response = await fetch(
        ODDS_URL + '?cache=' + Date.now(),
        { cache: 'no-store' }
      );

      if (!response.ok) throw new Error('Odds feed unavailable');

      const data = await response.json();

      if (!Array.isArray(data.games)) {
        throw new Error('Invalid odds feed');
      }

      oddsFeed = data;
      renderOdds();

    } catch (error) {
      console.warn('Odds unavailable:', error);
    }
  }

  function start() {
    const cards = document.getElementById('gamecards');
    if (!cards) return;

    const observer = new MutationObserver(renderOdds);

    observer.observe(cards, {
      childList: true,
      subtree: false
    });

    loadOdds();

    // Update freshness warnings without API requests.
    setInterval(renderOdds, DISPLAY_REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
