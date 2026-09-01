import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentQueryService } from './document-query.service.js';
import { MAX_UPLOAD_SIZE_BYTES } from './documents.constants.js';
import { DocumentsService } from './documents.service.js';
import type { DocumentQueryResponseDto } from './dto/document-query-response.dto.js';
import type { IngestDocumentResponseDto } from './dto/ingest-document-response.dto.js';
import { MulterExceptionsFilter } from './multer-exceptions.filter.js';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentQueryService: DocumentQueryService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseFilters(MulterExceptionsFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  async ingest(@UploadedFile() file?: Express.Multer.File): Promise<IngestDocumentResponseDto> {
    if (!file) {
      throw new BadRequestException('O campo "file" é obrigatório.');
    }
    return this.documentsService.ingest(file);
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<DocumentQueryResponseDto> {
    return this.documentQueryService.findById(id);
  }
}
