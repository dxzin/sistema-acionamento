"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarRange, Download, FileCheck2, Loader2, Printer, RefreshCw, Route, Timer, UsersRound } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { formatMinutesToDuration } from "@/lib/calculations/jornada";
import { currentDateInBrasilia } from "@/lib/dates/operational-date";
import { exportOperationalReport, loadOperationalReport, OperationalReport } from "@/lib/services/report-service";

function initialPeriod() {
  const endDate = currentDateInBrasilia();
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

function statusTone(status: string) {
  if (status === "ACIONADO") return "excel-report-status-acionado";
  if (status === "ABONADO") return "excel-report-status-abonado";
  if (status === "APOIO") return "excel-report-status-apoio";
  if (status === "BALDEIO" || status.includes("TROCA")) return "excel-report-status-baldeio";
  if (status === "SEM STATUS") return "excel-report-status-empty";
  return "excel-report-status-other";
}

export default function RelatoriosPage() {
  const [initial] = useState(initialPeriod);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [region, setRegion] = useState("SP");
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (startDate > endDate) {
      setError("A data inicial precisa ser anterior ou igual à data final.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReport(await loadOperationalReport({ startDate, endDate, region }));
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }, [endDate, region, startDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const maxStatus = Math.max(1, ...(report?.statuses.map((item) => item.count) || [1]));
  const statusCoverage = report?.totalRows ? Math.round((report.filledStatuses / report.totalRows) * 100) : 0;

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportOperationalReport(report, { startDate, endDate, region });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar o relatório.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="excel-shell flex min-h-screen flex-1 flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex-1 overflow-auto">
          <section className="excel-report-sheet" aria-labelledby="report-title">
            <div className="excel-report-heading">
              <div>
                <h2 id="report-title"><BarChart3 aria-hidden="true" /> Relatório operacional</h2>
                <p>Consolidação das folhas de acionamento sem alterar os registros da operação.</p>
              </div>
              <div className="excel-report-actions">
                <button type="button" onClick={() => window.print()} disabled={loading || !report} className="excel-report-refresh"><Printer aria-hidden="true" /> Imprimir</button>
                <button type="button" onClick={handleExport} disabled={loading || exporting || !report} className="excel-report-refresh"><Download aria-hidden="true" /> {exporting ? "Gerando..." : "Exportar Excel"}</button>
                <button type="button" onClick={loadReport} disabled={loading} className="excel-report-refresh"><RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" /> Atualizar</button>
              </div>
            </div>

            <div className="excel-report-filters">
              <label>De<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label>Até<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              <label>Região<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="SP">SP · LP / Castilho</option><option value="UBJP">UB / LZ / JP</option></select></label>
              <span className="excel-report-period"><CalendarRange aria-hidden="true" /> {report?.sheetCount || 0} folha(s) no período</span>
            </div>

            {error && <div className="excel-report-error" role="alert">{error} Verifique o período e tente atualizar.</div>}

            {loading ? (
              <div className="excel-report-loading"><Loader2 className="animate-spin" aria-hidden="true" /> Consolidando folhas do período...</div>
            ) : report ? (
              <>
                <div className="excel-report-kpis">
                  <div><UsersRound aria-hidden="true" /><span>Status preenchido</span><strong>{report.filledStatuses}</strong><small>{statusCoverage}% das linhas</small></div>
                  <div><FileCheck2 aria-hidden="true" /><span>Jornadas concluídas</span><strong>{report.completedJourneys}</strong><small>{report.ongoingJourneys} em andamento</small></div>
                  <div><Timer aria-hidden="true" /><span>Média de jornada</span><strong>{formatMinutesToDuration(report.averageWorkedMinutes) || "—"}</strong><small>{report.longJourneys} acima de 11h10</small></div>
                  <div><Route aria-hidden="true" /><span>Linhas consolidadas</span><strong>{report.totalRows}</strong><small>inclui linhas sem status</small></div>
                </div>

                <div className="excel-report-grid">
                  <section className="excel-report-block">
                    <h3>Distribuição por status</h3>
                    {report.statuses.length ? report.statuses.map((item) => (
                      <div className="excel-report-bar-row" key={item.status}>
                        <span className={`excel-report-status ${statusTone(item.status)}`}>{item.status}</span>
                        <div className="excel-report-bar-track"><i style={{ width: `${(item.count / maxStatus) * 100}%` }} /></div>
                        <strong>{item.count}</strong><small>{item.share.toFixed(1)}%</small>
                      </div>
                    )) : <p className="excel-report-empty">Nenhuma folha encontrada neste período.</p>}
                  </section>

                  <section className="excel-report-block">
                    <h3>Destinos mais usados</h3>
                    <table className="excel-report-compact-table"><thead><tr><th>#</th><th>Destino final ou destino</th><th>Registros</th></tr></thead><tbody>
                      {report.destinations.map((item, index) => <tr key={item.name}><td>{index + 1}</td><td>{item.name}</td><td>{item.count}</td></tr>)}
                      {!report.destinations.length && <tr><td colSpan={3}>Nenhum destino preenchido no período.</td></tr>}
                    </tbody></table>
                  </section>
                </div>

                <section className="excel-report-block excel-report-drivers">
                  <h3>Resumo por condutor</h3>
                  <div className="overflow-auto">
                    <table className="excel-report-table"><thead><tr><th>#</th><th>Condutor</th><th>Login</th><th>Status preenchido</th><th>Jornadas concluídas</th><th>Horas trabalhadas</th><th>Acima de 11h10</th></tr></thead><tbody>
                      {report.drivers.map((driver, index) => <tr key={`${driver.login}-${driver.driver}`}><td>{index + 1}</td><td>{driver.driver}</td><td>{driver.login}</td><td>{driver.dispatches}</td><td>{driver.completedJourneys}</td><td>{formatMinutesToDuration(driver.workedMinutes) || "00:00"}</td><td className={driver.longJourneys ? "is-alert" : ""}>{driver.longJourneys}</td></tr>)}
                      {!report.drivers.length && <tr><td colSpan={7}>Nenhuma atividade preenchida para os filtros escolhidos.</td></tr>}
                    </tbody></table>
                  </div>
                </section>
              </>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
