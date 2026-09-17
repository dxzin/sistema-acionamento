# Previsão após abono no dia anterior

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
