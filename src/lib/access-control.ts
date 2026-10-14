import type { UserRole } from "@/types/database";

const OPERATION_PAGES = ["/acionamento", "/escala", "/condutores", "/sighra", "/avisos"];

export function canAccessPage(role: UserRole | string | null | undefined, pathname: string): boolean {
  if (role === "admin" || role === "supervisor") return true;
  if (pathname === "/") return true;
  return OPERATION_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
