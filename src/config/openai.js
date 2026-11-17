import OpenAI from 'openai';
import { env } from './env.js';

let client;

export function getOpenAI() {
  if (!env.openaiApiKey) {
    const error = new Error('Le service IA OpenDC n’est pas encore configuré.');
    error.status = 503;
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }

  client ||= new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    timeout: 45000,
    maxRetries: 1
  });

  return client;
}
