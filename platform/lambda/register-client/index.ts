import { CognitoIdentityProviderClient, CreateUserPoolClientCommand, OAuthFlowType, PreventUserExistenceErrorTypes, TimeUnitsType } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

// Initialize AWS SDK clients
const cognitoClient = new CognitoIdentityProviderClient();
const dynamoClient = new DynamoDBClient();

// Configuration
const USER_POOL_ID = process.env.USER_POOL_ID;
const DCR_CLIENTS_TABLE = process.env.DCR_CLIENTS_TABLE;

/**
 * Lambda function to handle dynamic client registration
 */
export const handler = async (event: APIGatewayProxyEvent | APIGatewayProxyEventV2) => {
  try {
    console.log('Event received:', JSON.stringify(event));

    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!body.redirect_uris || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
      return formatResponse(400, {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris is required and must be an array',
      });
    }

    // Determine client name
    const clientName = body.client_name || `DCR Client ${Date.now()}`;

    // Map requested scopes or use defaults
    const allowedScopes = body.scope ? body.scope.split(' ') : ['openid', 'profile', 'email', 'mcp-api/read'];

    // Create client in Cognito
    const createClientParams = {
      UserPoolId: USER_POOL_ID,
      ClientName: clientName,
      GenerateSecret: true,
      RefreshTokenValidity: 30, // 30 days
      AllowedOAuthFlows: [
        OAuthFlowType.code,
      ],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: allowedScopes,
      CallbackURLs: body.redirect_uris,
      SupportedIdentityProviders: ['COGNITO'],
      PreventUserExistenceErrors: PreventUserExistenceErrorTypes.ENABLED,
      TokenValidityUnits: {
        AccessToken: TimeUnitsType.HOURS,
        IdToken: TimeUnitsType.HOURS,
        RefreshToken: TimeUnitsType.DAYS,
      },
      AccessTokenValidity: 1, // 1 hour
      IdTokenValidity: 1, // 1 hour
    };

    // Create the client in Cognito
    const createClientCommand = new CreateUserPoolClientCommand(createClientParams);
    const cognitoResponse = await cognitoClient.send(createClientCommand);

    console.log('Cognito client created:', cognitoResponse.UserPoolClient?.ClientId);

    // Construct client registration response
    const registrationResponse = {
      client_id: cognitoResponse.UserPoolClient?.ClientId,
      client_secret: cognitoResponse.UserPoolClient?.ClientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0, // Never expires
      redirect_uris: body.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'client_secret_basic',
      response_types: ['code'],
      client_name: clientName,
      scope: allowedScopes.join(' '),
    };

    // Store client metadata in DynamoDB
    const dynamoItem = {
      client_id: cognitoResponse.UserPoolClient?.ClientId,
      client_metadata: JSON.stringify(registrationResponse),
      registration_time: Date.now(),
      initial_request: JSON.stringify(body),
    };

    const putItemParams = {
      TableName: DCR_CLIENTS_TABLE,
      Item: marshall(dynamoItem),
    };

    const putItemCommand = new PutItemCommand(putItemParams);
    await dynamoClient.send(putItemCommand);

    console.log('Client registration stored in DynamoDB');

    // Return successful response
    return formatResponse(201, registrationResponse);
  } catch (error) {
    console.error('Error in client registration:', error);

    return formatResponse(500, {
      error: 'server_error',
      error_description: 'An error occurred during client registration',
    });
  }
};

/**
 * Format the API Gateway response
 */
function formatResponse(statusCode: number, body: Record<string, string | string[] | number | undefined>) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
