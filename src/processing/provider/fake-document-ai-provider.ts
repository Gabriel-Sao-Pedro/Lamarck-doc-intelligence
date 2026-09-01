import { Injectable } from '@nestjs/common';
import { PHASE_1_DOCUMENT_TYPE } from '../../documents/documents.constants.js';
import { DocumentAiProvider } from './document-ai-provider.js';
import { ProviderTechnicalError, type ProviderInput, type ProviderResult } from './provider.types.js';

export type FakeProviderMode = 'SUCCESS' | 'NEEDS_REVIEW' | 'TECHNICAL_FAILURE';

const FICTITIOUS_FIELDS = {
  fullName: 'Fulano de Tal Fictício',
  parentage: 'Filho(a) de Fulano Fictício e Beltrana Fictícia',
  birthDate: '1990-01-01',
  issuingAuthority: 'ORGAO FICTICIO',
};

/**
 * Provider determinístico da Fase 1 (docs/architecture.md §14). Nunca lê o
 * conteúdo real do arquivo e só devolve dados fictícios. O modo controla o
 * cenário devolvido, para permitir testar sucesso, revisão semântica e
 * falha técnica sem depender de um provider real — a mesma instância pode
 * ser reconfigurada via setMode() tanto pela aplicação (modo padrão SUCCESS)
 * quanto pelos testes.
 */
@Injectable()
export class FakeDocumentAiProvider implements DocumentAiProvider {
  private mode: FakeProviderMode = 'SUCCESS';

  setMode(mode: FakeProviderMode): void {
    this.mode = mode;
  }

  async process(_input: ProviderInput): Promise<ProviderResult> {
    if (this.mode === 'TECHNICAL_FAILURE') {
      throw new ProviderTechnicalError('Falha técnica simulada do provider fake.', 'FAKE_PROVIDER_TIMEOUT');
    }

    if (this.mode === 'NEEDS_REVIEW') {
      return {
        documentType: PHASE_1_DOCUMENT_TYPE,
        confidence: 0.4,
        fields: { ...FICTITIOUS_FIELDS, documentNumber: 'FAKE-0000000' },
      };
    }

    return {
      documentType: PHASE_1_DOCUMENT_TYPE,
      confidence: 0.95,
      fields: { ...FICTITIOUS_FIELDS, documentNumber: 'FAKE-1234567' },
    };
  }
}
