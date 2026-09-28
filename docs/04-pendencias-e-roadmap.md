# Pendências e lista de tarefas

> Atualizado em 28/09/2026. Esta é a lista operacional principal do projeto.

## Legenda

- `[x]` implementado no sistema ou concluído.
- `[ ]` ainda precisa ser executado, validado ou decidido.
- Uma função implementada pode continuar pendente de homologação com usuários reais.

## Prioridade 0 — concluir as alterações locais atuais

- [x] Adicionar a opção `Vazio` aos filtros de `LOCAL`, `ENTRADA`, `FROTA`, `C/V`, `DESTINO`, `DESTINO FINAL` e `SAÍDA`.
- [x] Criar teste de interface para confirmar a opção nas sete colunas.
- [ ] Homologar esses filtros localmente com o operador.
- [ ] Publicar os novos filtros somente depois da aprovação do teste local.
- [ ] Revisar, testar e aplicar de forma controlada as migrations locais de atualização atômica de condutor/escala e endurecimento de permissões.

## Prioridade 1 — homologar a operação diária

- [ ] Executar testes reais com operadores em mais de um computador.
- [ ] Conferir salvar e recarregar em todos os campos editáveis.
- [ ] Testar colagem de blocos em todos os tipos de coluna, inclusive destino e destino final.
- [ ] Testar duas pessoas alterando linhas diferentes ao mesmo tempo.
- [ ] Testar duas pessoas tentando alterar a mesma linha e confirmar o aviso de conflito.
- [ ] Conferir cálculo diurno, virada da meia-noite, jornada aberta e próxima previsão com casos reais.
- [ ] Confirmar por vários dias que nenhum status futuro é criado automaticamente.
- [ ] Validar continuidade em dias consecutivos e na virada do mês.
- [ ] Validar fechamento e reabertura da folha com perfis e registros reais.
- [ ] Comparar a exportação da folha com o resultado filtrado na tela.
- [ ] Registrar cada erro com data, região, condutor, coluna, resultado esperado e resultado obtido.

### Critério para concluir a homologação

Cinco dias úteis de operação paralela sem perda de dados, sem status automático indevido, sem conflito silencioso e sem divergência crítica em escala, jornada ou continuidade.

## Prioridade 2 — concluir o piloto SIGhRA

- [x] Criar a ponte segura entre o sistema e o notebook com acesso ao SIGhRA.
- [x] Exibir a situação da ponte no sistema.
- [x] Permitir consulta manual de macros e último fim de jornada.
- [x] Criar prévia de jornada com confirmação humana antes de aplicar dados na grade.
- [x] Consultar jornadas em lote e aplicar somente os resultados seguros após conferência.
- [x] Registrar auditoria de pedido, prévia, aplicação, cancelamento, bloqueio e falha.
- [ ] Instalar e validar a ponte no notebook definitivo da operação.
- [ ] Testar perda e retorno da VPN sem duplicar consultas ou preenchimentos.
- [ ] Comparar placa, local e horários retornados com consultas manuais no SIGhRA.
- [ ] Definir quais operadores participarão do piloto e em quais datas/regiões.
- [ ] Executar o piloto com acompanhamento e registrar falsos positivos/negativos.
- [ ] Definir critérios objetivos para liberar o provedor real em produção.
- [ ] Decidir se haverá automação futura; atualmente nenhum agendador automático está ativo.

## Prioridade 3 — usuários, segurança e confiabilidade

- [x] Restringir Histórico, Relatórios e Administração a supervisor/administrador.
- [x] Restringir alteração de condutores a supervisor/administrador.
- [x] Manter chaves administrativas e credenciais do SIGhRA somente no servidor/notebook.
- [x] Implementar histórico, salvamento em lote transacional, presença e proteção contra conflito.
- [x] Definir política inicial de backup e restauração.
- [x] Monitorar o consumo do banco Supabase e alertar sobre o limite do plano.
- [ ] Substituir definitivamente a conta compartilhada por contas individuais.
- [ ] Revisar o perfil e as permissões de cada usuário real antes do go-live.
- [ ] Executar restauração de teste a partir de um backup recente e registrar tempo/resultado.
- [ ] Revisar os pontos ainda abertos da auditoria de segurança de 13/09/2026 após as correções recentes.
- [ ] Executar a suíte completa, build de produção e auditoria de dependências antes de cada publicação de homologação.

