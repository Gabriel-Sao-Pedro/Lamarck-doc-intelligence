import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { DocumentResultFieldsDto, DocumentResultResponseDto } from '../documents/dto/document-query-response.dto.js';
import { DocumentStatus } from '../generated/prisma/enums.js';
import type { ReviewQueueQuery } from './dto/review-queue-query.dto.js';
import type { ReviewQueueResponseDto } from './dto/review-queue-response.dto.js';

/
@Injectable()
export class ReviewQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ReviewQueueQuery): Promise<ReviewQueueResponseDto> {
    const where = { status: DocumentStatus.NEEDS_REVIEW };

    const [total, documents] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        select: { id: true, documentType: true, status: true, createdAt: true, updatedAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const results = await this.loadLatestResults(documents.map((document) => document.id));

    return {
      items: documents.map((document) => ({
        documentId: document.id,
        documentType: document.documentType,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        result: results.get(document.id) ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }


  private async loadLatestResults(documentIds: string[]): Promise<Map<string, DocumentResultResponseDto>> {
    if (documentIds.length === 0) return new Map();

    const rows = await this.prisma.documentResult.findMany({
      where: { documentId: { in: documentIds } },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<string, DocumentResultResponseDto>();
    for (const row of rows) {
      if (latest.has(row.documentId)) continue;
      const data = row.data as { fields?: DocumentResultFieldsDto; confidence?: number };
      latest.set(row.documentId, {
        documentType: row.documentType,
        fields: data.fields as DocumentResultFieldsDto,
        confidence: data.confidence as number,
      });
    }
    return latest;
  }
}
