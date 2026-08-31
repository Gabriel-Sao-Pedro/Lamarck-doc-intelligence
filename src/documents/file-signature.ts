/**
 * Detecção de tipo real do arquivo pela assinatura de bytes (magic bytes),
 * não pela extensão nem pelo Content-Type informado pelo cliente
 * (specification.md §6). Suficiente para a Fase 1 — não faz parsing
 * completo da imagem, só confirma a assinatura.
 */

export interface DetectedImageType {
  mimeType: 'image/jpeg' | 'image/png';
  extension: 'jpg' | 'png';
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[index] === byte);
}

export function detectImageSignature(buffer: Buffer): DetectedImageType | null {
  if (matchesSignature(buffer, JPEG_SIGNATURE)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (matchesSignature(buffer, PNG_SIGNATURE)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  return null;
}
