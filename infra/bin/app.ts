#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { PlanningStack } from '../lib/planning-stack';
import { AnalyticsStack } from '../lib/analytics-stack';

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' };

new PlanningStack(app, 'FpaExperienceDemo', {
  env,
  description: 'Custom FP&A Experience: driver-based FP&A demo on S3/Athena/Lambda/Bedrock',
});

new AnalyticsStack(app, 'FpaDemoAnalytics', {
  env,
  description: 'Anonymous traffic analytics for the public FP&A demo (CloudFront, HTTP API, Lambda, DynamoDB)',
  allowedOrigins: ['https://grizzly27.github.io', 'http://localhost:5173'],
  adminKeyParam: 'fpa-demo-admin-passphrase',
});
