import type { DocumentStatus } from '../generated/prisma/enums.js';

/** Transições aceitas, exatamente como definidas em docs/architecture.md §12. */
const ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  RECEIVED: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'NEEDS_REVIEW', 'RETRYING'],
  RETRYING: ['PROCESSING', 'FAILED'],
  COMPLETED: [],
  NEEDS_REVIEW: [],
  FAILED: [],
};

export class InvalidStateTransitionError extends Error {
  constructor(from: DocumentStatus, to: DocumentStatus) {
    super(`Transição de estado inválida: ${from} -> ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/** Regra central de transição (docs/architecture.md §12) — nenhuma mudança de Document.status deve contorná-la. */
export function assertValidTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
