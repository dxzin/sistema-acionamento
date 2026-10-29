import vinextWorker from "vinext/server/fetch-handler";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  API_RATE_LIMITER: RateLimiter;
  MUTATION_RATE_LIMITER: RateLimiter;
  [key: string]: unknown;
}

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function cookieSession(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => /^sb-[^=]+-auth-token(?:\.\d+)?=/i.test(part)) ?? null;
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function actorKey(request: Request): Promise<string> {
  const credential = request.headers.get("authorization") ?? cookieSession(request);
  if (credential) return `session:${await digest(credential)}`;

  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  return `ip:${clientIp}`;
}

function limitedResponse(): Response {
  return Response.json(
    { erro: "Muitas solicitações. Aguarde um minuto e tente novamente." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "60",
      },
    },
  );
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const actor = await actorKey(request);
      const routeKey = `${actor}:${request.method}:${url.pathname}`;

      const apiLimit = await env.API_RATE_LIMITER.limit({ key: routeKey });
      if (!apiLimit.success) return limitedResponse();

      if (mutationMethods.has(request.method)) {
        const mutationLimit = await env.MUTATION_RATE_LIMITER.limit({ key: routeKey });
        if (!mutationLimit.success) return limitedResponse();
      }
    }

    return vinextWorker.fetch(request, env, ctx);
  },
};

export default worker;
