import { handle } from 'hono/aws-lambda';
import { Context, Hono } from 'hono';
import { Logger } from '@aws-lambda-powertools/logger';
import { BlankEnv, BlankInput } from 'hono/types';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp-server';

const logger = new Logger();

/**
 * Hono アプリケーションインスタンス。MCP エンドポイントを処理します。
 *
 * Amazon Lambda 関数や Amazon Bedrock AgentCore Runtimeでの使用を想定した実装となっています。
 * そのため、リクエストごとにMCPサーバーインスタンスを生成しています。
 *
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
  const { req, res } = toReqRes(c.req.raw);
  const server = createMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // セッションIDを生成しない（ステートレスモード）
      enableJsonResponse: true,
    });
    await server.connect(transport);
    logger.trace('MCP リクエストを受信');
    await transport.handleRequest(req, res, await c.req.json());

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    return toFetchResponse(res);
  } catch (error) {
    return handleError(c, error, 'MCP 接続中のエラー:');
  }
});

app.get('/mcp', methodNotAllowedHandler);
app.delete('/mcp', methodNotAllowedHandler);

// Lambda handler
export const handler = handle(app);

// 以下、ローカルサーバー向けコード

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const main = async () => {
    const { z } = await import('zod');
    // 0 と well-known ポートはこのアプリの仕様として許可しない
    const portSchema = z.coerce.number().int().min(1024).max(65535).default(8080);
    const parsePort = (value: string | undefined): number => {
      const result = portSchema.safeParse(value);
      if (!result.success) {
        logger.warn(`無効または要件で許可されていないポート値: ${result.error.issues[0].message} (デフォルト: 8080に設定)`);
        return 8080;
      }
      return result.data;
    };

    const { serve } = await import('@hono/node-server');

    const port = parsePort(process.env.PORT);

    try {
      const server = serve({
        fetch: app.fetch,
        port,
      }, (info) => {
        logger.info(`MCP サーバーがポート ${info.port} でリッスン中`);
      });
      // Graceful shutdown
      const shutdown = () => {
        logger.info('サーバーをシャットダウンしています...');
        const shutdownTimeout = setTimeout(() => {
          logger.warn('シャットダウンがタイムアウトしました。強制終了します。');
          process.exit(1);
        }, 5000); // 5秒のタイムアウト

        server.close(() => {
          clearTimeout(shutdownTimeout);
          logger.info('サーバーが正常にシャットダウンされました');
          process.exit(0);
        });
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
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
