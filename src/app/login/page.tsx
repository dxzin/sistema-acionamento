"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Truck, Shield, ArrowRight, Lock, AlertCircle } from "lucide-react";
import { UserRole } from "@/types/database";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("operador@logistica.com.br");
  const [password, setPassword] = useState("Operador123!");
  const [role, setRole] = useState<UserRole>("operator");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Por favor, preencha o e-mail e a senha.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const success = await login(email, role, password);
    setIsLoading(false);

    if (success) {
      router.push("/acionamento");
      router.refresh();
    } else {
      setErrorMessage("Falha na autenticação. Verifique suas credenciais.");
    }
  };

  const handleQuickDemo = async (demoRole: UserRole, demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setRole(demoRole);
    setIsLoading(true);
    setErrorMessage(null);

    const success = await login(demoEmail, demoRole, demoPass);
    setIsLoading(false);

    if (success) {
      router.push("/acionamento");
      router.refresh();
    } else {
      setErrorMessage("Falha ao entrar com o usuário de demonstração.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-lg shadow-2xl p-6 sm:p-8">
        <div className="flex items-center justify-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-lg">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">
              SISTEMA DE ACIONAMENTO
            </h1>
            <p className="text-xs text-slate-400">Controle Operacional de Condutores</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-950/80 border border-rose-700 rounded text-rose-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              E-mail ou Matrícula
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operador@logistica.com.br"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Senha de Acesso
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Perfil de Acesso
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="operator">Operador / Despachante</option>
              <option value="supervisor">Supervisor de Tráfego</option>
              <option value="admin">Administrador do Sistema</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium text-sm transition-colors flex items-center justify-center space-x-2 shadow-sm"
          >
            <span>{isLoading ? "Autenticando..." : "Entrar no Sistema"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Acesso Rápido de Demonstração */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-center text-xs text-slate-400 mb-3 font-medium">
            Ou acesse diretamente com 1 clique:
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemo("operator", "operador@logistica.com.br", "Operador123!")}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-200 transition-colors text-left flex items-center space-x-2"
            >
              <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-[11px]">Operador</div>
                <div className="text-[9px] text-slate-400">Despacho</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo("supervisor", "supervisor@logistica.com.br", "Supervisor123!")}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-200 transition-colors text-left flex items-center space-x-2"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold text-[11px]">Supervisor</div>
                <div className="text-[9px] text-slate-400">Aprovações</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
