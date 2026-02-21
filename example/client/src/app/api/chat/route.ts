import type { UIMessageChunk } from 'ai';
import { mastra } from '@/mastra';
import { toAISdkStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';

/**
 * 天気に関する質問を受け取り、対応するエージェントへ委譲し、ストリームとして応答を返すハンドラ。
 * @param req - POST リクエスト。JSON ボディに { city: string } が含まれることを期待。
 * @returns MCP のストリームレスポンスオブジェクト。
 */
export async function POST(req: Request): Promise<Response> {
  const { city } = await req.json();
  const agent = mastra.getAgent('weatherAgent');

  const result = await agent.stream(`What's the weather like in ${city}?`);

  const stream = toAISdkStream(result, { from: 'agent' });
  return createUIMessageStreamResponse({ stream: stream as unknown as ReadableStream<UIMessageChunk> });
}
