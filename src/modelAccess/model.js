import { complete, defaultModel } from './llm.js';

/**
 * Back-compat wrapper kept for older components (m-compress, m-recent-history,
 * m-token-monitor) and test architectures. New code should import from llm.js.
 */
export async function createCompletion(prompt, model) {
  const result = await complete({
    prompt,
    model: model || defaultModel('utility'),
    maxTokens: 400,
  });
  return result.text;
}
