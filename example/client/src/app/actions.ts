'use server';

import { mastra } from '@/mastra';

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

export async function getAgentInfo() {
  const agent = mastra.getAgent('weatherAgent');

  return {
    name: agent.name,
    instructions: agent.getInstructions(),
    modelId: (await agent.getLLM()).getModelId(),
  };
}
