# ADR-005 — Histórico imutável de processamento

## Status

Aceito

## Contexto

O processamento dos documentos pode mudar com o tempo.

Podemos trocar:

- o provider;
- o modelo;
- a versão do modelo;
- o prompt;
- a versão do formato esperado;
- regras de validação.

Também pode acontecer de um documento precisar ser processado novamente depois
de uma falha ou depois de alguma mudança no sistema.

Se eu simplesmente sobrescrever o resultado anterior, perco a capacidade de
entender como aquele documento foi processado no passado.

Isso dificulta investigar erros e comparar mudanças futuras.

---

## Decisão

Cada tentativa iniciada será registrada em um novo `ProcessingRun`.

Depois de finalizado, esse registro não deve ser alterado para fingir que a
execução aconteceu de outra forma.

Se o documento for processado novamente, serão criados novos runs.

O histórico anterior continua existindo.

O `ProcessingJob.attemptCount` será a fonte de verdade operacional para decidir
se outra tentativa ainda pode começar.

Quando uma tentativa começa, esse contador é incrementado de forma atômica e o
novo `ProcessingRun` recebe o mesmo número em `attemptNumber`.

Assim, o job controla o limite de tentativas e o run preserva o histórico do
que realmente aconteceu.

Não vou calcular o limite de retry contando `ProcessingRun`s.

---

## Por que escolhi isso

Quero conseguir responder perguntas como:

- qual provider produziu esse resultado?
- qual versão do modelo foi usada?
- qual prompt estava ativo?
- essa foi a primeira, segunda ou terceira tentativa?
- quanto tempo essa execução levou?
- por que ela terminou em erro?
- esse resultado veio antes ou depois de uma mudança no sistema?

Sem histórico, eu teria apenas o estado atual.

Isso pode ser suficiente para mostrar a última resposta ao usuário, mas não é
suficiente para entender o que aconteceu durante o processamento.

---

## O que pretendo registrar

Quando fizer sentido, cada `ProcessingRun` poderá guardar informações como:

- identificador da execução;
- documento relacionado;
- número da tentativa;
- provider utilizado;
- modelo;
- versão do modelo;
- identificador, versão ou hash do prompt;
- versão do schema esperado;
- momento de início;
- momento de fim;
- status da execução;
- tipo de erro técnico, quando houver.

Não quero guardar conteúdo sensível apenas para aumentar a quantidade de
informação no histórico.

Dados pessoais e o conteúdo completo do documento não devem ir para logs ou
campos de auditoria sem necessidade.

---

## Relação com o resultado

O `DocumentResult` deve indicar qual execução produziu aquele resultado.

Assim, se futuramente o mesmo documento tiver mais de um processamento, eu
consigo saber qual resultado pertence a qual execução.

O documento pode apontar para o resultado atual, mas os resultados e execuções
anteriores não precisam desaparecer.

---

## Retry e histórico

As tentativas também devem aparecer no histórico.

Por exemplo:

`tentativa 1 -> erro técnico`

`tentativa 2 -> erro técnico`

`tentativa 3 -> sucesso`

Nesse caso, não quero guardar apenas a terceira tentativa.

As duas falhas anteriores ajudam a entender o comportamento do sistema.

O número de tentativa gravado no `ProcessingRun` deve vir do mesmo incremento
do `ProcessingJob.attemptCount` que autorizou aquela tentativa.

Dessa forma, não quero manter dois contadores independentes.

A mesma ideia vale se o processamento terminar em `FAILED`.

---

## Reprocessamento futuro

Se um documento for processado novamente porque o modelo mudou ou porque alguém
solicitou uma nova execução, não quero reutilizar o registro anterior.

Será criada uma nova execução.

Isso deixa claro que:

- o documento é o mesmo;
- o processamento é outro;
- o contexto técnico pode ter mudado.

---

## Alternativas consideradas

### Guardar apenas o último resultado

Seria mais simples e exigiria menos dados.

Não escolhi porque perderia informações importantes sobre tentativas, falhas e
mudanças de versão.

### Atualizar o mesmo `ProcessingRun`

Também reduziria a quantidade de registros.

Não escolhi porque faria o histórico depender do estado atual do registro.

Uma atualização errada poderia apagar informações úteis sobre uma execução
anterior.

### Criar um novo registro por tentativa

Foi a opção escolhida.

Ela aumenta um pouco a quantidade de dados, mas deixa o comportamento muito
mais fácil de acompanhar.

---

## Consequências

Com essa decisão:

- o histórico de processamento fica preservado;
- retries podem ser investigados;
- mudanças de modelo e prompt ficam rastreáveis;
- reprocessamento não apaga o passado;
- o limite de retry usa `ProcessingJob.attemptCount`;
- cada run recebe o número da tentativa que realmente começou;
- a quantidade de registros cresce com o tempo;
- consultas precisam diferenciar histórico de resultado atual.

Para o volume desta entrega, esse crescimento não é um problema relevante.

---

## Limitações

Imutável não significa que o banco nunca terá nenhuma operação administrativa.

Em produção podem existir necessidades como:

- retenção;
- anonimização;
- exclusão por política de dados;
- correção de problemas operacionais.

Esses casos precisam de regras próprias.

O objetivo desta decisão é evitar que a aplicação sobrescreva silenciosamente o
histórico normal de processamento.

---

## Quando eu mudaria essa decisão

Eu não pretendo abandonar o histórico mesmo se o sistema crescer.

O que provavelmente mudaria seria a forma de armazenar ou reter esses dados.

Se o volume se tornar muito grande, eu avaliaria:

- política de retenção;
- arquivamento;
- particionamento;
- armazenamento separado para histórico antigo.

Mas continuaria evitando sobrescrever execuções anteriores como se elas nunca
tivessem existido.
