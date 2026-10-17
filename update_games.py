"""Free scoreboard, team logos and experimental opponent-adjusted ratings.
Only completed games before the current week's start enter the rating fit.
No third-party API keys; no paid calls; no wagering actions.
"""
import json, math, os, re, time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'data'/'games.json'
NOW=datetime.now(timezone.utc)
YEAR=NOW.year
BASE='https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'
HEAD={'User-Agent':'SaturdayEdge/2.0 (personal research; contact via GitHub)','Accept':'application/json'}

def get(params):
    url=BASE+'?'+urlencode(params)
    with urlopen(Request(url,headers=HEAD),timeout=30) as r:
        return json.load(r)

def parse(event):
    comp=(event.get('competitions') or [{}])[0]
    sides=comp.get('competitors') or []
    home=next((s for s in sides if s.get('homeAway')=='home'),None)
    away=next((s for s in sides if s.get('homeAway')=='away'),None)
    if not home or not away:return None
    def team(s):
        t=s.get('team') or {}
        logos=t.get('logos') or []
        logo=next((l.get('href') for l in logos if l.get('href','').startswith('https://')),None)
        # Use a provider-supplied URL only, never construct an unverified logo path.
        return {'id':str(t.get('id','')),'name':t.get('displayName','Unknown'),
                'abbreviation':t.get('abbreviation',''), 'logo':logo,
                'score':int(s['score']) if str(s.get('score','')).isdigit() else None}
    st=(event.get('status') or {}).get('type') or {}
    return {'id':str(event.get('id','')),'home':team(home),'away':team(away),
            'kickoff':event.get('date'), 'status':st.get('description','Unknown'),
            'completed':bool(st.get('completed',False)),
            'neutral':bool(comp.get('neutralSite',False))}

# Query current regular-season weeks separately. Weekly coverage is more reliable
# than relying on a single scoreboard response to contain an entire season.
weeks={}
errors=[]
for week in range(1,17):
    try:
        payload=get({'groups':80,'dates':YEAR,'seasontype':2,'week':week,'limit':200})
        items=[g for ev in payload.get('events',[]) if (g:=parse(ev))]
        if items:weeks[week]=items
    except Exception as exc:
        errors.append(f'Week {week}: {type(exc).__name__}')
    time.sleep(.08)

# Also get the currently advertised scoreboard as a fallback for non-regular-season dates.
try:
    current=[g for ev in get({'groups':80,'limit':200}).get('events',[]) if (g:=parse(ev))]
except Exception as exc:
    current=[];errors.append('Current scoreboard: '+type(exc).__name__)
if not weeks and not current:
    raise RuntimeError('No ESPN scoreboard data; refusing to replace the previous snapshot')

all_games={g['id']:g for week in weeks.values() for g in week}
for g in current:all_games[g['id']]=g

# The week containing the present date is not used for training. This prevents
# completed Saturday games from changing pregame predictions within that week.
week_starts=[]
for w, games in weeks.items():
    dates=[]
    for g in games:
        try:dates.append(datetime.fromisoformat(g['kickoff'].replace('Z','+00:00')))
        except (TypeError,ValueError,AttributeError):pass
    if dates:week_starts.append((w,min(dates)))
active_week=next((w for w,d in sorted(week_starts,key=lambda z:z[1],reverse=True) if d<=NOW),None)
if active_week is None:active_week=min(weeks) if weeks else None
train=[]
for w, games in weeks.items():
    if active_week is not None and w>=active_week:continue
    for g in games:
        if not g['completed']:continue
        h,a=g['home'],g['away']
        if not h['id'] or not a['id'] or h['score'] is None or a['score'] is None:continue
        train.append((h['id'],a['id'],max(-35,min(35,h['score']-a['score'])),0 if g['neutral'] else 2.5))

# Ridge-regularized least-squares on score differences with a fixed HFA.
# Simple batch gradient optimization avoids third-party Python dependencies.
ids=sorted({t for h,a,_,_ in train for t in (h,a)})
ratings={t:0.0 for t in ids}
counts=defaultdict(int)
for h,a,_,_ in train:counts[h]+=1;counts[a]+=1
for _ in range(850):
    gradient=defaultdict(float)
    for h,a,diff,hfa in train:
        err=(ratings[h]-ratings[a]+hfa)-diff
        gradient[h]+=err;gradient[a]-=err
    for t in ids:
        # shrink lightly played teams toward average; 4 pseudo-games
        ratings[t]-=.16*(gradient[t]+4*ratings[t])/(counts[t]+4)
    if ratings:
        mean=sum(ratings.values())/len(ratings)
        for t in ids:ratings[t]-=mean

# Keep future/unstarted games for the present week and near future. Completed
# games are still displayed, but are not represented as pregame forecasts.
selected=[]
for g in all_games.values():
    try:dt=datetime.fromisoformat(g['kickoff'].replace('Z','+00:00'))
    except (ValueError,TypeError,AttributeError):continue
    if NOW-timedelta(days=3)<=dt<=NOW+timedelta(days=12):selected.append(g)
selected.sort(key=lambda g:g['kickoff'])
for g in selected:
    h,a=g['home'],g['away']
    if not g['completed'] and h['id'] in ratings and a['id'] in ratings and counts[h['id']]>=3 and counts[a['id']]>=3:
        home_margin=ratings[h['id']]-ratings[a['id']]+(0 if g['neutral'] else 2.5)
        g['prediction']={'home_margin':round(home_margin,1),'home_spread':round(-home_margin,1),
                         'model':'Experimental opponent-adjusted ridge ratings',
                         'games_home':counts[h['id']],'games_away':counts[a['id']],
                         'trained_through_week':active_week-1 if active_week else None,
                         'calibrated':False}
    else:g['prediction']=None

output={'updated_at':NOW.isoformat(),'source':'ESPN public scoreboard (unofficial)',
        'status':'updated','model_status':'experimental' if len(train)>=30 else 'insufficient_history',
        'training_games':len(train),'training_cutoff':'Before current week',
        'active_week':active_week,'games':selected,'warnings':errors[:5]}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(output,indent=2)+'\n',encoding='utf-8')
print(f'Updated {len(selected)} games; {len(train)} historical training games; {sum(bool(g["prediction"]) for g in selected)} projections')
