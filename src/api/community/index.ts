import { Hono } from 'hono';
import { handleChatRequest } from './chat-handler';

interface CommunityEnv {
  ANTHROPIC_API_KEY: string;
  ASSETS: Fetcher;
}

const api = new Hono<{ Bindings: CommunityEnv }>().basePath('/api');

api.get('/hello', (c) => c.json({ message: 'Hello from FormStudio!' }));

api.get('/config', (c) => c.json({ devMode: false, edition: 'community' }));

api.post('/chat', (c) => handleChatRequest(c));

export default api;
