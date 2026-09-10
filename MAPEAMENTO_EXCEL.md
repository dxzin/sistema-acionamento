# Mapeamento Completo da Planilha Excel (`TESTE.xlsx`)

Este documento apresenta o mapeamento detalhado da estrutura, dados, fórmulas, dependências e lógicas contidas na planilha `referencias/TESTE.xlsx`, utilizada no processo de acionamento de condutores logísticos.

---

## 1. Visão Geral da Pasta de Trabalho

- **Arquivo analisado:** `referencias/TESTE.xlsx`
- **Total de abas:** 198 abas
- **Período temporal coberto:** Maio/2026 a Setembro/2026
- **Divisão funcional das abas:**
  - **10 Abas de Escala Mensal:** `Escala Maio - MS`, `Escala Maio - UBJP`, `Escala Junho 2026 - SP`, `Escala Junho 2026 - MG`, `Escala Julho 2026 - SP`, `Escala Julho 2026 - MG`, `Escala Agosto 2026 - SP`, `Escala Agosto 2026 - MG`, `Escala Setembro 2026 - SP`, `Escala Setembro 2026 - MG`.
  - **92 Abas Diárias Gerais (SP / Lençóis Paulista / Castilho):** Padrão de nomenclatura `DD.MM.YY` (ex.: `01.06.26` até `31.08.26`).
  - **93 Abas Diárias UBJP (Minas Gerais - Uberaba / João Pinheiro / Luizlândia):** Padrão de nomenclatura `DD.MM.YY - UBJP` (ex.: `01.06.26  - UBJP` até `01.09.26 - UBJP`).
  - **1 Aba de Parâmetros Globais:** `REFERÊNCIAS`.
  - **2 Abas Auxiliares / Órfãs:** `Planilha1` (vazia, 1x1) e `Gráfico3` (Chartsheet com referências quebradas `#REF!`).

---

## 2. Mapeamento da Aba `REFERÊNCIAS`

A aba `REFERÊNCIAS` armazena constantes temporais e fórmulas globais utilizadas nos cálculos de jornada, virada de turno e cálculo de interjornada em todas as abas diárias.

| Célula | Valor / Fórmula | Tipo | Descrição / Finalidade Operacional |
| :--- | :--- | :--- | :--- |
| **B3** | `=NOW()` | Fórmula / Datetime | Data/hora atual do sistema. Utilizada para calcular a jornada em tempo real quando o condutor está em trânsito (campo `SAÍDA` ainda não preenchido). |
| **B4** | `23:59:59` | Constante / Time | Limite superior do dia civil. Utilizada no cálculo de jornada noturna (quando o turno atravessa a meia-noite e `SAÍDA < ENTRADA`). |
| **B5** | `00:00:01` | Constante / Time | Offset de 1 segundo adicionado para compensar a transição da meia-noite (`23:59:59 + 00:00:01 = 24:00:00`). |
| **B6** | `11:10:00` | Constante / Time | Interjornada padrão de 11 horas e 10 minutos (11h regulamentares de descanso legal CLT + 10 minutos de tolerância/margem operacional). Somada ao horário de saída para gerar a próxima previsão de acionamento. |
| **B7** | *Vazio (eval: 0)* | Nulo / Opcional | Célula referenciada nas fórmulas de previsão (`+ REFERÊNCIAS!$B$7`). Atua como buffer adicional configurável (atualmente zerado). |

---

## 3. Mapeamento das Abas Diárias Gerais (`DD.MM.YY`)

Estas abas controlam a alocação e despacho dos motoristas da operação São Paulo (Lençóis Paulista, Castilho, etc.).

### 3.1. Estrutura de Layout
- **Linha 1:** Título geral `CONTROLE DE ALOCAÇÃO DE MOTORISTA` (a célula A1 contém `#VALUE!` decorrente de concatenação legada).
- **Linhas 2 e 3:** Linhas de espaçamento em branco.
- **Linha 4:** Cabeçalho da Tabela estruturada do Excel.
- **Linhas 5 a N:** Linhas de registros dos condutores (uma linha por condutor por dia).

