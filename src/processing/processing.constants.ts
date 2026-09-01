import { createHash } from 'node:crypto';

/** Total de tentativas permitidas por documento, incluindo a primeira (docs/architecture.md §13, ADR-002). */
export const MAX_ATTEMPTS = 3;

/**
 * O provider real do ambiente pode levar até 40s. 60s = 40s (máximo
 * informado) + 20s de margem de segurança, para não tratar uma tentativa
 * normal e lenta como worker morto (docs/architecture.md §11, ADR-002).
 * Valor de configuração da Fase 1, não uma garantia futura.
 */
export const LEASE_DURATION_MS = 60_000;

/** Intervalo de polling do worker; configurável para não travar testes. */
export const WORKER_POLL_INTERVAL_MS = Number(process.env.PROCESSING_WORKER_POLL_INTERVAL_MS ?? 1000);

/** Desliga o auto-start do loop do worker (usado em testes, ver docs/ai/prompts/claude/04-claude-document-processing-prompt.md §19). */
export const WORKER_ENABLED = process.env.PROCESSING_WORKER_ENABLED !== 'false';

/**
 * Limiar mínimo de confiança para aceitar um resultado sem revisão humana.
 * Configuração determinística da Fase 1 (docs/architecture.md §15) — não
 * deriva de nenhum estudo estatístico, só separa os dois cenários fictícios
 * do provider fake (alta confiança vs. baixa confiança).
 */
export const CONFIDENCE_THRESHOLD = 0.7;

export const PROVIDER_NAME = 'fake-document-ai';
export const MODEL_NAME = 'fake-identity-extractor';
export const MODEL_VERSION = '1.0.0';
export const PROMPT_ID = 'identity-document-extraction';
export const PROMPT_VERSION = 'v1';
export const PROMPT_HASH = createHash('sha256').update(`${PROMPT_ID}:${PROMPT_VERSION}`).digest('hex');
export const OUTPUT_SCHEMA_VERSION = 'identity-document-v1';
export const RESULT_SCHEMA_VERSION = 'identity-document-v1';

export const LEASE_EXPIRED_ERROR_TYPE = 'LEASE_EXPIRED';
