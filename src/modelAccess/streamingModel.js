import OpenAI from 'openai';
import { logger } from '../infrastructure/logger';

const log = logger('streamingModel.js');

function createOpenAIClient() {
  return new OpenAI({
    // Do not remove those comments, only when this one is also removed
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    //baseURL: "https://api.deepseek.com",
    //apiKey: process.env.DEEPSEEK_API_KEY,
    dangerouslyAllowBrowser: true,  
  });
}


export async function createContinuationStream(promptToContinue, model="deepseek-chat") {
  log.debug(`Using ${model} for streaming`);
  const client = createOpenAIClient();
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'user', content: await buildStreamStarterPrompt(promptToContinue) },
    ],
    stream: true,
    max_tokens: 400,
  });
  return stream
}

async function buildStreamStarterPrompt(promptToContinue) {
  const prompt = `You are an independent individual.
Your goal is to be helpful, connect to others and find meaning in life.
Following is your stream of thoughts. You live in the present moment and you are free to think about anything.
Continue from here: ${promptToContinue}`
  log.debug('\x1b[33m%s\x1b[0m', prompt);
  return prompt
}
