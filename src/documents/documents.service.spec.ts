import { InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { DocumentStorage } from '../storage/document-storage.js';
import { DocumentsService } from './documents.service.js';
import { buildValidPng } from '../../test/support/image-fixtures.js';

describe('DocumentsService', () => {
  // T8 — se o banco falhar depois de o arquivo ja ter sido salvo, o arquivo
  // desta requisicao deve ser removido do storage (compensacao).
  it('T8 — remove o arquivo do storage quando a persistencia no banco falha', async () => {
    const storageKey = 'fake-key.png';
    const prisma = {
      document: { findUnique: async () => null },
      $transaction: async () => {
        throw new Error('falha simulada de banco');
      },
    } as unknown as PrismaService;

    const saveCalls: Array<{ key: string; data: Buffer }> = [];
    const deleteCalls: string[] = [];
    const storage: DocumentStorage = {
      buildKey: () => storageKey,
      save: async (key, data) => {
        saveCalls.push({ key, data });
      },
      delete: async (key) => {
        deleteCalls.push(key);
      },
    };

    const service = new DocumentsService(prisma, storage);
    const png = buildValidPng();

    await expect(
      service.ingest({
        buffer: png,
        originalname: 't8.png',
        size: png.length,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].key).toBe(storageKey);
    expect(deleteCalls).toEqual([storageKey]);
  });
});
