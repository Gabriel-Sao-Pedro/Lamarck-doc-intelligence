import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { DocumentStorage } from '../storage/document-storage.js';
import { PHASE_1_DOCUMENT_TYPE } from './documents.constants.js';
import type { IngestDocumentResponseDto } from './dto/ingest-document-response.dto.js';
import { detectFileSignature } from './file-signature.js';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}

  async ingest(file: Express.Multer.File): Promise<IngestDocumentResponseDto> {
    const startedAt = Date.now();

    const signature = detectFileSignature(file.buffer);
    if (!signature) {
      throw new BadRequestException(
        'O conteúdo do arquivo não corresponde a um JPEG, PNG ou PDF válido.',
      );
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.prisma.document.findUnique({ where: { sha256 } });
    if (existing) {
      this.logger.log(
        `documentId=${existing.id} status=${existing.status} deduplicated=true durationMs=${Date.now() - startedAt}`,
      );
      return { documentId: existing.id, status: existing.status, deduplicated: true };
    }

    const storageKey = this.storage.buildKey(signature.extension);
    await this.saveOrThrow(storageKey, file.buffer);

    try {
      const document = await this.prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            sha256,
            storageKey,
            documentType: PHASE_1_DOCUMENT_TYPE,
            originalFilename: file.originalname,
            mimeType: signature.mimeType,
            sizeBytes: file.size,
          },
        });
        await tx.processingJob.create({ data: { documentId: created.id } });
        return created;
      });

      this.logger.log(
        `documentId=${document.id} status=${document.status} deduplicated=false durationMs=${Date.now() - startedAt}`,
      );
      return { documentId: document.id, status: document.status, deduplicated: false };
    } catch (error) {
      await this.compensateStorage(storageKey);

      if (this.isUniqueConstraintViolation(error)) {
        // Perdemos a corrida de deduplicação (ADR-004): outra requisição
        // com o mesmo hash já criou o Document entre a nossa consulta e a
        // nossa tentativa de criação. Não é uma falha — é o caminho
        // esperado da requisição perdedora.
        const winner = await this.prisma.document.findUniqueOrThrow({ where: { sha256 } });
        this.logger.log(
          `documentId=${winner.id} status=${winner.status} deduplicated=true durationMs=${Date.now() - startedAt} reason=dedup-race`,
        );
        return { documentId: winner.id, status: winner.status, deduplicated: true };
      }

      this.logger.error(`failed to persist document durationMs=${Date.now() - startedAt}`, error as Error);
      throw new InternalServerErrorException('Não foi possível processar o documento enviado.');
    }
  }

  private async saveOrThrow(storageKey: string, data: Buffer): Promise<void> {
    try {
      await this.storage.save(storageKey, data);
    } catch (error) {
      this.logger.error('failed to save document to storage', error as Error);
      throw new InternalServerErrorException('Não foi possível armazenar o documento enviado.');
    }
  }

  private async compensateStorage(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      // Falha na compensação não deve mascarar o erro original — só
      // registramos que um possível arquivo órfão pode ter ficado
      // (limitação conhecida da Fase 1, ver relatório 003).
      this.logger.warn(`failed to compensate storage for key=${storageKey}`, error as Error);
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
    );
  }
}
