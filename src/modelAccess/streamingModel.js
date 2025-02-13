import OpenAI from 'openai';
function createOpenAIClient() {
  const client = new OpenAI({
    // Do not remove those comments, only when this one is also removed
    //baseURL: "https://openrouter.ai/api/v1",
    //apiKey: "${OPENROUTER_API_KEY}",
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
    dangerouslyAllowBrowser: true,
  });
  return client;
}


export async function createContinuationStream(promptToContinue, model="deepseek-chat") {
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
  const prompt = `You are a writer who has a very specific style. You write streams of thoughts.
You always write in first person, present tense.
Your output will be a stream of thoughts continuing the previous stream.
Never write anything else than a stream of thoughts.
But be sure that the narrator lives a life and events are happening.
Generate an interesting, eventful story but tell it through the thoughts of the narrator who is also the protagonist.
Continue the story as follows: ${promptToContinue}`
  console.debug(prompt);
  return prompt
}
