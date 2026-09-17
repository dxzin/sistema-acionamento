# Ponte Sighra

Esta primeira etapa monitora a conexão. Não importa dados operacionais e não executa comandos recebidos da internet. O agente consulta apenas `SELECT 1`, abre conexões de saída por HTTPS e não precisa de uma porta de entrada no PC.

## Sistema online

1. Aplicar `supabase/migrations/20260917020000_sighra_bridge.sql` no Supabase do sistema.
2. Gerar uma chave aleatória de 32 bytes. O exemplo sem Node está em `ponte-sighra/powershell/LEIA-ME.md`.
3. Definir `SIGHRA_BRIDGE_TOKEN` no ambiente do servidor. Nunca usar prefixo `NEXT_PUBLIC_`. O servidor também precisa da configuração Supabase existente e `SUPABASE_SERVICE_ROLE_KEY`.
4. Publicar a versão atualizada. O cabeçalho de computadores mostra o status para usuários autenticados.

## PC na rede da empresa

### PowerShell (opção recomendada para esta instalação)

Copiar os arquivos de `ponte-sighra/powershell` para `C:\PonteSighra` no PC da empresa. Reaproveita `C:\SIGhRA_Monitor\libmysql.dll`, já existente. Não instala programas, drivers ou DLLs.

No mesmo Windows PowerShell que funcionou com o script anterior (arquitetura compatível com a DLL), executar:

```powershell
cd C:\PonteSighra
.\Instalar-Ponte.ps1
.\Iniciar-Ponte.ps1 -UmaVez
```

O instalador pede a URL HTTPS do sistema, a senha do banco e a chave da ponte. Os segredos usam DPAPI, vinculada à conta e ao computador, com permissões restritas no arquivo de configuração. Nenhuma senha é distribuída no pacote.

Para iniciar ao entrar no Windows, executar o instalador com `-RegistrarTarefa`. A tarefa requer a mesma conta conectada; bloquear a tela permite continuar, sair da conta encerra. Para operar antes do login, é necessária uma conta de serviço configurada pelo TI. Detalhes de instalação, logs e remoção em `ponte-sighra/powershell/LEIA-ME.md`.

### Node.js (alternativa)

1. Instalar Node.js 22 ou superior e copiar a pasta `ponte-sighra`.
2. Dentro dela, executar `npm install`.
3. Copiar `.env.example` para `.env`, preencher a senha local do Sighra, a URL HTTPS do sistema e a mesma chave de ponte configurada no servidor. Não enviar esse arquivo nem a chave ao navegador ou ao Git.
4. Executar `npm start`. Conferir o sinal enviado no terminal e o status no sistema.
5. No Agendador de Tarefas do Windows, criar uma tarefa ao iniciar o computador, usando uma conta autorizada a acessar a rede. Programa: caminho absoluto de `node.exe`; argumentos: `--env-file=.env agent.mjs`; iniciar em: caminho absoluto da pasta da ponte. Configurar reinício em caso de falha e desativar o limite de duração da tarefa. Restringir acesso à pasta e ao `.env` à conta da tarefa e administradores.

Não colocar a senha do Sighra no servidor online. Confirmar com o TI que `monitor` possui apenas as permissões necessárias de leitura.

## Estados

- Online: sinal recente e teste do banco bem-sucedido.
- Sem acesso ao banco: PC enviou sinal, mas não conseguiu consultar o Sighra.
- Offline: nenhum sinal nos últimos dois minutos; tela atualiza a cada 30 segundos.
- Último sinal: horário de recebimento pelo servidor, disponível ao passar o mouse no status. Não equivale a sincronização de dados.

## Próxima etapa

Identificar com o TI as tabelas, campos, identificador do condutor e regras dos dados desejados. Só então implementar consultas limitadas e o mapeamento para acionamentos. A integração não foi testada contra o banco interno: isso precisa acontecer no PC da empresa.
