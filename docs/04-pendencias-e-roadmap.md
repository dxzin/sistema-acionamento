# Pendências e roadmap

## Prioridade 1 — homologar a operação diária

- [ ] Executar testes reais com operadores em mais de um computador.
- [ ] Conferir salvar e recarregar para todos os campos editáveis.
- [ ] Testar colagem de blocos em todos os tipos de coluna, inclusive destino e destino final.
- [ ] Testar duas pessoas alterando linhas diferentes e a mesma linha ao mesmo tempo.
- [ ] Conferir cálculos de jornada, virada da meia-noite e próxima previsão com casos reais.
- [ ] Confirmar que nenhum status futuro é criado automaticamente.
- [ ] Validar continuidade em vários dias e também na virada do mês.
- [ ] Registrar erros encontrados com data, condutor, coluna, resultado esperado e resultado obtido.

### Critério para concluir

Cinco dias úteis de operação paralela sem perda de dados, sem status automático e sem divergência crítica em escala, jornada ou continuidade.

## Prioridade 2 — completar a experiência de planilha

- [x] Transformar filtros em menus mais próximos do Excel: busca, selecionar tudo, limpar e múltiplos valores.
- [x] Fazer uma colagem grande ser um único comando de desfazer/refazer.
- [x] Adicionar redimensionamento manual de colunas e salvar as larguras escolhidas.
- [ ] Permitir congelar e descongelar colunas escolhidas pelo usuário.
- [x] Adicionar seleção por cabeçalho de linha/coluna e `Ctrl+A`.
- [ ] Adicionar alça de preenchimento para arrastar valores e sequências.
- [x] Adicionar localizar e substituir.
- [x] Adicionar menu de contexto com copiar, limpar conteúdo e ocultar coluna; reexibição permanece no menu `Colunas`.
- [ ] Otimizar o desempenho para grades maiores, se os testes indicarem lentidão.

## Prioridade 3 — segurança, gestão e confiabilidade

- [ ] Trocar o acesso compartilhado por usuários individuais.
- [ ] Revisar permissões de operador, supervisor e administrador.
- [ ] Validar a auditoria de cada alteração importante e a identificação do usuário.
- [ ] Definir política de backup, restauração e retenção de dados.
- [ ] Criar procedimento de fechamento/reabertura de uma folha diária.
- [ ] Criar testes automatizados para regras críticas e salvamento em lote.
- [ ] Implementar salvamento em lote transacional para grandes colagens.

## Prioridade 4 — dados e expansão

- [ ] Validar escalas de MG/UBJP com o mesmo rigor aplicado a Setembro/SP.
- [ ] Validar meses anteriores e posteriores necessários para a operação.
- [ ] Definir o processo oficial de importação de uma nova escala.
- [ ] Documentar como corrigir um arquivo importado sem apagar lançamentos manuais.

## Prioridade 5 — gestão e encerramento do projeto

- [x] Concluir relatório inicial de horas, jornadas, status (incluindo abonos e faltas) e destinos, com exportação Excel.
- [x] Criar painel resumido para supervisão e gerência.
- [ ] Treinar operadores e supervisores.
- [x] Preparar manual rápido de uma página.
- [ ] Fazer apresentação à chefia e obter aceite formal.
- [ ] Definir data de entrada oficial e plano de retorno ao Excel em caso de incidente.
- [ ] Depois da homologação, manter a planilha apenas como consulta histórica.

## Registro de testes sugerido

| Data | Testador | Cenário | Resultado esperado | Resultado obtido | Situação |
|---|---|---|---|---|---|
|  |  |  |  |  | Pendente |

## Registro de decisões sugerido

| Data | Decisão | Responsável | Motivo | Impacto |
|---|---|---|---|---|
| 11/09/2026 | O local herda apenas o destino final do dia anterior | Operação | Evitar origem incorreta no dia seguinte | Regra de continuidade |
| 11/09/2026 | Status começa vazio e é preenchido apenas pelo operador | Operação | Impedir acionamentos automáticos indevidos | Folhas diárias futuras |
