"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Falha inesperada na interface:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="m-0 bg-[#20242a] font-sans text-slate-100">
        <main className="flex min-h-screen items-center justify-center p-6">
          <section className="w-full max-w-lg border border-slate-600 bg-[#292f36] p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 h-2 w-24 bg-[#107c41]" />
            <h1 className="text-xl font-bold">A tela encontrou uma falha</h1>
            <p className="mt-2 text-sm text-slate-300">Os dados já salvos permanecem no sistema. Tente carregar a tela novamente.</p>
            <button type="button" onClick={reset} className="mt-5 border border-emerald-500 bg-[#107c41] px-5 py-2 text-sm font-bold text-white hover:bg-[#0d6936]">
              Tentar novamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
