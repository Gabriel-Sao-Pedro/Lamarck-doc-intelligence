import type { ProviderInput, ProviderResult } from './provider.types.js';

/**
 * Fronteira entre o processamento e qualquer fornecedor de IA
 * (docs/architecture.md §14). A aplicação depende só desta abstração —
 * nunca de um provider concreto.
 */
export abstract class DocumentAiProvider {
  abstract process(input: ProviderInput): Promise<ProviderResult>;
}
