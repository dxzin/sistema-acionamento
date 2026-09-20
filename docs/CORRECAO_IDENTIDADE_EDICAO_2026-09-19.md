# Correção local: edição vinculada ao condutor

## Causa raiz e reprodução

As linhas já tinham `key={row.id}` e os UPDATEs já usavam `dispatches.id`.
O erro estava na seleção da grade: `anchor.row` e `focus.row` guardavam índices
visuais. Após filtrar/reordenar `processedDispatches`, navegação, colagem,
limpeza e preenchimento interpretavam os mesmos índices como outros registros.
O foco programado com `requestAnimationFrame` também procurava uma posição no DOM.
Valores iguais na ordenação dependiam da ordem recebida do servidor.

Foi reproduzido no Chromium com o código anterior (`HEAD`), dados fictícios e
serviços simulados, sem conexão com produção:

- Tab após refresh deixou a célula de JOÃO e levou o foco para outra linha.
- Colagem iniciada em JOÃO enviou o UPDATE simulado para ANA.
- Uma leitura iniciada antes do save, liberada após sua conclusão, substituiu
  `texto novo de JOÃO` por `original`. O contador de consultas protegia contra
  outras consultas, mas não era invalidado pelas gravações.

## Investigação obrigatória

| Item | Resultado |
| --- | --- |
| 1. Tabela | `src/components/acionamento/DispatchGrid.tsx`. |
| 2–4. Identificação React/key/índice | `<tr key={row.id}>`; não usa índice como key de linha. |
| 5. Identificador único | `dispatches.id` identifica o lançamento; `driver_id` identifica o condutor. |
| 6–7. Edição de célula/linha | Rascunhos dos inputs e frota já ligados à linha; linha selecionada por ID, mas intervalo/célula de navegação por índice. |
| 8–9. Refresh/busca | `loadData`, `getDispatchesForSheet`, eventos Realtime e consulta periódica do token. |
| 10–11. Ordenação/filtros | Recalculados com novos dados e também com rascunhos; filtros existem na página e na grade. |
| 12–13. Autosave/debounce | Rascunho em cada mudança; gravação no blur/commit, fila de lotes. Debounce de 700 ms agrupa eventos Realtime, não a digitação. Polling de 5 s no fallback e 30 s ao vivo. |
| 14. Paste | Convertia índices da seleção em registros da lista atual, podendo trocar o destinatário. |
| 15–17. UPDATE/backend | Serviço envia `id` e `expected_updated_at`; RPC usa `WHERE id = p_dispatch_id`, trava a linha, valida versão e folha aberta, registra auditoria. Não grava por posição; `driver_id` não é campo permitido nessa RPC. |
| 18. Substituição do array | Refresh produz novo array via `mergeServerDispatches`; preservação de rascunhos por ID não preservava a seleção visual. |
| 19. Reutilização React | Nenhuma key de índice encontrada nas linhas; o problema confirmado era o endereçamento da seleção/foco. |
| 20. Resposta antiga | Resposta antiga de save já tinha proteção por versão do campo; leitura anterior ao save ainda podia sobrescrever o resultado confirmado. |

## Correção

- Seleção guarda IDs e captura os destinatários/ordem original de uma operação em bloco.
- Tab/Enter procuram a identidade da célula; o foco adiado também resolve a linha por ID.
- Colagem, cópia, limpeza, preenchimento e substituição usam os IDs capturados.
  Registros ausentes não são substituídos pelos ocupantes da posição anterior.
- Linha com input focado permanece visível nos filtros e mantém sua posição,
  enquanto as outras linhas continuam recebendo dados. Ordenação tem desempate por ID.
- Refresh é invalidado ao iniciar/terminar gravações; novas leituras não começam
  durante um save. O merge também rejeita versões de linha anteriores às locais.
- Registro focado ausente da resposta é preservado localmente; não há recriação
  ou troca automática de ID para salvar. As validações existentes do banco permanecem.

## Arquivos

Código: `src/components/acionamento/DispatchGrid.tsx`,
`src/app/acionamento/page.tsx`, `src/lib/editing/dispatch-edit-state.ts` e
novo `src/lib/editing/dispatch-grid-selection.ts`.

Testes: `tests/dispatch-edit-state.test.ts`, novo `tests/dispatch-grid-selection.test.ts`,
`e2e/dispatch-grid-identity.spec.ts`, `e2e/dispatch-grid.playwright.config.ts`,
`e2e/fixtures/dispatch-grid.tsx`, `e2e/fixtures/dispatch-page-mocks.tsx` e
`e2e/fixtures/dispatch-grid-server.mjs`.

Comandos: `package.json` adiciona `test:grid`; `playwright.config.ts` exclui a suíte
isolada do servidor E2E normal. Este relatório documenta a investigação.

## Validação

- `npm test`: 77 testes aprovados.
- `npm run test:grid`: 23 testes Chromium aprovados, incluindo Cidade somente em MG (`UB`/`LZ`), ausência da coluna em SP, a edição do Local e os demais campos editáveis,
  atualização de horário, chegada de condutor, filtros, seleção removida, colagem
  múltipla, Tab, Enter, Escape e leitura atrasada após save.
- `npm run lint`: aprovado.
- `npx tsc --noEmit --incremental false`: aprovado.
- Três cenários críticos falharam ao executar contra a versão anterior, confirmando
  que os testes detectam os defeitos corrigidos.

A suíte isolada renderiza os componentes reais com serviços fictícios, escuta
somente em `127.0.0.1` e bloqueia requisições externas no navegador. Não carrega
credenciais nem inicia o servidor Next configurado para produção.

Nenhum deploy, publicação Vercel, alteração de banco ou migração foi realizado.
Não houve teste contra o banco real nem homologação em produção. Alterações locais
preexistentes e a cópia `empresa/` foram preservadas.
