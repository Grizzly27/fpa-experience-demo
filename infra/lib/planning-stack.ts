import * as path from 'path';
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as logs from 'aws-cdk-lib/aws-logs';

const ROOT = path.join(__dirname, '..', '..');
const MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

export class PlanningStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add('Project', 'fpa-experience-demo');

    // ---------- data lake: S3 + Glue + Athena ----------
    const dataBucket = new s3.Bucket(this, 'Data', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const resultsBucket = new s3.Bucket(this, 'AthenaResults', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: Duration.days(3) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, 'SeedData', {
      sources: [s3deploy.Source.asset(path.join(ROOT, 'data', 'out'))],
      destinationBucket: dataBucket,
      destinationKeyPrefix: 'lake',
    });

    const dbName = 'northwind_planning';
    const db = new glue.CfnDatabase(this, 'GlueDb', {
      catalogId: this.account,
      databaseInput: { name: dbName, description: 'Synthetic FP&A data for the Custom FP&A Experience demo' },
    });
    const parquetTable = (name: string, cols: [string, string][]) => {
      const t = new glue.CfnTable(this, `Table-${name}`, {
        catalogId: this.account,
        databaseName: dbName,
        tableInput: {
          name,
          tableType: 'EXTERNAL_TABLE',
          parameters: { classification: 'parquet' },
          storageDescriptor: {
            columns: cols.map(([n, t]) => ({ name: n, type: t })),
            location: `s3://${dataBucket.bucketName}/lake/${name}/`,
            inputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
            outputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
            serdeInfo: { serializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' },
          },
        },
      });
      t.addResourceDependency(db);
    };
    const dims: [string, string][] = [
      ['month', 'string'], ['fiscal_year', 'string'], ['quarter', 'string'],
      ['scenario', 'string'], ['department', 'string'],
    ];
    parquetTable('gl', [...dims, ['account', 'string'], ['account_group', 'string'], ['amount', 'double']]);
    parquetTable('drivers', [...dims, ['driver', 'string'], ['value', 'double']]);

    const workgroup = new athena.CfnWorkGroup(this, 'Workgroup', {
      name: 'fpa-experience-demo',
      recursiveDeleteOption: true,
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        bytesScannedCutoffPerQuery: 100 * 1024 * 1024, // 100 MB guardrail
        resultConfiguration: { outputLocation: `s3://${resultsBucket.bucketName}/results/` },
      },
    });

    // ---------- app state: DynamoDB ----------
    const table = new ddb.Table(this, 'State', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---------- API: Lambda + API Gateway ----------
    const fn = new lambda.Function(this, 'Api', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(ROOT, 'backend', 'api')),
      memorySize: 512,
      timeout: Duration.seconds(29),
      environment: {
        TABLE_NAME: table.tableName,
        GLUE_DB: dbName,
        ATHENA_WORKGROUP: workgroup.name,
        MODEL_ID,
      },
      logGroup: new logs.LogGroup(this, 'ApiLogs', { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });
    table.grantReadWriteData(fn);
    dataBucket.grantRead(fn);
    resultsBucket.grantReadWrite(fn);
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['athena:StartQueryExecution', 'athena:GetQueryExecution', 'athena:GetQueryResults'],
      resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/${workgroup.name}`],
    }));
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['glue:GetDatabase', 'glue:GetTable', 'glue:GetPartitions'],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/${dbName}`,
        `arn:aws:glue:${this.region}:${this.account}:table/${dbName}/*`,
      ],
    }));
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODEL_ID}`,
        'arn:aws:bedrock:*::foundation-model/anthropic.*',
      ],
    }));

    const api = new apigw.RestApi(this, 'RestApi', {
      restApiName: 'fpa-experience-demo',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 20,
        throttlingBurstLimit: 40,
        methodOptions: {
          // Bedrock calls cost money: keep /ask tightly throttled for a public demo link
          '/api/ask/POST': { throttlingRateLimit: 1, throttlingBurstLimit: 3 },
        },
      },
    });
    const integ = new apigw.LambdaIntegration(fn);
    const apiRes = api.root.addResource('api');
    apiRes.addResource('ask').addMethod('POST', integ);
    apiRes.addResource('{proxy+}').addMethod('ANY', integ);

    // ---------- web: S3 + CloudFront ----------
    const siteBucket = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const dist = new cf.Distribution(this, 'Cdn', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [403, 404].map((code) => ({
        httpStatus: code, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(0),
      })),
    });
    new s3deploy.BucketDeployment(this, 'SiteDeploy', {
      sources: [s3deploy.Source.asset(path.join(ROOT, 'web', 'dist'))],
      destinationBucket: siteBucket,
      distribution: dist,
      distributionPaths: ['/*'],
    });

    // ---------- cost guardrail ----------
    const alertEmail = this.node.tryGetContext('alertEmail');
    if (alertEmail) {
      new budgets.CfnBudget(this, 'Budget', {
        budget: {
          budgetName: 'fpa-experience-demo',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: 25, unit: 'USD' },
        },
        notificationsWithSubscribers: [{
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80 },
          subscribers: [{ subscriptionType: 'EMAIL', address: alertEmail }],
        }],
      });
    }

    new CfnOutput(this, 'Url', { value: `https://${dist.distributionDomainName}` });
    new CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
