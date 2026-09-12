# Regras de Negócio da Operação de Acionamento de Condutores

Este documento formaliza as regras essenciais de negócio para o acionamento e controle diário de condutores, alinhadas às diretrizes da operação.

---

## 1. Glossário Operacional e Entidades Fundamentais

1. **Condutor / Motorista:** Profissional responsável pela condução do veículo na operação de transporte florestal/logístico.
2. **Base / Cidade de Origem:** Localidade onde o motorista é alocado e inicia seus ciclos de trabalho (`LP`, `UB`, `LZ`, `JP`, `CASTILHO`, etc.).
3. **Frota / Veículo:** Identificador alfanumérico do conjunto cavalo mecânico / carreta (ex.: `SJE7G29`, `PZB0F50`, `RTF1I40`).
4. **Estado de Carga (`C/V`):**
   - `C` (Carregado): Veículo transportando carga.
   - `V` (Vazio): Veículo em deslocamento vazio.
5. **Turnos de Trabalho:**
   - **Turno A:** Início padrão às `04:00:00`
   - **Turno B:** Início padrão às `12:00:00`
   - **Turno C:** Início padrão às `20:00:00`
6. **Destino e Destino Final:** Local intermediário e local de término da viagem onde o motorista encerra o turno.

---

## 2. Regras de Escala Mensal e Ciclos de Trabalho

1. **Ciclos Operacionais:** A escala mensal define para cada dia do mês se o motorista está em dia de trabalho ou de descanso (ex.: escalas 6x2 ou 4x2).
2. **Códigos de Escala:**
   - `1` a `6`: Dia sequencial dentro do ciclo de trabalho.
   - `F`: Folga regulamentar.
   - `FE`: Período de férias.
   - `FER`: Feriado.
   - `AF`: Afastamento (médico/INSS).
   - `AT` / `ATÉ DD/MM`: Atestado médico.
   - `DESL`: Desligado.
   - `VF` / `VJ`: Viagem Fechada / Jornada.
   - `RETORNA DD/MM` / `VOLTA DD/MM`: Retorno previsto de ausência.
3. **Vinculação com o Acionamento Diário:**
   - O campo `DIA ESC.` do dia busca o código correspondente na escala mensal do motorista.
   - Os campos `LOGIN` e `HORARIO` (turno padrão) são preenchidos automaticamente a partir da escala mensal.

---

## 3. Regras de Continuidade e Herança Entre Dias (Transição D-1 -> D)

O sistema mantém a continuidade contínua de estado entre os dias:

1. **Previsão de Início (`PREVISÃO`):**
   - **Regra:** O campo `PREVISÃO` do dia D herda automaticamente o valor de `PREV PRÓX. DIA` calculado no dia D-1 para o mesmo condutor.
   - **Caso Não Encontrado:** Se não houver registro em D-1, exibe `"INSERIR PREV"` ou permite digitação manual.
2. **Local Inicial de Partida (`LOCAL`):**
   - **Regra:** O campo `LOCAL` do dia D herda automaticamente **somente** o `DESTINO FINAL` de D-1 para o mesmo condutor.
   - **Destino normal não é alternativa:** O campo `DESTINO` de D-1 nunca deve ser usado para preencher o `LOCAL` do dia seguinte.
   - **Caso Não Encontrado:** Se não houver `DESTINO FINAL` preenchido em D-1, o `LOCAL` permanece vazio e aguarda o operador.
3. **Transição Entre Meses:** A continuidade opera normalmente na virada do mês (ex.: 01/07 herda de 30/06; 01/08 herda de 31/07).

---

## 4. Regras de Cálculo da Jornada de Trabalho

A jornada de trabalho é calculada a partir dos horários de `ENTRADA (h)` e `SAÍDA (h)`:

1. **Jornada Normal Diurna (`SAÍDA >= ENTRADA`):**
   $$\text{Tempo de Jornada} = \text{SAÍDA} - \text{ENTRADA}$$
2. **Jornada Noturna com Virada de Meia-Noite (`SAÍDA < ENTRADA`):**
   $$\text{Tempo de Jornada} = (23:59:59 - \text{ENTRADA}) + \text{SAÍDA} + 00:00:01$$
   *(Equivalente a $24\text{h} - \text{ENTRADA} + \text{SAÍDA}$)*
3. **Jornada em Andamento / Tempo Real (`SAÍDA` não preenchida):**
   $$\text{Tempo de Jornada} = \text{HORA\_ATUAL} - \text{ENTRADA}$$
   - Enquanto a `SAÍDA` estiver vazia, o sistema calcula e exibe dinamicamente o tempo decorrido.
4. **Jornada Nula:** Se nem `ENTRADA` nem `SAÍDA` estiverem preenchidas, a jornada permanece vazia.

---

## 5. Regras de Interjornada e Próxima Previsão (`PREV PRÓX. DIA`)

1. **Cálculo da Próxima Previsão:**
   $$\text{PREV PRÓX. DIA} = \text{SAÍDA} + \text{Tempo de Interjornada}$$
   - Padrão da operação: soma do horário de encerramento da jornada com o período regulamentar de descanso (11h / 11h10min), operando em módulo de 24h.
2. **Condição:** Se a `SAÍDA` estiver vazia, `PREV PRÓX. DIA` permanece vazio.

---

## 6. Status de Acionamento e Abonos

1. **Status Operacionais:**
   - `ACIONADO`, `ABONADO`, `APOIO`, `TROCA`, `FALTA`, `ATESTADO`, `AFASTADO`, `BATE E VOLTA`, `SUSPENSÃO`, `VIAGEM FECHADA`.
2. **Registro de Abono:**
   - Quando um condutor é marcado como `ABONADO` (ou em desvio de escala), informa-se o `MOTIVO DO ABONO` (ex.: estouro de jornada, manutenção, alinhamento de ciclo, etc.).
   - O campo `AUTORIZAÇÃO DE ABONO` registra o responsável ou a indicação de `PENDENTE`.
   - *(A atribuição de perfil e workflow formal de aprovação por supervisor será tratada em etapa futura).*

---

## 7. Itens Fora do Escopo Inicial / Etapas Futuras

- **Regras de Refeição (Alimentação em Rota):** Desconsideradas para a aplicação web inicial.
- **Parametrização Regional de Interjornada por Base:** Unificada para cálculo padrão direto.
- **Workflow Avançado de Supervisores para Abonos:** Mantido como campo de seleção simples no despacho diário; perfis dedicados de supervisor e fluxo formal de aprovação serão tratados mais adiante.
