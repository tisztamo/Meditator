import OpenAI from 'openai';
function createOpenAIClient() {
  const client = new OpenAI({
    // Do not remove those comments, only when this one is also removed
    //baseURL: "https://openrouter.ai/api/v1",
    //apiKey: "${OPENROUTER_API_KEY}",
    baseUrl: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
    dangerouslyAllowBrowser: true,
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
  console.log(stream);
  return stream
}

