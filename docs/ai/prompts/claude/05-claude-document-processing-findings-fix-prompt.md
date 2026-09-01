# 05 — Corrigir os findings do processamento

## 1. Ação

Corrija somente os três pontos encontrados na minha revisão do processamento:

- `PROC-001` — a falha final está gravando `PROCESSING -> FAILED` diretamente;
- `PROC-002` — a finalização não garante que documento e run pertencem ao job claimado;
- `PROC-003` — o intervalo de polling aceita configuração inválida.

Não implemente nenhuma feature nova.

## 2. Contexto

A implementação principal do processamento está na branch:

`feat/document-processing`

HEAD revisado:

`ee76395d2c8e7e0d1ae911d61f2797538603928b`

A CI desse estado passou, mas minha revisão encontrou dois findings altos e um baixo.

Leia antes de alterar:

- `docs/implementation/reviews/04-document-processing-review.md`;
- `docs/implementation/004-document-processing.md`;
- arquitetura e ADRs relevantes;
- serviços de claim/finalização;
- worker/constants;
- testes atuais.

A state machine já aprovada continua sendo:

```text
RECEIVED -> PROCESSING
PROCESSING -> COMPLETED
PROCESSING -> NEEDS_REVIEW
PROCESSING -> RETRYING
RETRYING -> PROCESSING
RETRYING -> FAILED
```

Não altere os documentos humanos para acomodar a implementação.

## 3. Papel

Atue como implementador da correção.

Faça o menor conjunto de mudanças necessário para fechar os três findings e preservar o restante da implementação.

A checagem final e a decisão de merge serão feitas por mim.

## 4. Dados de entrada e referências

### PROC-001

Na terceira falha técnica e no lease expirado sem tentativas restantes, não grave `FAILED` diretamente a partir de `PROCESSING`.

Quero que `RETRYING` seja um estado realmente persistido:

```text
PROCESSING
→ RETRYING
→ FAILED
```

A passagem para `FAILED` deve acontecer depois, sem nova chamada ao provider.

Se houver crash com:

```text
RETRYING + attemptCount >= 3
```

o próximo ciclo precisa conseguir finalizar o job em `FAILED` sem processá-lo novamente.

Fortaleça P10 e P12 para provar a transição intermediária e confirmar que não existe quarta chamada ao provider.

### PROC-002

A finalização deve confiar no job claimado, não em IDs independentes.

Derive o `documentId` do próprio `ProcessingJob` sempre que possível.

O `ProcessingRun` precisa ser carregado e validado contra:

- documento do job;
- tentativa atual;
- estado correto para finalização.

Uma chamada com token válido de A e run/documento de B deve ser rejeitada antes de qualquer escrita.

Adicione teste desse cenário e confirme que nenhum documento, run, resultado ou claim é alterado indevidamente.

### PROC-003

Valide `PROCESSING_WORKER_POLL_INTERVAL_MS`.

Aceite somente inteiro positivo.

Para valor ausente, zero, negativo, inválido ou não finito, use o fallback seguro já definido no projeto.

Não adicione biblioteca para isso.

## 5. Formato de saída

Depois da correção, crie:

`docs/implementation/005-document-processing-findings-fix.md`

Explique:

- os três findings;
- o que causava cada um;
- como foram corrigidos;
- testes adicionados;
- resultados;
- CI;
- riscos que permaneceram.

Não altere minha review humana.

Rode:

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm run prisma:validate
npm run prisma:generate
docker compose config
npm audit
npm audit --omit=dev
```

Antes do commit:

```bash
git status --short
git diff --stat
git diff
```

Faça commits claros e push para:

`origin/feat/document-processing`

Acompanhe a CI e informe HEAD, run id, resultado e quantidade real de testes.

Depois pare para minha checagem.

## 6. Restrições e limites

Não:

- altere specification, architecture ou ADRs;
- altere a review humana;
- altere migrations existentes;
- crie migration sem necessidade real;
- implemente consulta HTTP;
- implemente listagem;
- implemente fila de revisão;
- implemente autenticação;
- implemente PDF;
- implemente provider real;
- implemente frontend;
- implemente nome padronizado;
- faça merge.

Não deixe `PROCESSING -> FAILED` direto em nenhum caminho.

Não confie em `documentId` ou `processingRunId` sem vinculá-los ao job claimado.

Não reduza os testes P1–P15 existentes.

Se a correção exigir mudança estrutural maior do que o esperado, pare e me mostre antes de expandir o escopo.
