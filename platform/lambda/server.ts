import { serve } from '@hono/node-server';
import { Logger } from '@aws-lambda-powertools/logger';
import { app } from '.';

const logger = new Logger();

try {
  const port = Number.parseInt(process.env.PORT ?? '8080');
  serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    logger.info(`MCP サーバーがポート ${info.port} でリッスン中`);
  });
} catch (error) {
  logger.error('サーバーのセットアップに失敗しました:', error instanceof Error ? error : JSON.stringify(error));
  process.exit(1);
}
