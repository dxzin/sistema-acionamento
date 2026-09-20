import { json, sessionDb, validOrigin } from "@/lib/sighra/server";

export const runtime = "nodejs";

const retired = () => json({
  erro: "O preenchimento pelo último fim foi desativado. Use a ação SIGhRa na planilha de Acionamento, com prévia e confirmação.",
}, 410);

export async function GET() {
  const { user } = await sessionDb();
  return user ? retired() : json({ erro: "Faça login." }, 401);
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ erro: "Origem inválida." }, 403);
  const { user } = await sessionDb();
  return user ? retired() : json({ erro: "Faça login." }, 401);
}
