import { BadRequestException } from '@nestjs/common';

export type ReviewClaimBody = {
  reviewerId: string;
};

export const parseReviewClaimBody = (rawBody: unknown): ReviewClaimBody => {
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    throw new BadRequestException('O corpo da requisição precisa ser um objeto.');
  }

  const reviewerId = (rawBody as Record<string, unknown>).reviewerId;
  if (typeof reviewerId !== 'string' || reviewerId.trim().length === 0) {
    throw new BadRequestException('O campo "reviewerId" é obrigatório e precisa ser uma string não vazia.');
  }

  return { reviewerId };
};
