# Ponte Sighra sem instalar programas

Para o PC da torre que fica ligado 24 horas, siga [TUTORIAL-TORRE.md](TUTORIAL-TORRE.md). O script `Registrar-Torre.ps1` registra e inicia a tarefa usando a configuracao existente, sem pedir os segredos novamente. Em um PC novo, configure primeiro nessa maquina; os segredos do outro PC nao sao reutilizaveis.

Usa Windows PowerShell e exclusivamente `C:\SIGhRA_Monitor\libmysql.dll`, que ja existe no PC. Nao instala Node.js, ODBC, DLLs ou outros programas. `Instalar-Ponte.ps1` apenas configura a ponte; o nome foi mantido para compatibilidade.

Esta versao testa o banco, envia sinais e atende consultas da aba Consulta Sighra. Executa apenas SQL fixo de leitura para obter as ultimas 10 macros, o ultimo fim de jornada e as sequencias de inicio, fim e reinicio de viagem a partir da data consultada. A ponte nao altera a planilha; o operador confere a previa antes de aplicar a jornada.

Na consulta da jornada, a placa pode vir somente da primeira ou segunda macro de reinicio de viagem depois do inicio e antes do fim. Se nenhuma delas tiver placa, a entrada e a saida continuam disponiveis para preenchimento. Para usar essa regra, atualize tambem `MySql-Nativo.ps1` na ponte em execucao.

## Atualizar uma ponte ja configurada

Pare a ponte com Ctrl+C (ou pare a tarefa). Substitua `Iniciar-Ponte.ps1` e `MySql-Nativo.ps1` por estes arquivos, mantendo `config.local.json`. Nao e necessario executar o configurador novamente ou informar senha/chave. Se os novos arquivos tiverem marca de download, revise e use Unblock-File somente nesses arquivos. Reinicie no mesmo PowerShell de 32 bits que funcionou anteriormente:

```powershell
cd C:\PonteSighra
.\Iniciar-Ponte.ps1
```

No sistema, abra Consulta Sighra, cole o login numerico e consulte. A ponte busca pedidos a cada cinco segundos e envia sinais a cada 30 segundos. Pedidos expiram apos tres minutos, com no maximo duas tentativas. Se o envio de resultado falhar, a ponte tenta novamente antes de receber outro pedido. A tela informa que e necessario atualizar a ponte se ela ainda estiver na versao anterior.

O botao Conferir preenchimento mostra a entrada e a saida atuais da folha. Preencher saida usa o horario GPS com segundos descartados, recalcula jornada e proxima previsao, registra a alteracao no historico do usuario e bloqueia conflitos ou folhas fechadas. Nenhuma linha e criada automaticamente. Escolha o dia da macro ou o anterior para jornadas que cruzaram a meia-noite. O ultimo fim historico nao confirma encerramento da jornada atual.

Copie os quatro arquivos desta pasta para `C:\PonteSighra`, sem alterar a pasta do Sighra. Abra o mesmo PowerShell que funcionou com o script anterior:

```powershell
cd C:\PonteSighra
.\Instalar-Ponte.ps1
.\Iniciar-Ponte.ps1 -UmaVez
```

Informe a URL HTTPS do sistema publicado, a senha do banco e a chave exclusiva da ponte configurada no servidor. Nenhuma senha vem no pacote. Os segredos usam DPAPI, vinculados a esta conta neste computador. Reconfigure ao trocar de conta ou PC.

O script verifica a arquitetura da DLL: para 32 bits use `C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe`; para 64 bits use `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`. Nao substitua a DLL.

Para manter no terminal:

```powershell
.\Iniciar-Ponte.ps1
```

Ctrl+C encerra. Logs: `ponte.log`, com rotacao a 1 MB, sem segredos nem erros internos do MySQL. Configuracao: `config.local.json`, com segredos criptografados e permissoes restritas.

## Inicializacao automatica opcional

Somente se permitido pela empresa, execute novamente o configurador com:

```powershell
.\Instalar-Ponte.ps1 -RegistrarTarefa
Start-ScheduledTask -TaskName 'Ponte Sighra'
```

A tarefa inicia ao entrar no Windows, usando a mesma conta e arquitetura do PowerShell. Continua com a tela bloqueada, encerra ao sair da conta e nao inicia antes do login. Nao use SYSTEM ou outra conta, porque os segredos sao vinculados ao usuario. Para operar antes do login, o TI deve configurar uma conta de servico e gerar os segredos nessa conta.

Para parar ou remover:

```powershell
Stop-ScheduledTask -TaskName 'Ponte Sighra'
Unregister-ScheduledTask -TaskName 'Ponte Sighra' -Confirm:$false
```

Se a politica corporativa bloquear scripts, trate com o TI. Nao altere a politica global nem use bypass. Se os arquivos estiverem marcados como baixados da internet, revise os arquivos e, somente se permitido, use `Unblock-File` nos scripts desta pasta.

## Configuracao do sistema online

Publicar a integracao, aplicar as migracoes `20260917020000_sighra_bridge.sql` e `20260917030000_sighra_queries.sql` no Supabase e definir `SIGHRA_BRIDGE_TOKEN` no servidor. Para uma instalacao existente, manter a mesma chave. Copiar os scripts sozinho nao habilita o sistema online.

A chave deve ter pelo menos 32 caracteres aleatorios e ser a mesma no servidor e na ponte. Nao usar a senha do banco como chave. Gerar a chave em PowerShell no computador de quem configura o servidor:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
```

Nao colocar a senha do banco no sistema online nem abrir a porta 3306 na internet. A DLL real e o banco precisam ser validados no PC da empresa; os testes locais usam uma simulacao da API nativa.

## Placa e local das macros

A ponte consulta `cad_veiculo.cvei_placa` pelo `lmac_cvei_id` de cada macro. Consulta o ponto, cidade e UF em `cad_ponto` pelo `lmac_cpnt_id`, e a rua em `cad_ruas` pelo `lmac_crua_id`. As coordenadas sao `lmac_latitude` e `lmac_longitude` do evento. Cadastros ausentes nao removem a macro; a tela exibe o mapa quando ha coordenadas validas. A placa e os nomes refletem os cadastros consultados, e a posicao corresponde ao evento.

Em uma ponte ja configurada, preservar `config.local.json`, parar com Ctrl+C, substituir `MySql-Nativo.ps1` e iniciar novamente no PowerShell de 32 bits. Nao executar o configurador novamente. Fazer uma nova consulta no sistema para receber os campos adicionais.
