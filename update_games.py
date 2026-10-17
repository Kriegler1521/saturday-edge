"""Fetch an ESPN public scoreboard snapshot. No API keys, paid services or private data."""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(__file__).parent / 'data' / 'games.json'
now = datetime.now(timezone.utc)
# Look across a broad near-term window using the current ESPN season/week scoreboard.
url = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=150'
request = Request(url, headers={'User-Agent': 'SaturdayEdge/1.0 (personal schedule dashboard)', 'Accept': 'application/json'})
with urlopen(request, timeout=25) as response:
    payload = json.load(response)
games = []
for event in payload.get('events', []):
    competition = (event.get('competitions') or [{}])[0]
    sides = competition.get('competitors') or []
    home = next((s for s in sides if s.get('homeAway') == 'home'), {})
    away = next((s for s in sides if s.get('homeAway') == 'away'), {})
    if not home or not away:
        continue
    games.append({
        'id': str(event.get('id', '')),
        'home': home.get('team', {}).get('displayName', 'Home'),
        'away': away.get('team', {}).get('displayName', 'Away'),
        'home_score': int(home['score']) if str(home.get('score', '')).isdigit() else None,
        'away_score': int(away['score']) if str(away.get('score', '')).isdigit() else None,
        'kickoff': event.get('date'),
        'status': event.get('status', {}).get('type', {}).get('description', 'Unknown'),
    })
# Preserve a good previous snapshot when endpoint unexpectedly returns no games.
if not games:
    raise RuntimeError('No games returned; refusing to replace existing data')
OUT.write_text(json.dumps({'updated_at': now.isoformat(), 'source': 'ESPN public scoreboard (unofficial)', 'status': 'updated', 'games': games}, indent=2) + '\n')
print(f'Updated {len(games)} games at {now.isoformat()}')
