
/*
  Saturday Edge — Phase 2.3
  Live college football scoreboard
  Scores, quarters, game clock and update timestamps.
*/

(() => {
  'use strict';

  const ESPN =
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

  const REFRESH_MS = 60 * 1000;

  let requestInProgress = false;

  function parseScore(value) {
    if (value === null || value === undefined) return null;
    if (String(value).trim() === '') return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function parseTeam(competitor) {
    const team = competitor.team || {};

    return {
      id: String(team.id || ''),
      name: team.displayName || 'Unknown',
      abbreviation: team.abbreviation || '',
      logo: team.logo ||
        (team.id
          ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`
          : null),
      score: parseScore(competitor.score)
    };
  }

  function parseGame(event) {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];

    const home = competitors.find(
      team => team.homeAway === 'home'
    );

    const away = competitors.find(
      team => team.homeAway === 'away'
    );

    if (!home || !away) return null;

    const status = event.status || competition.status || {};
    const type = status.type || {};

    const completed = Boolean(type.completed);
    const state = String(type.state || '').toLowerCase();

    const period = Number(status.period) || 0;

    const clock = typeof status.displayClock === 'string'
      ? status.displayClock.trim()
      : '';

    let gamePhase = 'pregame';

    if (completed || state === 'post') {
      gamePhase = 'final';
    } else if (state === 'in') {
      gamePhase = 'live';
    }

    const statusName =
      type.shortDetail ||
      type.detail ||
      type.description ||
      event.status?.type?.description ||
      'Scheduled';

    return {
      id: String(event.id),
      home: parseTeam(home),
      away: parseTeam(away),
      kickoff: event.date,
      status: statusName,
      completed,
      neutral: Boolean(competition.neutralSite),

      // Phase 2.3 live game details
      gamePhase,
      period,
      clock,
      statusDetail: type.shortDetail || '',
      statusName: type.name || '',

      // Keep predictions separate from scoreboard data.
      prediction: null
    };
  }

  async function getLiveScores() {
    const url =
      ESPN +
      '?groups=80&limit=200&_=' +
      Date.now();

    const response = await fetch(url, {
      cache: 'no-store',
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(
        'ESPN returned HTTP ' + response.status
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.events)) {
      throw new Error('Invalid ESPN scoreboard response');
    }

    return data;
  }

  async function refreshLiveScores() {
    if (requestInProgress) return false;

    requestInProgress = true;

    const indicator = document.getElementById('sync');

    if (indicator) {
      indicator.textContent = 'Updating scores...';
    }

    try {
      const data = await getLiveScores();

      const games = data.events
        .map(parseGame)
        .filter(Boolean);

      const updatedAt = new Date().toISOString();

      window.SaturdayEdgeLive = {
        games,
        updatedAt,
        source: 'ESPN live scoreboard'
      };

      window.dispatchEvent(
        new CustomEvent('saturday-edge-live-updated', {
          detail: window.SaturdayEdgeLive
        })
      );

      if (indicator) {
        indicator.textContent = 'Live scores updated';
      }

      return true;

    } catch (error) {
      console.warn(
        'Saturday Edge live scores unavailable:',
        error
      );

      if (indicator) {
        indicator.textContent = 'Using saved game feed';
      }

      return false;

    } finally {
      requestInProgress = false;
    }
  }

  window.SaturdayEdgeRefreshLive = refreshLiveScores;

  // Initial scoreboard request.
  refreshLiveScores();

  // Update every minute while the app is visible.
  setInterval(() => {
    if (!document.hidden) {
      refreshLiveScores();
    }
  }, REFRESH_MS);

  // Refresh after returning to the app.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshLiveScores();
    }
  });
})();