### 3.2. Dicionário de Colunas das Abas Gerais

| # | Coluna | Cabeçalho Exato | Tipo | Origem | Fórmula / Regra | Exemplo de Valor |
| :-: | :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | **A** | `CONDUTORES` | Texto | Manual | Nome completo do condutor | `Rafael Lima Amorim` |
| 2 | **B** | `LOGIN` | Texto/ID | Calculado | `=IF([@CONDUTORES]="","",VLOOKUP([@CONDUTORES],'Escala Mês - SP'!$A$1:$AH$75,2,FALSE))` | `18560` |
| 3 | **C** | `HORARIO` | Time | Calculado | `=IF([@CONDUTORES]="","",VLOOKUP([@CONDUTORES],'Escala Mês - SP'!$A$1:$AH$75,33,FALSE))` | `12:00:00` |
| 4 | **D** | `PREVISÃO` | Time/Txt | Calculado / Herdado / Manual | `=IFERROR(VLOOKUP([@CONDUTORES],TabelaDiaAnterior[#All],16,FALSE),"INSERIR PREV")` | `00:00:00`, `INSERIR PREV` |
| 5 | **E** | `ACIONADO` | Texto | Manual (Lista) | Status operacional do acionamento (Validação por Dropdown) | `ACIONADO`, `ABONADO`, `APOIO` |
| 6 | **F** | `MOTIVO DO ABONO` | Texto | Manual | Justificativa do abono, atraso, apoio ou ocorrência | `ESTOURO DE JORNADA`, `TROCA 034` |
| 7 | **G** | `LOCAL` | Texto | Calculado / Herdado / Manual | `=IFERROR(IF(VLOOKUP([@CONDUTORES],TabelaDiaAnterior[#All],12,FALSE)="","",VLOOKUP([@CONDUTORES],TabelaDiaAnterior[#All],12,FALSE)),"INSERIR LOCAL")` | `LP`, `UBERABA`, `CASTILHO` |
| 8 | **H** | `ENTRADA (h)` | Time | Manual | Horário efetivo de início da jornada do motorista | `01:12:00` |
| 9 | **I** | `FROTA` | Texto | Manual | Placa/Código do cavalo mecânico / veículo | `SJE7G29`, `PZB0F50` |
| 10 | **J** | `C/V` | Texto | Manual (Lista) | Indicador de carga: `C` (Carregado) ou `V` (Vazio) | `C`, `V` |
| 11 | **K** | `DESTINO` | Texto | Manual (Lista) | Local intermediário / destino da viagem | `UBERABA`, `LP`, `CASTILHO` |
| 12 | **L** | `DESTINO FINAL` | Texto | Manual (Lista) | Destino final da viagem (usado como `LOCAL` no dia seguinte) | `UBERABA`, `LP` |
| 13 | **M** | `SAÍDA (h)` | Time | Manual | Horário efetivo de término da jornada | `10:50:00` |
| 14 | **N** | `OBSERVAÇÃO` | Texto | Manual | Observações operacionais livres | `Render condutor em Perdizinha` |
| 15 | **O** | `DIA DE ESC.` | Texto/Num | Calculado | `=VLOOKUP([@CONDUTORES],'Escala Mês - SP'!$A$1:$AH$75,[Dia+2],FALSE)` | `1`, `2`, `3`, `4`, `5`, `6`, `F` |
| 16 | **P** | `PREV PRÓX. DIA` | Time | Calculado | `=IF([@[SAÍDA (h)]]="","",[@[SAÍDA (h)]]+REFERÊNCIAS!$B$6+REFERÊNCIAS!$B$7)` | `22:00:00` |
| 17 | **Q** | `TEMPO DE JORNADA`| Time/Num | Calculado | `=IF([@TEMPO1]<>"",[@TEMPO1],[@TEMPO2])` | `09:38:00` |
| 18 | **R** | `TEMPO1` | Time/Txt | Calculado (Virada Noturna) | `=IF([@[SAÍDA (h)]]="","",IF([@[SAÍDA (h)]]<[@[ENTRADA (h)]],REFERÊNCIAS!$B$4-[@[ENTRADA (h)]]+[@[SAÍDA (h)]]+REFERÊNCIAS!$B$5,""))` | `08:45:00` |
| 19 | **S** | `TEMPO2` | Time/Txt | Calculado (Diurna / Tempo Real) | `=IF([@[SAÍDA (h)]]="",IF([@[ENTRADA (h)]]="","",REFERÊNCIAS!$B$3-[@[ENTRADA (h)]]),[@[SAÍDA (h)]]-[@[ENTRADA (h)]])` | `09:38:00` |
| 20 | **T** | `AUTORIZAÇÃO DE ABONO` | Texto | Manual (Lista) | Nome do supervisor que autorizou o abono ou status de pendência | `ANDERSON`, `ROBERTO`, `LEOVEGILDO`, `PENDENTE` |
| 21 | **U** | `DATA` | Date | Constante | Data de referência da aba | `02/06/2026` |

