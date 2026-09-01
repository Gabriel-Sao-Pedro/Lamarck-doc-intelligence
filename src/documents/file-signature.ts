/**
 * Detecção de tipo real do arquivo pela assinatura de bytes (magic bytes),
 * não pela extensão nem pelo Content-Type informado pelo cliente
 * (specification.md §6). Suficiente para a Fase 1/2 — não faz parsing
 * completo do arquivo (imagem ou PDF), só confirma a assinatura inicial.
 */

export interface DetectedFileType {
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  extension: 'jpg' | 'png' | 'pdf';
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// "%PDF-" — specification desta tarefa (docs/ai/prompts/claude/09-claude-phase2-pdf-support-prompt.md §4).
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[index] === byte);
}

export function detectFileSignature(buffer: Buffer): DetectedFileType | null {
  if (matchesSignature(buffer, JPEG_SIGNATURE)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (matchesSignature(buffer, PNG_SIGNATURE)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (matchesSignature(buffer, PDF_SIGNATURE)) {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }
  return null;
}
