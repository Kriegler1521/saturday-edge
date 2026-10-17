
#!/usr/bin/env python3
"""
Saturday Edge — sportsbook odds updater.

Reads ODDS_API_KEY from GitHub Actions secrets.
Publishes public odds snapshots without exposing the key.

Uses one API request per run for:
- NCAAF
- US bookmakers
- Spreads, totals and moneylines

Never publishes credentials.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from datetime import datetime, timezone
from pathlib import Path

API_URL = (
    "https://api.the-odds-api.com/v4/"
    "sports/americanfootball_ncaaf/odds/"
)

OUTPUT = Path("data/odds.json")


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_output(payload):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    OUTPUT.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8"
    )


def main():
    key = os.environ.get("ODDS_API_KEY", "").strip()

    if not key:
        print("ODDS_API_KEY is missing.")
        sys.exit(1)

    params = urllib.parse.urlencode({
        "apiKey": key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
        "dateFormat": "iso"
    })

    request = urllib.request.Request(
        API_URL + "?" + params,
        headers={
            "User-Agent": "SaturdayEdge/1.0",
            "Accept": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=30
        ) as response:
            raw = json.load(response)

            remaining = response.headers.get(
                "x-requests-remaining"
            )

            used = response.headers.get(
                "x-requests-used"
            )

    except urllib.error.HTTPError as error:
        print(
            "Odds API returned HTTP",
            error.code
        )
        sys.exit(1)

    except Exception as error:
        print("Odds request failed:", error)
        sys.exit(1)

    games = []

    for event in raw:
        bookmakers = []

        for book in event.get("bookmakers", []):
            markets = {}

            for market in book.get("markets", []):
                markets[market["key"]] = {
                    "last_update": market.get(
                        "last_update"
                    ),
                    "outcomes": market.get(
                        "outcomes", []
                    )
                }

            bookmakers.append({
                "key": book.get("key"),
                "title": book.get("title"),
                "last_update": book.get(
                    "last_update"
                ),
                "markets": markets
            })

        games.append({
            "id": event.get("id"),
            "home_team": event.get("home_team"),
            "away_team": event.get("away_team"),
            "commence_time": event.get(
                "commence_time"
            ),
            "bookmakers": bookmakers
        })

    payload = {
        "updated_at": utc_now(),
        "source": "The Odds API",
        "sport": "americanfootball_ncaaf",
        "games": games,
        "quota": {
            "remaining": remaining,
            "used": used
        }
    }

    write_output(payload)

    print(
        "Saved", len(games),
        "games. Credits remaining:",
        remaining
    )


if __name__ == "__main__":
    main()
