
import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { createServer } from 'node:http';

async function withServer(run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('GET /api/health renvoie un statut JSON opérationnel', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.service, 'OpenDC API');
  });
});

test('GET /api/auth/me refuse une session absente', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/auth/me`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.code, 'SESSION_INVALID');
  });
});

test('les routes privées refusent une session absente', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/profile`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
  });
});

test('les mutations auth exigent un jeton CSRF', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, 'CSRF_INVALID');
  });
});
