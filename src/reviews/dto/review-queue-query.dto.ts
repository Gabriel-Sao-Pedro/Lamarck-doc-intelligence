import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const POSITIVE_INTEGER_PATTERN = /^\d+$/;

export type ReviewQueueQuery = {
  page: number;
  pageSize: number;
};

export const parseReviewQueueQuery = (rawQuery: Record<string, unknown>): ReviewQueueQuery => ({
  page: parseIntParam(rawQuery.page, 'page', DEFAULT_PAGE, 1, undefined),
  pageSize: parseIntParam(rawQuery.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
});

const parseIntParam = (
  rawValue: unknown,
  paramName: string,
  defaultValue: number,
  min: number,
  max: number | undefined,
): number => {
  if (rawValue === undefined) return defaultValue;
  if (typeof rawValue !== 'string' || !POSITIVE_INTEGER_PATTERN.test(rawValue)) {
    throw new BadRequestException(`O parâmetro "${paramName}" precisa ser um número inteiro positivo.`);
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw new BadRequestException(`O parâmetro "${paramName}" está fora do intervalo permitido.`);
  }
  return parsed;
};
