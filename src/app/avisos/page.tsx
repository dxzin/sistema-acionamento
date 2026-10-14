"use client";

import { Megaphone } from "lucide-react";
import { NoticeBoard } from "@/components/avisos/NoticeBoard";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/lib/auth-context";

export default function AvisosPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <div className="excel-shell flex min-h-screen flex-1 flex-col">
    <Header />
    <div className="notice-page-layout flex min-h-0 flex-1 overflow-hidden">
      <Sidebar />
      <main className="excel-workspace notice-page flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="notice-page-heading">
          <div className="notice-page-icon"><Megaphone aria-hidden="true" /></div>
          <div><span>Comunicação operacional</span><h1>Quadro de Avisos</h1><p>Avisos e atividades compartilhados entre os analistas.</p></div>
        </header>
        <NoticeBoard currentUser={user} />
      </main>
    </div>
  </div>;
}
