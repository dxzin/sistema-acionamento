"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Profile, UserRole } from "@/types/database";
import { createClient } from "./supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { canAccessPage } from "./access-control";

interface AuthContextType {
  user: Profile | null;
  isLoading: boolean;
  login: (email: string, role?: UserRole, password?: string, captchaToken?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

interface LoginResult {
  success: boolean;
  message?: string;
}

function loginErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  const code = error.code;
  const message = error.message || "Resposta sem mensagem";
  if (code === "invalid_credentials") return "E-mail ou senha incorretos.";
  if (code === "captcha_failed") return "A verificação de segurança expirou ou foi recusada. Marque-a novamente.";
  if (code === "over_request_rate_limit") return "Muitas tentativas de acesso. Aguarde um minuto e tente novamente.";
  if (code === "email_not_confirmed") return "Este e-mail ainda não foi confirmado.";
  if (code === "request_timeout") return "O servidor de autenticação demorou para responder. Tente novamente.";
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/captcha|turnstile/i.test(message)) return "A verificação de segurança foi recusada. Atualize a página e marque-a novamente.";
  if (/rate limit|too many requests/i.test(message)) return "Muitas tentativas de acesso. Aguarde um minuto e tente novamente.";
  const reference = code || (error.status ? `HTTP ${error.status}` : "sem código");
  return `Falha do servidor de autenticação: ${message} (${reference}).`;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const restrictedPage = pathname !== "/login" && !canAccessPage(user?.role, pathname);

  useEffect(() => {
    if (!isLoading && user && restrictedPage) router.replace("/acionamento");
  }, [isLoading, user, restrictedPage, router]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id,name,email,role,base_id,created_at,updated_at")
            .eq("id", session.user.id)
            .maybeSingle();

          const activeUser: Profile = profile || {
            id: session.user.id,
            name: session.user.user_metadata?.name || (session.user.email?.split("@")[0].toUpperCase() ?? "USUARIO"),
            email: session.user.email || "",
            role: (session.user.user_metadata?.role as UserRole) || "operator",
            base_id: null,
            created_at: session.user.created_at,
            updated_at: session.user.created_at,
          };

          setUser(activeUser);
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Falha ao recuperar sessao Supabase:", e);
      }

      // Com Supabase configurado, somente uma sessão validada no servidor
      // representa um login. Nunca restaure um perfil gravado pelo navegador.
      if (typeof window !== "undefined") localStorage.removeItem("sistema_acionamento_user");
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, role: UserRole = "operator", password?: string, captchaToken?: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      if (password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });

        if (error) {
          setIsLoading(false);
          return { success: false, message: loginErrorMessage(error) };
        }

        if (data && data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id,name,email,role,base_id,created_at,updated_at")
            .eq("id", data.user.id)
            .maybeSingle();

          const activeUser: Profile = profile || {
            id: data.user.id,
            name: data.user.user_metadata?.name || email.split("@")[0].toUpperCase(),
            email: data.user.email || email,
            role: (data.user.user_metadata?.role as UserRole) || role,
            base_id: null,
            created_at: data.user.created_at,
            updated_at: data.user.created_at,
          };

          setUser(activeUser);
          setIsLoading(false);
          return { success: true };
        }
      }

      // Modo demonstrativo local, disponível apenas quando o Supabase não está configurado.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const demoMode = !supabaseUrl || !supabaseKey || supabaseUrl.includes("placeholder") || supabaseKey.includes("placeholder");
      if (!demoMode) {
        setIsLoading(false);
        return { success: false, message: "Informe a senha de acesso." };
      }
      const profile: Profile = {
        id: `usr-${Date.now()}`,
        name: email.split("@")[0].toUpperCase(),
        email,
        role,
        base_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setUser(profile);
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      console.error("Erro inesperado no login:", err);
      setIsLoading(false);
      return { success: false, message: "Não foi possível conectar ao servidor de autenticação." };
    }
  };

  const logout = useCallback(async () => {
    const activeUserId = user?.id;
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("sistema_acionamento_user");
      if (activeUserId) sessionStorage.removeItem(`dispatch-reminders:${activeUserId}`);
    }
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Ignora erro
    }
    router.replace("/login");
    router.refresh();
  }, [router, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {restrictedPage ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
