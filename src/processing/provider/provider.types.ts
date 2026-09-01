export interface IdentityDocumentFields {
  fullName: string;
  parentage: string;
  birthDate: string;
  documentNumber: string;
  issuingAuthority: string;
}

export interface ProviderResult {
  documentType: string;
  confidence: number;
  fields: IdentityDocumentFields;
}

export interface ProviderInput {
  documentId: string;
  documentType: string;
  storageKey: string;
}

/** Erro técnico do provider (timeout, indisponibilidade etc.) — distinto de um resultado semanticamente inválido. */
export class ProviderTechnicalError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'ProviderTechnicalError';
  }
}
