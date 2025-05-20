import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Logger } from '@aws-lambda-powertools/logger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { server } from './mcp-server';
import { toFetchResponse, toReqRes } from 'fetch-to-node';

const logger = new Logger();

const app = new Hono();

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});
// try {
await server.connect(transport);

// ルートを設定
app.post('/mcp', async (c) => {
  const { req, res } = toReqRes(c.req.raw);
  try {
    const body = await c.req.json();
    logger.trace('MCP リクエストを受信:', body);
    await transport.handleRequest(req, res, body);

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    return toFetchResponse(res);
  } catch (error) {
    console.error('MCP リクエスト処理中のエラー:', error);
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      },
      { status: 500 },
    );
  }
});

app.get('/mcp', async (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'メソッドは許可されていません。.',
      },
      id: null,
    },
    { status: 405 },
  );
});

app.delete('/mcp', async (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'メソッドは許可されていません。.',
      },
      id: null,
    },
    { status: 405 },
  );
});
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
