import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { createServer } from 'node:http';

test('GET /api/health renvoie un statut JSON opérationnel', async () => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.service, 'OpenDC API');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('les routes de profil refusent une requête sans jeton', async () => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/profile`);
    const body = await response.json();
    assert.equal(response.status, 401); // L'absence de jeton est refusée avant l'accès à Firebase.
    assert.equal(body.success, false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
