import { Logger } from '@aws-lambda-powertools/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { createHonoApp } from 'aws-lambda-mcp-server';
import weather from './tools/WeatherTool.js';

const logger = new Logger();

const createMcpServer = () => {
  const server = new McpServer({
    name: 'WeatherTools',
    version: '0.1.0',
  });

  server.registerTool(
    'weather',
    {
      description: '街の天気予報を取得します',
      inputSchema: { city: z.string().describe('街の名前') },
    },
    weather,
  );
  return server;
};

const app = createHonoApp(createMcpServer);

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
