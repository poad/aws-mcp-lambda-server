import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectName = this.node.tryGetContext('project-name') ?? 'aws-mcp-lambda-server';
    const domain = this.node.tryGetContext('domin') ?? `mcp-server-${this.account}`;

    const useAuth = this.node.tryGetContext('use-auth') === 'true';

    const clientCallbackUrls = this.node.tryGetContext('clientCallbackUrls') as string[];
    // const autoClientCallbackUrls = this.node.tryGetContext('autoClientCallbackUrls') as string[];
    const logoutUrls = this.node.tryGetContext('logoutUrls') as string[];

    // Cognito ユーザープール
    const userPool = new cdk.aws_cognito.UserPool(this, 'OAuth21UserPool', {
      userPoolName: `${projectName}-oidc-user-pool`,
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: domain,
      },
    });

    new cdk.aws_cognito.UserPoolResourceServer(this, 'ResourceServer', {
      userPool,
      identifier: 'mcp-api',
      userPoolResourceServerName: 'MCP API',
      scopes: [
        new cdk.aws_cognito.ResourceServerScope({
          scopeName: 'read',
          scopeDescription: 'Read access to MCP API',
        }),
        new cdk.aws_cognito.ResourceServerScope({
          scopeName: 'write',
          scopeDescription: 'Write access to MCP API',
        }),
      ],
    });

    // ユーザープールクライアント
    const userPoolClient = new cdk.aws_cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: projectName,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        callbackUrls: clientCallbackUrls,
        logoutUrls,

        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cdk.aws_cognito.OAuthScope.EMAIL,
          cdk.aws_cognito.OAuthScope.OPENID,
          cdk.aws_cognito.OAuthScope.PROFILE,
        ],
      },
    });

    // Lambda関数のIAMロール
    const lambdaRole = new cdk.aws_iam.Role(this, 'LambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });


    const webAdapter = cdk.aws_lambda.LayerVersion.fromLayerVersionArn(this, 'LayerVersion', `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerArm64:25`);
    const mcpServerFunctionName = `${projectName}-mcp-server`;
    const mcpServerLogGroup = new cdk.aws_logs.LogGroup(this, 'McpServerFunctionLogGroup', {
      logGroupName: `/aws/lambda/${mcpServerFunctionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });
    // MCP Server のLambda関数
    const mcpServer = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'McpServer', {
      functionName: mcpServerFunctionName,
      entry: 'lambda/clients.ts',
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      logGroup: mcpServerLogGroup,
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      layers: [webAdapter],
      environment: {
        // Lambda Web Adapter の設定
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',

        // 設定するとエラー時に全て HTTP 500 になるため、デフォルトのままにしておく
        // AWS_LWA_INVOKE_MODE: 'response_stream',

        AWS_LWA_PORT: '8080',
        PORT: '8080',
        RUST_LOG: 'info',
      },
      memorySize: 128,
      bundling: {
        // No externalModules since we want to bundle everything
        nodeModules: [
          '@modelcontextprotocol/sdk',
          'hono',
          'fetch-to-node',
          'zod',
        ],
        commandHooks: {
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp ${inputDir}/platform/lambda/mcp-server/run.sh ${outputDir}`,
          ],
          beforeInstall(): string[] {
            return [''];
          },
          beforeBundling(): string[] {
            return [''];
          },
        },
        externalModules: [
          // Lambda レイヤーで提供されるモジュールは除外できる（オプション）
          '/opt/nodejs/node_modules/aws-lambda-web-adapter',

          'dotenv',
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
    const api = new cdk.aws_apigateway.RestApi(this, useAuth ? 'OAuth21API' : 'MCPAPI', {
      restApiName: useAuth ? 'OAuth 2.1 Provider API' : 'MCP API',
      description: useAuth ? 'API for OAuth 2.1 authorization server' : 'API for MCP',
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
      deployOptions: {
        stageName: 'v1',
      },
      endpointTypes: [cdk.aws_apigateway.EndpointType.REGIONAL],
    });

    if (useAuth) {
      // DynamoDBテーブル - 認可コードとトークンの保存
      const authorizationTable = new cdk.aws_dynamodb.Table(this, 'AuthorizationTable', {
        partitionKey: { name: 'id', type: cdk.aws_dynamodb.AttributeType.STRING },
        timeToLiveAttribute: 'ttl',
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      });

      // クライアントアプリケーション情報を保存するテーブル
      const clientsTable = new cdk.aws_dynamodb.Table(this, 'ClientsTable', {
        partitionKey: { name: 'clientId', type: cdk.aws_dynamodb.AttributeType.STRING },
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      });

      // Lambda関数のIAMロール
      const oauthLambdaRole = new cdk.aws_iam.Role(this, 'OAuthLambdaRole', {
        assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      });

      // DynamoDBへのアクセス権限をLambdaに付与
      authorizationTable.grantReadWriteData(oauthLambdaRole);
      clientsTable.grantReadWriteData(oauthLambdaRole);

      const authorizeHandlerFunctionName = `${projectName}-authorize-handler`;
      const authorizeHandlerLogGroup = new cdk.aws_logs.LogGroup(this, 'AuthorizeHandlerFunctionLogGroup', {
        logGroupName: `/aws/lambda/${authorizeHandlerFunctionName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: cdk.aws_logs.RetentionDays.ONE_DAY,
      });

      // 認可エンドポイント用のLambda関数
      const authorizeHandler = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'AuthorizeHandler', {
        functionName: authorizeHandlerFunctionName,
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        entry: 'lambda/authorize.ts',
        environment: {
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          AUTHORIZATION_TABLE_NAME: authorizationTable.tableName,
          CLIENTS_TABLE_NAME: clientsTable.tableName,
        },
        role: oauthLambdaRole,
        timeout: cdk.Duration.seconds(30),
        logGroup: authorizeHandlerLogGroup,
        loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      });

      const tokenHandlerFunctionName = `${projectName}-token-handler`;
      const tokenHandleLogGroup = new cdk.aws_logs.LogGroup(this, 'TokenHandlerLogGroup', {
        logGroupName: `/aws/lambda/${tokenHandlerFunctionName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: cdk.aws_logs.RetentionDays.ONE_DAY,
      });


      // トークンエンドポイント用のLambda関数
      const tokenHandler = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'TokenHandler', {
        functionName: tokenHandlerFunctionName,
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        entry: 'lambda/token.ts',
        environment: {
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          AUTHORIZATION_TABLE_NAME: authorizationTable.tableName,
          CLIENTS_TABLE_NAME: clientsTable.tableName,
        },
        role: oauthLambdaRole,
        timeout: cdk.Duration.seconds(30),
        logGroup: tokenHandleLogGroup,
        loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      });

      const revokeHandlerFunctionName = `${projectName}-revoke-handler`;
      const revokeHandlerLogGroup = new cdk.aws_logs.LogGroup(this, 'RevokeHandlerFunctionLogGroup', {
        logGroupName: `/aws/lambda/${revokeHandlerFunctionName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: cdk.aws_logs.RetentionDays.ONE_DAY,
      });

      // 取り消しエンドポイント用のLambda関数
      const revokeHandler = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'RevokeHandler', {
        functionName: revokeHandlerFunctionName,
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        entry: 'lambda/revoke.ts',
        environment: {
          AUTHORIZATION_TABLE_NAME: authorizationTable.tableName,
        },
        role: oauthLambdaRole,
        timeout: cdk.Duration.seconds(30),
        logGroup: revokeHandlerLogGroup,
        loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      });

      const clientsHandlerFunctionName = `${projectName}-clients-handler`;
      const clientsHandlerLogGroup = new cdk.aws_logs.LogGroup(this, 'ClientsHandlerFunctionLogGroup', {
        logGroupName: `/aws/lambda/${clientsHandlerFunctionName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: cdk.aws_logs.RetentionDays.ONE_DAY,
      });
      // クライアント管理用のLambda関数
      const clientsHandler = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'ClientsHandler', {
        functionName: clientsHandlerFunctionName,
        entry: 'lambda/clients.ts',
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        environment: {
          CLIENTS_TABLE_NAME: clientsTable.tableName,
        },
        role: oauthLambdaRole,
        timeout: cdk.Duration.seconds(30),
        logGroup: clientsHandlerLogGroup,
        loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      });


      // OAuth 2.1エンドポイント
      const oauthResource = api.root.addResource('oauth2');

      // 認可エンドポイント
      const authorizeResource = oauthResource.addResource('authorize');
      authorizeResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(authorizeHandler));
      authorizeResource.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(authorizeHandler));

      // トークンエンドポイント
      const tokenResource = oauthResource.addResource('token');
      tokenResource.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(tokenHandler));

      // トークン取り消しエンドポイント
      const revokeResource = oauthResource.addResource('revoke');
      revokeResource.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(revokeHandler));

      // クライアント管理エンドポイント
      const clientsResource = api.root.addResource('clients');
      clientsResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(clientsHandler));
      clientsResource.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(clientsHandler));

      const clientResource = clientsResource.addResource('{clientId}');
      clientResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(clientsHandler));
      clientResource.addMethod('PUT', new cdk.aws_apigateway.LambdaIntegration(clientsHandler));
      clientResource.addMethod('DELETE', new cdk.aws_apigateway.LambdaIntegration(clientsHandler));

      const mcpResource = api.root.addResource('mcp');
      mcpResource.addMethod('ANY', new cdk.aws_apigateway.LambdaIntegration(mcpServer));
    } else {
      const mcpResource = api.root.addResource('mcp');
      mcpResource.addMethod('ANY', new cdk.aws_apigateway.LambdaIntegration(mcpServer));
    }
  }
}
