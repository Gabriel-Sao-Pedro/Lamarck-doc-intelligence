# Ferramentas de IA

## Claude Code

Versão: 2.1.211
Ambiente: Windows 11 Pro, Node.js v24.16.0, npm 11.13.0, Git 2.55.0

## Instruções do projeto

- `CLAUDE.md` — na raiz do projeto. Carregado automaticamente pelo Claude
  Code como instrução de projeto.
- `AGENTS.md` — na raiz do projeto. Regras gerais de trabalho para o Claude.
- `PROJECT_CONTEXT.md` — na raiz do projeto, ao lado dos dois acima (ambos o
  referenciam como leitura obrigatória). Contexto operacional do Claude
  neste projeto.
- Skill `doc-intelligence-backend` — complementa `CLAUDE.md`/`AGENTS.md` com
  regras de domínio específicas; ver seção Skills abaixo.

  Correção de estrutura: `CLAUDE.md`, `AGENTS.md` e `PROJECT_CONTEXT.md`
  estavam originalmente em `docs/` e foram movidos para a raiz nesta tarefa.
  Só `CLAUDE.md` é carregado automaticamente pelo Claude Code — `AGENTS.md`
  e `PROJECT_CONTEXT.md` são lidos porque `CLAUDE.md` manda lê-los no início
  de qualquer tarefa, não por carregamento automático da ferramenta.

## Skills

### `doc-intelligence-backend`
- Origem: local, escrita especificamente para este projeto nesta preparação.
- Escopo: projeto (`.claude/skills/doc-intelligence-backend/SKILL.md`).
- Finalidade: define como o Claude deve trabalhar neste backend — leitura
  obrigatória de spec/arquitetura/ADRs antes de implementar, regras da state
  machine do documento, atomicidade/concorrência em jobs, deduplicação por
  SHA-256, regras de PII em logs, e o checklist de conclusão de tarefa
  (build/lint/testes + relatório final).
- Por que foi adicionada: nenhuma skill genérica de mercado conhece as regras
  de domínio específicas deste projeto (state machine, dedup, PII); só uma
  skill local poderia cobrir isso.

### `postgres-concurrency`
- Origem: conteúdo técnico vendorizado (copiado, sem modificação) da skill
  oficial `supabase-postgres-best-practices`, mantida pela Supabase
  (`github.com/supabase/agent-skills`, licença MIT). Ver
  `.claude/skills/postgres-concurrency/SOURCE.md` para commit exato, hashes
  de cada arquivo e justificativa de vendorização em vez de instalação via
  plugin marketplace.
- Escopo: projeto (`.claude/skills/postgres-concurrency/`).
- Finalidade: 5 arquivos de referência sobre `SELECT ... FOR UPDATE SKIP
  LOCKED` (claim atômico de fila), prevenção de deadlock, transações curtas,
  locks de aplicação (advisory locks) e `INSERT ... ON CONFLICT` (upsert
  atômico) — aplicados ao claim de jobs pelo worker, aos retries e à
  deduplicação por SHA-256 deste projeto.
- Por que foi adicionada: é a única capacidade de conhecimento técnico
  específico de concorrência em PostgreSQL, de fonte oficial verificada, com
  conteúdo confirmado (li os 5 arquivos linha a linha antes de copiar), que
  se aplica diretamente ao núcleo deste projeto (fila persistida +
  deduplicação). Só os arquivos relevantes foram copiados — o pacote
  original tem 32 arquivos, a maioria sobre tópicos fora de escopo (RLS,
  pooler do Supabase, full-text search, JSONB).

## MCPs

### `context7`
- Origem: oficial, mantido pela Upstash (`github.com/upstash/context7`,
  pacote npm `@upstash/context7-mcp`, licença MIT). Maintainers verificados
  via `npm view` com e-mails do domínio `upstash.com`.
- Escopo: projeto (`.mcp.json` na raiz do repositório).
- Finalidade: consulta de documentação técnica atualizada (NestJS, Prisma,
  PostgreSQL, bibliotecas do projeto) via `resolve-library-id` +
  `get-library-docs`, para reduzir risco de informação desatualizada ou
  API alucinada.
- Status: Context7 configurado no projeto, mas a tentativa de conexão nesta
  sessão falhou por timeout (`CONNECT_TIMEOUT` após 30s), em duas ocasiões
  distintas (sessão anterior e nesta). Não requer chave de API para uso
  básico; nenhuma credencial foi configurada — o timeout não está relacionado
  a autenticação. **Não é dependência bloqueante da implementação.** Se
  necessário, a documentação pode ser consultada manualmente via
  context7.com ou busca web até o MCP conectar.

## Recursos existentes utilizados

Recursos já instalados globalmente (fora desta preparação) que serão
efetivamente usados neste projeto:

- `code-review` — revisão de diffs/PRs.
- `pr-test-analyzer` — cobertura de testes em mudanças.
- `silent-failure-hunter` — falhas silenciosas / error handling inadequado
  (relevante para o tratamento de falha técnica vs. semântica do provider).
- `type-design-analyzer` — qualidade de design de tipos TypeScript.
- `security-guidance` — revisão de segurança em edições/commits/push.
