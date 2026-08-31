/**
 * Fronteira de armazenamento de documentos (ADR-003 / specification.md §20).
 * Esconde o mecanismo físico — o resto da aplicação só conhece esta
 * interface, nunca o filesystem, um bucket S3 ou qualquer detalhe de
 * implementação.
 *
 * A chave é gerada pela própria implementação (nunca a partir do nome
 * enviado pelo usuário) para que o restante do sistema não precise saber
 * como o storage nomeia seus arquivos internamente.
 */
export abstract class DocumentStorage {
  abstract buildKey(extension: string): string;
  abstract save(key: string, data: Buffer): Promise<void>;
  abstract delete(key: string): Promise<void>;
}
