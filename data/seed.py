"""Generate synthetic GL + driver data for Northwind Devices (fictional).

Outputs:
  data/out/gl/gl.parquet            -> Athena table `gl`
  data/out/drivers/drivers.parquet  -> Athena table `drivers`
  web/src/data/seed.json            -> local dev fallback + driver-forecast baseline

Plan covers Jan 2025 - Dec 2026. Actuals run Jan 2025 - Sep 2026.
Baked-in storylines (so variance analysis has something to find):
  * Q3-26 R&D contractors run hot (platform rewrite backfill) + cloud overage
  * Aug-26 Marketing "Northwind Hub" launch campaign not in plan
  * Q2-26 hardware units beat plan (retail channel win)
  * Subscription churn runs ~0.4pt/month worse than plan from Mar-26
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "out"
random.seed(42)

MONTHS = [f"{y}-{m:02d}" for y in (2025, 2026) for m in range(1, 13)]
LAST_ACTUAL = "2026-09"

DEPTS = {
    # dept: (plan headcount Jan-25, monthly hires in plan, loaded annual cost)
    "Sales": (42, 0.6, 165_000),
    "Marketing": (18, 0.25, 150_000),
    "R&D": (64, 1.0, 210_000),
    "Customer Success": (26, 0.4, 115_000),
    "Operations": (22, 0.2, 105_000),
    "G&A": (20, 0.15, 160_000),
}

# Non-people opex per dept per month (plan), by account
OPEX_BASE = {
    "Sales": {"Travel": 85_000, "Software & Cloud": 40_000, "Contractors": 20_000},
    "Marketing": {"Marketing Programs": 420_000, "Software & Cloud": 35_000, "Contractors": 45_000},
    "R&D": {"Software & Cloud": 310_000, "Contractors": 180_000, "Travel": 15_000},
    "Customer Success": {"Software & Cloud": 55_000, "Travel": 10_000},
    "Operations": {"Facilities": 260_000, "Software & Cloud": 20_000},
    "G&A": {"Facilities": 90_000, "Professional Fees": 140_000, "Software & Cloud": 30_000},
}

HW_PRICE = 349.0
HW_UNIT_COST = 196.0
ARPU = 14.0          # monthly subscription
ATTACH = 0.62        # share of hardware buyers who subscribe
PLAN_CHURN = 0.021
HOSTING_PCT = 0.18   # subscription COGS as % of sub revenue


def month_idx(m: str) -> int:
    return MONTHS.index(m)


def seasonality(m: str) -> float:
    mo = int(m[5:])
    return {11: 1.35, 12: 1.6, 1: 0.8, 2: 0.85}.get(mo, 1.0)


def noise(pct: float) -> float:
    return 1 + random.uniform(-pct, pct)


def build():
    gl, drivers = [], []

    for scenario in ("plan", "actual"):
        subs = 182_000.0
        hc = {d: float(v[0]) for d, v in DEPTS.items()}
        for m in MONTHS:
            if scenario == "actual" and m > LAST_ACTUAL:
                break
            i = month_idx(m)
            q = f"Q{(int(m[5:]) - 1) // 3 + 1}"
            fy = f"FY{m[2:4]}"

            # --- revenue drivers ---
            units = 21_000 * (1 + 0.012 * i) * seasonality(m)
            churn = PLAN_CHURN
            price = HW_PRICE
            if scenario == "actual":
                units *= noise(0.04)
                if "2026-04" <= m <= "2026-06":
                    units *= 1.14  # retail channel win
                if m >= "2026-03":
                    churn += 0.004
                price *= noise(0.01)
            new_subs = units * ATTACH
            subs = subs * (1 - churn) + new_subs

            hw_rev = units * price
            sub_rev = subs * ARPU
            row = dict(month=m, fiscal_year=fy, quarter=q, scenario=scenario)
            gl.append({**row, "department": "Revenue", "account": "Hardware Revenue", "account_group": "Revenue", "amount": round(hw_rev, 2)})
            gl.append({**row, "department": "Revenue", "account": "Subscription Revenue", "account_group": "Revenue", "amount": round(sub_rev, 2)})
            gl.append({**row, "department": "Operations", "account": "Hardware COGS", "account_group": "COGS", "amount": round(units * HW_UNIT_COST * (noise(0.02) if scenario == "actual" else 1), 2)})
            gl.append({**row, "department": "Operations", "account": "Hosting COGS", "account_group": "COGS", "amount": round(sub_rev * HOSTING_PCT, 2)})
            drivers.append({**row, "department": "Revenue", "driver": "hardware_units", "value": round(units)})
            drivers.append({**row, "department": "Revenue", "driver": "hardware_price", "value": round(price, 2)})
            drivers.append({**row, "department": "Revenue", "driver": "subscribers", "value": round(subs)})
            drivers.append({**row, "department": "Revenue", "driver": "churn_rate", "value": round(churn, 4)})

            # --- opex by department ---
            for d, (hc0, hires, cost) in DEPTS.items():
                hc[d] += hires * (noise(0.5) if scenario == "actual" else 1)
                salaries = hc[d] * cost / 12
                drivers.append({**row, "department": d, "driver": "headcount", "value": round(hc[d], 1)})
                drivers.append({**row, "department": d, "driver": "loaded_cost", "value": cost})
                gl.append({**row, "department": d, "account": "Salaries & Benefits", "account_group": "Opex", "amount": round(salaries, 2)})

                for acct, base in OPEX_BASE[d].items():
                    amt = base * (1 + 0.006 * i)
                    if scenario == "actual":
                        amt *= noise(0.06)
                        if d == "R&D" and acct == "Contractors" and "2026-07" <= m <= "2026-09":
                            amt *= 1.85  # platform rewrite backfill
                        if d == "R&D" and acct == "Software & Cloud" and "2026-07" <= m <= "2026-09":
                            amt *= 1.22  # GPU/inference overage
                        if d == "Marketing" and acct == "Marketing Programs" and m == "2026-08":
                            amt += 650_000  # Northwind Hub launch campaign
                    gl.append({**row, "department": d, "account": acct, "account_group": "Opex", "amount": round(amt, 2)})

    return pd.DataFrame(gl), pd.DataFrame(drivers)


def main():
    gl, drivers = build()
    (OUT / "gl").mkdir(parents=True, exist_ok=True)
    (OUT / "drivers").mkdir(parents=True, exist_ok=True)
    gl.to_parquet(OUT / "gl" / "gl.parquet", index=False)
    drivers.to_parquet(OUT / "drivers" / "drivers.parquet", index=False)

    web = ROOT / "web" / "src" / "data"
    web.mkdir(parents=True, exist_ok=True)
    (web / "seed.json").write_text(json.dumps({
        "lastActual": LAST_ACTUAL,
        "gl": gl.to_dict(orient="records"),
        "drivers": drivers.to_dict(orient="records"),
    }))

    pivot = gl[gl.month.between("2026-07", "2026-09")].groupby(["account_group", "scenario"]).amount.sum().unstack()
    print(f"gl rows={len(gl)} driver rows={len(drivers)}")
    print("Q3-26 by group:\n", (pivot / 1e6).round(2))


if __name__ == "__main__":
    main()