---

## 4. Mapeamento das Abas Diárias UBJP (`DD.MM.YY - UBJP`)

Estas abas controlam a operação em Minas Gerais (Bases: Uberaba - `UB`, Luizlândia do Oeste - `LZ`, João Pinheiro - `JP`).

### 4.1. Evolução Estrutural das Colunas
Ao longo dos meses de Junho, Julho e Agosto de 2026, a planilha passou por ajustes incrementais:
1. **Junho (22 colunas):** Estrutura inicial com campos básicos de acionamento e cálculo de jornada.
2. **Início de Julho (24 a 26 colunas):** Introdução dos campos de cálculo de refeições (`REFEIÇÃO UBERABA`, `REFEIÇÃO LUIZLANDIA`), inclusão explícita de `FROTA` e `V/C`.
3. **Meados de Julho em diante (27 colunas consolidadas):** Estrutura estável padronizada.

### 4.2. Dicionário de Colunas Consolidado (Padrão 27 Colunas)

| # | Coluna | Cabeçalho Exato | Tipo | Origem | Fórmula / Regra | Descrição |
| :-: | :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | **A** | `COLABORADORES` / `CONDUTORES` | Texto | Manual | Nome do condutor | Identificação do motorista |
| 2 | **B** | `CIDADE` | Texto | Calculado | `=IF([@COLABORADORES]="","",VLOOKUP([@COLABORADORES],'Escala Mês - MG'!$A$1:$AI$145,2,FALSE))` | Base do motorista (`UB`, `LZ`, `JP`) |
| 3 | **C** | `LOGIN` | Texto/ID | Calculado | `=IFERROR(IF([@COLABORADORES]="","",VLOOKUP([@COLABORADORES],'Escala Mês - MG'!$A$1:$AI$145,3,FALSE)),"SEM ID")` | ID/Matrícula do condutor |
| 4 | **D** | `HORÁRIO` | Time | Calculado | `=IF([@COLABORADORES]="","",VLOOKUP([@COLABORADORES],'Escala Mês - MG'!$A$1:$AI$145,34,FALSE))` | Horário padrão da turma |
| 5 | **E** | `PREVISÃO` | Time/Txt | Calculado / Herdado / Manual | `=IFERROR(VLOOKUP([@COLABORADORES],TabelaDiaAnteriorUBJP[#All],17,FALSE),"INSERIR PREV")` | Previsão herdada do D-1 UBJP |
| 6 | **F** | `ACIONADO` | Texto | Manual (Lista) | Dropdown de status de acionamento | Status da alocação |
| 7 | **G** | `MOTIVO ABONO` | Texto | Manual | Justificativa do abono ou suporte | Texto descritivo |
| 8 | **H** | `LOCAL` | Texto | Calculado / Herdado / Manual | `=IFERROR(IF(VLOOKUP([@COLABORADORES],TabelaDiaAnteriorUBJP[#All],13,FALSE)="","",VLOOKUP([@COLABORADORES],TabelaDiaAnteriorUBJP[#All],13,FALSE)),"INSERIR LOCAL")` | Local de partida / destino anterior |
| 9 | **I** | `ENTRADA (h)` | Time | Manual | Horário de início do turno | Início da jornada |
| 10 | **J** | `FROTA` | Texto | Manual | Placa/Código do caminhão | Veículo alocado |
| 11 | **K** | `V/C` | Texto | Manual (Lista) | `V` (Vazio) ou `C` (Carregado) | Estado de carregamento |
| 12 | **L** | `DESTINO` | Texto | Manual (Lista) | Destino operacional | Ex: `UBERABA`, `LZ`, `LP` |
| 13 | **M** | `DESTINO FINAL` | Texto | Manual (Lista) | Destino final da viagem | Ex: `UBERABA`, `LUIZLANDIA` |
| 14 | **N** | `SAÍDA (h)` | Time | Manual | Horário de término do turno | Encerramento da jornada |
| 15 | **O** | `OBSERVAÇÕES` | Texto | Manual | Notas de campo | Texto livre |
| 16 | **P** | `DIA ESC.` | Texto/Num | Calculado | `=VLOOKUP([@COLABORADORES],'Escala Mês - MG'!A$1:$AI$145,[Dia+3],FALSE)` | Status do dia na escala mensal |
| 17 | **Q** | `PREV PRÓX. DIA` | Time | Calculado | `=IF([@[SAÍDA (h)]]="","",[@[SAÍDA (h)]]+11:00+REFERÊNCIAS!$B$7)` | Próxima previsão (Saída + 11h) |
| 18 | **R** | `ABONAR 04:00` | - | Manual | *Sem preenchimento histórico* | [PENDENTE DE VALIDAÇÃO] |
| 19 | **S** | `ABONAR 12:00` | - | Manual | *Sem preenchimento histórico* | [PENDENTE DE VALIDAÇÃO] |
| 20 | **T** | `ABONAR 20:00` | - | Manual | *Sem preenchimento histórico* | [PENDENTE DE VALIDAÇÃO] |
| 21 | **U** | `ABONAR?` | - | Manual | *Sem preenchimento histórico* | [PENDENTE DE VALIDAÇÃO] |
| 22 | **V** | `TEMPO JORNADA` | Time/Num | Calculado | `=IF([@TEMPO1]<>"",[@TEMPO1],[@TEMPO2])` | Tempo total trabalhado |
| 23 | **W** | `TEMPO1` | Time/Txt | Calculado | `=IF([@[SAÍDA]]="","",IF([@[SAÍDA]]<[@[ENTRADA]],REFERÊNCIAS!$B$4-[@[ENTRADA]]+[@[SAÍDA]]+REFERÊNCIAS!$B$5,""))` | Cálculo para virada da meia-noite |
| 24 | **X** | `TEMPO2` | Time/Txt | Calculado | `=IF([@[SAÍDA]]="",IF([@[ENTRADA]]="","",REFERÊNCIAS!$B$3-[@[ENTRADA]]),[@[SAÍDA]]-[@[ENTRADA]])` | Cálculo normal ou tempo real |
| 25 | **Y** | `AUTORIZAÇÃO DE ABONO` | Texto | Manual (Lista) | `ANDERSON`, `ROBERTO`, `LEOVEGILDO`, `PENDENTE` | Responsável pela aprovação |
| 26 | **Z** | `REFEIÇÃO UBERABA` | Num (0/1) | Calculado | `=IF(AND(B5="UB",OR(M5="LUIZLANDIA",M5="LP")),1,0)` | Direito a refeição (Base UB) |
| 27 | **AA** | `REFEIÇÃO LUIZLANDIA` | Num (0/1) | Calculado | `=IF(AND(B5="LZ",OR(M5="LUIZLANDIA",M5="LENÇÓIS",L5="LP",M5="UBERABA")),1,0)` | Direito a refeição (Base LZ) |

