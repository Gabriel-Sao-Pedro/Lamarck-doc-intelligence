# ADR-002 — PostgreSQL como fila de processamento

## Status

Aceito

## Contexto

Depois que o documento é recebido, ele precisa ficar aguardando até que um
worker faça o processamento.

Para isso, eu preciso de algum lugar que guarde os trabalhos pendentes e permita
que o worker saiba o que deve processar.

Uma opção seria usar uma ferramenta própria para filas, como Redis, RabbitMQ,
Kafka ou outro serviço parecido.

Mesmo assim, para esta entrega eu não quero adicionar uma nova infraestrutura
sem necessidade.

O PostgreSQL já vai existir no projeto para armazenar os dados da aplicação e,
para o volume inicial do desafio, ele também consegue controlar os jobs
pendentes.

---

## Decisão

Vou usar o próprio PostgreSQL como fila de processamento na primeira versão.

Os jobs ficarão registrados no banco e os workers buscarão os trabalhos
disponíveis diretamente nele.

A ideia é que cada job tenha informações suficientes para controlar:

- se está disponível;
- quantas tentativas já aconteceram;
- qual worker pegou o trabalho;
- quando o trabalho foi pego;
- até quando aquele claim continua válido.

Também quero garantir que dois workers não processem o mesmo job ao mesmo tempo.

---

## Por que escolhi isso

Escolhi PostgreSQL porque ele já faz parte da solução.

Isso evita adicionar outra ferramenta só para resolver um problema que, neste
momento, ainda é pequeno.

Para esta entrega, isso traz algumas vantagens:

- menos infraestrutura para configurar;
- ambiente local mais simples;
- menos dependências para quem clonar o projeto;
- menos pontos de falha;
- mais tempo focado nas regras principais do sistema.

Também considero importante que a fila seja persistente.

Se a aplicação reiniciar, os jobs não devem simplesmente desaparecer.

Como eles estarão no banco, continuam disponíveis depois que a aplicação voltar.

---

## Como pretendo evitar dois workers no mesmo job

Quando um worker buscar trabalho, ele não pode apenas fazer:

"pegar o primeiro job pendente"

porque dois workers poderiam encontrar o mesmo registro ao mesmo tempo.

A ideia é usar o controle de concorrência do PostgreSQL para que um worker
consiga pegar um job de forma exclusiva e os outros sigam para outro trabalho.

A implementação provavelmente usará uma estratégia com:

`FOR UPDATE SKIP LOCKED`

Não quero manter esse lock enquanto o documento estiver sendo processado.

O lock serve somente para o momento de escolher e marcar o job.

Depois disso, a transação deve terminar.

O processamento com o provider acontece fora dessa transação.

---

## Recuperação de jobs

Também pode acontecer de um worker pegar um trabalho e cair antes de terminar.

Por isso, o job terá um tempo de validade para o claim.

Se esse tempo expirar, outro worker poderá recuperar o trabalho.

Quando a tentativa já tiver começado e o worker desaparecer, vou considerar isso
uma falha técnica e essa tentativa contará dentro do limite total.

Isso evita deixar jobs presos para sempre e também evita tentativas infinitas.

---

## Alternativas consideradas

### Redis

Poderia funcionar muito bem para fila e seria uma escolha comum.

Não escolhi porque adicionaria mais um serviço para configurar e manter, sem uma
necessidade clara nesta primeira versão.

### RabbitMQ

Também resolveria bem o problema de mensageria.

Não escolhi porque seria mais infraestrutura e mais configuração para um volume
que ainda não justifica isso.

### Kafka

Não considero adequado para este caso inicial.

É uma ferramenta mais pesada e voltada para cenários bem maiores do que o que
preciso demonstrar aqui.

### Fila em memória

Seria simples de implementar.

Não escolhi porque os jobs seriam perdidos se a aplicação reiniciasse.

### PostgreSQL

Foi a opção escolhida porque já está no projeto, é persistente e atende o volume
inicial sem adicionar uma nova dependência.

---

## Consequências

Com essa decisão:

- banco e fila ficam na mesma infraestrutura;
- o ambiente local fica mais simples;
- os jobs sobrevivem a reinicializações;
- preciso tomar cuidado com concorrência;
- preciso manter transações curtas;
- o banco passa a receber também carga relacionada à fila.

Isso funciona bem para a escala inicial, mas não significa que PostgreSQL será
a melhor fila para sempre.

---

## Limitações

Se o volume crescer muito, o banco pode começar a acumular responsabilidades
demais.

Os primeiros sinais que eu observaria seriam:

- muitos jobs pendentes;
- workers concorrendo demais pelos mesmos registros;
- aumento no número de conexões;
- consultas da fila afetando consultas normais da aplicação;
- dificuldade para aumentar a quantidade de workers.

Se isso começar a acontecer, provavelmente já seria hora de separar a fila do
banco principal.

---

## Quando eu mudaria essa decisão

Eu reconsideraria PostgreSQL como fila quando o volume ou a necessidade
operacional justificassem uma ferramenta dedicada.

Nesse ponto eu avaliaria Redis, RabbitMQ, SQS ou outra solução de mensageria de
acordo com o ambiente real do produto.

Para esta entrega, prefiro começar com a opção mais simples que atende o
problema atual.
