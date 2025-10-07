import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import weather from './tools/WeatherTool.js';

/**
 * 新しいMCPサーバーインスタンスを作成します。
 * WeatherTools用のツールが登録されたサーバーを返します。
 * @returns {McpServer} 設定済みのMCPサーバーインスタンス
 */
export const createMcpServer = () => {
  const server = new McpServer({
    name: 'WeatherTools',
    version: '0.1.0',
  });

  server.tool(
    'weather',
    '街の天気予報を取得します',
    { city: z.string().describe('街の名前') },
    weather,
  );
  return server;
};