### 4.3. Colunas Auxiliares Ocultas / Células de Apoio
Nas abas UBJP existem células laterais que armazenam referências de turno:
- Célula com `Turno`: `B`
- Célula com `Horário`: `12:00:00`
- Célula com `Tolerância`: `05:00:00`
- Célula com `Interjornada`: `11:00:00` (usada na fórmula de `PREV PRÓX. DIA`)

---

## 5. Mapeamento das Abas de Escala Mensal

As escalas mensais representam o plano de trabalho de cada motorista para o mês civil.

### 5.1. Estrutura das Abas de Escala SP (`Escala [Mês] [Ano] - SP`)
- **Col A (1):** `Nome` (Nome do motorista)
- **Col B (2):** `Login` (Matrícula/ID operacional)
- **Col C a AF (3 a 32):** Dias `1` a `30` (ou `31`) do mês correspondente
- **Col AG (33):** `Hora` (Horário de início padrão da turma: `04:00:00`, `12:00:00`, `20:00:00`)
- **Col AH (34):** `Turno` (Letra da turma: `A`, `B`, `C`, `D`, etc.)
- **Col AI (35):** `Coluna1` / Observações (ex: `RETORNA 15/07`, `DESLIGADO`)

### 5.2. Estrutura das Abas de Escala MG (`Escala [Mês] [Ano] - MG`)
- **Col A (1):** `Nome` (Nome do motorista)
- **Col B (2):** `Cidade` (Base de lotação: `UB`, `LZ`, `JP`)
- **Col C (3):** `Login` (Matrícula/ID operacional)
- **Col D a AH (4 a 34):** Dias `1` a `30` (ou `31`) do mês
- **Col AI (35):** `HORA ` (Horário de início padrão da turma)
- **Col AJ (36):** `ESCALA` / `Turno` (Letra da turma)

