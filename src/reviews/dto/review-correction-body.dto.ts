import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CLAIM_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const REVIEW_CORRECTION_FIELDS = [
  'fullName',
  'parentage',
  'birthDate',
  'documentNumber',
  'issuingAuthority',
] as const;

export type ReviewCorrectionFieldName = (typeof REVIEW_CORRECTION_FIELDS)[number];
export type ReviewCorrectionFields = Partial<Record<ReviewCorrectionFieldName, string>>;

export class ReviewCorrectionFieldsDto {
  @ApiPropertyOptional()
  fullName?: string;

  @ApiPropertyOptional()
  parentage?: string;

  @ApiPropertyOptional({ example: '1990-01-01' })
  birthDate?: string;

  @ApiPropertyOptional()
  documentNumber?: string;

  @ApiPropertyOptional()
  issuingAuthority?: string;
}

export class ReviewCorrectionBodyDto {
  @ApiProperty({ format: 'uuid' })
  claimToken!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ type: ReviewCorrectionFieldsDto })
  corrections!: ReviewCorrectionFieldsDto;
}

export type ReviewCorrectionBody = {
  claimToken: string;
  version: number;
  corrections: ReviewCorrectionFields;
};

export const parseReviewCorrectionBody = (rawBody: unknown): ReviewCorrectionBody => {
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    throw new BadRequestException('O corpo da requisição precisa ser um objeto.');
  }

  const body = rawBody as Record<string, unknown>;
  const claimToken = body.claimToken;
  if (typeof claimToken !== 'string' || !CLAIM_TOKEN_PATTERN.test(claimToken)) {
    throw new BadRequestException('O campo "claimToken" precisa ser um UUID v4 válido.');
  }

  const version = body.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BadRequestException('O campo "version" precisa ser um inteiro maior ou igual a 1.');
  }

  const corrections = body.corrections;
  if (typeof corrections !== 'object' || corrections === null || Array.isArray(corrections)) {
    throw new BadRequestException('O campo "corrections" precisa ser um objeto.');
  }

  const rawCorrections = corrections as Record<string, unknown>;
  const allowedFields = new Set<string>(REVIEW_CORRECTION_FIELDS);
  const entries = Object.entries(rawCorrections);
  if (entries.length === 0) {
    throw new BadRequestException('O campo "corrections" precisa informar ao menos uma correção.');
  }

  const parsed: ReviewCorrectionFields = {};
  for (const [field, value] of entries) {
    if (!allowedFields.has(field)) {
      throw new BadRequestException(`Campo de correção não permitido: ${field}.`);
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`O campo "${field}" precisa ser uma string não vazia.`);
    }
    if (field === 'birthDate' && !BIRTH_DATE_PATTERN.test(value)) {
      throw new BadRequestException('O campo "birthDate" precisa usar o formato YYYY-MM-DD.');
    }
    parsed[field as ReviewCorrectionFieldName] = value;
  }

  return { claimToken, version, corrections: parsed };
};
