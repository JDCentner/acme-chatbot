import express from 'express';
import {resolve} from 'node:path';
import {createApp} from './app.ts';
import {Store} from './store.ts';
import {createProvider} from './models.ts';

const port = Number(process.env.PORT || 3000);
const store = new Store(process.env.DATABASE_PATH || 'data/acme.sqlite');
const provider = createProvider();
const app = createApp(store, provider);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
} else {
  const {createServer} = await import('vite');
  const vite = await createServer({server: {middlewareMode: true}});
  app.use(vite.middlewares);
}
const server = app.listen(port, '0.0.0.0', () => console.log(`ACME demo: http://localhost:${port} (${provider.mode})`));
function shutdown(): void { server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
