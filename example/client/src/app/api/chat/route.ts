import { mastra } from '@/mastra';

/**
 * 天気に関する質問を受け取り、対応するエージェントへ委譲し、ストリームとして応答を返すハンドラ。
 * @param req - POST リクエスト。JSON ボディに { city: string } が含まれることを期待。
 * @returns MCP のストリームレスポンスオブジェクト。
 */
export async function POST(req: Request) {
  const { city } = await req.json();
  const agent = mastra.getAgent('weatherAgent');

  const result = await agent.streamVNext(`What's the weather like in ${city}?`);

  return result.textStream;
}
