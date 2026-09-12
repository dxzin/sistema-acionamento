# Regras operacionais confirmadas

Este documento registra decisões confirmadas durante os testes. Alterações nestas regras devem ser combinadas com a operação antes de serem implementadas.

## Escala mensal

1. Os grupos de horário são 04h, 12h e 20h e devem permanecer visualmente identificáveis.
2. A listagem do acionamento deve respeitar o horário e o código do dia na escala mensal.
3. `F` e `FE` representam ausência do acionamento diário; esses condutores não devem aparecer na folha do dia.
4. A escala é a fonte dos dados planejados. Ela não define automaticamente o status operacional do acionamento.

## Status do acionamento

1. O status é decisão do operador e pode ser digitado livremente.
2. Uma nova folha diária deve abrir com todos os status em branco.
3. Apagar um status deve deixá-lo vazio; nenhum valor pode reaparecer automaticamente.
4. O próprio banco usa status vazio como padrão; nenhuma inserção assume `ACIONADO` por omissão.

## Criação da folha diária

1. Uma folha nova só pode ser criada para o dia seguinte no calendário de Brasília.
2. Exemplo: durante o dia 10, somente a folha do dia 11 pode ser preparada; ao entrar no dia 11, a próxima permitida passa a ser a do dia 12.
3. Datas anteriores continuam disponíveis para consulta, mas consultar uma data sem folha não cria registros.
4. Selecionar uma data além do dia seguinte nunca pode gerar folha ou condutores automaticamente.
4. As opções conhecidas continuam disponíveis como ajuda de preenchimento.
5. As cores de `ACIONADO`, `ABONADO`, `APOIO`, `BALDEIO` e demais estados conhecidos são parâmetros visuais da operação e devem ser preservadas.

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

## Uso semelhante ao Excel

1. O operador pode selecionar uma célula ou intervalo por arraste.
2. Shift amplia a seleção até outra célula.
3. Ao copiar um bloco com várias linhas e colunas, a colagem deve manter sua forma.
4. Se o destino selecionado for maior que o bloco copiado, o padrão deve se repetir como no Excel.
5. A colagem deve ser efetivamente salva no banco, não apenas exibida na tela.
6. Ocultar uma coluna não deve esticar as colunas restantes.

## Segurança e usuários

1. O acesso compartilhado atual serve somente para homologação com a equipe.
2. Senhas nunca devem ser registradas nesta documentação ou no código.
3. Antes do uso definitivo, cada pessoa deve possuir uma conta individual e um perfil compatível com sua função.
