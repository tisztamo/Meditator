import OpenAI from 'openai';
import { logger } from '../infrastructure/logger';

const log = logger('model.js');

function createOpenAIClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    dangerouslyAllowBrowser: true,  
  });
}

export async function createCompletion(prompt, model = "deepseek-chat") {
  // Validate and normalize model name
  const normalizedModel = normalizeModelName(model);
  log.debug(`Using ${normalizedModel} for completion`);
  
  const client = createOpenAIClient();
  const completion = await client.chat.completions.create({
    model: normalizedModel,
    messages: [
      { role: 'user', content: prompt },
    ],
    max_tokens: 400,
  });
  return completion.choices[0].message.content;
}

function normalizeModelName(model) {
  // Add model name mappings and validation
  const modelMappings = {
    'gpt4': 'openai/gpt-4',
    'gpt3': 'openai/gpt-3.5-turbo',
    'claude': 'anthropic/claude-3-sonnet',
    'deepseek': 'deepseek-ai/deepseek-chat',
    'mixtral': 'mistralai/mixtral-8x7b',
    'gemini': 'google/gemini-2.0-flash-lite-preview-02-05:free',
    // Add default case
    'deepseek-chat': 'deepseek-ai/deepseek-chat'
  };

  // Handle falsy model values
  if (!model) {
    return modelMappings['gemini'];
  }

  // Check if we have a direct mapping
  if (modelMappings[model]) {
    return modelMappings[model];
  }

  // If the model name is already in the correct format, return it
  if (model.includes('/')) {
    return model;
  }

  // Default to deepseek-chat if no match found
  log.warn(`Unknown model "${model}", defaulting to deepseek-chat`);
  return modelMappings['deepseek-chat'];
}