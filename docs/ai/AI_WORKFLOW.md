# AI Workflow — Lamarck DOC Intelligence

## Objetivo

Definir como Claude e Codex colaboram sem criar decisões arquiteturais ocultas, trabalho duplicado ou uso de IA sem rastreabilidade.

## Papéis

### Claude
Implementação principal:
- fundação;
- ingestão/API;
- upload/storage/dedup;
- superfície da Fase 2.

Papel secundário:
- revisar mudanças de processamento do Codex.

### Codex
Implementação principal:
- processamento/worker;
- concorrência;
- state machine/retry/history;
- fluxo de revisão da Fase 3 quando atribuído.

Papel secundário:
- revisar mudanças de ingestão/API do Claude.

## Autoridade humana

O responsável pelo projeto controla:
- escopo;
- arquitetura;
- contrato da API;
- state machine;
- prioridade das fases;
- ADRs;
- aceite/rejeição de propostas;
- merges.

Documentos humanos:
- specification;
- architecture;
- ADRs;
- carta final.

Agentes podem criticar, mas não reescrever silenciosamente.

## Protocolo de prompt

Cada prompt de implementação deve conter:
1. objetivo da tarefa;
2. dentro do escopo;
3. fora do escopo;
4. spec/ADRs que governam;
5. arquivos/módulos de propriedade do agente;
6. arquivos compartilhados que não podem mudar sem aprovação;
7. critérios de aceite;
8. validações exigidas;
9. relatório obrigatório;
10. condições de parada.

Salvar prompts completos, sem reescrever, e em ordem cronológica.

Estrutura sugerida:
- `docs/ai/prompts/claude/`
- `docs/ai/prompts/codex/`

## Protocolo de branches

Sugestão:
- Claude: `feat/claude-<scope>`
- Codex: `feat/codex-<scope>`

Fluxo:
1. implementar;
2. commit/push de branch focada;
3. executar CI/testes;
4. preservar falhas reais;
5. revisão cruzada read-only;
6. corrigir;
7. rodar novamente;
8. merge após validação.

Não fabricar falhas.

## Revisão cruzada

O revisor não edita na primeira passada.

Formato:

### Finding <n>
Severity:
Location:
Problem:
Failure scenario:
Impact:
Suggested correction:
Status: CONFIRMED | HYPOTHESIS

Priorizar correção funcional sobre estilo.

## Documentação de falha

Se um agente introduzir defeito real:
- preservar o prompt original;
- registrar teste/CI/reprodução que falhou;
- descrever como o problema foi detectado;
- descrever correção;
- rodar validação novamente;
- registrar resultado final.

Arquivo sugerido:
- `docs/ai/agent-retrospective.md`

Não inventar erro apenas para preencher requisito.

## Proveniência

Relatórios devem distinguir:
- implementação gerada por agente;
- modificações humanas posteriores;
- revisão cruzada;
- estado final aceito.

Não afirmar que código gerado por agente foi escrito sem IA.

## Quality gate

Uma tarefa não termina porque o código existe.

Só termina quando:
- critérios de aceite foram atendidos;
- build/lint/testes exigidos foram executados;
- resultados foram reportados honestamente;
- relatório da tarefa existe;
- riscos restantes estão explícitos.
