# 09 — Review — suporte a PDF

## 1. Resultado

**APROVADO TECNICAMENTE**

O suporte a PDF ficou dentro do escopo da Fase 2.2 e reutiliza o pipeline que já
existia para imagens.

A implementação revisada passou com:

- `9/9` unit;
- `57/57` E2E;
- CI verde no HEAD funcional `ecf9429`.

Depois da implementação, dois commits documentais entraram na branch: o
ajuste do README (`5d00f6f`) e a consolidação de prompts/reviews/ADRs
(`4796d43`). Nenhum dos dois toca `src/`, `prisma/`, dependências, `.github/`
ou testes. Esta review é versionada em seguida, e a decisão de merge fica
condicionada apenas à CI do HEAD que passar a conter esta própria review —
não é necessário reexecutar a implementação funcional.

## 2. Estado revisado

- branch: `feat/pdf-support`
- base: `161c24b`
- HEAD funcional revisado: `ecf9429728473e3bb123dccc0a42e5fe14695ab3`
- commits documentais depois do HEAD funcional: `5d00f6f`, `4796d43`
- CI da implementação: `33473478135` — `SUCCESS`
- unit: `9/9`
- E2E: `57/57`

`docs.rar` permanece fora do escopo.

## 3. O que eu conferi

Revisei:

- diff completo da Fase 2.2;
- assinatura `%PDF-`;
- buffer curto;
- limite de 10 MB;
- MIME persistido;
- storage key;
- SHA-256;
- deduplicação sequencial;
- corrida de duplicata;
- cleanup físico;
- processing;
- worker/retry/lease/fencing;
- fake provider;
- consulta individual;
- listagem;
- PDF1–PDF14;
- regressões;
- schema;
- migrations;
- dependências;
- README;
- relatório 009;
- CI.

## 4. Findings confirmados

**Nenhum finding funcional ou arquitetural confirmado.**

## 5. Decisões técnicas relevantes

### Detecção

PDF é reconhecido pela assinatura:

```text
%PDF-
```

nos primeiros cinco bytes.

Nesta fase isso é uma validação mínima de formato, não uma validação estrutural
completa do PDF.

### Limite

O limite continua em 10 MB e usa o mesmo mecanismo do upload de imagens.

### MIME e storage

O MIME persistido vem do tipo detectado:

```text
application/pdf
```

A storage key usa extensão derivada do tipo real, e não do nome enviado pelo
cliente.

### SHA-256 e deduplicação

O hash continua sendo calculado sobre os bytes crus.

O mesmo PDF enviado duas vezes reaproveita o mesmo documento.

A corrida de duas requisições idênticas continua protegida pela constraint
única e pelo cleanup da cópia perdedora.

### Processing

PDF usa o mesmo:

- `ProcessingJob`;
- worker;
- retry;
- lease;
- `claimToken`;
- fencing;
- state machine.

Nenhum parser, OCR ou provider externo foi adicionado.

### Testes

Existem 13 testes novos dedicados (`PDF1` a `PDF13`).

`PDF14` representa a execução da regressão completa, por isso a conta final é:

```text
44 anteriores + 13 novos = 57 E2E
```

O problema observado na primeira execução de alguns testes era isolamento da
fila entre casos do mesmo arquivo. O cleanup por teste corrigiu isso sem mudar
código de produção.

## 6. Riscos não bloqueantes

- `%PDF-` valida somente a assinatura mínima;
- não existe teste específico para 10 MB exatos e 10 MB + 1 byte;
- permanece o finding conhecido de `deepmerge-ts` no audit.

Esses pontos estão dentro do escopo atual e não bloqueiam a Fase 2.2.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 9/9 |
| E2E | PASS — 57/57 |
| Docker Compose | PASS |
| `npm audit` | FAIL — finding conhecido |
| `npm audit --omit=dev` | FAIL — mesmo finding |
| CI da implementação | PASS — `33473478135` |

## 8. Decisão de merge

**PODE FAZER MERGE DEPOIS DA CI DO HEAD QUE CONTIVER ESTA REVIEW**

A implementação de PDF está aprovada. Os commits documentais posteriores não
alteram código, schema, dependências, CI ou testes — a única confirmação que
falta é a CI do HEAD que incorporar esta review.

## 9. Próximo passo

```text
versionar esta review
→ push feat/pdf-support
→ CI do HEAD verde
→ merge --ff-only em main
→ CI main verde
→ iniciar Fase 2.3
```

A próxima slice planejada continua sendo a API key simples.
