"""Pre-generate "Ask the Plan" answers with Claude on Bedrock.

The static (GitHub Pages) build can't hold model credentials, so we run the same
grounded prompt the Lambda uses (backend/api/handler.py) once, locally, and bundle
the answers into web/src/data/answers.json.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import boto3
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
LAST_ACTUAL = "2026-09"

QUESTIONS = [
    "Why is Q3 opex over plan?",
    "How is revenue tracking against plan this year?",
    "What drove the August variance?",
    "Which department is furthest off plan YTD, and why?",
    "What should we watch going into the FY27 budget?",
]

SYSTEM = """You are an FP&A analyst for Northwind Devices (a fictional consumer hardware + subscription company).
Answer the user's question using ONLY the variance tables provided. Amounts are USD.
Variance = actual - plan. For Opex/COGS, positive variance is unfavorable; for Revenue, positive is favorable.
Write like a sharp finance business partner: lead with the headline number, then the 2-4 biggest drivers with $ and %,
then one line on what to watch or do. Use short markdown bullets. Max ~180 words. Never invent numbers.
If the data can't answer the question, say so."""


def period_mask(gl: pd.DataFrame, period: str) -> pd.Series:
    upto = gl.month <= LAST_ACTUAL
    if period.startswith("FY"):
        return (gl.fiscal_year == period) & upto
    if period.startswith("Q"):
        q, yy = int(period[1]), period[3:]
        return gl.month.isin([f"20{yy}-{m:02d}" for m in range(q * 3 - 2, q * 3 + 1)]) & upto
    return gl.month == period


def fmt_table(gl: pd.DataFrame, period: str) -> str:
    v = (gl[period_mask(gl, period)]
         .pivot_table(index=["account_group", "department", "account"], columns="scenario",
                      values="amount", aggfunc="sum", fill_value=0)
         .reset_index())
    lines = ["group | department | account | actual | plan | variance"]
    for r in v.itertuples():
        lines.append(f"{r.account_group} | {r.department} | {r.account} | "
                     f"{r.actual:,.0f} | {r.plan:,.0f} | {r.actual - r.plan:+,.0f}")
    return "\n".join(lines)


def main():
    gl = pd.read_parquet(ROOT / "data" / "out" / "gl" / "gl.parquet")
    ctx = "\n\n".join(
        f"### Period {p} (actuals through {LAST_ACTUAL})\n{fmt_table(gl, p)}"
        for p in ("FY26", "Q1-26", "Q2-26", "Q3-26", "2026-07", "2026-08", "2026-09"))
    bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

    answers = []
    for q in QUESTIONS:
        out = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": SYSTEM}],
            messages=[{"role": "user", "content": [{"text": f"{ctx}\n\nQuestion: {q}"}]}],
            inferenceConfig={"maxTokens": 600, "temperature": 0.2},
        )
        text = out["output"]["message"]["content"][0]["text"]
        answers.append({"question": q, "answer": text})
        print(f"\n=== {q}\n{text}")

    (ROOT / "web" / "src" / "data" / "answers.json").write_text(json.dumps({
        "model": "Claude Sonnet 4.5 (Amazon Bedrock)",
        "generated": date.today().isoformat(),
        "answers": answers,
    }, indent=2))


if __name__ == "__main__":
    main()
