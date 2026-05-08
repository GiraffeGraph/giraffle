import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { resolveOpenAiConfigForUser } from "@/domain/integration/integration.service";

export async function resolveAgentModel(input: {
  userId: string;
  modelId?: string;
}): Promise<LanguageModel> {
  const openAiConfig = await resolveOpenAiConfigForUser(input.userId);
  const apiKey = openAiConfig.apiKey;

  if (!apiKey) {
    throw new Error("AI service is not configured");
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: openAiConfig.baseUrl ?? undefined,
  });

  return provider(input.modelId ?? "gpt-5.4-mini");
}
