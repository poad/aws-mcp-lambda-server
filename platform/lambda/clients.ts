import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import * as crypto from 'crypto';
import { createResponse } from './utils';
import { DynamoDBClientConfig, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// 環境変数
const CLIENTS_TABLE_NAME = process.env.CLIENTS_TABLE_NAME || '';

// AWS SDKクライアント
// AWS SDKクライアント
const config: DynamoDBClientConfig = {
  // ...接続設定...
};
const dbClient = new DynamoDBClient(config);
const documentClient = DynamoDBDocumentClient.from(dbClient);

// クライアントシークレットの生成
function generateClientSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

// クライアントIDの生成
function generateClientId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // パス変数からクライアントIDを取得
    const clientId = event.pathParameters?.clientId;

    // リクエストメソッドに基づいて処理
    switch (event.httpMethod) {
      case 'GET':
        return await handleGetRequest(clientId);

      case 'POST':
        return await handlePostRequest(event);

      case 'PUT':
        if (!clientId) {
          return createResponse(400, { error: 'クライアントIDが必要です' });
        }
        return await handlePutRequest(clientId, event);

      case 'DELETE':
        if (!clientId) {
          return createResponse(400, { error: 'クライアントIDが必要です' });
        }
        return await handleDeleteRequest(clientId);

      default:
        return createResponse(405, { error: 'メソッドが許可されていません' });
    }
  } catch (error) {
    console.error('クライアント管理エンドポイントエラー:', error);
    return createResponse(500, { error: 'サーバーエラーが発生しました' });
  }
};

// GET: クライアント情報の取得
async function handleGetRequest(clientId?: string): Promise<APIGatewayProxyResult> {
  // 特定のクライアント情報を取得
  if (clientId) {
    const result = await documentClient.send(new GetCommand({
      TableName: CLIENTS_TABLE_NAME,
      Key: { clientId },
    }));

    if (!result.Item) {
      return createResponse(404, { error: 'クライアントが見つかりません' });
    }

    // クライアントシークレットは返さない
    const client = result.Item;
    delete client.clientSecret;

    return createResponse(200, client);
  }

  // すべてのクライアント情報を取得
  const result = await await documentClient.send(new ScanCommand({
    TableName: CLIENTS_TABLE_NAME,
    ProjectionExpression: 'clientId, #name, createdAt, updatedAt, redirectUris, allowedScopes',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  }));

  return createResponse(200, result.Items || []);
}

// POST: 新しいクライアントの作成
async function handlePostRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // リクエストボディの解析
  const body = event.body ? JSON.parse(event.body) : {};

  // 必須パラメータのチェック
  const { name, redirectUris, allowedScopes } = body;

  if (!name || !Array.isArray(redirectUris) || redirectUris.length === 0) {
    return createResponse(400, {
      error: '必須パラメータが不足しています',
      required: ['name', 'redirectUris'],
    });
  }

  // クライアントIDとシークレットの生成
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const now = new Date().toISOString();

  // クライアント情報の保存
  const client = {
    clientId,
    clientSecret,
    name,
    redirectUris,
    allowedScopes: Array.isArray(allowedScopes) ? allowedScopes : ['default'],
    createdAt: now,
    updatedAt: now,
  };

  await documentClient.send(new PutCommand({
    TableName: CLIENTS_TABLE_NAME,
    Item: client,
  }));

  // レスポンスにはシークレットを含める（初回のみ）
  return createResponse(201, client);
}

// PUT: クライアント情報の更新
async function handlePutRequest(clientId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // クライアントの存在確認
  const existingClient = await documentClient.send(new GetCommand({
    TableName: CLIENTS_TABLE_NAME,
    Key: { clientId },
  }));

  if (!existingClient.Item) {
    return createResponse(404, { error: 'クライアントが見つかりません' });
  }

  // リクエストボディの解析
  const body = event.body ? JSON.parse(event.body) : {};

  // 更新可能なフィールド
  const { name, redirectUris, allowedScopes, resetSecret } = body;

  // 更新するクライアント情報
  const updates: Record<string, string | string[]> = {
    ...existingClient.Item,
    updatedAt: new Date().toISOString(),
  };

  // 更新対象のフィールド
  if (name) updates.name = name;
  if (Array.isArray(redirectUris) && redirectUris.length > 0) updates.redirectUris = redirectUris;
  if (Array.isArray(allowedScopes)) updates.allowedScopes = allowedScopes;

  // シークレットのリセットが要求された場合
  if (resetSecret === true) {
    updates.clientSecret = generateClientSecret();
  }

  // クライアント情報の更新
  await documentClient.send(new PutCommand({
    TableName: CLIENTS_TABLE_NAME,
    Item: updates,
  }));

  // レスポンス作成（シークレットをリセットした場合のみ含める）
  const response = { ...updates };
  if (resetSecret !== true) {
    delete response.clientSecret;
  }

  return createResponse(200, response);
}

// DELETE: クライアントの削除
async function handleDeleteRequest(clientId: string): Promise<APIGatewayProxyResult> {
  // クライアントの存在確認
  const existingClient = await documentClient.send(new GetCommand({
    TableName: CLIENTS_TABLE_NAME,
    Key: { clientId },
  }));

  if (!existingClient.Item) {
    return createResponse(404, { error: 'クライアントが見つかりません' });
  }

  // クライアント情報の削除
  await documentClient.send(new DeleteCommand({
    TableName: CLIENTS_TABLE_NAME,
    Key: { clientId },
  }));

  return createResponse(204, null);
}
