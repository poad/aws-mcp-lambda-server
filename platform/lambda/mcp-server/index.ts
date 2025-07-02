import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { StreamableHTTPTransport } from '@hono/mcp';
import { server } from './mcp-server';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger();

export const app = new Hono();

// ルートを設定
app.post('/mcp', async (c) => {
  try {
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined, // セッションIDを生成しない（ステートレスモード）
      enableJsonResponse: true,
    });
    await server.connect(transport);
    logger.trace('MCP リクエストを受信');

    return transport.handleRequest(c);
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

export const handler = handle(app);
