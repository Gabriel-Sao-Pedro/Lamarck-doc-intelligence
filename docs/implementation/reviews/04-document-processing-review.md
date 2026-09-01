# Review — processamento de documentos

## 1. Resultado

**REPROVADO ATÉ CORREÇÃO**

Revisei a implementação do processamento e a base está próxima de ficar pronta, mas encontrei dois problemas técnicos que afetam invariantes centrais do fluxo e impedem o merge neste momento.

A implementação principal cobre bem claim atômico, `FOR UPDATE SKIP LOCKED`, `claimToken`, lease, retry, recuperação de lease expirado, provider fake, `ProcessingRun`, `DocumentResult` e testes concorrentes com PostgreSQL real.

Mesmo com a CI verde, não considero seguro aprovar enquanto `PROC-001` e `PROC-002` não forem corrigidos.

## 2. Estado revisado

- **Branch:** `feat/document-processing`
- **HEAD:** `ee76395d2c8e7e0d1ae911d61f2797538603928b`
- **Base:** `533f54d`
- **Commits revisados:**
  - `d126642` — implementação do processamento;
  - `ee76395` — relatório da implementação.
- **CI:** run `33453856692` — `SUCCESS`
- **Working tree:** limpa

A CI corresponde ao HEAD revisado e a suíte completa passou, incluindo 23 testes E2E.

## 3. O que eu conferi

Conferi o fluxo de processamento diretamente no código, nos testes, no relatório `004` e na CI.

Os principais pontos revisados foram:

- claim atômico do `ProcessingJob`;
- uso de `FOR UPDATE SKIP LOCKED`;
- geração de `claimToken` novo por tentativa;
- lease de 60 segundos;
- provider executado fora da transação de claim;
- fencing na finalização;
- retry técnico;
- recuperação de lease expirado;
- limite de 3 tentativas;
- transições da state machine;
- criação e atualização de `ProcessingRun`;
- persistência de `DocumentResult`;
- provider fake e os modos de sucesso, revisão e falha técnica;
- validação determinística e semântica;
- comportamento do worker;
- testes P1–P15;
- execução E2E com PostgreSQL real;
- divergência de escopo do nome padronizado;
- preservação de schema, migrations e documentos humanos.

Também confirmei que o nome padronizado ficou fora desta etapa, conforme o planejamento humano do projeto.

## 4. Findings confirmados

### PROC-001 — falha final grava `PROCESSING -> FAILED` diretamente

**Severidade:** ALTO  
**Status:** CONFIRMADO  
**Arquivos principais:** `src/processing/finalization.service.ts` e `src/processing/job-claim.service.ts`

A arquitetura define estas transições:

```text
PROCESSING -> RETRYING
RETRYING -> FAILED
```

Na terceira falha técnica, ou quando um lease expira depois da última tentativa disponível, o código valida conceitualmente esse caminho, mas persiste `FAILED` diretamente.

Ou seja, na prática ocorre:

```text
PROCESSING -> FAILED
```

Isso não corresponde à state machine registrada.

O problema não é apenas visual. Essa diferença pode prejudicar auditoria, consumidores de status e a própria rastreabilidade das decisões do processamento.

**Correção esperada:** persistir a passagem por `RETRYING` antes de chegar a `FAILED`, ou então alterar formalmente a arquitetura. Para esta fase, prefiro manter a arquitetura já aprovada e corrigir a implementação.

### PROC-002 — finalização confia em IDs que não são vinculados ao job claimado

**Severidade:** ALTO  
**Status:** CONFIRMADO  
**Arquivo principal:** `src/processing/finalization.service.ts`

O fencing atual valida corretamente:

- `jobId`;
- `claimToken`;
- status;
- lease ainda válido.

O problema é que a finalização também recebe `documentId` e `processingRunId`, mas não garante que esses IDs realmente pertencem ao mesmo job que foi claimado.

Um cenário possível é uma chamada interna incorreta usando:

```text
job/token válidos do documento A
+
documentId ou processingRunId do documento B
```

Nesse caso, o fencing do job pode passar, mas a operação pode tentar atualizar resultado, run ou status de outro documento.

Isso quebra a consistência entre:

```text
ProcessingJob
ProcessingRun
Document
DocumentResult
```

**Correção esperada:** a finalização deve derivar ou validar `documentId` e `processingRunId` a partir do próprio job claimado, em vez de confiar nesses IDs como parâmetros independentes.

### PROC-003 — intervalo do worker não é sanitizado

**Severidade:** BAIXO  
**Status:** CONFIRMADO  
**Arquivos principais:** `src/processing/processing.constants.ts` e `src/processing/processing.worker.ts`

