# Ponte Sighra no PC da torre

Este pacote usa apenas o Windows PowerShell e a biblioteca do Sighra que ja existe no computador. Nao instala programas. O sistema online ja esta publicado em https://sistema-acionamento.vercel.app/sighra.

## 1. Preparar o PC

Use uma pasta fixa: `C:\PonteSighra`. Copie todos os arquivos deste pacote para ela. Nao mova a pasta depois de registrar a tarefa.

O PC precisa ter `C:\SIGhRA_Monitor\libmysql.dll`, acesso ao banco `192.168.0.4:3306` e acesso a internet. Se a DLL nao existir nesse PC, confirme com o TI como usar a biblioteca do Sighra; o pacote nao inclui DLLs.

Abra o PowerShell de 32 bits pelo Executar (Win+R):

```text
C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe
```

Execute:

```powershell
Set-Location C:\PonteSighra
Get-ChildItem -LiteralPath C:\PonteSighra -Filter *.ps1 | Unblock-File
Test-NetConnection 192.168.0.4 -Port 3306
```

O teste precisa mostrar `TcpTestSucceeded : True`. Se mostrar False, conecte a VPN utilizada pela empresa ou confira a rede com o TI. Nao abra a porta do banco na internet.

## 2. Configurar neste computador

Se este e um PC diferente do que usava a ponte, configure novamente. A senha criptografada do outro computador nao funciona aqui. Nao copie `config.local.json` de outra maquina ou conta.

```powershell
.\Instalar-Ponte.ps1 -SistemaUrl 'https://sistema-acionamento.vercel.app'
```

Informe a senha do banco e a mesma chave da ponte que ja esta configurada no servidor. A chave e diferente da senha do banco. Se precisar recuperar a chave, ela esta na variavel `SIGHRA_BRIDGE_TOKEN` do projeto na Vercel, acessivel ao responsavel pelo sistema. Nao gere uma chave diferente somente neste PC.

O configurador salva os segredos criptografados para a conta atual neste PC. O arquivo nao vem no pacote. Se a ponte ja foi configurada neste mesmo PC e nesta conta, pule esta etapa.

## 3. Testar

```powershell
.\Iniciar-Ponte.ps1 -UmaVez
```

Espere a mensagem `Sinal recebido pelo sistema; banco acessivel: True`.

Para testar as macros, mantenha a ponte em execucao:

```powershell
.\Iniciar-Ponte.ps1
```

No sistema, abra Consulta Sighra e consulte um login conhecido, por exemplo 30049. Confira as macros, a placa e o local/mapa. Um sinal online sozinho nao confirma que a consulta das tabelas funcionou. Se falhar, copie a linha `Detalhe local:` do PowerShell para diagnostico, sem enviar senhas ou o arquivo de configuracao.

Depois do teste, pare esta execucao com Ctrl+C antes de registrar a tarefa.

## 4. Iniciar automaticamente

No mesmo PowerShell de 32 bits, com a mesma conta utilizada na configuracao:

```powershell
.\Registrar-Torre.ps1
Get-ScheduledTask -TaskName 'Ponte Sighra' | Select-Object TaskName,State
```

A tarefa `Ponte Sighra` deve ficar `Running`. Ela executa em segundo plano, inicia quando esta conta entra no Windows, nao tem limite de duracao e tenta reiniciar se o processo encerrar com erro. Nao exige informar as credenciais novamente. Nao mantenha outra ponte manual ou tarefa em outro PC funcionando em paralelo.

Fechar esta janela do PowerShell nao para a tarefa. Bloquear a tela com Win+L mantem a ponte. Sair da conta do Windows encerra a execucao.

**Depois de um reinicio, e preciso entrar nesta conta e restabelecer a VPN, quando utilizada. A tarefa nao inicia antes do login.** Se a torre precisa voltar sozinha depois de falta de energia, sem alguem entrar no Windows, o TI precisa configurar a execucao com conta dedicada e a VPN nesse contexto. Nao habilite login automatico como parte deste tutorial.

## 5. Deixar funcionando 24 horas

- Manter o PC ligado, com internet e conexao com o banco/VPN.
- Em Configuracoes do Windows > Sistema > Energia, definir suspensao como Nunca quando conectado a tomada. A tela pode apagar normalmente.
- Manter a conta conectada; bloquear a tela em vez de sair da conta.
- Depois de atualizacoes, reinicios ou falta de energia, entrar na conta e confirmar a VPN e `Sighra: online` no sistema.
- A ponte verifica o banco e envia sinal a cada 30 segundos; procura consultas a cada cinco segundos. Ela tenta novamente quando a rede volta.

## 6. Conferir, parar e reiniciar

```powershell
# Ver estado
Get-ScheduledTask -TaskName 'Ponte Sighra' | Select-Object TaskName,State

# Ver ultimas mensagens
Get-Content C:\PonteSighra\ponte.log -Tail 20

# Parar
Stop-ScheduledTask -TaskName 'Ponte Sighra'

# Iniciar novamente
Start-ScheduledTask -TaskName 'Ponte Sighra'
```

O log gira quando atinge aproximadamente 1 MB. A versao anterior fica em `ponte.log.anterior`. A tarefa nao precisa ficar com uma janela aberta.

## 7. Atualizar os scripts

Pare a tarefa, substitua os scripts pelos arquivos novos e preserve `config.local.json`. Desbloqueie os novos scripts e inicie a tarefa novamente. Nao execute o configurador novamente para uma simples atualizacao. Se mudar a pasta ou a arquitetura do PowerShell, registre a tarefa novamente.

## Problemas comuns

| Mensagem ou situacao | Como resolver |
| --- | --- |
| Script nao assinado | Desbloquear somente os scripts deste pacote com Unblock-File. Nao alterar a politica global. |
| DLL incompatível | Abrir o PowerShell de 32 bits indicado no inicio. |
| Banco inacessivel | Testar a porta 3306 e conferir rede/VPN. |
| Segredos nao podem ser lidos | Usar a conta e o PC da configuracao; configurar novamente se mudou de PC. |
| Falha de confianca com dominio | Os scripts usam SIDs para permissoes e para a tarefa. Se o Windows ainda rejeitar o registro, solicitar ao TI a correcao do dominio; nao mudar a conta da tarefa sem reconfigurar os segredos. |
| Acesso negado ao registrar tarefa | Solicitar ao TI o registro para a mesma conta. A execucao da ponte nao requer uma conta diferente nem instalacao de programas. |
| Online, mas macros falham | Parar a tarefa, executar Iniciar-Ponte.ps1 manualmente e consultar um login para ler o Detalhe local. Depois parar a execucao manual e iniciar a tarefa. |

O pacote nao contem senha, chave, dados de condutores nem configuracao de nenhum PC.
