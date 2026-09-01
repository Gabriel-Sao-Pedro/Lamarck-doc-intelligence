# ADR-007 — Fencing por claimToken em jobs com lease

## Status

Aceito

Nota sobre a data desta ADR: o mecanismo de `claimToken` já havia sido
implementado na foundation, como correção do finding `F-001` (fencing de
lease insuficiente). Esta ADR foi versionada mais tarde, durante a
consolidação documental da Fase 2.2, para formalizar por escrito uma
decisão que já estava em produção — a data de criação do arquivo não é a
data em que o mecanismo nasceu.

## Contexto

O worker não mantém a transação do PostgreSQL aberta enquanto o provider está
sendo executado.

Isso é intencional. A chamada de inteligência pode levar vários segundos e não
quero segurar lock ou conexão do banco durante esse tempo.

O job é pego em uma transação curta usando `FOR UPDATE SKIP LOCKED`. Depois do
claim, a transação termina e o processamento continua fora dela.

Para recuperar jobs quando um worker cai, existe um lease.

Esse lease resolve a recuperação, mas cria outro problema.

Um worker pode:

1. pegar um job;
2. começar o processamento;
3. ficar lento ou perder comunicação;
4. deixar o lease expirar;
5. ter o mesmo job recuperado por outro worker;
6. voltar atrasado e tentar finalizar a tentativa antiga.

Nesse cenário, conferir apenas `documentId`, `claimedBy` ou o status atual não é
forte o suficiente para provar que a finalização ainda pertence ao claim
válido.

---

## Decisão

Cada claim válido de um `ProcessingJob` recebe um `claimToken` novo.

O token é gerado no momento do claim e fica no estado operacional do job.

A finalização só pode gravar o resultado quando o token apresentado pela
tentativa ainda corresponde ao token atual do `ProcessingJob`.

Em termos simples:

`claimToken da tentativa == claimToken atual do job`

Se outro worker recuperar o job, um novo token é criado.

A tentativa antiga passa a ter um token obsoleto e não pode mais finalizar o
trabalho.

O `claimToken` funciona como fencing token para aquela posse específica do job.

---

## Relação com o lease

O lease responde:

`até quando este claim é considerado válido?`

O `claimToken` responde:

`esta finalização ainda pertence ao claim atual?`

As duas proteções trabalham juntas.

O lease permite recuperar trabalho abandonado.

O fencing impede que um worker antigo volte depois da recuperação e sobrescreva
o resultado do claim mais novo.

---

## Relação com ProcessingJob e ProcessingRun

`ProcessingJob` continua sendo a fonte de verdade operacional.

Por isso, o `claimToken` pertence ao job.

`ProcessingRun` continua sendo o histórico da tentativa.

Ele registra o que aconteceu naquela execução, mas não deve decidir sozinho se
uma tentativa ainda possui o direito de finalizar o job.

Na finalização também é importante validar a relação entre:

- job;
- documento;
- `ProcessingRun`;
- número da tentativa.

Isso evita aceitar um run válido, mas pertencente a outro documento ou a outra
tentativa.

---

## Por que não manter o lock durante a chamada ao provider

Uma alternativa seria manter a transação e o lock do banco abertos até o
provider responder.

Não escolhi isso porque:

- a chamada pode durar muitos segundos;
- o provider pode sofrer timeout;
- a conexão ficaria ocupada durante uma espera externa;
- locks longos reduzem concorrência;
- uma falha do provider aumentaria o tempo de transação.

Prefiro:

`transação curta para claim -> processamento fora da transação -> transação curta para finalizar`

---

## Alternativas consideradas

### Confiar apenas em claimedBy

Não escolhi porque o mesmo worker pode pegar o job novamente depois de uma
recuperação.

O nome do worker identifica o processo, mas não identifica uma posse específica
do job.

### Confiar apenas em claimedAt ou leaseExpiresAt

Esses campos ajudam a decidir se o claim expirou, mas são mais frágeis como
identificador de ownership.

Também não deixam tão explícito qual claim está tentando finalizar.

### Usar somente o status do documento

Não é suficiente.

Um worker antigo pode voltar enquanto o documento continua em um estado que
parece compatível com processamento.

O status representa o estado de negócio, não a identidade do claim.

### Manter transação aberta durante o provider

Foi descartado pelos custos de lock e conexão descritos acima.

### Gerar um token novo por claim

Foi a alternativa escolhida.

É simples, explícita e separa bem:

- recuperação por lease;
- autorização de finalização por fencing.

---

## Consequências

Com essa decisão:

- cada recuperação gera uma nova identidade de claim;
- worker atrasado não consegue finalizar com token antigo;
- o banco continua sem transação longa durante chamada externa;
- `ProcessingJob` ganha um pequeno estado operacional extra;
- finalizações precisam verificar o token;
- testes de stale worker passam a ser parte importante da regressão.

Também fica mais fácil explicar o comportamento:

`lease expirou -> claim antigo perdeu a posse`

`novo claim -> novo claimToken`

`token antigo -> sem direito de finalizar`

---

## Limitações

O `claimToken` não resolve todos os problemas possíveis de processamento
distribuído.

Ainda existem pontos como:

- política de heartbeat;
- limite de workers;
- observabilidade;
- backoff;
- indisponibilidade prolongada do banco.

Esses itens podem evoluir depois.

Para esta entrega, o token resolve o risco principal de um worker atrasado
gravar sobre um claim mais recente.

---

## Quando eu mudaria essa decisão

Mesmo com um broker dedicado, eu continuaria querendo alguma forma de fencing
ou versionamento de ownership se existir recuperação por timeout/lease.

A implementação concreta pode mudar caso a infraestrutura de fila mude, mas a
regra que quero preservar é:

`uma tentativa antiga não pode finalizar um trabalho depois de perder a posse`
