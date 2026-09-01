import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type {
  DocumentQueryResponseDto,
  DocumentResultFieldsDto,
  DocumentResultResponseDto,
} from './dto/document-query-response.dto.js';

/**
 * Consulta somente leitura (docs/specification.md §10, docs/architecture.md
 * §18). Nunca dispara processamento, nunca faz claim, nunca muda estado —
 * só lê Document + DocumentResult atual.
 */
@Injectable()
export class DocumentQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(documentId: string): Promise<DocumentQueryResponseDto> {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Documento não encontrado.');
    }

    const result = await this.loadResult(documentId);

    return {
      documentId: document.id,
      documentType: document.documentType,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      result,
    };
  }

  private async loadResult(documentId: string): Promise<DocumentResultResponseDto | null> {
    // Nesta fase, no máximo um DocumentResult existe por Document: a
    // finalização move o Document para um estado terminal
    // (COMPLETED/NEEDS_REVIEW) exatamente quando cria o resultado, e um
    // documento terminal nunca mais é selecionado pelo claim — nenhuma nova
    // tentativa pode criar um segundo resultado. O schema não impõe
    // unicidade de documentId em DocumentResult, então usamos o mais
    // recente por createdAt como regra explícita e defensiva (não
    // arbitrária), caso reprocessamento seja adicionado numa fase futura.
    const documentResult = await this.prisma.documentResult.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!documentResult) return null;

    const data = documentResult.data as { fields?: DocumentResultFieldsDto; confidence?: number };
    return {
      documentType: documentResult.documentType,
      fields: data.fields as DocumentResultFieldsDto,
      confidence: data.confidence as number,
    };
  }
}
