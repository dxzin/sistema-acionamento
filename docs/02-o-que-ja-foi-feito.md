# O que já foi feito

## Situação por área

| Área | Situação | Entregas principais |
|---|---|---|
| Infraestrutura | Concluída para homologação | Aplicação publicada, Supabase conectado, variáveis de produção configuradas |
| Acionamento diário | Funcional, em testes | Edição inline, cálculos, cores, filtros, seleção e colagem em grade |
| Escala mensal | Funcional, em testes | Horários, códigos diários, importação/exportação e navegação por teclado |
| Condutores | Funcional | Cadastro, edição, matrícula, turno, horário e base |
| Histórico | Parcial | Estrutura e consulta disponíveis; auditoria deve ser validada ponta a ponta |
| Administração | Parcial | Estrutura de parâmetros e cadastros disponível |
| Relatórios gerenciais | Funcional, em testes | Consolidação por período, região, status, jornada, destino e condutor |

## Acionamento diário

- Grade visual inspirada no Excel, com cabeçalhos fixos e larguras de coluna estáveis.
- Abertura automática na data atual de Brasília.
- Ordenação dos condutores por grupos de horário: 04h, 12h e 20h.
- Filtro em todas as colunas, com pesquisa, seleção de vários valores, selecionar todos e limpar filtro.
- Ocultar e reexibir colunas sem aumentar a largura das demais; preferência mantida no navegador.
- Redimensionar as colunas operacionais arrastando sua divisão; larguras salvas no navegador e restauração pelo menu `Colunas`.
- Campo `FROTA` livre para digitação, sem exigir cadastro prévio de uma lista de frotas.
- Campos `DESTINO` e `DESTINO FINAL` livres para digitar e com sugestões opcionais.
- Campo `STATUS` livre para digitação, com opções conhecidas e cores operacionais preservadas.
- Status vazio permanece vazio: o sistema não deve decidir sozinho se um condutor foi acionado.
- Cores mantidas como referência visual, incluindo `ACIONADO`, `ABONADO`, `APOIO` e `BALDEIO`.
- Seleção de intervalo com arraste e Shift.
- Seleção da grade inteira com `Ctrl+A`, de uma linha pelo número e de uma coluna pela letra.
- Copiar, colar e limpar células; colagem de blocos e repetição do padrão copiado na seleção.
- Preenchimento do intervalo para baixo com `Ctrl+D` e para a direita com `Ctrl+R`.
- Localizar e substituir no intervalo selecionado ou nas linhas visíveis, salvando as alterações como uma única ação.
- Menu de contexto com botão direito para copiar, limpar conteúdo e ocultar coluna.
- Navegação por Tab, Enter e setas.
- Desfazer e refazer durante a sessão; uma colagem ou limpeza de intervalo é tratada como uma única ação.
- Salvamento de destino, destino final e frota corrigido no ambiente publicado.
- Sincronização em tempo real preparada para operadores simultâneos.
- Sincronização automática de segurança para redes corporativas que bloqueiam o canal em tempo real, sem exigir o botão `Atualizar`.
- Presença colaborativa mostra os logins online na mesma planilha e destaca a linha selecionada por outro operador.
- Eventos em tempo real agrupados durante colagens grandes, evitando recargas concorrentes e valores aparentemente desaparecendo.
- Em produção, uma falha no banco não mostra dados de demonstração: a grade fica vazia e apresenta um aviso explícito para evitar acionamentos fictícios.
- A folha diária pode ser exportada diretamente para `.xlsx`; filtros de busca, status e turno determinam quais linhas entram no arquivo.
- Uma faixa compacta sinaliza acionados sem entrada, jornadas abertas, abonos pendentes e jornadas acima de 11h10.
- Falhas inesperadas de interface exibem uma tela de recuperação sem sugerir que os dados salvos foram perdidos.

## Regras entre escala e acionamento

- Condutor marcado com `F` ou `FE` na escala não aparece no acionamento daquele dia.
- Condutor marcado com `VF` (viagem fechada) continua no acionamento como dia trabalhado.
- Horário do condutor é exibido na escala mensal e usado no acionamento.
- Uma folha diária nova inicia com o status em branco.
- O campo `LOCAL` do dia atual herda somente o `DESTINO FINAL` preenchido no dia anterior.
- Se o `DESTINO FINAL` anterior estiver vazio, o sistema aguarda o operador; não usa o `DESTINO` normal como substituto.
- A origem do `LOCAL` é registrada: valores automáticos acompanham correções do dia anterior, enquanto ajustes manuais ficam protegidos.

## Dados de Setembro/2026 — SP

- A escala anterior foi substituída pelo arquivo `CONTROLE DE ALOCAÇÃO - ACIONAMENTO2.xlsx`.
- Conferência realizada com 100 condutores e 30 dias, totalizando 3.000 posições de escala.
- Foram incluídos três condutores que faltavam: Daniel Augusto Goes Arantes, Fabio Junior Paulino e Felipe Barbosa.
- O carregamento da página foi corrigido para não parar no limite de 1.000 registros do banco.
- Status gerados indevidamente em dias futuros foram limpos, preservando o que havia sido preenchido manualmente, como `BALDEIO`.
- A continuidade do dia 11 foi corrigida e registros originados indevidamente do destino normal foram removidos.

## Ferramentas de manutenção criadas

- Substituição e conferência da escala de Setembro/SP.
- Limpeza de status automáticos em datas futuras.
- Preenchimento de continuidade entre dias.
- Correção do local do dia 11 usando apenas destino final.
- Importação de folha diária.
- Auditoria somente leitura de folgas, status futuros e continuidade entre dias.
- Limpeza segura de registros vazios em dias de folga, preservando linhas históricas com preenchimento operacional.

## Validações técnicas realizadas

- Build de produção executado com sucesso após as alterações recentes.
- Salvamento de destinos validado depois da configuração segura da chave de serviço no ambiente da Vercel.
- Escala Setembro/2026 — SP comparada com o arquivo de origem sem divergências na conferência executada.
- Senha de homologação removida do código enviado ao navegador; somente o e-mail da conta de teste é exibido.
- Testes automáticos adicionados para jornada normal, jornada noturna, jornada em andamento, interjornada e continuidade baseada exclusivamente no destino final.
- Edição isolada de entrada ou saída preserva o outro horário já salvo ao recalcular jornada e próxima previsão.
- Previsão do acionamento sincronizada com a `PREV. PRÓX.` do dia anterior, preservando ajustes manuais do operador.
- Framework atualizado para Next.js 16 LTS e React 19, eliminando os alertas críticos identificados na versão anterior.
- Importação web migrada para ExcelJS e limitada a `.xlsx` de até 5 MB, 2.000 linhas e 100 colunas.

## Relatórios gerenciais

- Consulta por período e região sem criar ou alterar folhas operacionais.
- Indicadores de preenchimento, jornadas concluídas e em andamento, média de jornada e jornadas acima de 11h10.
- Distribuição por status com as cores da operação, destinos mais usados e resumo por condutor.
- Exportação do relatório em Excel e versão preparada para impressão/PDF.
