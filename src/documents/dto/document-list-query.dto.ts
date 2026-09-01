import { BadRequestException } from '@nestjs/common';
import type { DocumentStatus } from '../../generated/prisma/enums.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const POSITIVE_INTEGER_PATTERN = /^\d+$/;

const VALID_STATUSES: readonly DocumentStatus[] = [
  'RECEIVED',
  'PROCESSING',
  'RETRYING',
  'COMPLETED',
  'NEEDS_REVIEW',
  'FAILED',
];

export interface DocumentListQuery {
  page: number;
  pageSize: number;
  status?: DocumentStatus;
}

/**
 * Parsing manual e explícito dos query params de `GET /documents`
 * (docs/specification.md §23 — listagem/paginação/filtro da Fase 2). O
 * projeto não usa class-validator/ValidationPipe em nenhum outro lugar,
 * então isso segue o mesmo padrão já usado pelo resto do código (ex.:
 * `ParseUUIDPipe` nativo do Nest para `:id`) em vez de introduzir uma
 * biblioteca nova. Nenhum valor inválido cai silenciosamente num default —
 * só a ausência do parâmetro usa o default.
 */
export function parseDocumentListQuery(rawQuery: Record<string, unknown>): DocumentListQuery {
  return {
    page: parsePositiveIntParam(rawQuery.page, 'page', DEFAULT_PAGE, 1, undefined),
    pageSize: parsePositiveIntParam(rawQuery.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    status: parseStatusParam(rawQuery.status),
  };
}

function parsePositiveIntParam(
  rawValue: unknown,
  paramName: string,
  defaultValue: number,
  min: number,
  max: number | undefined,
): number {
  if (rawValue === undefined) return defaultValue;

  if (typeof rawValue !== 'string' || !POSITIVE_INTEGER_PATTERN.test(rawValue)) {
    throw new BadRequestException(`O parâmetro "${paramName}" precisa ser um número inteiro positivo.`);
  }

  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw new BadRequestException(`O parâmetro "${paramName}" está fora do intervalo permitido.`);
  }

  return parsed;
}

function parseStatusParam(rawValue: unknown): DocumentStatus | undefined {
  if (rawValue === undefined) return undefined;

  if (typeof rawValue !== 'string' || !VALID_STATUSES.includes(rawValue as DocumentStatus)) {
    throw new BadRequestException('O parâmetro "status" precisa ser um dos estados válidos.');
  }

  return rawValue as DocumentStatus;
}
