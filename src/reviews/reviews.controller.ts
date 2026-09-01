import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { API_KEY_SECURITY_SCHEME } from '../auth/api-key.constants.js';
import { parseReviewQueueQuery } from './dto/review-queue-query.dto.js';
import { ReviewQueueResponseDto } from './dto/review-queue-response.dto.js';
import { ReviewQueueService } from './review-queue.service.js';

@Controller('reviews')
@UseGuards(ApiKeyGuard)
@ApiTags('reviews')
@ApiSecurity(API_KEY_SECURITY_SCHEME)
export class ReviewsController {
  constructor(private readonly reviewQueueService: ReviewQueueService) {}

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
}
