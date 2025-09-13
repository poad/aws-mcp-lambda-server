import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectName = this.node.tryGetContext('project-name') ?? 'aws-mcp-lambda-server';

    // Lambda関数のIAMロール
    const lambdaRole = new cdk.aws_iam.Role(this, 'LambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });


    const mcpServerFunctionName = `${projectName}-mcp-server`;
    const mcpServerLogGroup = new cdk.aws_logs.LogGroup(this, 'McpServerFunctionLogGroup', {
      logGroupName: `/aws/lambda/${mcpServerFunctionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });
    // MCP Server のLambda関数
    const mcpServer = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'McpServer', {
      functionName: mcpServerFunctionName,
      entry: 'lambda/index.ts',
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      logGroup: mcpServerLogGroup,
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      memorySize: 128,
      bundling: {
        // No externalModules since we want to bundle everything
        nodeModules: [
          '@modelcontextprotocol/sdk',
          'hono',
          'zod',
        ],
        externalModules: [
          'dotenv',
          '@hono/node-server',
        ],
        // minify: true, // コードの最小化
        sourceMap: true, // ソースマップを有効化（デバッグ用）
        keepNames: true,
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        target: 'node22', // Target Node.js 22.x
        banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);',
      },
    });

    // API Gateway
    const api = new cdk.aws_apigateway.RestApi(this, 'MCPAPI', {
      restApiName: 'MCP API',
      description: 'API for MCP',
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
      deployOptions: {
        stageName: 'v1',
      },
      endpointTypes: [cdk.aws_apigateway.EndpointType.REGIONAL],
    });

    const mcpResource = api.root.addResource('mcp');
    mcpResource.addMethod('ANY', new cdk.aws_apigateway.LambdaIntegration(mcpServer));
  }
}
