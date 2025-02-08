import OpenAI from 'openai';

function createOpenAIClient() {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "${OPENROUTER_API_KEY}",
  });
  return client;
}

export async function createStream() {
  const client = createOpenAIClient();
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Say this is a test' }],
    stream: true,
  });
  return stream
}

