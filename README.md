# Custom FP&A Experience (demo)

A demo of what a custom-built financial planning platform on AWS can look like: driver-based forecasting,
cost center budget workflow, actuals management, variance reporting and a grounded AI assistant,
with enterprise SSO, role-based access and governed data pipelines.

> **Demo only.** "Northwind Devices" is fictional and all data is synthetic. In the public build, SSO is
> simulated and everything runs in your browser (edits are saved to local storage).

## What's in the repo

| Path | What it is |
| --- | --- |
| `web/` | React + TypeScript + Vite + Tailwind front end (the GitHub Pages site) |
| `data/seed.py` | Generates the synthetic GL and driver data (Parquet for Athena, JSON for the static build) |
| `data/gen_answers.py` | Pre-generates AI Assistant answers with Claude on Amazon Bedrock |
| `backend/api/` | Lambda API for the full AWS deployment (Athena, DynamoDB, Bedrock) |
| `infra/` | AWS CDK stacks: `FpaExperienceDemo` (S3 + Glue + Athena, Lambda, DynamoDB, CloudFront) and `FpaDemoAnalytics` |
| `backend/analytics/` | Traffic analytics API: CloudFront → HTTP API → Lambda → DynamoDB (90-day TTL) |

## Run locally

```bash
cd web
npm install
npm run dev   # http://localhost:5173/fpa-experience-demo/
```

## Deploy

- **GitHub Pages:** pushes to `main` build and deploy via `.github/workflows/pages.yml`.
- **Full AWS version:** `python data/seed.py`, then `cd web && npm run build`, then `cd infra && npm install && npx cdk deploy`.

## Traffic analytics

The public site records basic usage (pages viewed, engaged time, device, approximate location from CloudFront; no IP
addresses) plus an email only when a visitor chooses to enter one on the sign-in screen. The site owner views it at
**Site owner? View traffic** on the sign-in screen, unlocked with a passphrase stored in SSM Parameter Store:

```powershell
$p = Read-Host "Passphrase (12+ chars)" -AsSecureString
aws ssm put-parameter --name fpa-demo-admin-passphrase --type SecureString --overwrite --value ([System.Net.NetworkCredential]::new('', $p).Password)
```

Deploy or update the analytics backend with `cd infra && npx cdk deploy FpaDemoAnalytics`.
