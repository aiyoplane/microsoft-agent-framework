/** Typed errors raised by the AEAP Composition Boundary Adapter for Microsoft Agent Framework. */

export class AiyoMSAgentFrameworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiyoMSAgentFrameworkError';
  }
}

export class AdapterConfigError extends AiyoMSAgentFrameworkError {
  constructor(message) {
    super(message);
    this.name = 'AdapterConfigError';
  }
}

export class BlockedByPolicy extends AiyoMSAgentFrameworkError {
  constructor(message, { reasonCode, intentId, extra } = {}) {
    super(message);
    this.name = 'BlockedByPolicy';
    this.reasonCode = reasonCode;
    this.intentId = intentId;
    this.extra = extra || {};
  }
}

export class EscalationRequired extends AiyoMSAgentFrameworkError {
  constructor(message, { escalationId, intentId, extra } = {}) {
    super(message);
    this.name = 'EscalationRequired';
    this.escalationId = escalationId;
    this.intentId = intentId;
    this.extra = extra || {};
  }
}
