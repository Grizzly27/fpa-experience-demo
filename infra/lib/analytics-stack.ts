import * as path from 'path';
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

const ROOT = path.join(__dirname, '..', '..');

/**
 * Anonymous traffic analytics for the public demo:
 * CloudFront (adds viewer geo, no IPs stored) -> HTTP API (throttled) -> Lambda -> DynamoDB (90-day TTL).
 * The owner passphrase lives in SSM Parameter Store as a SecureString and is set by the owner, not by CDK.
 */
export class AnalyticsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { allowedOrigins: string[]; adminKeyParam: string }) {
    super(scope, id, props);
    Tags.of(this).add('Project', 'fpa-experience-demo');

    const table = new ddb.Table(this, 'Events', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new lambda.Function(this, 'Fn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(ROOT, 'backend', 'analytics')),
      memorySize: 512,
      timeout: Duration.seconds(15),
      environment: {
        TABLE_NAME: table.tableName,
        ADMIN_KEY_PARAM: props.adminKeyParam,
        ALLOWED_ORIGINS: props.allowedOrigins.join(','),
      },
      logGroup: new logs.LogGroup(this, 'Logs', { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });
    table.grantReadWriteData(fn);
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/${props.adminKeyParam}`],
    }));
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: ['*'],
      conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
    }));

    const api = new apigw.HttpApi(this, 'Api', {
      apiName: 'fpa-demo-analytics',
      defaultIntegration: new HttpLambdaIntegration('Integration', fn),
    });
    const stage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 25, throttlingBurstLimit: 50 };

    const requestPolicy = new cf.OriginRequestPolicy(this, 'Forward', {
      headerBehavior: cf.OriginRequestHeaderBehavior.allowList(
        'origin', 'access-control-request-method', 'access-control-request-headers', 'content-type', 'user-agent', 'x-admin-key',
        'cloudfront-viewer-country', 'cloudfront-viewer-country-region-name', 'cloudfront-viewer-city',
      ),
      queryStringBehavior: cf.OriginRequestQueryStringBehavior.all(),
    });
    const dist = new cf.Distribution(this, 'Cdn', {
      comment: 'fpa-demo-analytics',
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${api.apiId}.execute-api.${this.region}.amazonaws.com`),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: requestPolicy,
      },
    });

    new CfnOutput(this, 'AnalyticsUrl', { value: `https://${dist.distributionDomainName}` });
  }
}
