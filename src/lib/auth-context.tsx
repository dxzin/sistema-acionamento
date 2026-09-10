"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Profile, UserRole } from "@/types/database";
import { createClient } from "./supabase/client";

interface AuthContextType {
  user: Profile | null;
  isLoading: boolean;
  login: (email: string, role?: UserRole, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
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
          if (typeof window !== "undefined") {
            localStorage.setItem("sistema_acionamento_user", JSON.stringify(activeUser));
          }
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Falha ao recuperar sessao Supabase:", e);
      }

      const stored = typeof window !== "undefined" ? localStorage.getItem("sistema_acionamento_user") : null;
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          localStorage.removeItem("sistema_acionamento_user");
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, role: UserRole = "operator", password?: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      if (password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          console.error("Erro no signInWithPassword:", error.message);
          setIsLoading(false);
          return false;
        }

        if (data && data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
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
          if (typeof window !== "undefined") {
            localStorage.setItem("sistema_acionamento_user", JSON.stringify(activeUser));
          }
          setIsLoading(false);
          return true;
        }
      }

      // Fallback local caso sem senha
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
      if (typeof window !== "undefined") {
        localStorage.setItem("sistema_acionamento_user", JSON.stringify(profile));
      }
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Erro inesperado no login:", err);
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("sistema_acionamento_user");
    }
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Ignora erro
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

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
      {children}
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
