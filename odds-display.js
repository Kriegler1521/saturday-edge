
'use strict';

// Saturday Edge — Sportsbook odds display.
// Reads public data/odds.json, never the private API key.
// Designed to work alongside the existing app.js.

(() => {
  const ODDS_URL = './data/odds.json';
  const STALE_AFTER_MINUTES = 15;

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

  const money = value => {
    const number = Number(value);

    if (!Number.isFinite(number)) return 'N/A';

    return number > 0 ? '+' + number : String(number);
  };

  const points = value => {
    const number = Number(value);

    if (!Number.isFinite(number)) return 'N/A';

    return number > 0
      ? '+' + number
      : String(number);
  };

  const ageMinutes = value => {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) return Infinity;

    return Math.max(0, (Date.now() - date.getTime()) / 60000);
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

  function isStale() {
    return !oddsFeed ||
      oddsFeed.status === 'stale' ||
      ageMinutes(oddsFeed.updated_at) >
        (Number(oddsFeed.stale_after_minutes) ||
         STALE_AFTER_MINUTES);
  }

  function outcome(book, marketKey, teamName) {
    const outcomes =
      book.markets?.[marketKey]?.outcomes || [];

    return outcomes.find(item =>
      normalize(item.name) === normalize(teamName)
    );
  }

  function bestSpread(game, teamName) {
    const candidates = [];

    for (const book of game.bookmakers || []) {
      const item = outcome(book, 'spreads', teamName);

      if (
        item &&
        Number.isFinite(Number(item.point)) &&
        Number.isFinite(Number(item.price))
      ) {
        candidates.push({
          point: Number(item.point),
          price: Number(item.price),
          book: book.title || book.key || 'Sportsbook'
        });
      }
    }

    candidates.sort((a, b) =>
      b.point - a.point ||
      b.price - a.price
    );

    return candidates[0] || null;
  }

  function bestMoneyline(game, teamName) {
    const candidates = [];

    for (const book of game.bookmakers || []) {
      const item = outcome(book, 'h2h', teamName);

      if (
        item &&
        Number.isFinite(Number(item.price))
      ) {
        candidates.push({
          price: Number(item.price),
          book: book.title || book.key || 'Sportsbook'
        });
      }
    }

    candidates.sort((a, b) => b.price - a.price);

    return candidates[0] || null;
  }

  function bestTotal(game, side) {
    const candidates = [];

    for (const book of game.bookmakers || []) {
      const item = outcome(book, 'totals', side);

      if (
        item &&
        Number.isFinite(Number(item.point)) &&
        Number.isFinite(Number(item.price))
      ) {
        candidates.push({
          point: Number(item.point),
          price: Number(item.price),
          book: book.title || book.key || 'Sportsbook'
        });
      }
    }

    candidates.sort((a, b) =>
      side === 'Over'
        ? a.point - b.point || b.price - a.price
        : b.point - a.point || b.price - a.price
    );

    return candidates[0] || null;
  }

  function matchGame(awayName, homeName) {
    if (!oddsFeed?.games) return null;

    // Require both teams to match. Do not guess
    // based on just one team or kickoff time.
    return oddsFeed.games.find(game => {
      const home = normalize(game.home_team);
      const away = normalize(game.away_team);
      const displayedHome = normalize(homeName);
      const displayedAway = normalize(awayName);

      return home === displayedHome &&
        away === displayedAway;
    }) || null;
  }

  function oddsLine(label, item, format) {
    if (!item) return '';

    return `
      <div style="margin-top:5px">
        <strong>${escapeHTML(label)}:</strong>
        ${escapeHTML(format(item))}
        <span style="opacity:.75">
          · ${escapeHTML(item.book)}
        </span>
      </div>`;
  }

  function gameOddsHTML(game) {
    const away = game.away_team;
    const home = game.home_team;

    const awaySpread = bestSpread(game, away);
    const homeSpread = bestSpread(game, home);

    const awayML = bestMoneyline(game, away);
    const homeML = bestMoneyline(game, home);

    const over = bestTotal(game, 'Over');
    const under = bestTotal(game, 'Under');

    const stale = isStale();

    const content = [
      oddsLine(
        away + ' spread',
        awaySpread,
        item => points(item.point) + ' (' + money(item.price) + ')'
      ),
      oddsLine(
        home + ' spread',
        homeSpread,
        item => points(item.point) + ' (' + money(item.price) + ')'
      ),
      oddsLine(
        away + ' ML',
        awayML,
        item => money(item.price)
      ),
      oddsLine(
        home + ' ML',
        homeML,
        item => money(item.price)
      ),
      oddsLine(
        'Over',
        over,
        item => item.point + ' (' + money(item.price) + ')'
      ),
      oddsLine(
        'Under',
        under,
        item => item.point + ' (' + money(item.price) + ')'
      )
    ].join('');

    if (!content) return '';

    return `
      <div class="sportsbook-odds"
        style="
          margin-top:12px;
          padding:12px;
          border:1px solid rgba(140,140,140,.35);
          border-radius:10px;
          font-size:13px;
          line-height:1.6;
        ">
        <strong>Sportsbook comparison</strong>
        <div style="font-size:11px;opacity:.8">
          ${stale ? 'STALE SNAPSHOT — NOT LIVE' : 'Latest saved snapshot'}
        </div>
        ${content}
        <div style="
          margin-top:8px;
          font-size:11px;
          opacity:.75;
        ">
          Prices checked ${escapeHTML(
            dateLabel(oddsFeed.updated_at)
          )}.
          Verify in sportsbook before betting.
        </div>
      </div>`;
  }

  function renderBanner() {
    const cards = document.getElementById('gamecards');
    if (!cards || !oddsFeed) return;

    let banner = document.getElementById('odds-status');

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'odds-status';
      banner.style.cssText = [
        'padding:12px',
        'margin-bottom:12px',
        'border:1px solid rgba(140,140,140,.35)',
        'border-radius:10px',
        'font-size:13px',
        'line-height:1.6'
      ].join(';');

      cards.parentNode.insertBefore(banner, cards);
    }

    const remaining = oddsFeed.quota?.remaining ?? 'Unknown';
    const reserve = oddsFeed.quota?.reserve ?? 30;
    const stale = isStale();

    banner.innerHTML = `
      <strong>Sportsbook odds</strong>
      <div>
        ${stale
          ? '⚠️ Odds are stale — verify all prices'
          : 'Latest saved sportsbook snapshot'}
      </div>
      <div>
        Updated: ${escapeHTML(dateLabel(oddsFeed.updated_at))}
      </div>
      <div>
        Free API credits remaining:
        <strong>${escapeHTML(remaining)}</strong>
        · Reserve: ${escapeHTML(reserve)}
      </div>
      <div style="opacity:.75;font-size:11px">
        Odds refresh through GitHub Actions,
        not the scoreboard Refresh button.
      </div>`;
  }

  function renderOdds() {
    const cards = document.getElementById('gamecards');
    if (!cards || !oddsFeed) return;

    renderBanner();

    for (const card of cards.querySelectorAll('.game')) {
      const names = [
        ...card.querySelectorAll('.teamrow strong')
      ].map(node => node.textContent.trim());

      if (names.length < 2) continue;

      const [awayName, homeName] = names;

      const matchingGame = matchGame(awayName, homeName);

      const existing = card.querySelector('.sportsbook-odds');

      if (!matchingGame) {
        if (existing) existing.remove();
        continue;
      }

      const html = gameOddsHTML(matchingGame);

      if (!html) continue;

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

      if (!response.ok) throw new Error('Odds unavailable');

      const data = await response.json();

      if (!Array.isArray(data.games)) {
        throw new Error('Invalid odds feed');
      }

      oddsFeed = data;
      renderOdds();

    } catch (error) {
      console.warn('Sportsbook odds unavailable:', error);
    }
  }

  function start() {
    const cards = document.getElementById('gamecards');

    if (!cards) return;

    // Existing app.js replaces the game cards when
    // ESPN scores refresh. Restore odds after that.
    const observer = new MutationObserver(() => {
      renderOdds();
    });

    observer.observe(cards, {
      childList: true,
      subtree: false
    });

    loadOdds();

    // Re-check the stale warning every minute.
    setInterval(renderBanner, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
