// Roda antes de qualquer arquivo *.e2e-spec.ts importar o AppModule.
// Desliga o auto-start do worker de processamento (docs/ai/prompts/claude/
// 04-claude-document-processing-prompt.md §19): sem isso, o worker
// processaria em segundo plano os documentos criados pelos testes de
// ingestão, mudando o status deles de forma imprevisível durante as
// asserções desses testes.
process.env.PROCESSING_WORKER_ENABLED = 'false';
