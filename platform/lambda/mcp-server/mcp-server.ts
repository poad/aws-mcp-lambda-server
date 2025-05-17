import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import weather from './tools/WeatherTool';

// サーバーインスタンスの作成
export const server = new McpServer({
  name: 'WeatherTools',
  version: '0.1.0',
});

server.tool(
  'weather',
  'Get weather information for a city',
  { city: z.string().describe('City name') },
  weather,
);
