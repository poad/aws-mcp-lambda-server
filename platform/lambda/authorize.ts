import { APIGatewayProxyHandler } from 'aws-lambda';

import { v4 as uuidv4 } from 'uuid';
import {
  createResponse,
  getClient,
  generateAuthorizationCode,
  saveAuthorization,
  validateScopes,
} from './utils';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // GETリクエスト（初期認可リクエスト）の場合
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};

      // 必須パラメータのチェック
      const {
        response_type,
        client_id = '',
        redirect_uri = '',
        state,
        scope,
        code_challenge,
        code_challenge_method,
      } = params;

      // OAuth 2.1では response_type=code のみ対応
      if (response_type !== 'code') {
        return createResponse(400, {
          error: 'unsupported_response_type',
          error_description: 'サポートされていないレスポンスタイプです',
        });
      }

      // PKCEは必須（OAuth 2.1要件）
      if (!code_challenge || !code_challenge_method) {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: 'PKCE パラメータが不足しています',
        });
      }

      // code_challenge_methodの検証
      if (code_challenge_method !== 'S256' && code_challenge_method !== 'plain') {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: '無効なcode_challenge_methodです',
        });
      }

      // クライアント情報の検証
      const client = await getClient(client_id);
      if (!client) {
        return createResponse(400, {
          error: 'invalid_client',
          error_description: '無効なクライアントIDです',
        });
      }

      // リダイレクトURIの検証
      if (!(client.redirectUris as string[]).includes(redirect_uri)) {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: '無効なリダイレクトURIです',
        });
      }

      // スコープの検証
      const validatedScopes = validateScopes(scope ?? '', client.allowedScopes as string[]);

      // ユーザー認証用HTMLを返す（実際のプロダクションでは、CognitoのHosted UIなどを使用するか、より洗練されたUIを提供）
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
        },
        body: `
          <!DOCTYPE html>
          <html>
          <head>
            <title>認証</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
              .container { max-width: 500px; margin: 0 auto; }
              h1 { color: #333; }
              form { background: #f9f9f9; padding: 20px; border-radius: 5px; }
              label { display: block; margin-bottom: 5px; }
              input { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 3px; }
              button { background: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 3px; cursor: pointer; }
              .scope { margin: 15px 0; }
              .scope-item { margin: 5px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>${client.name}がアクセスを要求しています</h1>
              <p>以下の権限を許可しますか？</p>

              <div class="scope">
                ${validatedScopes.map((s) => `<div class="scope-item">・${s}</div>`).join('')}
              </div>

              <form method="POST">
                <input type="hidden" name="client_id" value="${client_id}">
                <input type="hidden" name="redirect_uri" value="${redirect_uri}">
                <input type="hidden" name="state" value="${state || ''}">
                <input type="hidden" name="scope" value="${validatedScopes.join(' ')}">
                <input type="hidden" name="code_challenge" value="${code_challenge}">
                <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">

                <h2>ログイン</h2>
                <label for="username">ユーザー名:</label>
                <input type="text" id="username" name="username" required>

                <label for="password">パスワード:</label>
                <input type="password" id="password" name="password" required>

                <button type="submit">許可する</button>
              </form>
            </div>
          </body>
          </html>
        `,
      };
    }
    // POSTリクエスト（ユーザー認証とコードの発行）の場合
    else if (event.httpMethod === 'POST') {
      const params = event.body ? JSON.parse(event.body) : {};

      // フォームデータの解析（実際にはAPI Gatewayで設定が必要）
      const formData: Record<string, string> = {};
      if (event.body && event.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        const pairs = event.body.split('&');
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          formData[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
        }
      } else {
        Object.assign(formData, params);
      }

      const {
        client_id,
        redirect_uri,
        state,
        scope,
        code_challenge,
        code_challenge_method,
        username,
        password,
      } = formData;

      // 実際の環境では、ここでCognitoを使用してユーザー認証を行う
      // このサンプルでは簡易的に実装

      // ユーザー認証の簡易シミュレーション（実際の実装ではこのような認証はしない）
      if (!username || !password) {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: 'ユーザー名とパスワードが必要です',
        });
      }

      // クライアント情報の検証
      const client = await getClient(client_id);
      if (!client) {
        return createResponse(400, {
          error: 'invalid_client',
          error_description: '無効なクライアントIDです',
        });
      }

      // リダイレクトURIの検証
      if (!(client.redirectUris as string[]).includes(redirect_uri)) {
        return createResponse(400, {
          error: 'invalid_request',
          error_description: '無効なリダイレクトURIです',
        });
      }

      // 認可コードの生成
      const code = generateAuthorizationCode();
      const authId = uuidv4();

      // 認可情報の保存
      await saveAuthorization({
        id: authId,
        code,
        clientId: client_id,
        userId: username, // 実際のユーザーIDを使用
        scope: scope || '',
        redirectUri: redirect_uri,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 600, // 10分間有効
      });

      // リダイレクトの作成
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.append('code', code);
      if (state) {
        redirectUrl.searchParams.append('state', state);
      }

      // リダイレクト応答
      return {
        statusCode: 302,
        headers: {
          'Location': redirectUrl.toString(),
        },
        body: '',
      };
    }

    // その他のHTTPメソッドには対応しない
    return createResponse(405, {
      error: 'method_not_allowed',
      error_description: 'メソッドが許可されていません',
    });
  } catch (error) {
    console.error('認可エンドポイントエラー:', error);
    return createResponse(500, {
      error: 'server_error',
      error_description: 'サーバーエラーが発生しました',
    });
  }
};
