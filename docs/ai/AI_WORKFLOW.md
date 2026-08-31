# Fluxo de Trabalho com IA — Lamarck DOC Intelligence

## Objetivo

Organizar o uso de IA no projeto sem deixar decisões importantes escondidas e
sem transformar o processo em burocracia.

## Uso da IA

O Claude pode ser usado para implementação, análise técnica, testes e apoio na
documentação.

As decisões de escopo, arquitetura, contrato da API, state machine, ADRs e
aceite final continuam sendo humanas.

## Revisão humana

Mudanças relevantes passam por revisão humana antes do merge.

Na revisão eu quero conferir principalmente:
- se o código segue a especificação;
- se contratos compartilhados continuam coerentes;
- se concorrência/transações fazem sentido;
- se não há vazamento de PII;
- se testes e CI realmente passaram;
- se consigo explicar o que foi feito.

Se a revisão mostrar uma correção pequena, ela pode ser tratada normalmente.

Se a correção virar praticamente uma nova implementação — como regra prática,
mais de aproximadamente 30% da tarefa — prefiro devolver a implementação ao
Claude e revisar a nova versão.

## Prompts

Prompts de implementação devem ser objetivos e conter apenas o necessário para:
- explicar a tarefa;
- definir o que entra e o que não entra;
- apontar decisões já tomadas;
- indicar validações;
- dizer quando o Claude deve parar.

Os prompts relevantes ficam em:

`docs/ai/prompts/claude/`

## Branches

Usar branches focadas por tarefa.

Fluxo normal:

1. implementar;
2. revisar o diff;
3. commit/push;
4. executar CI/testes;
5. revisão humana;
6. corrigir falhas reais;
7. validar novamente;
8. merge.

Não fabricar falhas.

## Problemas encontrados

Quando aparecer um erro real:
- registrar o problema;
- explicar o impacto;
- corrigir;
- rodar novamente as validações relevantes.

Não é necessário criar um arquivo separado para todo erro pequeno.

## Quality gate

Uma tarefa só está pronta quando:
- o escopo foi atendido;
- os testes relevantes foram executados;
- a CI foi verificada;
- os riscos restantes estão claros;
- a revisão humana foi concluída quando necessária.
