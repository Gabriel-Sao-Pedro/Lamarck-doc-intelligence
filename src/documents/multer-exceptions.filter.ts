import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

/**
 * O limite de 10 MB é imposto pelo Multer/Busboy durante o próprio parsing
 * multipart (interrompe o stream antes de bufferizar além do limite —
 * specification.md §6). Sem este filtro, o erro do Multer viraria um 500
 * genérico em vez do 4xx esperado pelo contrato da API.
 */
@Catch(MulterError)
export class MulterExceptionsFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Arquivo maior que o limite permitido (10 MB).',
      });
      return;
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Upload multipart inválido.',
    });
  }
}
