# O que já foi implementado

> Atualizado em 28/09/2026 com base no código, nas telas e nos testes disponíveis no repositório.

## Situação atual por área

| Área | Situação | O que está disponível |
|---|---|---|
| Autenticação e acesso | Funcional | Login pelo Supabase, sessão protegida e separação entre operador, supervisor e administrador |
| Acionamento diário | Funcional, em homologação | Grade operacional, edição e salvamento, filtros, cálculos, colaboração, exportação e alertas |
| Escala mensal | Funcional, em homologação | Edição mensal, códigos e turnos A–G, importação e exportação `.xlsx` |
| Condutores | Funcional | Consulta, cadastro e edição de matrícula, base, turno, horário e escala |
| Histórico | Funcional | Pesquisa, filtros por período e operador, paginação e exportação CSV |
| Relatórios | Funcional, em homologação | Indicadores por período e região, Excel e impressão/PDF |
| Administração | Funcional para consulta | Parâmetros, bases, destinos e consumo do banco Supabase |
| SIGhRA | Piloto controlado | Ponte pelo notebook, consulta de macros/fim de jornada e preenchimento assistido com prévia |
| API para dashboard | Disponível | Consulta autenticada de escala, acionamento e disponibilidade após descanso |

## Funções disponíveis no acionamento diário

### Grade e preenchimento

- Visual semelhante ao Excel, com cabeçalho fixo, colunas de identificação fixas e zoom entre 75% e 150%.
- Edição direta de status, abono, local, entrada, frota, C/V, destino, destino final, saída e observação.
- `FROTA`, `STATUS`, `C/V`, `DESTINO` e `DESTINO FINAL` aceitam texto livre.
- Destino, destino final e local oferecem sugestões sem impedir novos valores.
- Horários digitados como `HH:mm` são normalizados e salvos com segundos.
- Salvamento automático com indicação por célula e manutenção local do rascunho em caso de erro.
- Salvamento transacional em lote para colagens e alterações de várias células.
- Proteção contra sobrescrever silenciosamente uma linha alterada por outra pessoa.

### Filtros, organização e navegação

- Filtro por data, região, texto, status e turno.
- Filtros individuais em todas as colunas, com pesquisa, múltipla seleção, selecionar todos e limpar.
- Opção `Vazio` no status e, na versão local de 21/09/2026, também em `LOCAL`, `ENTRADA`, `FROTA`, `C/V`, `DESTINO`, `DESTINO FINAL` e `SAÍDA`.
- Ordenação de colunas e agrupamento operacional por horário.
- Ocultar e reexibir colunas, redimensionar larguras e manter preferências no navegador.
- Tema claro, escuro e automático, preservando as cores operacionais.
- Navegação por Tab, Enter e setas.

### Recursos semelhantes ao Excel

- Seleção de célula, linha, coluna e intervalo com arraste ou Shift. Dentro de uma caixa de edição, `Ctrl+A` seleciona apenas o texto da caixa; a grade inteira pode ser selecionada pelo canto `#`.
- Copiar, colar e limpar células, inclusive blocos com várias linhas e colunas.
- Repetição do padrão copiado quando a seleção de destino é maior.
- Preenchimento para baixo com `Ctrl+D` e para a direita com `Ctrl+R`.
- Desfazer e refazer durante a sessão; ações em lote contam como uma única operação.
- Localizar e substituir na seleção ou nas linhas visíveis.
- Menu de contexto para copiar, limpar conteúdo e ocultar coluna.
- Exportação da folha visível para Excel, respeitando filtros ativos.

### Cálculos e continuidade

- Jornada normal, jornada com virada da meia-noite e jornada ainda em andamento.
- Próxima previsão calculada com interjornada padrão de 11h10.
- Edição isolada de entrada ou saída preserva o outro horário já registrado.
- Nova folha diária inicia com status em branco.
- Condutores em `F`, `FE` ou códigos de afastamento configurados não entram indevidamente no acionamento.
- `LOCAL` herda somente o `DESTINO FINAL` do dia anterior; nunca usa o destino intermediário como substituto.
- Valores automáticos acompanham correções do dia anterior, enquanto alterações manuais ficam protegidas.
- Previsão do dia seguinte acompanha a saída anterior sem sobrescrever uma previsão ajustada manualmente.
- Folhas podem ser fechadas para consulta e reabertas para correção, com registro da ação.

