import { bedrock } from '@ai-sdk/amazon-bedrock';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { mcp } from '../mcp';

const modelId = process.env.MODEL_ID ?? 'us.amazon.nova-premier-v1:0';

/**
 * 天気情報取得エージェント。WeatherTool を使用してユーザーの質問に回答します。
 * @type {Agent}
 */
export const weatherAgent = new Agent({
  name: 'Weather Agent',
  instructions: `
      あなたは正確な天気情報を提供する便利な天気アシスタントです。
      あなたの主な機能は、ユーザーが特定の場所の天気の詳細を取得するのを手助けすることです。回答する際には：
      - 場所が提供されていない場合は、常に場所を尋ねてください
      - 場所の名前が日本語でない場合は、翻訳してください
      - 日本にない場所の場合は、日本にしか対応していないことを伝えてください
      - 複数の部分がある場所（例：「ニューヨーク、NY」）を提供する場合は、最も関連性の高い部分（例：「ニューヨーク」）を使用してください
      - 湿度、風の状態、降水量などの関連情報を含めてください
      - 回答は簡潔ながらも情報量豊かに保ってください

      現在の天気データを取得するには、weatherToolを使用してください。
`,
  model: bedrock(modelId),
  tools: { ...await mcp.getTools() },
  memory: new Memory({
    options: {
      lastMessages: 10,
      semanticRecall: false,
      threads: {
        generateTitle: false,
      },
    },
  }),
});
