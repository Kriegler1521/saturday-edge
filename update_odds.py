
#!/usr/bin/env python3
"""
Saturday Edge — protected sportsbook odds updater.

Uses ODDS_API_KEY from GitHub Actions secrets.
Preserves the last successful snapshot on failure.
Protects a reserve of monthly API credits.
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

CREDIT_RESERVE = 30
STALE_MINUTES = 15


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def parse_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def load_previous():
    if not OUTPUT.exists():
        return {}

    try:
        with OUTPUT.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, ValueError):
        return {}


def save(payload):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)


def snapshot_age_minutes(updated_at):
    if not updated_at:
        return None

    try:
        timestamp = datetime.fromisoformat(
            updated_at.replace("Z", "+00:00")
        )

        age = (
            datetime.now(timezone.utc) - timestamp
        ).total_seconds() / 60

        return max(0, round(age, 1))

    except (TypeError, ValueError):
        return None


def preserve_previous(previous, reason):
    if not previous:
        print(reason)
        sys.exit(1)

    previous["status"] = "stale"
    previous["warning"] = reason
    previous["stale_after_minutes"] = STALE_MINUTES

    # Do not overwrite updated_at. It represents
    # when odds were actually fetched.
    save(previous)

    print(reason)
    print("Previous odds snapshot preserved.")


def main():
    key = os.environ.get(
        "ODDS_API_KEY", ""
    ).strip()

    if not key:
        print("ODDS_API_KEY missing.")
        sys.exit(1)

    previous = load_previous()

    remaining = parse_int(
        previous.get("quota", {}).get("remaining")
    )

    if (
        remaining is not None and
        remaining <= CREDIT_RESERVE
    ):
        preserve_previous(
            previous,
            "Credit reserve reached. Odds refresh paused."
        )
        return

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
            "User-Agent": "SaturdayEdge/1.1",
            "Accept": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=30
        ) as response:
            raw = json.load(response)

            api_remaining = response.headers.get(
                "x-requests-remaining"
            )

            api_used = response.headers.get(
                "x-requests-used"
            )

    except urllib.error.HTTPError as error:
        preserve_previous(
            previous,
            "Odds API HTTP error: " + str(error.code)
        )
        return

    except Exception as error:
        preserve_previous(
            previous,
            "Odds request failed: " + str(error)
        )
        return

    if not isinstance(raw, list):
        preserve_previous(
            previous,
            "Odds API returned unexpected data."
        )
        return

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
        "status": "ok",
        "warning": None,
        "stale_after_minutes": STALE_MINUTES,
        "games": games,
        "quota": {
            "remaining": api_remaining,
            "used": api_used,
            "reserve": CREDIT_RESERVE
        }
    }

    save(payload)

    print(
        "Saved", len(games),
        "games. Credits remaining:",
        api_remaining
    )


if __name__ == "__main__":
    main()
