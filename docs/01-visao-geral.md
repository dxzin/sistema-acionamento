# Visão geral

## Problema que o projeto resolve

A operação de acionamento de condutores era controlada em planilhas Excel extensas, com repetição de preenchimento, risco de divergência entre dias e dificuldade para vários operadores trabalharem na mesma informação. O sistema web centraliza essa rotina sem abandonar a aparência e os hábitos de uso da planilha.

## Objetivo

Disponibilizar uma ferramenta única para:

- consultar a escala mensal dos condutores;
- montar e atualizar o acionamento diário;
- calcular jornada e próxima previsão;
- manter a continuidade correta entre um dia e o seguinte;
- registrar alterações e consultar histórico;
- permitir trabalho simultâneo e acesso pelo computador da empresa.

## Público

- Operadores de despacho, responsáveis pelo preenchimento diário;
- supervisores, responsáveis por acompanhamento e abonos;
- gestores, interessados em indicadores e relatórios;
- administração do sistema, responsável por usuários, bases e parâmetros.

## Módulos disponíveis

| Módulo | Endereço | Finalidade |
|---|---|---|
| Acionamento | `/acionamento` | Grade operacional diária com edição em células |
| Escala Mensal | `/escala` | Visualização, edição, importação e exportação da escala |
| Condutores | `/condutores` | Cadastro e manutenção dos dados dos condutores |
| Histórico | `/historico` | Consulta de registros e alterações operacionais |
| Administração | `/admin` | Bases, destinos e parâmetros do sistema |

## Tecnologia e publicação

- Interface: Next.js, React e TypeScript;
- banco de dados e autenticação: Supabase;
- hospedagem: Vercel;
- origem dos dados: planilhas operacionais Excel;
- ambiente publicado: [sistema-acionamento.vercel.app](https://sistema-acionamento.vercel.app/).

## Momento atual

O produto é utilizável para testes reais, mas ainda está em homologação. A prioridade não é acrescentar muitas telas, e sim provar que dados, regras, salvamento e uso simultâneo são confiáveis antes de substituir definitivamente a planilha.

