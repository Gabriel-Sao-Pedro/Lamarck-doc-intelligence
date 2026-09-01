import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { API_KEY_SECURITY_SCHEME } from '../auth/api-key.constants.js';
import { parseReviewClaimBody } from './dto/review-claim-body.dto.js';
import { ReviewClaimResponseDto } from './dto/review-claim-response.dto.js';
import { parseReviewQueueQuery } from './dto/review-queue-query.dto.js';
import { ReviewQueueResponseDto } from './dto/review-queue-response.dto.js';
import { ReviewClaimService } from './review-claim.service.js';
import { ReviewQueueService } from './review-queue.service.js';

@Controller('reviews')
@UseGuards(ApiKeyGuard)
@ApiTags('reviews')
@ApiSecurity(API_KEY_SECURITY_SCHEME)
export class ReviewsController {
  constructor(
    private readonly reviewQueueService: ReviewQueueService,
    private readonly reviewClaimService: ReviewClaimService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista a fila de revisão humana (NEEDS_REVIEW)',
    description:
      'Somente leitura — sem claim, sem lease, sem alteração de estado. ' +
      'Ordenada por createdAt ascendente (FIFO): documento mais antigo primeiro.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Inteiro >= 1.', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Inteiro entre 1 e 100.', example: 20 })
  @ApiResponse({ status: 200, description: 'Página da fila de revisão.', type: ReviewQueueResponseDto })
  @ApiResponse({ status: 400, description: '"page"/"pageSize" fora do intervalo ou formato permitido.' })
  @ApiResponse({ status: 401, description: 'X-API-Key ausente ou inválida.' })
  async findMany(@Query() rawQuery: Record<string, unknown>): Promise<ReviewQueueResponseDto> {
    const query = parseReviewQueueQuery(rawQuery);
    return this.reviewQueueService.list(query);
  }

  @Post(':documentId/claim')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reivindica um documento NEEDS_REVIEW para revisão',
    description:
      'Concede um claim exclusivo com lease de 15 minutos. Duas requisições concorrentes para o ' +
      'mesmo documento nunca ganham as duas — uma recebe 200, a outra 409. Lease expirado pode ser ' +
      'sobrescrito por um novo claim.',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiBody({ schema: { type: 'object', required: ['reviewerId'], properties: { reviewerId: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Claim concedido.', type: ReviewClaimResponseDto })
  @ApiResponse({ status: 400, description: '"reviewerId" ausente ou inválido.' })
  @ApiResponse({ status: 401, description: 'X-API-Key ausente ou inválida.' })
  @ApiResponse({ status: 404, description: 'Documento não encontrado.' })
  @ApiResponse({ status: 409, description: 'Documento não está em NEEDS_REVIEW, ou já está reivindicado.' })
  async claim(
    @Param('documentId', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() rawBody: unknown,
  ): Promise<ReviewClaimResponseDto> {
    const body = parseReviewClaimBody(rawBody);
    return this.reviewClaimService.claim(documentId, body.reviewerId);
  }
}
