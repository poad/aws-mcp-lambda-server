import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectName = this.node.tryGetContext('project-name') ?? 'aws-mcp-lambda-server';
    const domain = this.node.tryGetContext('domin') ?? `mcp-server-${this.account}`;

    const clientCallbackUrls = this.node.tryGetContext('clientCallbackUrls') as string[];
    // const autoClientCallbackUrls = this.node.tryGetContext('autoClientCallbackUrls') as string[];
    const logoutUrls = this.node.tryGetContext('logoutUrls') as string[];

    const userPool = new cdk.aws_cognito.UserPool(this, 'CognitoOidcUserPool', {
      userPoolName: `${projectName}-oidc-user-pool`,
      signInAliases: {
        username: true,
        email: true,
        preferredUsername: false,
        phone: false,
      },
      selfSignUpEnabled: true,
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
        },
        preferredUsername: {
          required: false,
        },
        phoneNumber: {
          required: false,
        },
      },
      mfa: cdk.aws_cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        email: false,
        otp: true,
      },
      passwordPolicy: {
        minLength: 8,
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

    const client = new cdk.aws_cognito.UserPoolClient(this, 'CognitoAppClient', {
      userPool: userPool,
      userPoolClientName: projectName,
      authFlows: {
        adminUserPassword: true,
        userSrp: true,
        userPassword: false,
      },
      oAuth: {
        callbackUrls: clientCallbackUrls,
        logoutUrls,
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cdk.aws_cognito.OAuthScope.COGNITO_ADMIN,
          cdk.aws_cognito.OAuthScope.EMAIL,
          cdk.aws_cognito.OAuthScope.OPENID,
          cdk.aws_cognito.OAuthScope.PROFILE,
        ],
      },
      readAttributes: new cdk.aws_cognito.ClientAttributes().withStandardAttributes({
        email: true,
        familyName: true,
        givenName: true,
        fullname: true,
        preferredUsername: true,
        emailVerified: true,
        profilePage: true,
      }),
      writeAttributes: new cdk.aws_cognito.ClientAttributes().withStandardAttributes({
        email: true,
        familyName: true,
        givenName: true,
        fullname: true,
        preferredUsername: true,
        profilePage: true,
      }),
    });

    const identityPoolProvider = {
      clientId: client.userPoolClientId,
      providerName: userPool.userPoolProviderName,
    };

    const identityPool = new cdk.aws_cognito.CfnIdentityPool(
      this,
      'CognitoIdentityIdPool',
      {
        allowUnauthenticatedIdentities: false,
        allowClassicFlow: true,
        cognitoIdentityProviders: [identityPoolProvider],
        identityPoolName: 'MPC Lambda idp',
      },
    );

    const unauthenticatedRole = new cdk.aws_iam.Role(
      this,
      'CognitoDefaultUnauthenticatedRole',
      {
        roleName: `cognito-${projectName}-unauth-role`,
        assumedBy: new cdk.aws_iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'unauthenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        maxSessionDuration: cdk.Duration.hours(12),
      },
    );

    unauthenticatedRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['cognito-sync:*', 'cognito-identity:*'],
        resources: ['*'],
      }),
    );
    unauthenticatedRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:*'],
        resources: ['*'],
      }),
    );

    const authenticatedRole = new cdk.aws_iam.Role(
      this,
      'CognitoDefaultAuthenticatedRole',
      {
        roleName: `cognito-${projectName}-auth-role`,
        assumedBy: new cdk.aws_iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ).withSessionTags(),
        maxSessionDuration: cdk.Duration.hours(12),
      },
    );
    authenticatedRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['cognito-sync:*', 'cognito-identity:*'],
        resources: ['*'],
      }),
    );
    authenticatedRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:*'],
        resources: ['*'],
      }),
    );

    new cdk.aws_cognito.CfnIdentityPoolRoleAttachment(
      this,
      'CognitoOidcIdPoolRoleAttachment',
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
          unauthenticated: unauthenticatedRole.roleArn,
        },
      },
    );


    const table = new cdk.aws_dynamodb.Table(this, 'DynamicClientrRegisterClientsTable', {
      tableName: `${projectName}-dynamic-client-register-clients`,
      partitionKey: {
        name: 'client_id',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });


    const registerClientFunctionName = `${projectName}-register-client`;

    const lambdaExecutionRole = new cdk.aws_iam.Role(this, 'LambdaExecutionRole', {
      roleName: `${registerClientFunctionName}-execution`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        'CognitoAccess': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'cognito-idp:CreateUserPoolClient',
                'cognito-idp:DescribeUserPoolClient',
              ],
              resources: [
                userPool.userPoolArn,
              ],
            }),
          ],
        }),
        'DynamoDBAccess': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'dynamodb:PutItem',
                'dynamodb:GetItem',
              ],
              resources: [
                table.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    const registerClientLogGroup = new cdk.aws_logs.LogGroup(this, 'RegisterClientFunctionLogGroup', {
      logGroupName: `/aws/lambda/${registerClientFunctionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });
    const registerClientFn = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'RegisterClientFunction', {
      functionName: registerClientFunctionName,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: './lambda/register-client/index.ts',
      retryAttempts: 0,
      logGroup: registerClientLogGroup,
      role: lambdaExecutionRole,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        DCR_CLIENTS_TABLE: table.tableArn,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: [
          // Lambda レイヤーで提供されるモジュールは除外できる（オプション）
          '/opt/nodejs/node_modules/aws-lambda-web-adapter',

          'dotenv',
        ],
        nodeModules: ['express'], // 依存関係を指定
        // minify: true, // コードの最小化
        sourceMap: true, // ソースマップを有効化（デバッグ用）
        keepNames: true,
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);',
      },
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
    });


    const getClientFunctionName = `${projectName}-get-client`;

    const getClientLambdaExecutionRole = new cdk.aws_iam.Role(this, 'GetClientLambdaExecutionRole', {
      roleName: `${getClientFunctionName}-execution`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        'CognitoAccess': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'cognito-idp:CreateUserPoolClient',
                'cognito-idp:DescribeUserPoolClient',
              ],
              resources: [
                userPool.userPoolArn,
              ],
            }),
          ],
        }),
        'DynamoDBAccess': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
              ],
              resources: [
                table.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    const getClientLogGroup = new cdk.aws_logs.LogGroup(this, 'GetClientFunctionLogGroup', {
      logGroupName: `/aws/lambda/${getClientFunctionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });
    const getClientFn = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'GetClientFunction', {
      functionName: getClientFunctionName,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: './lambda/get-client/index.ts',
      retryAttempts: 0,
      logGroup: getClientLogGroup,
      role: getClientLambdaExecutionRole,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        DCR_CLIENTS_TABLE: table.tableArn,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: [
          // Lambda レイヤーで提供されるモジュールは除外できる（オプション）
          '/opt/nodejs/node_modules/aws-lambda-web-adapter',

          'dotenv',
        ],
        nodeModules: ['express'], // 依存関係を指定
        // minify: true, // コードの最小化
        sourceMap: true, // ソースマップを有効化（デバッグ用）
        keepNames: true,
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);',
      },
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
    });


    const functionName = projectName;

    const webAdapter = cdk.aws_lambda.LayerVersion
      .fromLayerVersionArn(
        this,
        'LayerVersion',
        `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerArm64:25`);

    const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });
    new cdk.aws_lambda_nodejs.NodejsFunction(this, 'Lambda', {
      functionName,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: './lambda/mcp-server/index.ts',
      handler: 'run.sh',
      retryAttempts: 0,
      layers: [webAdapter],
      logGroup,
      environment: {
        // Lambda Web Adapter の設定
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_INVOKE_MODE: 'response_stream',
        RUST_LOG: 'info',
        PORT: '8080',
        NODE_PATH: '/opt/nodejs/node_modules',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      bundling: {
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
        nodeModules: ['express'], // 依存関係を指定
        // minify: true, // コードの最小化
        sourceMap: true, // ソースマップを有効化（デバッグ用）
        keepNames: true,
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        banner: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);',
      },
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
    });


    const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      authorizerName: 'Authorizer',
      cognitoUserPools: [userPool],
    });

    const api = new cdk.aws_apigateway.RestApi(this, 'ApiGateway', {
      restApiName: `${projectName}-dynamic-client-register-api`,
      description: 'API for Dynamic Client Registration with MCP OAuth 2.1',
      endpointConfiguration: {
        types: [cdk.aws_apigateway.EndpointType.REGIONAL],
      },
    });
    const apiRoot = api.root;
    const registerResource = apiRoot.addResource('register');
    registerResource.addCorsPreflight({
      allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
      allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      allowHeaders: cdk.aws_apigateway.Cors.DEFAULT_HEADERS,
      allowCredentials: true,
      disableCache: true,
      statusCode: 200,
    });
    const registerMethod = registerResource.addMethod(
      'POST',
      new cdk.aws_apigateway.LambdaIntegration(
        registerClientFn,
        {
          proxy: true,
        },
      ),
      {
        authorizer,
      },
    );

    const clientsResource = apiRoot.addResource('clients');
    const clientMethod = clientsResource.addResource('{client_id}').addMethod(
      'GET',
      new cdk.aws_apigateway.LambdaIntegration(
        getClientFn,
        {
          proxy: true,
        },
      ),
      {
        authorizer,
      },
    );

    const deployment = new cdk.aws_apigateway.Deployment(this, 'ApiDeployment', {
      api,
      stageName: 'v1',
    });
    deployment.node.addDependency(
      registerMethod,
      clientMethod,
    );

    registerClientFn.addPermission('RegisterClientPermission', {
      principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/POST/register`,
    });

    getClientFn.addPermission('GetClientPermission', {
      principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/GET/clients/{client_id}`,
    });

    new cdk.aws_apigateway.GatewayResponse(this, 'UnauthorizedGatewayResponse', {
      restApi: api,
      type: cdk.aws_apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': '\'*\'',
      },
    });


    new cdk.aws_apigateway.GatewayResponse(this, 'ClientErrorGatewayResponse', {
      restApi: api,
      type: cdk.aws_apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': '\'*\'',
      },
    });


    new cdk.aws_apigateway.GatewayResponse(this, 'ServerErrorGatewayResponse', {
      restApi: api,
      type: cdk.aws_apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': '\'*\'',
      },
    });
  }
}
