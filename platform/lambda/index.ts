import { handle } from 'hono/aws-lambda';
import { Context, Hono } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Logger } from '@aws-lambda-powertools/logger';
import { BlankEnv, BlankInput } from 'hono/types';
import { createMcpServer } from './mcp-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

const closeTransportAndServer = async (server: McpServer, transport: StreamableHTTPTransport) => {
  // 両方のクローズを確実に実行（片方が失敗してももう片方を実行）
  const closeResults = await Promise.allSettled([
    transport.close().catch((error) => {
      logger.error('Transport close failed:', { error: error instanceof Error ? { message: error.message, stack: error.stack } : error });
      throw error;
    }),
    server.close().catch((error) => {
      logger.error('Server close failed:', { error: error instanceof Error ? { message: error.message, stack: error.stack } : error });
      throw error;
    }),
  ]);

  // クローズエラーをログ出力
  closeResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      const resourceName = index === 0 ? 'transport' : 'server';
      logger.error(`Error closing ${resourceName}:`, result.reason);
    }
  });
};

// ルートを設定
app.post('/mcp', async (c) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: undefined, // セッションIDを生成しない（ステートレスモード）
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    try {
      logger.trace('MCP リクエストを受信');
      return await transport.handleRequest(c);
    } catch (error) {
      return handleError(c, error, 'MCP リクエスト処理中のエラー:');
    } finally {
      await closeTransportAndServer(server, transport);
    }
  } catch (error) {
    // サーバー接続に失敗した場合、transportのみクローズ（serverは未接続のため）
    try {
      await transport.close();
    } catch (closeError) {
      logger.error('Transport close failed after connection error:', { closeError });
    }
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
    const portSchema = z.coerce.number().int().min(0).max(65535).default(8080);
    const parsePort = (value: string | undefined): number => {
      const result = portSchema.safeParse(value);
      if (!result.success) {
        logger.warn(`無効なポート値: ${result.error.issues[0].message} (デフォルト: 8080に設定)`);
        return 8080;
      }
      const port = result.data;
      if (port === 0) {
        logger.warn('ポート0が指定されました。開発環境では予測可能なポートを使用するため、デフォルトの8080を使用します。');
        return 8080;
      }
      if (port < 1024) {
        logger.warn(`特権ポート ${port} が指定されました。代わりにデフォルトの8080を使用します。`);
        return 8080;
      }
      return port;
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
        server.close(() => {
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
