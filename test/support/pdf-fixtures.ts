/**
 * Fixtures de PDF fictício para os testes de ingestão/processamento (Fase
 * 2.2, docs/ai/prompts/claude/09-claude-phase2-pdf-support-prompt.md §15).
 * Não faz parsing real de PDF nem gera um arquivo estruturalmente completo
 * — a validação da Fase 2.2 é só por assinatura de bytes (%PDF-), então um
 * buffer mínimo com a assinatura correta já é suficiente para exercitar o
 * pipeline real. Nenhum conteúdo real de pessoa é usado.
 */

const PDF_SIGNATURE = Buffer.from('%PDF-1.4\n', 'ascii');
const PDF_TRAILER = Buffer.from('\n%%EOF', 'ascii');

/** PDF mínimo, porém válido para a política de detecção desta fase (assinatura %PDF- no início do buffer). */
export function buildValidPdf(): Buffer {
  const fakeBody = Buffer.from('1 0 obj<</Type/Catalog>>endobj\n', 'ascii');
  return Buffer.concat([PDF_SIGNATURE, fakeBody, PDF_TRAILER]);
}

/** Um PDF válido (assinatura correta) mas maior que o limite de 10 MB da API. */
export function buildOversizedPdf(): Buffer {
  const padding = Buffer.alloc(11 * 1024 * 1024, 0x00);
  return Buffer.concat([PDF_SIGNATURE, padding]);
}

/** Conteúdo de texto simples, sem relação com PDF, para simular extensão/MIME divergentes do conteúdo real (PDF2/PDF3). */
export function buildFakeContent(): Buffer {
  return Buffer.from('isto nao e um PDF de verdade, apenas texto com extensao/MIME de PDF', 'utf-8');
}
