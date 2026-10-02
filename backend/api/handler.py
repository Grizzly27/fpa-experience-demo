"""Custom FP&A Experience API: one Lambda, routed by path.

GET  /api/actuals              GL rows (actual + plan) from Athena
GET  /api/drivers              driver rows from Athena
GET  /api/variance?period=     plan vs actual by dept/account for a period (FY26, Q3-26, 2026-08)
GET  /api/scenarios            saved driver scenarios (DynamoDB)
POST /api/scenarios            save a scenario
GET  /api/workflow             FY27 budget submissions by cost center
POST /api/workflow             submit / approve / reject / reopen a cost center budget
POST /api/ask                  natural-language question -> Bedrock commentary grounded in Athena numbers
"""
from __future__ import annotations

import json
import os
import time
import uuid
from decimal import Decimal

import boto3

athena = boto3.client("athena")
bedrock = boto3.client("bedrock-runtime")
table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])

DB = os.environ["GLUE_DB"]
WORKGROUP = os.environ["ATHENA_WORKGROUP"]
MODEL_ID = os.environ["MODEL_ID"]
LAST_ACTUAL = "2026-09"
COST_CENTERS = ["Sales", "Marketing", "R&D", "Customer Success", "Operations", "G&A"]
TRANSITIONS = {  # action -> (allowed from-states, to-state, role)
    "submit": ({"draft", "rejected"}, "submitted", "analyst"),
    "approve": ({"submitted"}, "approved", "approver"),
    "reject": ({"submitted"}, "rejected", "approver"),
    "lock": ({"approved"}, "locked", "approver"),
    "reopen": ({"approved", "locked"}, "draft", "approver"),
}

_cache: dict[str, tuple[float, list]] = {}


# ---------- helpers ----------

def resp(status: int, body) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body, default=lambda o: float(o) if isinstance(o, Decimal) else str(o)),
    }


