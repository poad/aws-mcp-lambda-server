'use server';

import { mastra } from '@/mastra';

/**
 * 天気情報取得アクション。
 * @param formData - フォームデータ。`message` フィールドに JSON 文字列で { city: string } が含まれ、`maxSteps` に整数のステップ上限が入る。
 * @returns 取得したステップ情報の配列。
 */
export async function getWeatherInfo(formData: FormData) {
  const message = JSON.parse(formData.get('message') as string);
  const maxSteps = parseInt(formData.get('maxSteps') as string);

  const agent = mastra.getAgent('weatherAgent');
  const steps: { text: string; toolCalls?: string[] }[] = [];

  const result = await agent.generate(
    message,
    {
      maxSteps,
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        console.log('Step completed:', { text, toolCalls, toolResults });
        steps.push({
          text,
          toolCalls: Array.isArray(toolCalls)
            ? toolCalls.map((tc) => tc.toolName)
            : [],
        });
      },
    },
  );

  console.log('Answer completed:', {
    finishReason: result.finishReason,
    modelId: (await result.response).modelId,
    timestamp: (await result.response).timestamp,
    totalTokens: (await result.usage)?.totalTokens,
  });

  return {
    steps,
  };
}

/**
 * エージェント情報取得アクション。
 * @returns エージェント名、指示内容、使用モデルID を含むオブジェクト。
 */
export async function getAgentInfo() {
  const agent = mastra.getAgent('weatherAgent');

  return {
    name: agent.name,
    instructions: agent.getInstructions(),
    modelId: (await agent.getLLM()).getModelId(),
  };
}
