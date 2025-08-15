// eslint-disable-next-line import/no-unresolved
import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  createResponse,
  getClient,
  getAuthorizationByToken,
  revokeToken,
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
      token,
      token_type_hint,
      client_id,
      client_secret,
    } = body;

    // 必須パラメータのチェック
    if (!token || !client_id) {
      return createResponse(400, {
        error: 'invalid_request',
        error_description: '必須パラメータが不足しています',
      });
    }

    // クライアント認証
    const client = await getClient(client_id);
    if (!client || client.clientSecret !== client_secret) {
      return createResponse(401, {
        error: 'invalid_client',
        error_description: 'クライアント認証に失敗しました',
      });
    }

    // トークンタイプに基づいて検証
    let tokenData;
    if (token_type_hint === 'refresh_token') {
      tokenData = await getAuthorizationByToken(token, 'refreshToken');
    } else {
      // デフォルトはアクセストークンとして扱う
      tokenData = await getAuthorizationByToken(token, 'accessToken');

      // アクセストークンとして見つからない場合、リフレッシュトークンとして試す
      if (!tokenData) {
        tokenData = await getAuthorizationByToken(token, 'refreshToken');
      }
    }

    // トークンが見つからない、または異なるクライアントのトークンの場合
    if (!tokenData || tokenData.clientId !== client_id) {
      // OAuth 2.1の仕様では、無効なトークンでも成功レスポンスを返す
      return createResponse(200, {});
    }

    // トークンの取り消し
    await revokeToken(tokenData.id);

    // 成功レスポンス
    return createResponse(200, {});
  } catch (error) {
    console.error('トークン取り消しエンドポイントエラー:', error);
    return createResponse(500, {
      error: 'server_error',
      error_description: 'サーバーエラーが発生しました',
    });
  }
};
