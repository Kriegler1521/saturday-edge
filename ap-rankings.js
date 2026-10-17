
'use strict';

// Saturday Edge — AP Top 25 rankings
// Retrieves the AP Poll and attaches rankings
// to live scoreboard teams using ESPN team IDs.

(() => {
  const URL =
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings';

  let rankings = new Map();
  let pollInfo = null;

  async function loadRankings() {
    try {
      const response = await fetch(
        URL + '?_=' + Date.now(),
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Rankings unavailable');
      }

      const data = await response.json();

      const apPoll = (data.rankings || []).find(poll =>
        poll.type === 'ap' ||
        poll.name === 'AP Top 25'
      );

      if (!apPoll || !Array.isArray(apPoll.ranks)) {
        throw new Error('AP Top 25 not found');
      }

      const updated = new Map();

      for (const entry of apPoll.ranks) {
        const teamId = String(entry.team?.id || '');
        const rank = Number(entry.current);

        if (
          teamId &&
          Number.isInteger(rank) &&
          rank >= 1 &&
          rank <= 25
        ) {
          updated.set(teamId, rank);
        }
      }

      rankings = updated;

      pollInfo = {
        name: apPoll.name,
        week: apPoll.occurrence?.displayValue || '',
        date: apPoll.date || ''
      };

      applyRankings();

    } catch (error) {
      console.warn(
        'AP rankings unavailable:',
        error
      );
    }
  }

  function applyRankings() {
    const live = window.SaturdayEdgeLive;

    if (!live || !Array.isArray(live.games)) {
      return;
    }

    for (const game of live.games) {
      for (const team of [game.home, game.away]) {
        if (!team) continue;

        team.apRank =
          rankings.get(String(team.id)) ?? null;
      }
    }

    window.SaturdayEdgeAPPoll = pollInfo;

    window.dispatchEvent(
      new CustomEvent('saturday-edge-live-updated', {
        detail: live
      })
    );
  }

  window.addEventListener(
    'saturday-edge-live-updated',
    event => {
      // Avoid responding to our own ranking update.
      if (event.detail?._apRankingsApplied) return;

      const live = event.detail;

      if (!live || !Array.isArray(live.games)) {
        return;
      }

      for (const game of live.games) {
        for (const team of [game.home, game.away]) {
          if (!team) continue;

          team.apRank =
            rankings.get(String(team.id)) ?? null;
        }
      }

      live._apRankingsApplied = true;
    }
  );

  loadRankings();
})();
