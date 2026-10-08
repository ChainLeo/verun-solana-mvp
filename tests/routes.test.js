import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/api.js';
import { legacyRoutes } from '../src/retired.js';

test('actual local HTTP entry point retires every alias and exposes only public files', async t => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of legacyRoutes) for (const prefix of ['', '/api']) for (const method of ['GET', 'POST']) {
    const response = await fetch(`${base}${prefix}/${route}`, { method });
    assert.equal(response.status, 410, `${method} ${prefix}/${route}`);
    assert.equal((await response.json()).error, 'legacy_api_retired');
  }
  for (const route of ['/.env', '/package.json', '/client/cli.js', '/src/api.js', '/.verun-client/scan.json', '/docs/PRODUCT_MIGRATION.md']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  assert.equal((await (await fetch(base + '/api/health')).json()).payments, 'local-client-only');
  for (const route of ['/', '/docs.html', '/styles.css']) assert.equal((await fetch(base + route)).status, 200);
});
test('Vercel handlers independently retire every legacy API', async () => {
  for (const route of legacyRoutes) {
    const { default: handler } = await import(`../api/${route}.js`);
    const response = { setHeader() {}, status(value) { assert.equal(value, 410); return this; }, json(value) { assert.equal(value.error, 'legacy_api_retired'); } };
    handler({ method: 'POST', body: { score: 100, operation: 'invest' } }, response);
  }
});
