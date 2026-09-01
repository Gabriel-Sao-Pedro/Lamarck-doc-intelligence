# 04A — Ajustar escopo do processamento

## 1. Ação

Continue a implementação do processamento, mas não implemente a sugestão de nome padronizado nesta etapa.

O prompt 04 avançou esse item antes da hora.

## 2. Contexto

Os documentos humanos do projeto colocam a sugestão de nome padronizado em uma fase futura.

Como eles são a fonte de verdade do planejamento, quero manter esse escopo original.

Antes de continuar, confira:

- `docs/specification.md`;
- `PROJECT_CONTEXT.md`;
- `docs/architecture.md`;
- ADRs relevantes;
- schema atual.

Se aparecer outra divergência entre o prompt e esses documentos, pare e me mostre.

## 3. Papel

Continue como implementador do backend.

Sua função é seguir com o processamento sem redesenhar o escopo já definido.

A decisão de fase e a revisão final continuam sendo minhas.

## 4. Dados de entrada e referências

A tarefa continua incluindo:

- claim;
- `SKIP LOCKED`;
- `claimToken`;
- lease;
- worker;
- provider fake;
- validação;
- retry;
- recuperação de lease;
- `ProcessingRun`;
- `DocumentResult`;
- estados finais;
- testes e CI.

Nesta fase, o `DocumentResult` deve guardar somente o que o schema e o planejamento atual suportam.

Não crie campo, migration ou regra para nome padronizado.

## 5. Formato de saída

No relatório:

`docs/implementation/004-document-processing.md`

registre que o prompt 04 mencionou nome padronizado, mas durante a execução foi identificado que isso conflitava com o planejamento versionado.

Explique que:

- os documentos humanos prevaleceram;
- o item ficou para a fase futura;
- nenhuma migration ou lógica foi criada só por causa dessa divergência.

Na resposta final da tarefa, inclua:

### Divergência de escopo tratada

- nome padronizado implementado?: NÃO
- motivo:
- migration criada por isso?: NÃO
- decisão registrada no relatório 004?: SIM

## 6. Restrições e limites

Não:

- altere specification/architecture/ADRs para acomodar o prompt;
- reescreva o prompt 04;
- implemente nome padronizado;
- crie migration por causa desse item;
- reinicie a tarefa;
- descarte código válido já feito.

Continue do ponto atual e siga com o restante do processamento normalmente.