### Operação simultânea e avisos

- Sincronização pelo Supabase Realtime entre operadores.
- Consulta periódica de segurança quando a rede corporativa bloqueia WebSocket.
- Presença de operadores online e indicação da linha em edição por outra pessoa.
- Agrupamento de eventos durante colagens grandes para evitar recargas concorrentes.
- Alertas de acionados sem entrada, jornadas abertas, abonos pendentes e jornadas acima de 11h10.
- Indicadores de total, acionados, em trânsito, abonos, apoios, trocas, faltas e pendências.
- Lembrete por condutor com horário, aviso visual, som, volume configurável e opção de adiar cinco minutos.
- Os lembretes pertencem à sessão daquele navegador; ainda não são compartilhados entre computadores.

## Escala mensal

- Grade mensal de 1 a 31 dias, com edição e navegação por teclado.
- Turnos e horários de A a G sincronizados com o cadastro do condutor e com folhas futuras.
- Filtros por região, mês, ano e texto.
- Importação segura de `.xlsx` limitada a 5 MB, 2.000 linhas e 100 colunas.
- Exportação da escala para `.xlsx`.
- Alterações ficam pendentes na tela até o operador confirmar o salvamento.
- Regras de ausência e códigos de escala integradas à geração do acionamento diário.

## Condutores e permissões

- Cadastro e edição de nome, matrícula, base, turno, horário e letras da escala.
- Operadores podem consultar; supervisores e administradores podem cadastrar e alterar.
- Operadores acessam as áreas operacionais: Acionamento, Escala, Condutores e Consulta SIGhRA.
- Supervisores e administradores também acessam Histórico, Relatórios e Administração.
- Rotas e operações sensíveis usam sessão autenticada; credenciais administrativas permanecem no servidor.

## Histórico, relatórios e administração

- Histórico de alterações com data/hora, operador, condutor, ação e campos modificados.
- Pesquisa por condutor, operador ou conteúdo da alteração, filtros por período e operador e exportação CSV.
- Relatório por período e região sem criar folhas operacionais.
- Indicadores de preenchimento, jornadas concluídas/em andamento, média, excesso de 11h10, status, destinos e resumo por condutor.
- Exportação do relatório para Excel e impressão preparada para PDF.
- Administração exibe parâmetros de cálculo, bases e destinos cadastrados.
- Medidor do consumo do banco Supabase, com alerta de aproximação do limite do plano.
- Tela global de recuperação para falhas inesperadas de interface.

## Integração SIGhRA

- Ponte segura executada no notebook que possui acesso ao banco SIGhRA pela rede/VPN da empresa.
- Indicador de estado da ponte no cabeçalho.
- Consulta manual do último fim de jornada por login e data.
- Exibição de macro, horário GPS, recebimento, placa, local, veículo e link para mapa quando há coordenadas.
- Piloto de jornada dentro do acionamento: consulta, prévia, validações, confirmação humana e auditoria antes de preencher entrada/saída/frota/destino.
- Consulta de até 50 jornadas em lote, com prévia e aplicação manual somente dos resultados seguros.
- Modo de produção permanece desabilitado sem configuração explícita.
- O modo automático existe apenas como contrato futuro; nenhum agendador automático está ativo.

## Dados, manutenção e confiabilidade

- Escala de Setembro/2026 de SP conferida com 100 condutores e 3.000 posições.
- Correções para paginação acima de 1.000 registros, status futuros indevidos e continuidade baseada exclusivamente no destino final.
- Ferramentas de importação, sincronização, auditoria somente leitura e limpeza segura de registros vazios.
- Política inicial de backup/restauração e ponto de restauração documentados.
- Testes automatizados para cálculos, continuidade, edição, seleção, lembretes, acesso, relatórios, importação, SIGhRA e serviços de banco.
- Projeto atualizado para Next.js 16 e React 19.

## O que está funcionando, mas ainda precisa de homologação operacional

- Uso simultâneo em computadores reais e em redes corporativas diferentes.
- Todos os campos editáveis após salvar, recarregar e trocar de data/região.
- Colagens grandes com dados reais da operação.
- Cálculos e continuidade em vários dias e na virada do mês.
- Relatórios comparados com a planilha oficial.
- Ponte SIGhRA no notebook definitivo, com VPN, retomada após queda e volume real de consultas.
- Fechamento/reabertura e permissões usando contas individuais reais.
