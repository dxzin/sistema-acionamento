# Ponte SIGhRA isolada para teste no notebook

Este ambiente usa uma fila mantida apenas na memoria do Next.js local. Ele nao consulta nem altera `sighra_bridge_status` ou `sighra_query_jobs` do Supabase e nao disputa tarefas com a ponte do PC da empresa.

## Teste simulado, sem DLL, VPN ou banco

Use esta opcao para validar agora o fluxo completo com eventos ficticios de inicio às 04:05 e fim às 12:10:

```powershell
cd D:\sistema-acionamento\ponte-sighra\powershell
.\Configurar-Ponte-Teste-Simulada.ps1
```

Na primeira janela:

```powershell
.\Iniciar-Servidor-Ponte-Teste-Simulada.ps1
```

Na segunda janela:

```powershell
.\Iniciar-Ponte-Teste-Simulada.ps1
```

Abra `http://127.0.0.1:3100/acionamento`. Esse modo nunca tenta abrir uma conexão MySQL.

O notebook ainda precisa ter acesso direto ao banco SIGhRA pela VPN/rede e a biblioteca `C:\SIGhRA_Monitor\libmysql.dll`. A senha fica criptografada pelo Windows para a conta atual. A ponte executa somente as consultas fixas de leitura existentes em `MySql-Nativo.ps1`.

## Teste com dados reais do SIGhRA

Abra o Windows PowerShell com a mesma arquitetura da DLL e execute:

```powershell
cd D:\sistema-acionamento\ponte-sighra\powershell
.\Configurar-Ponte-Teste.ps1
```

## Executar

Na primeira janela:

```powershell
.\Iniciar-Servidor-Ponte-Teste.ps1
```

Na segunda janela, também no PowerShell compatível com a DLL:

```powershell
.\Iniciar-Ponte-Teste.ps1
```

Abra `http://127.0.0.1:3100/acionamento`. A identificação do SIGhRA nessa página corresponde somente à ponte do notebook. `Ctrl+C` em cada janela encerra o respectivo processo de teste.

Use `ponte-teste.log` para o diagnóstico. Não registre tarefa agendada para esse ambiente e não copie `config.teste.local.json` para outro computador.
