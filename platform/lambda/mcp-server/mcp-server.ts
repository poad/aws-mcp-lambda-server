import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import weather from './tools/WeatherTool.js';

// サーバーインスタンスの作成
export const server = new McpServer({
  name: 'WeatherTools',
  version: '0.1.0',
});

server.tool(
  'weather',
  '街の天気予報を取得します',
  { city: z.string().describe('街の名前') },
  weather,
);
