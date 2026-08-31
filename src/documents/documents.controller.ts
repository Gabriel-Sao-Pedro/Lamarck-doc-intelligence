import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_SIZE_BYTES } from './documents.constants.js';
import { DocumentsService } from './documents.service.js';
import type { IngestDocumentResponseDto } from './dto/ingest-document-response.dto.js';
import { MulterExceptionsFilter } from './multer-exceptions.filter.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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
}
