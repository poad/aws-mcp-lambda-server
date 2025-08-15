// eslint-disable-next-line import/no-unresolved
import { APIGatewayProxyHandler } from 'aws-lambda';
// eslint-disable-next-line import/no-unresolved
import * as uuid from 'uuid';
import {
  createResponse,
  getClient,
  getAuthorizationByCode,
  getAuthorizationByToken,
  generateAccessToken,
  generateRefreshToken,
  saveAuthorization,
  verifyPKCE,
} from './utils';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return createResponse(405, {
        error: 'method_not_allowed',
        error_description: 'メソッドが許可されていません',
      });
    }

    // リクエストボディの解析
    let body: Record<string, string> = {};
    if (event.body) {
      if (event.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        const pairs = decodeURIComponent(event.body).split('&');
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          body[key] = value;
        }
      } else {
        body = JSON.parse(event.body);
      }
    }

    const {
      grant_type,
      client_id,
      client_secret,
      code,
      redirect_uri,
      code_verifier,
      refresh_token,
    } = body;

    // クライアント認証
    const client = await getClient(client_id);
    if (!client || client.clientSecret !== client_secret) {
      return createResponse(401, {
        error: 'invalid_client',
        error_description: 'クライアント認証に失敗しました',
      });
    }

    // OAuth 2.1でサポートするgrant_type
    if (grant_type === 'authorization_code') {
      // 認可コードフロー
      if (!code || !redirect_uri || !code_verifier) {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: '必須パラメータが不足しています',
        });
      }

      // 認可コードの検証
      const authData = await getAuthorizationByCode(code);

      // 認可コードの検証
      if (!authData || authData.clientId !== client_id || authData.redirectUri !== redirect_uri) {
        return createResponse(400, {
          error: 'invalid_grant',
          error_description: '無効な認可コードです',
        });
      }

      // PKCE検証（OAuth 2.1では必須）
      if (!verifyPKCE(code_verifier, authData.codeChallengeMethod, authData.codeChallenge)) {
        return createResponse(400, {
          error: 'invalid_grant',
          error_description: 'PKCE検証に失敗しました',
        });
      }

      // 認可コードは一度しか使えない (CSRF対策)
      // 実際の実装では、認可コードを使用済みにマークする処理が必要

      // トークンの生成
      const accessToken = generateAccessToken();
      const refreshToken = generateRefreshToken();
      const authorizationId = uuid.v4();

      // トークン情報の保存
      await saveAuthorization({
        id: authorizationId,
        accessToken,
        refreshToken,
        clientId: client_id,
        userId: authData.userId,
        scope: authData.scope,
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 3600, // アクセストークンは1時間有効
      });

      // レスポンスの作成
      return createResponse(200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refreshToken,
        scope: authData.scope,
      });
    }
    else if (grant_type === 'refresh_token') {
      // リフレッシュトークンフロー
      if (!refresh_token) {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: 'リフレッシュトークンが必要です',
        });
      }

      // リフレッシュトークンの検証
      const tokenData = await getAuthorizationByToken(refresh_token, 'refreshToken');

      if (!tokenData || tokenData.clientId !== client_id) {
        return createResponse(400, {
          error: 'invalid_grant',
          error_description: '無効なリフレッシュトークンです',
        });
      }

      // 新しいアクセストークンの生成
      const newAccessToken = generateAccessToken();
      const authorizationId = uuid.v4();

      // トークン情報の更新
      await saveAuthorization({
        id: authorizationId,
        accessToken: newAccessToken,
        refreshToken: tokenData.refreshToken, // 同じリフレッシュトークンを再利用
        clientId: client_id,
        userId: tokenData.userId,
        scope: tokenData.scope,
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 3600, // アクセストークンは1時間有効
      });

      // レスポンスの作成
      return createResponse(200, {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: tokenData.scope,
      });
    }
    else {
      return createResponse(400, {
        error: 'unsupported_grant_type',
        error_description: 'サポートされていないgrant_typeです',
      });
    }
  } catch (error) {
    console.error('トークンエンドポイントエラー:', error);
    return createResponse(500, {
      error: 'server_error',
      error_description: 'サーバーエラーが発生しました',
    });
  }
};
