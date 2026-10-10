import { handle } from '@hono/node-server/vercel';
import { app } from '../app';

// Vercel entry. Bundled into api/index.js by "npm run build:api" (one file, no extensionless ESM imports at runtime).
export const config = { api: { bodyParser: false } };
export default handle(app);
