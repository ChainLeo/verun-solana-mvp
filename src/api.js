import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { retired, legacyRoutes } from './retired.js';
import health from '../api/health.js';

export const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  next();
});
for (const route of legacyRoutes) app.all([`/${route}`, `/api/${route}`], retired);
app.get(['/health', '/api/health'], health);
// Publish only this directory, never the checkout or private client state.
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { dotfiles: 'deny' }));
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(Number(process.env.PORT || 3010), '127.0.0.1', () => console.log('VERUN client guide at http://127.0.0.1:' + (process.env.PORT || 3010)));
}
