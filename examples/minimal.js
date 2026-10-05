/**
 * Minimal example of @aiyoplane/microsoft-agent-framework.
 * Exercises wrapAction without a full Agent instance.
 *
 * Run: node examples/minimal.js
 */

import { createAiyoMcpAuthz, createLocalRdp } from '@aiyoplane/mcp-authz';
import {
  BlockedByPolicy,
  EscalationRequired,
  wrapAction,
} from '../src/index.js';

const policy = {
  rules: [
    { action_type: 'deploy', action_target: 'staging', effect: 'allow' },
    { action_type: 'deploy', action_target: 'production', effect: 'escalate' },
    { action_type: 'deploy', effect: 'block' },
  ],
};

const authz = createAiyoMcpAuthz({
  rdp: createLocalRdp({ policy }),
  toolConfig: {
    deploy: { aiyoGated: true, action: { type: 'deploy' } },
  },
});

const deploy = async ({ target, artifact }) => `Deployed ${artifact} to ${target}`;

const gated = wrapAction(deploy, {
  authz,
  toolName: 'deploy',
  intentBuilder: ({ target, artifact }) => ({ type: 'deploy', target, artifact }),
});

async function main() {
  console.log('ALLOW (staging):');
  console.log('  ', await gated({ target: 'staging', artifact: 'sha256:abc' }));

  console.log('\nESCALATE (production):');
  try {
    await gated({ target: 'production', artifact: 'sha256:def' });
  } catch (err) {
    if (err instanceof EscalationRequired) console.log('  Held:', err.message);
    else throw err;
  }

  console.log('\nBLOCK (unknown):');
  try {
    await gated({ target: 'unknown', artifact: 'sha256:ghi' });
  } catch (err) {
    if (err instanceof BlockedByPolicy) console.log('  Blocked:', err.message);
    else throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
