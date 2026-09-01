import { PHASE_1_DOCUMENT_TYPE } from '../../documents/documents.constants.js';
import { CONFIDENCE_THRESHOLD } from '../processing.constants.js';
import type { ProviderResult } from '../provider/provider.types.js';

export type ValidationOutcome = 'VALID' | 'NEEDS_REVIEW';

const REQUIRED_FIELDS = ['fullName', 'parentage', 'birthDate', 'documentNumber', 'issuingAuthority'] as const;
const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Etapa 1 (estrutural) + etapa 2 (contra o documento, simulada e
 * determinística nesta fase) da validação de docs/architecture.md §15. Não
 * valida CPF/RG real — só estrutura e um limiar de confiança fixo, para
 * decidir entre aceitar o resultado ou mandar para revisão humana.
 */
export function validateResult(result: ProviderResult): ValidationOutcome {
  if (result.documentType !== PHASE_1_DOCUMENT_TYPE) return 'NEEDS_REVIEW';

  const hasAllFields = REQUIRED_FIELDS.every((field) => {
    const value = result.fields[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
  if (!hasAllFields) return 'NEEDS_REVIEW';

  if (!BIRTH_DATE_PATTERN.test(result.fields.birthDate)) return 'NEEDS_REVIEW';

  if (typeof result.confidence !== 'number' || result.confidence < CONFIDENCE_THRESHOLD) {
    return 'NEEDS_REVIEW';
  }

  return 'VALID';
}
