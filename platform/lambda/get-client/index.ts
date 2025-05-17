import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

// Initialize AWS SDK client
const dynamoClient = new DynamoDBClient();

// Configuration
const DCR_CLIENTS_TABLE = process.env.DCR_CLIENTS_TABLE;

/**
 * Lambda function to get client registration information
 */
export const handler = async (event: APIGatewayProxyEvent | APIGatewayProxyEventV2) => {
  try {
    console.log('Event received:', JSON.stringify(event));

    // Get client_id from path parameters
    const clientId = event.pathParameters?.client_id;

    if (!clientId) {
      return formatResponse(400, {
        error: 'invalid_request',
        error_description: 'client_id is required',
      });
    }

    // Get client data from DynamoDB
    const getItemParams = {
      TableName: DCR_CLIENTS_TABLE,
      Key: marshall({ client_id: clientId }),
    };

    const getItemCommand = new GetItemCommand(getItemParams);
    const response = await dynamoClient.send(getItemCommand);

    if (!response.Item) {
      return formatResponse(404, {
        error: 'invalid_client',
        error_description: 'Client not found',
      });
    }

    // Extract and return client metadata
    const item = unmarshall(response.Item);
    const clientMetadata = JSON.parse(item.client_metadata);

    // Remove sensitive information
    delete clientMetadata.client_secret;

    return formatResponse(200, clientMetadata);
  } catch (error) {
    console.error('Error retrieving client information:', error);

    return formatResponse(500, {
      error: 'server_error',
      error_description: 'An error occurred while retrieving client information',
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
