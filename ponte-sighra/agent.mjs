import mysql from "mysql2/promise";
import { setTimeout as sleep } from "node:timers/promises";

const required = ["SIGHRA_HOST", "SIGHRA_DATABASE", "SIGHRA_USER", "SIGHRA_PASSWORD", "SISTEMA_URL", "SIGHRA_BRIDGE_TOKEN"];
if (required.some(key => !process.env[key]) || process.env.SIGHRA_BRIDGE_TOKEN.length < 32) {
  console.error("Preencha o .env; a chave da ponte deve ter pelo menos 32 caracteres.");
  process.exit(1);
}
const url = new URL("/api/integracoes/sighra", process.env.SISTEMA_URL);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
  throw new Error("Use HTTPS para conectar ao sistema.");
}
const port = Number(process.env.SIGHRA_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Porta inválida.");

let stopping = false;
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; shutdown.abort(); });

while (!stopping) {
  let connection;
  let databaseOk = false;
  try {
    connection = await mysql.createConnection({ host: process.env.SIGHRA_HOST, port,
      database: process.env.SIGHRA_DATABASE, user: process.env.SIGHRA_USER,
      password: process.env.SIGHRA_PASSWORD, connectTimeout: 10_000, multipleStatements: false });
    await connection.query({ sql: "SELECT 1 AS connection_ok", timeout: 10_000 });
    databaseOk = true;
  } catch {
    console.error("Não foi possível consultar o Sighra. Verifique rede e credenciais locais.");
  } finally { connection?.destroy(); }
  if (stopping) break;
  try {
    const response = await fetch(url, { method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${process.env.SIGHRA_BRIDGE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ database_ok: databaseOk }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error();
    console.log(`${new Date().toLocaleString("pt-BR")} — sinal enviado; banco ${databaseOk ? "acessível" : "indisponível"}.`);
  } catch { console.error("Sinal não entregue. Verifique URL, chave e configuração do sistema."); }
  try { await sleep(30_000, undefined, { signal: shutdown.signal }); } catch { /* encerramento */ }
}