## Prioridade 4 — dados, escala e relatórios

- [x] Validar e carregar a escala de Setembro/2026 de SP.
- [x] Disponibilizar turnos/horários A–G e sincronização com folhas futuras.
- [x] Disponibilizar importação e exportação segura da escala em `.xlsx`.
- [x] Entregar relatório inicial com jornadas, status, abonos, faltas, destinos e condutores.
- [x] Entregar exportação Excel, impressão/PDF e API autenticada para dashboard.
- [ ] Validar escalas de MG/UBJP com o mesmo rigor aplicado a SP.
- [ ] Validar os meses anteriores e posteriores necessários para a operação.
- [ ] Comparar os indicadores dos relatórios com a planilha oficial em períodos fechados.
- [ ] Definir o processo oficial, os responsáveis e a janela para importar uma nova escala.
- [ ] Documentar como corrigir um arquivo importado sem apagar lançamentos manuais.
- [ ] Definir retenção de histórico e capacidade necessária antes de atingir o limite do Supabase.

## Prioridade 5 — melhorias de experiência

- [x] Filtros por coluna com busca, múltiplos valores, selecionar todos e limpar.
- [x] Seleção por linha/coluna, `Ctrl+A` dentro de caixas de edição, copiar/colar, `Ctrl+D`, `Ctrl+R`, desfazer/refazer e localizar/substituir.
- [x] Redimensionar, ocultar e reexibir colunas com preferências no navegador.
- [x] Temas claro, escuro e automático e zoom da grade.
- [x] Lembretes locais por condutor com som, volume e adiamento.
- [ ] Decidir se os lembretes devem sobreviver ao fechamento do navegador e sincronizar entre computadores.
- [ ] Permitir congelar e descongelar colunas escolhidas pelo usuário.
- [ ] Adicionar alça de preenchimento para arrastar valores e sequências.
- [ ] Medir o desempenho com a maior grade real e otimizar somente se houver lentidão observável.
- [ ] Fazer ajustes finos de atalhos e usabilidade a partir do teste dos operadores.

## Prioridade 6 — treinamento e entrada oficial

- [x] Preparar manual rápido do operador.
- [x] Preparar roteiro de apresentação à chefia.
- [ ] Atualizar o manual com lembretes, filtros `Vazio`, fechamento de folha e piloto SIGhRA.
- [ ] Treinar operadores, supervisores e administradores.
- [ ] Fazer apresentação à chefia e obter aceite formal.
- [ ] Definir data de entrada oficial.
- [ ] Definir responsáveis pelo suporte e tempo esperado de atendimento.
- [ ] Testar e aprovar o plano de retorno temporário ao Excel em caso de incidente.
- [ ] Acompanhar os primeiros dias de operação exclusiva.
- [ ] Após a homologação, bloquear a edição da planilha e mantê-la somente como histórico.

## Itens futuros, fora do bloqueio para o go-live

- [ ] Sincronizar lembretes entre usuários/dispositivos, se a operação solicitar.
- [ ] Automatizar o preenchimento SIGhRA somente após aprovação formal do piloto.
- [ ] Evoluir o painel gerencial conforme indicadores solicitados pela chefia.
- [ ] Planejar suporte contínuo, manutenção de dependências e revisões periódicas de segurança.

## Registro de testes

| Data | Testador | Ambiente | Cenário | Resultado esperado | Resultado obtido | Situação |
|---|---|---|---|---|---|---|
| 21/09/2026 | Automático | Local | Opção `Vazio` nas sete colunas operacionais | Opção disponível em todas | 2 testes de filtro aprovados | Aprovado tecnicamente |
|  |  |  |  |  |  | Pendente |

## Registro de decisões

| Data | Decisão | Responsável | Motivo | Impacto |
|---|---|---|---|---|
| 11/09/2026 | O local herda apenas o destino final do dia anterior | Operação | Evitar origem incorreta no dia seguinte | Continuidade diária |
| 11/09/2026 | Status começa vazio e é preenchido apenas pelo operador | Operação | Impedir acionamentos automáticos indevidos | Folhas futuras |
| 20/09/2026 | SIGhRA inicia como piloto com prévia e confirmação humana | Projeto | Validar dados antes de automatizar | Integração e jornada |
| 21/09/2026 | Novos filtros `Vazio` permanecem locais até homologação | Operação | Testar antes de publicar | Grade de acionamento |
