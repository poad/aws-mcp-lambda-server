import { DynamoDBClient, DynamoDBClientConfig, QueryCommand } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as jose from 'jose';
import * as crypto from 'crypto';
import { unmarshall } from '@aws-sdk/util-dynamodb';
 
import { APIGatewayProxyResult } from 'aws-lambda';

// 環境変数
const AUTHORIZATION_TABLE_NAME = process.env.AUTHORIZATION_TABLE_NAME ?? '';
const CLIENTS_TABLE_NAME = process.env.CLIENTS_TABLE_NAME ?? '';

// AWS SDKクライアント
const config: DynamoDBClientConfig = {
  // ...接続設定...
};
const dbClient = new DynamoDBClient(config);
const documentClient = DynamoDBDocumentClient.from(dbClient);

// 認可コードの生成
export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

// アクセストークンの生成
export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// リフレッシュトークンの生成
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

// JWTの検証
export function verifyJwt(token: string, secret: string): Promise<jose.JWTVerifyResult<jose.JWTPayload>> {
  try {
    return jose.jwtVerify(token, new TextEncoder().encode(secret));
  } catch {
    throw new Error('無効なトークン');
  }
}

// JWTの生成
export async function generateJwt(payload: jose.JWTPayload, secret: string, expiresIn: string): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

// クライアント情報の取得
export async function getClient(clientId: string): Promise<Record<string, string | number | string[]> | undefined> {
  try {
    const result = await documentClient.send(new GetCommand({
      TableName: CLIENTS_TABLE_NAME,
      Key: { clientId },
    }));

    return result.Item;
  } catch (error) {
    console.error('クライアント情報の取得エラー:', error);
    throw new Error('クライアント情報の取得に失敗しました');
  }
}

// 認可情報の保存
export async function saveAuthorization(authData: Record<string, string | number | string[]>): Promise<void> {
  try {
    await documentClient.send(new PutCommand({
      TableName: AUTHORIZATION_TABLE_NAME,
      Item: authData,
    }));
  } catch (error) {
    console.error('認可情報の保存エラー:', error);
    throw new Error('認可情報の保存に失敗しました');
  }
}

// 認可コードの検証と取得
export async function getAuthorizationByCode(code: string): Promise<Record<string, string> | undefined> {
  try {
    const result = await documentClient.send(new QueryCommand({
      TableName: AUTHORIZATION_TABLE_NAME,
      IndexName: 'codeIndex',
      KeyConditionExpression: 'code = :code',
      ExpressionAttributeValues: {
        ':code': {
          S: code,
        },
      },
    }));

    if (!result.Items || result.Items.length === 0) {
      throw new Error('無効な認可コード');
    }

    return unmarshall(result.Items[0]);
  } catch (error) {
    console.error('認可コード検証エラー:', error);
    throw new Error('認可コードの検証に失敗しました');
  }
}

// トークンの取得
export async function getAuthorizationByToken(token: string, tokenType: 'accessToken' | 'refreshToken'): Promise<Record<string, string> | undefined> {
  try {
    const result = await documentClient.send(new QueryCommand({
      TableName: AUTHORIZATION_TABLE_NAME,
      IndexName: `${tokenType}Index`,
      KeyConditionExpression: `${tokenType} = :token`,
      ExpressionAttributeValues: {
        ':token': {
          S: token,
        },
      },
    }));

    if (!result.Items || result.Items.length === 0) {
      throw new Error('無効なトークン');
    }

    return result.Items[0] ? unmarshall(result.Items[0]) : undefined;
  } catch (error) {
    console.error('トークン検証エラー:', error);
    throw new Error('トークンの検証に失敗しました');
  }
}

// トークンの取り消し
export async function revokeToken(id: string): Promise<void> {
  try {
    await documentClient.send(new DeleteCommand({
      TableName: AUTHORIZATION_TABLE_NAME,
      Key: { id },
    }));
  } catch (error) {
    console.error('トークン取り消しエラー:', error);
    throw new Error('トークンの取り消しに失敗しました');
  }
}

// レスポンスヘルパー
export function createResponse(statusCode: number, body: Record<string, string | number | string[]> | Record<string, string | number | string[]>[] | null): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

// OAuth 2.1のスコープ検証
export function validateScopes(requestedScopes: string, allowedScopes: string[]): string[] {
  const scopes = requestedScopes.split(' ').filter((scope) => allowedScopes.includes(scope));
  return scopes.length > 0 ? scopes : ['default'];
}

// PKCE検証
export function verifyPKCE(codeVerifier: string, codeChallengeMethod: string, codeChallenge: string): boolean {
  if (codeChallengeMethod === 'S256') {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return hash === codeChallenge;
  } else if (codeChallengeMethod === 'plain') {
    return codeVerifier === codeChallenge;
  }
  return false;
}
