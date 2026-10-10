import { handle } from '@hono/node-server/vercel';
import { app } from '../server/app';

// Vercel: every /api/* request is rewritten here (see vercel.json) and handled by the Hono app.
export const config = { api: { bodyParser: false } };
export default handle(app);
