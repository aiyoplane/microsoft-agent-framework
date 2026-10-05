import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAiyoMcpAuthz, createLocalRdp } from '@aiyoplane/mcp-authz';

import {
  AdapterConfigError,
  AiyoAgentMiddleware,
  BlockedByPolicy,
  EscalationRequired,
  wrapAction,
} from '../src/index.js';

function makeAuthz(rules) {
  return createAiyoMcpAuthz({
    rdp: createLocalRdp({ policy: { rules } }),
    toolConfig: { deploy: { aiyoGated: true, action: { type: 'deploy' } } },
  });
}

test('wrapAction ALLOW runs the function', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'allow' }]);
  const gated = wrapAction(
    async ({ target, artifact }) => `Deployed ${artifact} to ${target}`,
    { authz, toolName: 'deploy', intentBuilder: ({ target }) => ({ type: 'deploy', target }) }
  );
  const result = await gated({ target: 'staging', artifact: 'sha256:abc' });
  assert.match(result, /Deployed/);
});

test('wrapAction BLOCK prevents execution', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'block' }]);
  const gated = wrapAction(async () => 'should not run', {
    authz, toolName: 'deploy', intentBuilder: () => ({ type: 'deploy' }),
  });
  await assert.rejects(
    gated({ target: 'staging' }),
    (err) => err instanceof BlockedByPolicy
  );
});

test('wrapAction ESCALATE raises', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'escalate' }]);
  const gated = wrapAction(async () => 'should not run', {
    authz, toolName: 'deploy', intentBuilder: () => ({ type: 'deploy' }),
  });
  await assert.rejects(
    gated({ target: 'staging' }),
    (err) => err instanceof EscalationRequired || err instanceof BlockedByPolicy
  );
});

test('wrapAction broken intentBuilder blocks', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'allow' }]);
  const gated = wrapAction(async () => 'ok', {
    authz, toolName: 'deploy',
    intentBuilder: () => { throw new Error('broken'); },
  });
  await assert.rejects(
    gated({ target: 'staging' }),
    (err) => err instanceof BlockedByPolicy
  );
});

test('wrapAction non-object intent blocks', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'allow' }]);
  const gated = wrapAction(async () => 'ok', {
    authz, toolName: 'deploy', intentBuilder: () => 'not an object',
  });
  await assert.rejects(
    gated({ target: 'staging' }),
    (err) => err instanceof BlockedByPolicy
  );
});

test('wrapAction non-function raises AdapterConfigError', () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'allow' }]);
  assert.throws(
    () => wrapAction('not a fn', { authz, toolName: 'deploy', intentBuilder: () => ({ type: 'deploy' }) }),
    (err) => err instanceof AdapterConfigError
  );
});

test('AiyoAgentMiddleware ALLOW attaches receipt', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'allow' }]);
  const mw = new AiyoAgentMiddleware({
    authz,
    intentBuilders: { deploy: (p) => ({ type: 'deploy', target: p.target }) },
  });
  const context = {};
  await mw.beforeAction(context, { name: 'deploy', payload: { target: 'staging' } });
  assert.ok('aeapReceipt' in context);
});

test('AiyoAgentMiddleware BLOCK raises', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'block' }]);
  const mw = new AiyoAgentMiddleware({
    authz,
    intentBuilders: { deploy: () => ({ type: 'deploy' }) },
  });
  await assert.rejects(
    mw.beforeAction({}, { name: 'deploy', payload: { target: 'staging' } }),
    (err) => err instanceof BlockedByPolicy
  );
});

test('AiyoAgentMiddleware ignores unregistered actions', async () => {
  const authz = makeAuthz([{ action_type: 'deploy', effect: 'block' }]);
  const mw = new AiyoAgentMiddleware({
    authz,
    intentBuilders: { deploy: () => ({ type: 'deploy' }) },
  });
  // 'other' not in intentBuilders — passes through silently
  await mw.beforeAction({}, { name: 'other', payload: { foo: 'bar' } });
});

test('AiyoAgentMiddleware invalid authz raises AdapterConfigError', () => {
  assert.throws(
    () => new AiyoAgentMiddleware({ authz: null, intentBuilders: {} }),
    (err) => err instanceof AdapterConfigError
  );
});
