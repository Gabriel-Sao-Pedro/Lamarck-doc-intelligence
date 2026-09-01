import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { DocumentListQuery } from './dto/document-list-query.dto.js';
import type { DocumentListResponseDto } from './dto/document-list-response.dto.js';

/**
 * Listagem paginada, somente leitura (docs/specification.md §23). Nunca
 * cria/altera nada, nunca aciona worker/provider/storage — só lê `Document`
 * com os campos públicos explicitamente selecionados.
 */
@Injectable()
export class DocumentListService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: DocumentListQuery): Promise<DocumentListResponseDto> {
    const where = query.status ? { status: query.status } : {};

    // count e findMany usam exatamente a mesma condição `where` e rodam na
    // mesma transação, para que o total corresponda aos itens retornados
    // mesmo sob escrita concorrente.
    const [total, documents] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        select: {
          id: true,
          status: true,
          documentType: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: documents.map((document) => ({
        documentId: document.id,
        status: document.status,
        documentType: document.documentType,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
