import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { API_KEY_SECURITY_SCHEME } from '../auth/api-key.constants.js';
import { DocumentStatus } from '../generated/prisma/enums.js';
import { DocumentListService } from './document-list.service.js';
import { DocumentQueryService } from './document-query.service.js';
import { MAX_UPLOAD_SIZE_BYTES } from './documents.constants.js';
import { DocumentsService } from './documents.service.js';
import { parseDocumentListQuery } from './dto/document-list-query.dto.js';
import { DocumentListResponseDto } from './dto/document-list-response.dto.js';
import { DocumentQueryResponseDto } from './dto/document-query-response.dto.js';
import { IngestDocumentResponseDto } from './dto/ingest-document-response.dto.js';
import { MulterExceptionsFilter } from './multer-exceptions.filter.js';

@Controller('documents')
@UseGuards(ApiKeyGuard)
@ApiTags('documents')
@ApiSecurity(API_KEY_SECURITY_SCHEME)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentQueryService: DocumentQueryService,
    private readonly documentListService: DocumentListService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseFilters(MulterExceptionsFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Envia um documento para ingestão',
    description:
      'Aceita JPEG/JPG/PNG/PDF de até 10 MB. O tipo é validado pelo conteúdo real ' +
      '(assinatura/magic bytes), não pela extensão nem pelo Content-Type declarado. ' +
      'O SHA-256 dos bytes recebidos identifica duplicata exata: enviar o mesmo ' +
      'arquivo de novo não cria um segundo documento nem um segundo job, e a resposta ' +
      'indica deduplicated: true. O processamento acontece de forma assíncrona depois ' +
      'da resposta.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Arquivo JPEG/JPG/PNG/PDF, até 10 MB.' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 202, description: 'Documento novo ou duplicata reconhecida.', type: IngestDocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Campo "file" ausente, ou conteúdo que não corresponde a um JPEG/PNG/PDF válido.' })
  @ApiResponse({ status: 401, description: 'X-API-Key ausente ou inválida.' })
  @ApiResponse({ status: 413, description: 'Arquivo maior que 10 MB.' })
  async ingest(@UploadedFile() file?: Express.Multer.File): Promise<IngestDocumentResponseDto> {
    if (!file) {
      throw new BadRequestException('O campo "file" é obrigatório.');
    }
    return this.documentsService.ingest(file);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista documentos com paginação e filtro por status',
    description: 'Resumo por documento — sem campos extraídos nem detalhes de infraestrutura. Ordenado por createdAt decrescente.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Inteiro >= 1.', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Inteiro entre 1 e 100.', example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: DocumentStatus, description: 'Filtra por um dos estados públicos.' })
  @ApiResponse({ status: 200, description: 'Página de documentos.', type: DocumentListResponseDto })
  @ApiResponse({ status: 400, description: '"page"/"pageSize"/"status" fora do intervalo ou formato permitido.' })
  @ApiResponse({ status: 401, description: 'X-API-Key ausente ou inválida.' })
  async findMany(@Query() rawQuery: Record<string, unknown>): Promise<DocumentListResponseDto> {
    const query = parseDocumentListQuery(rawQuery);
    return this.documentListService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um documento pelo id' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID do documento.' })
  @ApiResponse({ status: 200, description: 'Documento existente — result é null até haver um resultado persistido.', type: DocumentQueryResponseDto })
  @ApiResponse({ status: 400, description: '"id" não é um UUID válido.' })
  @ApiResponse({ status: 401, description: 'X-API-Key ausente ou inválida.' })
  @ApiResponse({ status: 404, description: 'Nenhum documento com esse id.' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<DocumentQueryResponseDto> {
    return this.documentQueryService.findById(id);
  }
}
