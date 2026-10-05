# @aiyoplane/microsoft-agent-framework

**AEAP Composition Boundary Adapter for the Microsoft Agent Framework (Node).**

A thin wrapper that attaches the AEAP Runtime Decision Point (RDP) to the Microsoft Agent Framework's middleware chain and workflow nodes. Consequential actions produce independently verifiable Execution Receipts.

```bash
npm install @aiyoplane/microsoft-agent-framework
```

## Why Microsoft Agent Framework

Microsoft's current Agent Framework — the successor to AutoGen and Semantic Kernel — explicitly includes middleware for intercepting agent actions as a first-class architectural primitive. That is architecturally adjacent to the AEAP Composition Boundary.

See the [AEAP specification](https://github.com/aiyoplane/aeap) §9.

## Minimal usage — middleware

```javascript
import { Agent } from '@microsoft/agent-framework';
import { createAiyoMcpAuthz, createLocalRdp } from '@aiyoplane/mcp-authz';
import { AiyoAgentMiddleware } from '@aiyoplane/microsoft-agent-framework';

const policy = {
  rules: [
    { action_type: 'payment', amount_max: 1000, effect: 'allow' },
    { action_type: 'payment', amount_max: 10000, effect: 'escalate' },
    { action_type: 'payment', effect: 'block' },
  ],
};

const authz = createAiyoMcpAuthz({
  rdp: createLocalRdp({ policy }),
  toolConfig: {
    transfer_funds: { aiyoGated: true, action: { type: 'payment' } },
  },
});

const aiyoMw = new AiyoAgentMiddleware({
  authz,
  intentBuilders: {
    transfer_funds: (payload) => ({
      type: 'payment',
      amount: payload.amount,
      target: payload.toAccount,
    }),
  },
});

const agent = new Agent({
  name: 'banker',
  middleware: [aiyoMw, /* ... */],
});
```

## Minimal usage — wrapAction

```javascript
import { wrapAction } from '@aiyoplane/microsoft-agent-framework';

const deploy = async ({ target, artifact }) => actuallyDeploy(target, artifact);

const guardedDeploy = wrapAction(deploy, {
  authz,
  toolName: 'deploy',
  intentBuilder: ({ target, artifact }) => ({
    type: 'deploy', target, artifact,
  }),
});
```

## Composition Boundary — what the adapter actually does

1. **Intent construction** via `intentBuilder(payload)`.
2. **RDP evaluation** via `@aiyoplane/mcp-authz`.
3. **Verdict composition.** ALLOW → inner runs (receipt attached to context on middleware path); ESCALATE → `EscalationRequired`; BLOCK → `BlockedByPolicy`.
4. **Fail-closed default** on every ambiguous condition.

## API reference

### `AiyoAgentMiddleware({ authz, intentBuilders, attachReceiptKey })`
Middleware class with `beforeAction(context, action)`.

### `aiyoMiddleware({ authz, intentBuilders, attachReceiptKey })`
Convenience factory.

### `wrapAction(fn, { authz, toolName, intentBuilder, returnReceipt })`
Function-level wrapper.

### Exceptions

- `AiyoMSAgentFrameworkError`, `AdapterConfigError`, `BlockedByPolicy`, `EscalationRequired`

## License

Apache License 2.0.

## Links

- **AEAP specification:** https://github.com/aiyoplane/aeap
- **Underlying implementation:** [`@aiyoplane/mcp-authz`](https://www.npmjs.com/package/@aiyoplane/mcp-authz)
- **Python sibling:** `aiyoplane-microsoft-agent-framework` on PyPI
- **Trust surface:** https://aiyoplane.com/trust
- **Issues:** https://github.com/aiyoplane/microsoft-agent-framework/issues

Microsoft, Microsoft Agent Framework, AutoGen, and Semantic Kernel are trademarks of Microsoft Corporation. This package is independent and not affiliated with Microsoft.

**Verify First. Execute Second.**
