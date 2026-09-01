import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { getConfiguredApiKey } from './api-key.config.js';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Compara em tempo constante; trata comprimentos diferentes sem lançar
 * (timingSafeEqual exige buffers do mesmo tamanho).
 */
function safeCompare(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

/**
 * Autenticação simples por API key (Fase 2.3). Só aceita a chave pelo
 * header `X-API-Key` — nunca por query string, body, cookie ou path.
 * Guard, não lógica de domínio: aplicado na camada HTTP, antes de
 * qualquer pipe/interceptor/handler do controller (docs/architecture.md
 * — autenticação não pertence a DocumentsService/processing/storage).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[API_KEY_HEADER];

    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException();
    }

    if (!safeCompare(provided, getConfiguredApiKey())) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
