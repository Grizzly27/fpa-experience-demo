"""Privacy-respecting analytics for the demo site (anonymous unless a visitor volunteers an email).

POST /collect   public. Batched events from the browser tracker. No IPs or names are stored;
                location comes from CloudFront viewer headers (country / region / city).
GET  /stats     owner only. Requires header x-admin-key matching the SSM SecureString.
                Returns pre-aggregated metrics for the Traffic dashboard.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
ssm = boto3.client("ssm")

PARAM = os.environ["ADMIN_KEY_PARAM"]
ALLOWED_ORIGINS = set(os.environ["ALLOWED_ORIGINS"].split(","))
RETENTION_DAYS = 90
TYPES = {"session_start", "page_view", "heartbeat", "persona", "action", "lead"}
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[a-z]{2,24}$", re.I)
ID_RE = re.compile(r"^[a-z0-9-]{8,40}$")
BOT_RE = re.compile(r"bot|crawl|spider|headless|preview|lighthouse|monitor", re.I)

_key_cache: tuple[float, bytes | None] = (0.0, None)


# ---------------- helpers ----------------

def cors(origin: str | None) -> dict:
    h = {"vary": "origin", "cache-control": "no-store"}
    if origin in ALLOWED_ORIGINS:
        h.update({
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "content-type,x-admin-key",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-max-age": "600",
        })
    return h


def resp(status: int, body, origin: str | None) -> dict:
    return {"statusCode": status, "headers": {"content-type": "application/json", **cors(origin)}, "body": json.dumps(body)}


def admin_key_digest() -> bytes | None:
    """SHA-256 of the owner passphrase, cached for 60s so a new passphrase applies within a minute."""
    global _key_cache
    if time.time() - _key_cache[0] < 60:
        return _key_cache[1]
    try:
        value = ssm.get_parameter(Name=PARAM, WithDecryption=True)["Parameter"]["Value"]
        digest = hashlib.sha256(value.encode()).digest() if len(value) >= 12 else None
    except ssm.exceptions.ParameterNotFound:
        digest = None
    _key_cache = (time.time(), digest)
    return digest


def authorized(headers: dict) -> bool:
    expected = admin_key_digest()
    given = headers.get("x-admin-key", "")
    if not expected or not given:
        return False
    return hmac.compare_digest(hashlib.sha256(given.encode()).digest(), expected)


def parse_ua(ua: str) -> tuple[str, str, str]:
    device = "Tablet" if re.search(r"ipad|tablet", ua, re.I) else "Mobile" if re.search(r"mobi|iphone|android", ua, re.I) else "Desktop"
    browser = next((b for p, b in [(r"edg/", "Edge"), (r"opr/|opera", "Opera"), (r"firefox|fxios", "Firefox"),
                                   (r"chrome|crios", "Chrome"), (r"safari", "Safari")] if re.search(p, ua, re.I)), "Other")
    os_ = next((o for p, o in [(r"windows", "Windows"), (r"iphone|ipad|ios", "iOS"), (r"mac os x|macintosh", "macOS"),
                               (r"android", "Android"), (r"linux", "Linux")] if re.search(p, ua, re.I)), "Other")
    return device, browser, os_


def clean(v, n: int = 80) -> str:
    return re.sub(r"[\x00-\x1f]", "", str(v or ""))[:n]


# ---------------- collect ----------------

def collect(event: dict, headers: dict, origin: str | None) -> dict:
    ua = headers.get("user-agent", "")
    if origin not in ALLOWED_ORIGINS or BOT_RE.search(ua):
        return resp(204, None, origin) | {"body": ""}
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8", "replace")
    if len(raw) > 16_000:
        return resp(413, {"error": "too large"}, origin)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return resp(400, {"error": "bad json"}, origin)

    device, browser, os_ = parse_ua(ua)
    geo = {
        "country": clean(headers.get("cloudfront-viewer-country"), 2),
        "region": clean(unquote(headers.get("cloudfront-viewer-country-region-name", "") or headers.get("cloudfront-viewer-country-region", "")), 40),
        "city": clean(unquote(headers.get("cloudfront-viewer-city", "")), 40),
    }
    now = datetime.now(timezone.utc)
    ttl = int((now + timedelta(days=RETENTION_DAYS)).timestamp())
    events = payload.get("events", [])[:25] if isinstance(payload, dict) else []
    with table.batch_writer() as batch:
        for e in events:
            if not isinstance(e, dict) or e.get("t") not in TYPES:
                continue
            v, s = clean(e.get("v"), 40), clean(e.get("s"), 40)
            if not (ID_RE.match(v) and ID_RE.match(s)):
                continue
            ts = now.isoformat(timespec="milliseconds")
            item = {
                "pk": f"D#{now:%Y-%m-%d}", "sk": f"{ts}#{secrets.token_hex(3)}", "ttl": ttl,
                "ts": ts, "t": e["t"], "v": v, "s": s,
                "p": clean(e.get("p"), 80), "a": clean(e.get("a"), 40), "persona": clean(e.get("persona"), 20),
                "ref": clean(e.get("ref"), 60), "utm": clean(e.get("utm"), 40),
                "dur": max(0, min(int(e.get("dur") or 0), 60)),
                "new": bool(e.get("new")), "tz": clean(e.get("tz"), 40), "lang": clean(e.get("lang"), 12),
                "scr": clean(e.get("scr"), 12), "device": device, "browser": browser, "os": os_, **geo,
            }
            if e["t"] == "lead":
                email = clean(e.get("email"), 160).strip().lower()
                if not EMAIL_RE.match(email):
                    continue
                item["email"] = email  # volunteered by the visitor on the sign-in screen (disclosed there)
            if e.get("test"):
                item["test"] = True
            batch.put_item(Item={k: val for k, val in item.items() if val not in ("", None)})
    return resp(204, None, origin) | {"body": ""}


# ---------------- stats ----------------

def load(days: int) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days + 1)]

    def q(d):
        items, kw = [], {"KeyConditionExpression": Key("pk").eq(f"D#{d:%Y-%m-%d}")}
        while True:
            r = table.query(**kw)
            items += r["Items"]
            if "LastEvaluatedKey" not in r:
                return items
            kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]

    with ThreadPoolExecutor(max_workers=16) as pool:
        out = [i for chunk in pool.map(q, dates) for i in chunk]
    return [e for e in out if not e.get("test")]


def sessions_of(events: list[dict]) -> dict[str, dict]:
    sess: dict[str, dict] = {}
    for e in sorted(events, key=lambda x: x["ts"]):
        s = sess.setdefault(e["s"], {
            "id": e["s"], "visitor": e["v"], "start": e["ts"], "end": e["ts"], "pages": [], "engaged": 0,
            "actions": Counter(), "persona": None, "new": False, "email": None,
            **{k: e.get(k, "") for k in ("ref", "utm", "country", "region", "city", "device", "browser", "os", "tz")},
        })
        s["end"] = e["ts"]
        t = e["t"]
        if t == "session_start":
            s["new"] = bool(e.get("new"))
            s["ref"] = e.get("ref", s["ref"]) or ""
            s["utm"] = e.get("utm", s["utm"]) or ""
        elif t == "page_view":
            if not s["pages"] or s["pages"][-1]["p"] != e.get("p"):
                s["pages"].append({"p": e.get("p", "/"), "ts": e["ts"]})
        elif t == "heartbeat":
            s["engaged"] += int(e.get("dur", 0))
        elif t == "persona":
            s["persona"] = e.get("persona")
        elif t == "action":
            s["actions"][e.get("a", "other")] += 1
        elif t == "lead":
            s["email"] = e.get("email")
    return sess


def kpis(sess: dict[str, dict], events: list[dict]) -> dict:
    n = len(sess) or 1
    bounced = sum(1 for s in sess.values() if len(s["pages"]) <= 1 and s["engaged"] < 10)
    returning = sum(1 for s in sess.values() if not s["new"])
    return {
        "visitors": len({s["visitor"] for s in sess.values()}),
        "sessions": len(sess),
        "pageviews": sum(1 for e in events if e["t"] == "page_view"),
        "avgEngaged": round(sum(s["engaged"] for s in sess.values()) / n),
        "bounceRate": round(bounced / n, 3) if sess else 0,
        "returningRate": round(returning / n, 3) if sess else 0,
    }


def stats(days: int) -> dict:
    now = datetime.now(timezone.utc)
    cut, prev_cut = (now - timedelta(days=days)).isoformat(), (now - timedelta(days=2 * days)).isoformat()
    every = load(2 * days)
    cur = [e for e in every if e["ts"] >= cut]
    prev = [e for e in every if prev_cut <= e["ts"] < cut]
    sess, prev_sess = sessions_of(cur), sessions_of(prev)
    S = list(sess.values())

    hourly = days <= 2
    buckets: dict[str, dict] = {}
    step = timedelta(hours=1) if hourly else timedelta(days=1)
    t = (now - timedelta(days=days)).replace(minute=0, second=0, microsecond=0)
    if not hourly:
        t = t.replace(hour=0)
    while t <= now:
        buckets[t.isoformat()[:13 if hourly else 10]] = {"t": t.isoformat(), "visitors": set(), "sessions": set(), "pageviews": 0}
        t += step
    heat = [0] * 168  # UTC hour-of-week, Monday 00:00 = 0
    for e in cur:
        b = buckets.get(e["ts"][:13 if hourly else 10])
        if b:
            b["visitors"].add(e["v"]); b["sessions"].add(e["s"])
            if e["t"] == "page_view":
                b["pageviews"] += 1
        if e["t"] == "page_view":
            d = datetime.fromisoformat(e["ts"])
            heat[d.weekday() * 24 + d.hour] += 1
    series = [{"t": b["t"], "visitors": len(b["visitors"]), "sessions": len(b["sessions"]), "pageviews": b["pageviews"]} for b in buckets.values()]

    def top(values, k=8):
        return [{"name": n or "Unknown", "value": c} for n, c in Counter(values).most_common(k)]

    live_cut = (now - timedelta(minutes=5)).isoformat()
    live = [{"id": s["id"][-6:], "page": s["pages"][-1]["p"] if s["pages"] else "/", "country": s["country"], "city": s["city"],
             "device": s["device"], "since": s["start"]} for s in S if s["end"] >= live_cut]
    actions = Counter()
    for s in S:
        actions.update(s["actions"])

    return {
        "generatedAt": now.isoformat(),
        "days": days,
        "kpis": kpis(sess, cur),
        "previous": kpis(prev_sess, prev),
        "series": series,
        "hourly": hourly,
        "heatmapUtc": heat,
        "pages": top([p["p"] for s in S for p in s["pages"]], 10),
        "referrers": top([s["ref"] or "Direct" for s in S]),
        "countries": top([s["country"] for s in S]),
        "cities": top([", ".join(x for x in (s["city"], s["region"], s["country"]) if x) for s in S]),
        "devices": top([s["device"] for s in S]),
        "browsers": top([s["browser"] for s in S]),
        "os": top([s["os"] for s in S]),
        "personas": top([s["persona"] for s in S if s["persona"]]),
        "actions": [{"name": n, "value": c} for n, c in actions.most_common()],
        "funnel": [
            {"name": "Visited", "value": len(S)},
            {"name": "Signed in", "value": sum(1 for s in S if s["persona"])},
            {"name": "Explored 3+ pages", "value": sum(1 for s in S if len(s["pages"]) >= 3)},
            {"name": "Interacted", "value": sum(1 for s in S if s["actions"])},
        ],
        "live": live,
        "leads": [
            {"email": s["email"], "start": s["start"], "end": s["end"], "engaged": s["engaged"], "pages": len(s["pages"]),
             "city": s["city"], "country": s["country"], "device": s["device"], "ref": s["ref"], "session": s["id"][-6:]}
            for s in sorted((s for s in S if s["email"]), key=lambda x: x["start"], reverse=True)
        ],
        "sessions": [
            {**{k: s[k] for k in ("start", "end", "engaged", "persona", "new", "ref", "country", "region", "city", "device", "browser", "os", "email")},
             "id": s["id"][-6:], "visitor": s["visitor"][-6:], "pages": s["pages"][:30], "actions": sum(s["actions"].values())}
            for s in sorted(S, key=lambda x: x["start"], reverse=True)[:60]
        ],
        "feed": [
            {"ts": e["ts"], "t": e["t"], "p": e.get("p", ""), "a": e.get("a", ""), "persona": e.get("persona", ""),
             "country": e.get("country", ""), "city": e.get("city", ""), "device": e.get("device", ""), "s": e["s"][-6:]}
            for e in sorted((e for e in cur if e["t"] != "heartbeat"), key=lambda x: x["ts"], reverse=True)[:40]
        ],
    }


# ---------------- entry ----------------

def handler(event, _ctx):
    http = event.get("requestContext", {}).get("http", {})
    method, path = http.get("method", "GET"), event.get("rawPath", "/")
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    origin = headers.get("origin")

    if method == "OPTIONS":
        return {"statusCode": 204, "headers": cors(origin), "body": ""}
    try:
        if method == "POST" and path == "/collect":
            return collect(event, headers, origin)
        if method == "GET" and path == "/stats":
            if not authorized(headers):
                time.sleep(0.6)  # slow down guessing (API stage throttling caps the rate too)
                return resp(401, {"error": "unauthorized"}, origin)
            q = event.get("queryStringParameters") or {}
            days = int(q.get("days", 7)) if str(q.get("days", 7)).isdigit() else 7
            return resp(200, stats(max(1, min(days, 90))), origin)
        if method == "GET" and path == "/health":
            return resp(200, {"ok": True}, origin)
        return resp(404, {"error": "not found"}, origin)
    except Exception as e:  # never leak internals
        print("ERROR", repr(e))
        return resp(500, {"error": "internal error"}, origin)