### 5.3. Códigos Utilizados no Calendário da Escala Mensal

| Código | Significado | Comportamento no Acionamento |
| :--- | :--- | :--- |
| `1`, `2`, `3`, `4`, `5`, `6` | Dias do ciclo de trabalho (ex.: 6x2 ou 4x2) | Motorista escalado para trabalhar no dia |
| `F` | Folga regulamentar | Motorista em folga da escala |
| `FE` | Férias | Motorista em período de férias |
| `FER` | Feriado | Feriado programado |
| `AF` | Afastado | Afastamento previdenciário / médico prolongado |
| `AT` / `ATÉ DD/MM` | Atestado médico | Ausência justificada por atestado |
| `DESL` / `DES` | Desligado | Motorista demitido ou em rescisão |
| `VF` / `VJ` | Viagem Fechada / Jornada | Escala especial para viagem de longa distância |
| `RETORNA DD/MM` | Retorno de férias/afastamento | Indica data de reativação operacional |

---

## 6. Mapeamento de Validações de Dados (Listas Suspensas)

As validações de dados configuradas nas células impõem restrições de entrada:

### 6.1. Status de Acionamento (Coluna `ACIONADO`)
- `ACIONADO`
- `APOIO`
- `TROCA`
- `ABONADO`
- `FALTA`
- `ATESTADO`
- `AFASTADO`
- `BATE E VOLTA`
- `SUSPENSÃO`
- `VIAGEM FECHADA`

### 6.2. Autorização de Abono (Coluna `AUTORIZAÇÃO DE ABONO`)
- `ANDERSON`
- `ROBERTO`
- `LEOVEGILDO`
- `PENDENTE`

### 6.3. Locais e Destinos (Colunas `LOCAL`, `DESTINO`, `DESTINO FINAL`)
- Operação SP: `LP`, `CASTILHO`, `UBERABA`, `LZ`, `BREJO BONITO`, `POSTO CAXUXA`, `LUZ`, `ZELÂNDIA`, `ARAXÁ`
- Operação MG/UBJP: `LZ`, `UBERABA`, `LP`, `JP`, `CHAPADÃO A`, `SANTA IZA / UBERABA`, `LUZ`, `TROCA NO MEL`, `TROCA NO 034`

### 6.4. Estado de Carga (Coluna `C/V` ou `V/C`)
- `C` (Carregado)
- `V` (Vazio)

---

## 7. Mapeamento de Formatação Condicional e Cores

A planilha utiliza formatação condicional extensiva para sinalização visual imediata dos operadores de tráfego:

