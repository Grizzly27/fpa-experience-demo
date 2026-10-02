#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { PlanningStack } from '../lib/planning-stack';

const app = new App();
new PlanningStack(app, 'FpaExperienceDemo', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  description: 'Custom FP&A Experience: driver-based FP&A demo on S3/Athena/Lambda/Bedrock',
});