def query(sql: str, ttl: int = 300) -> list[dict]:
    """Run an Athena query, cache results in the warm container."""
    hit = _cache.get(sql)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    qid = athena.start_query_execution(
        QueryString=sql, QueryExecutionContext={"Database": DB}, WorkGroup=WORKGROUP
    )["QueryExecutionId"]
    while True:
        state = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]
        if state["State"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(0.25)
    if state["State"] != "SUCCEEDED":
        raise RuntimeError(state.get("StateChangeReason", state["State"]))

    rows, cols, token = [], None, None
    while True:
        kw = {"QueryExecutionId": qid, "MaxResults": 1000}
        if token:
            kw["NextToken"] = token
        page = athena.get_query_results(**kw)
        data = page["ResultSet"]["Rows"]
        if cols is None:
            cols = [c["Name"] for c in page["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]]
            types = [c["Type"] for c in page["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]]
            data = data[1:]  # header row
        for r in data:
            vals = [v.get("VarCharValue") for v in r["Data"]]
            rows.append({c: (float(v) if v is not None and t in ("double", "decimal", "bigint", "integer") else v)
                         for c, v, t in zip(cols, vals, types)})
        token = page.get("NextToken")
        if not token:
            break
    _cache[sql] = (time.time(), rows)
    return rows


def period_filter(period: str) -> str:
    """FY26 | Q3-26 | 2026-08 | YTD -> SQL predicate (values validated, not interpolated raw)."""
    p = period.upper()
    if p == "YTD":
        return f"fiscal_year = 'FY{LAST_ACTUAL[2:4]}' AND month <= '{LAST_ACTUAL}'"
    if len(p) == 4 and p.startswith("FY") and p[2:].isdigit():
        return f"fiscal_year = '{p}' AND month <= '{LAST_ACTUAL}'"
    if len(p) == 5 and p[0] == "Q" and p[1] in "1234" and p[3:].isdigit():
        q, yy = int(p[1]), p[3:]
        months = ", ".join(f"'20{yy}-{m:02d}'" for m in range(q * 3 - 2, q * 3 + 1))
        return f"month IN ({months}) AND month <= '{LAST_ACTUAL}'"
    if len(p) == 7 and p[4] == "-" and p.replace("-", "").isdigit():
        return f"month = '{p}'"
    raise ValueError("period must look like FY26, Q3-26, 2026-08 or YTD")


def variance(period: str) -> list[dict]:
    return query(f"""
        SELECT account_group, department, account,
               SUM(CASE WHEN scenario='actual' THEN amount ELSE 0 END) AS actual,
               SUM(CASE WHEN scenario='plan'   THEN amount ELSE 0 END) AS plan
        FROM gl WHERE {period_filter(period)}
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""")


# ---------- routes ----------

def get_actuals(_q, _b):
    return resp(200, query("SELECT month, fiscal_year, quarter, scenario, department, account, account_group, amount FROM gl ORDER BY month"))


def get_drivers(_q, _b):
    return resp(200, query("SELECT month, scenario, department, driver, value FROM drivers ORDER BY month"))


def get_variance(q, _b):
    try:
        return resp(200, variance(q.get("period", "YTD")))
    except ValueError as e:
        return resp(400, {"error": str(e)})


def get_scenarios(_q, _b):
    items = table.query(KeyConditionExpression="pk = :p", ExpressionAttributeValues={":p": "SCENARIO"})["Items"]
    return resp(200, sorted(items, key=lambda i: i["createdAt"], reverse=True)[:25])


def post_scenario(_q, b):
    name = str(b.get("name", "")).strip()[:60]
    if not name or not isinstance(b.get("drivers"), dict):
        return resp(400, {"error": "name and drivers required"})
    item = {
        "pk": "SCENARIO", "sk": str(uuid.uuid4()), "name": name,
        "drivers": json.loads(json.dumps(b["drivers"]), parse_float=Decimal),
        "summary": json.loads(json.dumps(b.get("summary", {})), parse_float=Decimal),
        "createdAt": int(time.time()),
    }
    table.put_item(Item=item)
    return resp(201, item)


def get_workflow(_q, _b):
    items = {i["sk"]: i for i in table.query(
        KeyConditionExpression="pk = :p", ExpressionAttributeValues={":p": "BUDGET#FY27"})["Items"]}
    return resp(200, [items.get(cc, {"sk": cc, "status": "draft", "lines": {}, "history": []}) for cc in COST_CENTERS])


def post_workflow(_q, b):
    cc, action, role = b.get("costCenter"), b.get("action"), b.get("role")
    if cc not in COST_CENTERS or action not in TRANSITIONS and action != "save":
        return resp(400, {"error": "bad costCenter or action"})
    cur = table.get_item(Key={"pk": "BUDGET#FY27", "sk": cc}).get("Item") or {
        "pk": "BUDGET#FY27", "sk": cc, "status": "draft", "lines": {}, "history": []}

    if action == "save":
        if cur["status"] not in ("draft", "rejected"):
            return resp(409, {"error": f"{cc} is {cur['status']}; reopen before editing"})
        lines = {str(k)[:40]: Decimal(str(round(float(v), 2))) for k, v in (b.get("lines") or {}).items()}
        cur["lines"] = lines
    else:
        allowed, to, need_role = TRANSITIONS[action]
        if role != need_role:
            return resp(403, {"error": f"only {need_role}s can {action}"})
        if cur["status"] not in allowed:
            return resp(409, {"error": f"cannot {action} from {cur['status']}"})
        cur["status"] = to
        cur["history"] = (cur.get("history") or []) + [{
            "action": action, "role": role, "at": int(time.time()),
            "comment": str(b.get("comment", ""))[:200]}]
    table.put_item(Item=cur)
    return resp(200, cur)


SYSTEM = """You are an FP&A analyst for Northwind Devices (a fictional consumer hardware + subscription company).
Answer the user's question using ONLY the variance tables provided. Amounts are USD.
Variance = actual - plan. For Opex/COGS, positive variance is unfavorable; for Revenue, positive is favorable.
Write like a sharp finance business partner: lead with the headline number, then the 2-4 biggest drivers with $ and %,
then one line on what to watch or do. Use short markdown bullets. Max ~180 words. Never invent numbers.
If the data can't answer the question, say so."""


def fmt_table(rows: list[dict]) -> str:
    lines = ["group | department | account | actual | plan | variance"]
    for r in rows:
        a, p = r["actual"] or 0, r["plan"] or 0
        if abs(a) + abs(p) < 1:
            continue
        lines.append(f"{r['account_group']} | {r['department']} | {r['account']} | {a:,.0f} | {p:,.0f} | {a - p:+,.0f}")
    return "\n".join(lines)


def post_ask(_q, b):
    question = str(b.get("question", "")).strip()[:500]
    if not question:
        return resp(400, {"error": "question required"})
    ctx = []
    for period in ("FY26", "Q1-26", "Q2-26", "Q3-26", "2026-07", "2026-08", "2026-09"):
        ctx.append(f"### Period {period} (actuals through {LAST_ACTUAL})\n{fmt_table(variance(period))}")
    out = bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": SYSTEM}],
        messages=[{"role": "user", "content": [{"text": "\n\n".join(ctx) + f"\n\nQuestion: {question}"}]}],
        inferenceConfig={"maxTokens": 600, "temperature": 0.2},
    )
    return resp(200, {
        "answer": out["output"]["message"]["content"][0]["text"],
        "model": MODEL_ID,
        "usage": out.get("usage", {}),
    })


ROUTES = {
    ("GET", "/api/actuals"): get_actuals,
    ("GET", "/api/drivers"): get_drivers,
    ("GET", "/api/variance"): get_variance,
    ("GET", "/api/scenarios"): get_scenarios,
    ("POST", "/api/scenarios"): post_scenario,
    ("GET", "/api/workflow"): get_workflow,
    ("POST", "/api/workflow"): post_workflow,
    ("POST", "/api/ask"): post_ask,
}


def handler(event, _ctx):
    route = ROUTES.get((event.get("httpMethod"), event.get("path")))
    if not route:
        return resp(404, {"error": "not found"})
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return resp(400, {"error": "invalid json"})
    try:
        return route(event.get("queryStringParameters") or {}, body)
    except Exception as e:  # surface a clean error to the demo UI
        print("ERROR", repr(e))
        return resp(500, {"error": "internal error"})
