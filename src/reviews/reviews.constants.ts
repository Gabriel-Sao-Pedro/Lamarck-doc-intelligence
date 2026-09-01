/**
 * Duração do lease de claim de revisão humana (Fase 3.2). 15 minutos é
 * suficiente para este slice. Sem scheduler/reaper separado: um lease
 * expirado simplesmente pode ser sobrescrito no próximo claim — mesma
 * filosofia já usada no claim do worker (docs/architecture.md §11, ADR-002).
 */
export const REVIEW_LEASE_MS = 15 * 60 * 1000;
