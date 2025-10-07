import { handle } from 'hono/aws-lambda';
import { Context, Hono } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Logger } from '@aws-lambda-powertools/logger';
import { BlankEnv, BlankInput } from 'hono/types';
import { server } from './mcp-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const logger = new Logger();

/**
 * Hono アプリケーションインスタンス。MCP エンドポイントを処理します。
 * @type {Hono}
 */
export const app = new Hono();

const methodNotAllowedHandler = async (
  c: Context<BlankEnv, '/mcp', BlankInput>,
) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'メソッドは許可されていません。',
      },
      id: null,
    },
    { status: 405 },
  );
};

const handleError = (
  c: Context<BlankEnv, '/mcp', BlankInput>,
  reason: unknown,
  logMessage: string,
) => {
  const errorDetails = reason instanceof Error
    ? { message: reason.message, stack: reason.stack, name: reason.name }
    : { reason };
  logger.error(logMessage, errorDetails);
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: '内部サーバーエラー',
      },
      id: null,
    },
    { status: 500 },
  );
};

// ルートを設定
app.post('/mcp', async (c) => {
  try {
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined, // セッションIDを生成しない（ステートレスモード）
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      logger.trace('MCP リクエストを受信');
      return await transport
        .handleRequest(c)
        .catch((reason) => {
          return handleError(c, reason, 'MCP リクエスト処理中のエラー:');
        })
        .finally(async () => {
          try {
            await server.close();
          } catch (closeError) {
            logger.error('サーバーのクローズ中のエラー:', { error: closeError });
          }
          if (transport) {
            try {
              await transport.close();
            } catch (closeError) {
              logger.error('トランスポートのクローズ中のエラー:', { error: closeError });
            }
          }
          logger.trace('MCP リクエストの処理が完了');
        });
    } catch (error) {
      if (transport) {
        try {
          await transport.close();
        } catch (closeError) {
          logger.error('トランスポートのクローズ中のエラー:', { error: closeError });
        }
      }
      return handleError(c, error, 'サーバー接続中のエラー:');
    }
  } catch (error) {
    return handleError(c, error, 'トランスポート生成エラー:');
  }
});

[app.get, app.delete].forEach((method) => {
  method('/mcp', methodNotAllowedHandler);
});

// Lambda handler
export const handler = handle(app);

// 以下、ローカルサーバー向けコード

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const handleSignal = async (server: McpServer) => {
    if (server) {
      try {
        await server.close();
        process.exit(0);
      } catch (err) {
        logger.error('error', { error: err });
        process.exit(1);
      }
    }
  };

  const { z } = await import('zod');
  const portSchema = z.coerce.number().int().min(0).max(65535).default(8080);
  const parsePort = (value: string | undefined): number => {
    const result = portSchema.safeParse(value);
    if (!result.success) {
      logger.warn(`${result.error.issues[0].message} (デフォルト: 8080に設定)`);
      return 8080;
    }
    const port = result.data;
    if (port < 1024) {
      logger.warn(`特権ポート ${port} を使用します。管理者権限が必要な場合があります。`);
    }
    return port;
  };const main = async () => {
    const { serve } = await import('@hono/node-server');

    const port = parsePort(process.env.PORT);

    try {
      // graceful shutdown
      ['SIGINT', 'SIGTERM'].forEach((signal) => {
        process.on(signal, async () => {
          await handleSignal(server);
        });
      });

      serve({
        fetch: app.fetch,
        port,
      }, (info) => {
        logger.info(`MCP サーバーがポート ${info.port} でリッスン中`);
      });
    } catch (error) {
      logger.error('サーバーのセットアップに失敗しました:', { error });
      process.exit(1);
    }
  };
  main().catch((err) => {
    logger.error('error', { error: err });
    process.exit(1);
  });
}
