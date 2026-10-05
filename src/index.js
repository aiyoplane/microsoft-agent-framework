/**
 * @aiyoplane/microsoft-agent-framework (Node)
 *
 * AEAP Composition Boundary Adapter for the Microsoft Agent Framework.
 *
 * Two integration surfaces:
 *  1. `AiyoAgentMiddleware` — register as middleware; intercepts actions.
 *  2. `wrapAction` — wrap a single callable; use in workflow nodes or
 *     direct function invocations outside the middleware chain.
 *
 * Aiyoplane, Inc. — Apache 2.0 licensed.
 * https://aiyoplane.com
 *
 * Specification: https://github.com/aiyoplane/aeap
 */

import {
  AdapterConfigError,
  AiyoMSAgentFrameworkError,
  BlockedByPolicy,
  EscalationRequired,
} from './errors.js';

export { AdapterConfigError, AiyoMSAgentFrameworkError, BlockedByPolicy, EscalationRequired };

export class AiyoAgentMiddleware {
  /**
   * @param {object} options
   * @param {object} options.authz - AiyoAuthz from @aiyoplane/mcp-authz
   * @param {object<string, function>} options.intentBuilders - Map of actionName -> (payload) => Intent
   * @param {string} [options.attachReceiptKey='aeapReceipt']
   */
  constructor({ authz, intentBuilders, attachReceiptKey = 'aeapReceipt' } = {}) {
    if (!authz || typeof authz.wrap !== 'function') {
      throw new AdapterConfigError('AiyoAgentMiddleware requires an authz with .wrap');
    }
    if (!intentBuilders || typeof intentBuilders !== 'object') {
      throw new AdapterConfigError('AiyoAgentMiddleware requires an intentBuilders object');
    }
    this.authz = authz;
    this.intentBuilders = intentBuilders;
    this.attachReceiptKey = attachReceiptKey;
  }

  async beforeAction(context, action) {
    const actionName = _actionName(action);
    if (!actionName) return;
    const builder = this.intentBuilders[actionName];
    if (typeof builder !== 'function') return;

    const payload = _actionPayload(action);
    const intent = _buildIntent(builder, payload, actionName);
    const ctx = await _evaluateRdp(this.authz, actionName, intent);

    if (context && ctx != null) {
      context[this.attachReceiptKey] = ctx.receipt ?? null;
    }
  }
}

/** Convenience factory returning a configured AiyoAgentMiddleware. */
export function aiyoMiddleware({ authz, intentBuilders, attachReceiptKey = 'aeapReceipt' } = {}) {
  return new AiyoAgentMiddleware({ authz, intentBuilders, attachReceiptKey });
}

/**
 * Wrap a single callable with an AEAP gate.
 *
 * @param {function} fn - Function to wrap
 * @param {object} options
 * @param {object} options.authz
 * @param {string} options.toolName - Key under which authz.toolConfig has the entry
 * @param {function} options.intentBuilder - (kwargs) => Intent payload (object)
 * @param {boolean} [options.returnReceipt=false]
 * @returns {function} The wrapped function
 */
export function wrapAction(fn, { authz, toolName, intentBuilder, returnReceipt = false } = {}) {
  if (typeof fn !== 'function') {
    throw new AdapterConfigError(`wrapAction expected a function, got ${typeof fn}`);
  }
  if (typeof intentBuilder !== 'function') {
    throw new AdapterConfigError('wrapAction requires an intentBuilder function');
  }
  if (typeof toolName !== 'string' || !toolName) {
    throw new AdapterConfigError('wrapAction requires a non-empty toolName');
  }

  return async function gated(kwargs) {
    const kw = kwargs || {};
    const intent = _buildIntent(intentBuilder, kw, toolName);
    const ctx = await _evaluateRdp(authz, toolName, intent);
    const result = await fn(kw);
    if (returnReceipt) {
      return { result, aeapReceipt: ctx?.receipt ?? null };
    }
    return result;
  };
}

// --- Internals -------------------------------------------------------------

function _actionName(action) {
  if (!action) return null;
  if (typeof action.name === 'string' && action.name) return action.name;
  if (typeof action.actionName === 'string' && action.actionName) return action.actionName;
  if (typeof action.toolName === 'string' && action.toolName) return action.toolName;
  return null;
}

function _actionPayload(action) {
  if (!action) return {};
  for (const key of ['payload', 'arguments', 'kwargs', 'args']) {
    if (action[key] && typeof action[key] === 'object' && !Array.isArray(action[key])) {
      return action[key];
    }
  }
  return {};
}

function _buildIntent(builder, payload, actionName) {
  let intent;
  try {
    intent = builder(payload);
  } catch (err) {
    throw new BlockedByPolicy(
      `intentBuilder for action '${actionName}' raised: ${err?.message || err}`,
      { reasonCode: 'INTENT_BUILD_FAILED' }
    );
  }
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new BlockedByPolicy(
      `intentBuilder for action '${actionName}' did not return a plain object`,
      { reasonCode: 'INTENT_SHAPE_INVALID' }
    );
  }
  return intent;
}

async function _evaluateRdp(authz, toolName, intent) {
  if (!authz || typeof authz.wrap !== 'function') {
    throw new AdapterConfigError('invalid authz (missing .wrap)');
  }
  let wrapped;
  try {
    wrapped = authz.wrap(toolName, async (_args, ctx) => ctx);
  } catch (err) {
    throw new BlockedByPolicy(
      `authz.wrap('${toolName}') failed: ${err?.message || err}`,
      { reasonCode: err?.name || 'AUTHZ_WRAP_FAILED' }
    );
  }
  try {
    return await wrapped(intent, null);
  } catch (err) {
    const msg = err?.message || String(err);
    if (/escalat/i.test(msg) || /ESCALATE/.test(msg)) {
      throw new EscalationRequired(
        `AEAP ESCALATE verdict for action '${toolName}' (intent=${JSON.stringify(intent)}): ${msg}`,
        { extra: { innerException: err?.name, intent } }
      );
    }
    throw new BlockedByPolicy(
      `AEAP non-ALLOW verdict for action '${toolName}' (intent=${JSON.stringify(intent)}): ${msg}`,
      { reasonCode: err?.name || 'RDP_NON_ALLOW', extra: { innerException: err?.name, intent } }
    );
  }
}
