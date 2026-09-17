# Previsão após abono no dia anterior

Regra ampliada em `20260917010000_working_status_forecast.sql`: ACIONADO,
APOIO, TROCA, BALDEIO e VIAGEM FECHADA em D-1 usam a continuidade da jornada.
Sem saída, a previsão de D fica vazia; com saída, usa a previsão do próximo dia
registrada em D-1. Para todos os demais status (inclusive vazio ou sem registro
anterior), D usa turno menos quatro horas. VF na escala, sem horário concreto,
continua sem previsão pela escala; pode receber a previsão pela continuidade.
Na própria planilha, o filtro abaixo do cabeçalho Status contém “Vazio”, que
mostra registros com status vazio ou apenas espaços. A opção não fica no seletor
Todos os Status da barra superior.

Quando o acionamento de D-1 tem status ABONADO, a previsão automática de D é
o horário do turno de D menos quatro horas, independentemente do código numérico
da escala. Exemplos: 04h → 00h, 12h → 08h, 20h → 16h, 02h → 22h.
O turno específico da escala tem prioridade sobre o horário padrão do condutor.
VF e horário ausente ficam sem previsão automática.

O campo Motivo de abono de D recebe “Abonado ontem” se estiver vazio. Isso é
um registro de controle, não um abono de D: o status atual permanece inalterado.
Motivos preenchidos e previsões manuais são preservados.

A migração `20260917000000_previous_abono_forecast.sql` aplica a regra ao criar
linhas, ao editar a escala e ao corrigir o status de D-1, apenas em folhas abertas.
Também recalcula os registros automáticos já existentes nessas folhas. Quando
o abono anterior é desfeito, remove somente o marcador “Abonado ontem” e retoma
a previsão da continuidade ou da escala, preservando a previsão manual.

Validação: testes de turnos, virada de horário, VF e ausência de abono; teste
transacional no banco com rollback para propagação, correção de status e
preservação de edições manuais.
