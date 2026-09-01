# 07 — Fechar e auditar a Fase 1

## 1. Ação

Faça o fechamento final da Fase 1.

Não quero nova feature.

Quero garantir que o projeto está reproduzível a partir de um ambiente limpo e que README, prompts, reviews e relatórios contam corretamente a história da implementação.

Ao final, precisamos conseguir decidir com segurança:

`FASE 1 PRONTA PARA ENTREGA`

ou

`FASE 1 AINDA NÃO PRONTA`.

## 2. Contexto

A vertical slice já está mergeada em `main`:

```text
receber
→ processar
→ persistir
→ consultar
```

Estado atual informado:

- main HEAD: `a84f799b3a0cffe94e8dd8c091c98d1b865f13fd`;
- CI main: run `33461640967`;
- resultado: `SUCCESS`.

Antes de começar, confirme `main`, working tree limpa e CI verde.

Crie:

`chore/phase1-closure`

Leia README, specification, architecture, ADRs, relatórios 001–006, reviews, prompts, package.json, env example, compose, Prisma e CI.

## 3. Papel

Atue como responsável pelo fechamento técnico/documental da fase.

Você pode corrigir documentação incompleta ou incorreta.

Não implemente feature nova.

Se o teste em ambiente limpo revelar bug funcional real, pare e me mostre antes de corrigir código.

## 4. Dados de entrada e referências

### README

Garanta que outra pessoa consiga, seguindo o README:

```text
clonar
→ configurar .env
→ subir PostgreSQL
→ instalar dependências
→ preparar Prisma
→ iniciar aplicação
→ POST /documents
→ GET /documents/:id
→ rodar testes
```

Documente:

- pré-requisitos;
- Node/npm;
- Docker;
- variáveis de ambiente;
- comandos reais;
- migrations/Prisma;
- como iniciar;
- como testar a vertical slice;
- como rodar unit/E2E;
- limitações da Fase 1.

### Fresh clone

Faça uma validação em cópia/clone limpo fora da working tree principal.

Siga apenas o README.

Prove que:

- banco sobe;
- Prisma funciona;
- build/lint/testes passam;
- aplicação sobe;
- upload retorna `documentId`;
- processamento ocorre;
- consulta chega a estado terminal.

Use apenas arquivo fictício.

Se o README estiver incompleto, corrija e repita o trecho necessário.

### Prompts

Audite os prompts realmente usados.

Não reescreva prompt histórico.

O `04A` foi versionado no histórico, mas não foi usado para instruir o Claude. Isso precisa ficar explícito.

Se necessário, crie um índice como:

`docs/ai/PROMPT_HISTORY.md`

com status:

- `USADO`;
- `VERSIONADO MAS NÃO USADO`.

Roteiros de revisão humana não devem ser classificados como prompts usados.

### Reviews

Confirme a autoria real.

No processing:

```text
implementação → Claude
primeira revisão → humana
PROC-001/002/003 → encontrados na revisão humana
correções → Claude
checagem final → humana
```

Não altere reviews antigas só por estilo.

### Escopo

Confirme que a Fase 1 contém a vertical slice e que continuam fora:

- PDF;
- provider real;
- autenticação;
- revisão humana operacional;
- listagem;
- nome padronizado;
- deploy;
- broker externo.

## 5. Formato de saída

Crie:

`docs/implementation/007-phase1-closure.md`

Registre:

- estado funcional;
- fresh clone;
- comandos usados;
- problemas do README;
- correções documentais;
- rastreabilidade dos prompts;
- situação do 04A;
- sequência das reviews;
- escopo implementado;
- fora de escopo;
- testes;
- CI;
- audit;
- riscos;
- decisão final.

Execute no ambiente limpo os comandos reais do projeto, incluindo build, lint, unit e E2E.

Antes do commit:

```bash
git status --short
git diff --stat
git diff
```

Faça push para:

`origin/chore/phase1-closure`

Acompanhe a CI.

Depois pare para minha revisão.

## 6. Restrições e limites

Não:

- implemente nova feature;
- inicie Fase 2;
- altere migrations antigas;
- reescreva prompts usados;
- faça amend/rebase para apagar o 04A do histórico;
- atribua revisão humana ao Claude;
- atribua correção do Claude ao usuário;
- use dado real;
- versione `.env`;
- use `npm audit fix --force`;
- faça merge.

Se encontrar bug funcional durante o fresh clone, pare antes de alterar código.

Se o 04A continuar no repositório, deixe inequívoco que foi versionado mas não usado.

Ao terminar, informe se considera:

`FASE 1 PRONTA PARA ENTREGA`

ou

`FASE 1 AINDA NÃO PRONTA`

e aguarde minha revisão humana.
