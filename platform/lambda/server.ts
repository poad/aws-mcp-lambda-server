/**
 * @file lambda/server.ts
 *
 * ローカルで MCP サーバーを起動するためのエントリーポイントです。
 *
 * このスクリプトは `tsx` や `node` で直接実行可能で、`app.fetch`
 * を Hono の Node サーバーとして起動します。実行例:
 *
 * ```bash
 * tsx lambda/server.ts
 * ```
 *
 * `process.env.PORT` が設定されていない場合はデフォルトで `8080` を使用します。
 * 本ファイルは開発・ローカルテスト用であり、本番環境では `lambda/index.ts`
 * の Lambda ハンドラが利用されます。
 */
import { serve } from '@hono/node-server';
import { Logger } from '@aws-lambda-powertools/logger';
import { app } from './app';

const logger = new Logger();
const port = Number.parseInt(process.env.PORT ?? '8080');

const startServer = () => {
  try {
    return serve({
      fetch: app.fetch,
      port,
    }, (info) => {
      logger.info(`MCP サーバーがポート ${info.port} でリッスン中`);
    });
  } catch (error) {
    logger.error('サーバーのセットアップに失敗しました:', error instanceof Error ? error : JSON.stringify(error));
    process.exit(1);
  }
};
const server = startServer();

// graceful shutdown
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});
