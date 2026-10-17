
/* Saturday Edge — Phase 2.2 live scoreboard
   Uses ESPN when cross-origin access is permitted.
   Existing GitHub game data remains the fallback.
*/
(() => {
  'use strict';

  const ESPN =
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

  const REFRESH_MS = 60 * 1000;

  async function getLiveScores() {
    const url = ESPN + '?groups=80&limit=200&_=' + Date.now();

    const response = await fetch(url, {
      cache: 'no-store',
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error('ESPN scoreboard unavailable');
    }

    return response.json();
  }

  function parseGame(event) {
    const competition = event.competitions?.[0];
    const teams = competition?.competitors || [];

    const home = teams.find(t => t.homeAway === 'home');
    const away = teams.find(t => t.homeAway === 'away');

    if (!home || !away) return null;

    const status = event.status?.type || {};

    return {
      id: String(event.id),
      home: {
        id: String(home.team?.id || ''),
        name: home.team?.displayName || 'Unknown',
        abbreviation: home.team?.abbreviation || '',
        logo: home.team?.id
          ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${home.team.id}.png`
          : null,
        score: Number.isFinite(Number(home.score))
          ? Number(home.score)
          : null
      },
      away: {
        id: String(away.team?.id || ''),
        name: away.team?.displayName || 'Unknown',
        abbreviation: away.team?.abbreviation || '',
        logo: away.team?.id
          ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${away.team.id}.png`
          : null,
        score: Number.isFinite(Number(away.score))
          ? Number(away.score)
          : null
      },
      kickoff: event.date,
      status: status.description || 'Scheduled',
      completed: Boolean(status.completed),
      neutral: Boolean(competition.neutralSite),
      prediction: null
    };
  }

  async function refreshLiveScores() {
    const indicator = document.getElementById('sync');

    if (indicator) indicator.textContent = 'Updating scores...';

    try {
      const data = await getLiveScores();

      const games = (data.events || [])
        .map(parseGame)
        .filter(Boolean);

      window.SaturdayEdgeLive = {
        games,
        updatedAt: new Date().toISOString(),
        source: 'ESPN live scoreboard'
      };

      if (indicator) {
        indicator.textContent = 'Live scores updated';
      }

      window.dispatchEvent(
        new CustomEvent('saturday-edge-live-updated', {
          detail: window.SaturdayEdgeLive
        })
      );

    } catch (error) {
      if (indicator) {
        indicator.textContent = 'Using saved game feed';
      }

      console.warn('Live scores unavailable:', error);
    }
  }

  window.SaturdayEdgeRefreshLive = refreshLiveScores;

  refreshLiveScores();

  setInterval(() => {
    if (!document.hidden) refreshLiveScores();
  }, REFRESH_MS);
})();
