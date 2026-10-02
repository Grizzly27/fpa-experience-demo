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
| `infra/` | AWS CDK stack: S3 + Glue + Athena, Lambda + API Gateway, DynamoDB, CloudFront, budget alarm |

## Run locally

```bash
cd web
npm install
npm run dev   # http://localhost:5173/fpa-experience-demo/
```

## Deploy

- **GitHub Pages:** pushes to `main` build and deploy via `.github/workflows/pages.yml`.
- **Full AWS version:** `python data/seed.py`, then `cd web && npm run build`, then `cd infra && npm install && npx cdk deploy`.
