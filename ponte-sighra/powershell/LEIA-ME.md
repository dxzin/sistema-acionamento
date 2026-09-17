# Ponte Sighra sem instalar programas

Usa Windows PowerShell e exclusivamente `C:\SIGhRA_Monitor\libmysql.dll`, que ja existe no PC. Nao instala Node.js, ODBC, DLLs ou outros programas. `Instalar-Ponte.ps1` apenas configura a ponte; o nome foi mantido para compatibilidade.

Esta etapa testa o banco com `SELECT 1` e envia um sinal HTTPS ao sistema. Nao importa jornadas ou posicoes.

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

## Sistema online: ainda pendente

Publicar a integracao, aplicar a migracao `20260917020000_sighra_bridge.sql` no Supabase e definir `SIGHRA_BRIDGE_TOKEN` no servidor. Copiar os scripts sozinho nao habilita o sistema online.

A chave deve ter pelo menos 32 caracteres aleatorios e ser a mesma no servidor e na ponte. Nao usar a senha do banco como chave. Gerar a chave em PowerShell no computador de quem configura o servidor:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
```

Nao colocar a senha do banco no sistema online nem abrir a porta 3306 na internet. A DLL real e o banco precisam ser validados no PC da empresa; os testes locais usam uma simulacao da API nativa.
