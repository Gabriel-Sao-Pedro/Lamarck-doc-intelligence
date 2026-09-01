import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/database/prisma.service.js';
import type { DocumentStatus } from '../../src/generated/prisma/enums.js';

/**
 * Cria um Document + ProcessingJob em RECEIVED diretamente pelo Prisma,
 * equivalente ao que a ingestão faz, sem precisar subir um arquivo real —
 * suficiente para exercitar claim/lease/fencing/retry isoladamente.
 */
export async function createReceivedDocument(
  prisma: PrismaService,
): Promise<{ documentId: string; jobId: string }> {
  const unique = randomUUID();
  const document = await prisma.document.create({
    data: {
      sha256: unique.replaceAll('-', '').padEnd(64, '0'),
      storageKey: `${unique}.png`,
      documentType: 'IDENTITY_DOCUMENT',
      originalFilename: `${unique}.png`,
      mimeType: 'image/png',
      sizeBytes: 128,
    },
  });
  const job = await prisma.processingJob.create({ data: { documentId: document.id } });
  return { documentId: document.id, jobId: job.id };
}

/**
 * Cria um Document isolado (sem ProcessingJob) com status e createdAt
 * controlados diretamente — útil para testar listagem/paginação/filtro sem
 * depender do fluxo real de claim/finalização.
 */
export async function createDocumentWithStatus(
  prisma: PrismaService,
  status: DocumentStatus,
  createdAt?: Date,
): Promise<{ documentId: string }> {
  const unique = randomUUID();
  const document = await prisma.document.create({
    data: {
      sha256: unique.replaceAll('-', '').padEnd(64, '0'),
      storageKey: `${unique}.png`,
      documentType: 'IDENTITY_DOCUMENT',
      originalFilename: `${unique}.png`,
      mimeType: 'image/png',
      sizeBytes: 128,
      status,
      ...(createdAt ? { createdAt } : {}),
    },
  });
  return { documentId: document.id };
}

/** Remove todas as linhas relacionadas a um documento criado em teste, na ordem que respeita as FKs. */
export async function cleanupDocument(prisma: PrismaService, documentId: string): Promise<void> {
  await prisma.documentResult.deleteMany({ where: { documentId } });
  await prisma.processingRun.deleteMany({ where: { documentId } });
  await prisma.processingJob.deleteMany({ where: { documentId } });
  await prisma.document.deleteMany({ where: { id: documentId } });
}