| Alvo / Intervalo | Condição / Fórmula | Cor de Fundo (Hex / RGB) | Cor da Fonte | Significado Visual |
| :--- | :--- | :--- | :--- | :--- |
| `ACIONADO` (Col E/F) | Célula = `"ACIONADO"` | Verde claro (`#C6EFCE`) | Verde escuro (`#006100`) | Motorista em rota / ativo |
| `ABONADO` (Col E/F) | Célula = `"ABONADO"` | Vermelho claro (`#FFC7CE`) | Vermelho escuro (`#9C0006`) | Dia de trabalho abonado |
| `APOIO` (Col E/F) | Célula = `"APOIO"` | Amarelo claro (`#FFEB9C`) | Marrom/Amarelo escuro (`#9C5700`)| Motorista prestando apoio |
| `FALTA` (Col E/F) | Célula = `"FALTA"` | Vermelho vivo (`#FF0000`) | Branco / Negrito | Falta não justificada |
| `ATESTADO` (Col E/F) | Célula = `"ATESTADO"` | Azul claro (`#B8CCE4`) | Azul escuro | Atestado médico |
| `AFASTADO` (Col E/F) | Célula = `"AFASTADO"` | Rosa / Magenta escuro (`#CC0066`)| Branco | Afastamento pelo INSS |
| `SUSPENSÃO` (Col E/F) | Contém `"SUSPENSÃO"` | Roxo / Magenta (`#CB05AF`) | Branco | Suspensão disciplinar |
| `BATE E VOLTA` (Col E/F)| Contém `"BATE E VOLTA"` | Laranja (`#FFC000`) | Preto | Viagem curta bate-volta |
| `TROCA` (Col E/F) | Contém `"TROCA"` | Amarelo puro (`#FFFF00`) | Preto | Troca de cavalo/motorista em rota |
| `VIAGEM FECHADA` (Col E/F)| Célula = `"VIAGEM FECHADA"` | Ciano / Azul suave (`#DCE6F1`)| Azul escuro | Viagem fechada sem baldeio |
| `PENDENTE` (Toda a linha)| `$T4="PENDENTE"` | Amarelo / Destaque de linha | Preto | Abono aguardando autorização |
| `FOLGA` na Escala | Célula = `"F"` | Vermelho (`#FF0000`) | Branco | Folga do condutor na escala |
| `HORÁRIO` (Col C/D) | `04:00:00` (0.1666) | Azul suave | Preto | Turno A (Madrugada) |
| `HORÁRIO` (Col C/D) | `12:00:00` (0.5000) | Laranja suave | Preto | Turno B (Dia) |
| `HORÁRIO` (Col C/D) | `20:00:00` (0.8333) | Cinza / Roxo suave | Preto | Turno C (Noite) |
| `TEMPO DE JORNADA` | Color Scale (3 Cores) | Gradiente Verde -> Amarelo -> Vermelho | Automático | Alerta visual de estouro de jornada (acima de 10h/12h) |

---

## 8. Diagnóstico de Falhas Estruturais do Excel a Serem Corrigidas no Web

1. **Erros de Referência `#REF!`:** No primeiro dia de cada mês ou ao excluir/renomear abas, as fórmulas que buscam o dia anterior quebram. O sistema web deve manter continuidade automática via chaves de banco de dados sem risco de quebra de ponteiros.
2. **Volatilidade da Função `=NOW()`:** O uso de `=NOW()` na planilha faz com que todas as jornadas em aberto sejam recalculadas a cada abertura ou edição de qualquer célula da pasta de trabalho. No sistema web, o cálculo em tempo real deve ser dinâmico na interface, mas congelado no momento do registro da `SAÍDA`.
3. **Inchaço de Nomes de Tabela:** Cada cópia diária de aba gerou identificadores gigantescos (ex.: `Tabela546485052545...`), consumindo memória e degradando a performance. O sistema web usará entidades relacionais normalizadas.
4. **Concorrência e Perda de Dados:** Apenas um despachante pode editar o Excel de forma confiável por vez. No sistema web, múltiplos operadores devem poder despachar simultaneamente com sincronização em tempo real.
