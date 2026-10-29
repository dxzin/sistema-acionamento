import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessPage } from "@/lib/access-control";

const privateCacheHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

function preventCaching(response: NextResponse) {
  Object.entries(privateCacheHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return response;
}

function preserveSession(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));

  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  }

  return preventCaching(target);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = preventCaching(NextResponse.next({ request }));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([name, value]) => {
            supabaseResponse.headers.set(name, value);
          });
          preventCaching(supabaseResponse);
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims.sub === "string" ? data.claims.sub : null;

  const isAuthPage = request.nextUrl.pathname.startsWith("/login");

  if (!userId && !isAuthPage && !request.nextUrl.pathname.startsWith("/_next") && !request.nextUrl.pathname.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return preserveSession(supabaseResponse, NextResponse.redirect(url));
  }

  if (userId && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/acionamento";
    return preserveSession(supabaseResponse, NextResponse.redirect(url));
  }

  if (userId && !isAuthPage && !request.nextUrl.pathname.startsWith("/api/") && !request.nextUrl.pathname.startsWith("/_next/") && !canAccessPage("operator", request.nextUrl.pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (!canAccessPage(profile?.role, request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/acionamento";
      url.search = "";
      return preserveSession(supabaseResponse, NextResponse.redirect(url));
    }
  }

  return supabaseResponse;
}
