"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TurnstileWidget, TurnstileWidgetHandle } from "@/components/auth/TurnstileWidget";
import { Truck, ArrowRight, Lock, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("torre@torre.com.br");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFqePekZPz_a7l_e";
  const handleCaptchaToken = useCallback((token: string | null) => setCaptchaToken(token), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Por favor, preencha o e-mail e a senha.");
      return;
    }
    if (turnstileSiteKey && !captchaToken) {
      setErrorMessage("Conclua a verificação de segurança antes de entrar.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const success = await login(email, "operator", password, captchaToken ?? undefined);
    setIsLoading(false);

    if (success) {
      router.push("/acionamento");
      router.refresh();
    } else {
      turnstileRef.current?.reset();
      setErrorMessage("Falha na autenticação. Verifique suas credenciais.");
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
            <label htmlFor="login-email" className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              E-mail ou Matrícula
            </label>
            <input
              type="email"
              id="login-email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="torre@torre.com.br"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Senha de Acesso
            </label>
            <div className="relative">
              <input
                type="password"
                id="login-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {turnstileSiteKey && (
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onTokenChange={handleCaptchaToken}
            />
          )}

          <button
            type="submit"
            disabled={isLoading || Boolean(turnstileSiteKey && !captchaToken)}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium text-sm transition-colors flex items-center justify-center space-x-2 shadow-sm"
          >
            <span>{isLoading ? "Autenticando..." : "Entrar no Sistema"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* A conta é informada, mas a senha nunca fica embutida no código do navegador. */}
        <div className="mt-8 border-t border-slate-800 pt-6 text-center">
          <div className="text-xs font-medium text-slate-400">Conta compartilhada de homologação</div>
          <div className="mt-1 text-[11px] font-semibold text-emerald-400">torre@torre.com.br</div>
          <div className="mt-1 text-[9px] text-slate-500">Digite a senha fornecida pela operação.</div>
        </div>
      </div>
    </div>
  );
}
