import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { DocumentStorage } from './document-storage.js';

/**
 * Implementação Fase 1 do DocumentStorage: filesystem local.
 * A chave nunca deriva do nome enviado pelo usuário — é sempre um UUID
 * gerado internamente, para não expor dados pessoais no nome físico do
 * arquivo e para não colidir quando dois uploads chegam com o mesmo nome.
 */
@Injectable()
export class LocalDocumentStorage extends DocumentStorage {
  private readonly baseDir = resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');

  buildKey(extension: string): string {
    return `${randomUUID()}.${extension}`;
  }

  async save(key: string, data: Buffer): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.resolveKeyPath(key), data);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKeyPath(key), { force: true });
  }

  private resolveKeyPath(key: string): string {
    return join(this.baseDir, key);
  }
}
