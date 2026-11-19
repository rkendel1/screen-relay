import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequest, newRequestId } from '@appport/protocol';
import { permissionAuthorizer } from '@appport/authorization';
import { createApplication, instantiateProvider, isProviderDefinition, MemoryExternalCallRecorder } from '@appport/core';
import provider from '../../dist/app/provider.js';

const live = process.env.RELAY_LIVE === '1';

async function host(config, permissions) {
  const recorder = new MemoryExternalCallRecorder();
  const instance = await provider.start({ name: 'desktop', config, credential: async () => null, log: console, signal: new AbortController().signal });
  const application = createApplication({
    application: { id: 'com.example.desktop-host', name: 'Desktop host', version: '1.0.0' },
    capabilities: instantiateProvider(provider, instance, { name: 'desktop', recorder }),
    authorizer: permissionAuthorizer(),
  });
  const session = { id: 'ses_test', applicationId: 'com.example.desktop-host', createdAt: new Date().toISOString(), principal: { id: 'ada', type: 'user' }, permissions };
  const call = (name, input = {}) => application.handleRequest(createRequest({ requestId: newRequestId(), capability: { name, version: 1 }, input }), { session });
  return { application, call, recorder, instance };
}

test('the provider publishes the desktop capabilities with their permissions', async () => {
  assert.equal(isProviderDefinition(provider), true);
  const { application } = await host({ url: 'http://127.0.0.1:9' }, []);
  const published = Object.fromEntries(application.manifest().capabilities.map((c) => [c.name, c]));
  for (const name of ['desktop.display.describe', 'desktop.screenshot.capture', 'desktop.input.pointer', 'desktop.input.keyboard']) assert.ok(published[name], name);
  assert.equal(published['desktop.input.pointer'].effect, 'consequential');
});

test('a viewer cannot operate the desktop, and nothing is recorded', async () => {
  const { call, recorder } = await host({ url: 'http://127.0.0.1:9' }, ['desktop.view']);
  const response = await call('desktop.input.pointer', { action: 'click', x: 0.5, y: 0.5 });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'FORBIDDEN');
  assert.equal(recorder.calls.size, 0);
});

test('input to an engine that refuses the connection is recorded as failed, not unknown', async () => {
  const { call, recorder } = await host({ url: 'http://127.0.0.1:9', timeoutMs: 2000 }, ['desktop.control']);
  const response = await call('desktop.input.keyboard', { text: 'x' });
  assert.equal(response.ok, false);
  assert.match(response.error.message, /unreachable/);
  const [record] = recorder.calls.values();
  assert.equal(record.outcome, 'failed');
  assert.equal(record.capability, 'desktop.input.keyboard');
});

test('the provider observes and operates a real desktop', { skip: live ? false : 'set RELAY_LIVE=1 with a running engine' }, async () => {
  const { call, recorder } = await host({}, ['desktop.view', 'desktop.control']);
  const display = await call('desktop.display.describe');
  assert.equal(display.ok, true, JSON.stringify(display));
  const shot = await call('desktop.screenshot.capture');
  assert.equal(shot.ok, true);
  assert.deepEqual([shot.output.width, shot.output.height], [display.output.width, display.output.height]);
  assert.equal(Buffer.from(shot.output.data, 'base64').subarray(1, 4).toString(), 'PNG');
  const click = await call('desktop.input.pointer', { action: 'click', x: 0.5, y: 0.42 });
  assert.deepEqual(click.output, { events: 2 });
  const typed = await call('desktop.input.keyboard', { text: 'ok' });
  assert.equal(typed.ok, true);
  const outcomes = [...recorder.calls.values()].map((c) => [c.capability, c.outcome]);
  assert.deepEqual(outcomes, [['desktop.input.pointer', 'succeeded'], ['desktop.input.keyboard', 'succeeded']]);
});
