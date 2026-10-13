# Regras operacionais confirmadas

Este documento registra decisões confirmadas durante os testes. Alterações nestas regras devem ser combinadas com a operação antes de serem implementadas.

## Escala mensal

1. Os grupos de horário são 04h, 12h e 20h e devem permanecer visualmente identificáveis.
2. A cor do turno deve preencher toda a célula de horário, como em uma planilha.
3. A listagem do acionamento deve respeitar o horário e o código do dia na escala mensal.
4. `VF` significa viagem fechada e conta como dia trabalhado: o condutor permanece na folha de acionamento.
5. `F` e `FE` representam ausência do acionamento diário; esses condutores não devem aparecer na folha do dia.
6. A escala é a fonte dos dados planejados. Ela não define automaticamente o status operacional do acionamento.

## Status do acionamento

1. O status é decisão do operador e pode ser digitado livremente.
2. Uma nova folha diária deve abrir com todos os status em branco.
3. Apagar um status deve deixá-lo vazio; nenhum valor pode reaparecer automaticamente.
4. O próprio banco usa status vazio como padrão; nenhuma inserção assume `ACIONADO` por omissão.
5. `BALDEIO` e `TROCA` são opções distintas e permanecem disponíveis para o operador.
6. O texto do status fica centralizado na célula.

## Criação da folha diária

1. Uma folha nova só pode ser criada para o dia seguinte no calendário de Brasília.
2. Exemplo: durante o dia 10, somente a folha do dia 11 pode ser preparada; ao entrar no dia 11, a próxima permitida passa a ser a do dia 12.
3. Datas anteriores continuam disponíveis para consulta, mas consultar uma data sem folha não cria registros.
4. Selecionar uma data além do dia seguinte nunca pode gerar folha ou condutores automaticamente.

## Previsão de acionamento

1. No primeiro dia da escala (código `1`), a previsão é sempre quatro horas antes do turno: `04h → 00h`, `12h → 08h` e `20h → 16h`.
2. Nos demais dias, a `PREVISÃO` usa primeiro a `PREV. PRÓX.` calculada no dia anterior.
3. O horário da escala é utilizado como alternativa quando não existe previsão do dia anterior.
4. Se a saída do dia anterior for preenchida depois que a próxima folha já existe, a previsão do dia seguinte é atualizada automaticamente.
5. Uma previsão alterada manualmente pelo operador não pode ser sobrescrita por nenhuma regra automática.
6. Se o condutor foi marcado como `ACIONADO` e ainda não possui `SAÍDA`, a previsão do dia seguinte permanece vazia e indica `AGUARD. SAÍDA`.
7. Ao preencher a saída, a próxima previsão é calculada pela interjornada e passa para a folha seguinte.

## Local no primeiro dia da escala

1. O `LOCAL` continua usando primeiro o `DESTINO FINAL` do dia anterior.
2. Quando não existe destino final anterior e o código do dia é `1`, o local inicial é a base cadastrada do condutor.
3. Exemplo confirmado: Anizio Barros está cadastrado em `CASTILHO`; em seu primeiro dia da escala, sem continuidade anterior, o local deve ser `CASTILHO`.
4. Nos códigos 2–5, a base não substitui a continuidade e o sistema não inventa um local.

## Campo C/V

1. `C` e `V` são os valores operacionais usuais, mas não limitam o preenchimento.
2. O operador pode digitar livremente outro texto no campo `C/V`.

## Horários de entrada e saída

1. O operador pode digitar somente horas e minutos, como `17:00`.
2. Ao concluir o preenchimento, o sistema completa e salva os segundos, resultando em `17:00:00`.

## Frota

1. Não é necessário manter previamente um grupo de frotas cadastradas.
2. O operador digita a frota diretamente na linha do condutor.
3. O valor digitado deve ser salvo mesmo quando outros campos, inclusive o status, estiverem vazios.

## Destino e destino final

1. Ambos os campos aceitam texto livre.
2. A lista de destinos serve apenas como sugestão e não bloqueia novos valores.
3. O preenchimento deve ser salvo independentemente do status da linha.
4. A abertura da lista de sugestões deve ocorrer por ação explícita, sem atrapalhar colagem ou digitação.

## Continuidade entre dias

1. O `LOCAL` do dia D recebe somente o `DESTINO FINAL` do dia D-1 para o mesmo condutor.
2. O `DESTINO` normal do dia anterior nunca deve ser usado como alternativa.
3. Se o destino final do dia anterior não estiver preenchido, o local do dia seguinte deve permanecer vazio e aguardar o operador.
4. A regra também vale na virada de mês.
5. Se o `DESTINO FINAL` anterior for corrigido depois, um `LOCAL` calculado pelo sistema acompanha a correção.
6. Um `LOCAL` digitado ou apagado manualmente pelo operador nunca é sobrescrito pela continuidade automática.

## Uso semelhante ao Excel

1. O operador pode selecionar uma célula ou intervalo por arraste.
2. Shift amplia a seleção até outra célula.
3. Ao copiar um bloco com várias linhas e colunas, a colagem deve manter sua forma.
4. Se o destino selecionado for maior que o bloco copiado, o padrão deve se repetir como no Excel.
5. A colagem deve ser efetivamente salva no banco, não apenas exibida na tela.
6. Ocultar uma coluna não deve esticar as colunas restantes.
7. O conteúdo das linhas operacionais utiliza fonte de `13px` para facilitar a leitura.
8. A grade possui zoom entre `75%` e `150%`, com preferência salva no navegador do operador.
9. O sistema oferece os temas `Claro`, `Escuro` e `Automático`; a escolha fica salva no navegador e vale para todas as telas.
10. O seletor global fica no cabeçalho para permanecer disponível durante a navegação.
11. O modo escuro usa tons de grafite em menus, indicadores, filtros, grades, formulários, relatórios e janelas auxiliares.
12. As cores operacionais de status e turnos permanecem preservadas e legíveis nos dois temas.
13. No tema escuro, o texto do status mantém a cor de alto contraste correspondente ao fundo operacional.
14. O texto do status fica geometricamente centralizado, sem deslocamento causado pelo indicador nativo da lista.

## Segurança e usuários

1. O acesso compartilhado atual serve somente para homologação com a equipe.
2. Senhas nunca devem ser registradas nesta documentação ou no código.
3. Antes do uso definitivo, cada pessoa deve possuir uma conta individual e um perfil compatível com sua função.

## Fechamento da folha diária

1. Uma folha aberta permite preenchimento normal pela operação.
2. Ao fechar a folha, todos os lançamentos ficam disponíveis somente para consulta.
3. A folha pode ser reaberta quando uma correção operacional for necessária.
4. Fechamento e reabertura ficam registrados no histórico com usuário, data e região.
5. Se outra pessoa alterar uma linha antes do salvamento, o sistema recusa a sobrescrita, recarrega a informação atual e avisa o operador.
