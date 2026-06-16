import { complete } from './llm.js';
import { resolveModelRef } from './modelConfig.js';

/**
 * Back-compat wrapper kept for legacy components (m-token-monitor) and old
 * architectures. New code should import from llm.js.
 */
export async function createCompletion(prompt, model) {
  const result = await complete({
    prompt,
    model: model ? resolveModelRef(model, 'utility') : resolveModelRef(null, 'utility'),
    maxTokens: 400,
  });
  return result.text;
}