O intervalo configurado pelo ambiente é convertido com `Number(...)`, mas não há validação para `NaN`, zero ou valor negativo.

Uma configuração inválida pode causar polling imediato ou excessivamente agressivo.

**Correção esperada:** aceitar apenas inteiro positivo e usar fallback seguro quando o valor for inválido.

Esse finding não bloqueia sozinho o merge, mas é simples e vale corrigir junto com os dois principais.

## 5. Decisões técnicas relevantes

Algumas decisões importantes foram confirmadas como corretas.

### Claim e concorrência

O claim usa `FOR UPDATE SKIP LOCKED` dentro de uma transação curta, protegendo a linha do job até a atualização do claim.

Isso permite que múltiplos workers disputem trabalho sem adquirir o mesmo job ao mesmo tempo.

### Provider fora da transação

A chamada ao provider acontece depois do commit do claim.

Isso evita manter lock e transação abertos durante uma operação que, no ambiente real, pode levar dezenas de segundos.

### `claimToken`

Cada claim recebe um UUID novo.

A finalização compara o token atual do banco, o lease e o status antes de persistir resultado. Os testes de stale worker mostram que um worker antigo não consegue finalizar depois que outro claim substitui o token.

### Tentativas

`ProcessingJob.attemptCount` continua sendo a fonte operacional das tentativas.

`ProcessingRun.attemptNumber` continua sendo histórico.

O limite de 3 tentativas está implementado e os testes cobrem retry e recuperação de lease.

### `ProcessingRun`

O run é criado em `STARTED` e atualizado uma vez para o estado terminal.

Considerei isso compatível com o ADR desde que “imutável” seja entendido como não reescrever um run depois de finalizado, e não como proibição absoluta de qualquer `UPDATE` durante a vida da tentativa.

Ele não virou fonte de ownership nem de retry.

### Nome padronizado

O nome padronizado não foi implementado.

O prompt 04 mencionava esse item, mas os documentos humanos colocam essa funcionalidade em fase futura. A decisão correta foi manter os documentos humanos como fonte de verdade.

## 6. Riscos não bloqueantes

Além do `PROC-003`, permanecem alguns riscos conhecidos:

- `npm audit` continua reportando `deepmerge-ts` pelo tooling do Prisma, sem evidência atual de impacto runtime;
- a proveniência do provider é fixada no momento do claim, o que é aceitável para o fake estático desta fase, mas deverá ser revisto quando existir provider real dinâmico;
- o worker atual processa uma tentativa por vez por instância, suficiente para esta fase, mas limitado para volume maior;
- o threshold de confiança `0.7` é uma decisão de implementação centralizada e documentada, não uma regra de negócio já consolidada pelos documentos humanos.

Nenhum desses riscos, isoladamente, impede o merge.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Tests | PASS |
| E2E | PASS — 23/23 |
| Docker Compose | PASS |
| `npm audit` | FAIL — risco conhecido em `deepmerge-ts` |
| `npm audit --omit=dev` | FAIL — mesmo risco conhecido |
| CI do HEAD | PASS |

A run `33453856692` corresponde ao HEAD `ee76395d2c8e7e0d1ae911d61f2797538603928b`.

Os testes P1–P15 existem e cobrem os principais cenários, mas P10 e P12 não detectam a divergência de state machine porque validam apenas o estado final.

## 8. Decisão de merge

**NÃO PODE FAZER MERGE AINDA.**

A implementação está próxima, mas `PROC-001` e `PROC-002` precisam ser corrigidos antes.

O primeiro mantém a implementação divergente da state machine aprovada.

O segundo pode permitir inconsistência entre job, run, documento e resultado durante a finalização.

Também recomendo corrigir `PROC-003` no mesmo ajuste por ser pequeno e operacionalmente útil.

Depois dessas correções, não considero necessário refazer toda a revisão. Basta uma checagem focada nos três findings e nova CI.

## 9. Próximo passo

Corrigir somente:

```text
PROC-001
→ persistir corretamente PROCESSING -> RETRYING -> FAILED

PROC-002
→ vincular documentId e processingRunId ao job claimado
→ não confiar em IDs independentes na finalização

PROC-003
→ sanitizar o intervalo de polling do worker
```

Depois:

```text
correções
        ↓
testes específicos
        ↓
suíte completa
        ↓
CI
        ↓
checagem humana focada
        ↓
merge em main
```

A etapa de consulta HTTP só deve começar depois que o processamento estiver corrigido e incorporado em `main`.
