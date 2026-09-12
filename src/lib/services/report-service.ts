import { calculateJornada } from "@/lib/calculations/jornada";
import { createClient } from "@/lib/supabase/client";
import ExcelJS from "exceljs";

export interface ReportFilters {
  startDate: string;
  endDate: string;
  region: string;
}

export interface ReportStatusRow {
  status: string;
  count: number;
  share: number;
}

export interface ReportDriverRow {
  driver: string;
  login: string;
  dispatches: number;
  completedJourneys: number;
  workedMinutes: number;
  longJourneys: number;
}

export interface OperationalReport {
  sheetCount: number;
  totalRows: number;
  filledStatuses: number;
  completedJourneys: number;
  ongoingJourneys: number;
  averageWorkedMinutes: number | null;
  longJourneys: number;
  statuses: ReportStatusRow[];
  destinations: Array<{ name: string; count: number }>;
  drivers: ReportDriverRow[];
}

interface ReportDispatchRecord {
  driver_id: string;
  dispatch_status: string | null;
  entry_time: string | null;
  exit_time: string | null;
  total_worked_minutes: number | null;
  destination_location_id: string | null;
  final_destination_location_id: string | null;
  scale_day_status?: string | null;
}

function normalizedStatus(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLocaleUpperCase("pt-BR") : "SEM STATUS";
}

export function aggregateOperationalReport(
  dispatches: ReportDispatchRecord[],
  driversById: Map<string, { name: string; login_matricula: string }>,
  locationsById: Map<string, string>,
  sheetCount: number
): OperationalReport {
  const operationalDispatches = dispatches.filter((row) => {
    const scaleCode = row.scale_day_status?.trim().toLocaleUpperCase("pt-BR");
    return scaleCode !== "F" && scaleCode !== "FE";
  });
  const statusCounts = new Map<string, number>();
  const destinationCounts = new Map<string, number>();
  const driverRows = new Map<string, ReportDriverRow>();
  let filledStatuses = 0;
  let completedJourneys = 0;
  let ongoingJourneys = 0;
  let workedMinutesTotal = 0;
  let longJourneys = 0;

  for (const row of operationalDispatches) {
    const status = normalizedStatus(row.dispatch_status);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (status !== "SEM STATUS") filledStatuses += 1;

    const calculated = calculateJornada(row.entry_time, row.exit_time);
    const minutes = row.total_worked_minutes ?? calculated.minutes;
    const completed = Boolean(row.entry_time && row.exit_time && minutes !== null);
    const ongoing = Boolean(row.entry_time && !row.exit_time);
    const isLong = completed && (minutes || 0) > 670;

    if (completed) {
      completedJourneys += 1;
      workedMinutesTotal += minutes || 0;
      if (isLong) longJourneys += 1;
    }
    if (ongoing) ongoingJourneys += 1;

    const destinationId = row.final_destination_location_id || row.destination_location_id;
    if (destinationId) {
      const destination = locationsById.get(destinationId) || "Local não cadastrado";
      destinationCounts.set(destination, (destinationCounts.get(destination) || 0) + 1);
    }

    const driver = driversById.get(row.driver_id);
    const current = driverRows.get(row.driver_id) || {
      driver: driver?.name || "Condutor não cadastrado",
      login: driver?.login_matricula || "—",
      dispatches: 0,
      completedJourneys: 0,
      workedMinutes: 0,
      longJourneys: 0,
    };
    if (status !== "SEM STATUS") current.dispatches += 1;
    if (completed) {
      current.completedJourneys += 1;
      current.workedMinutes += minutes || 0;
      if (isLong) current.longJourneys += 1;
    }
    driverRows.set(row.driver_id, current);
  }

  const statuses = [...statusCounts.entries()]
    .map(([status, count]) => ({
      status,
      count,
      share: operationalDispatches.length ? (count / operationalDispatches.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  const destinations = [...destinationCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);

  const drivers = [...driverRows.values()]
    .filter((row) => row.dispatches || row.completedJourneys)
    .sort((a, b) => b.dispatches - a.dispatches || b.workedMinutes - a.workedMinutes || a.driver.localeCompare(b.driver));

  return {
    sheetCount,
    totalRows: operationalDispatches.length,
    filledStatuses,
    completedJourneys,
    ongoingJourneys,
    averageWorkedMinutes: completedJourneys ? Math.round(workedMinutesTotal / completedJourneys) : null,
    longJourneys,
    statuses,
    destinations,
    drivers,
  };
}

async function fetchAllDispatches(sheetIds: string[]) {
  const supabase = createClient();
  const pageSize = 1000;
  const records: ReportDispatchRecord[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("dispatches")
      .select("driver_id,dispatch_status,entry_time,exit_time,total_worked_minutes,destination_location_id,final_destination_location_id,scale_day_status")
      .in("daily_sheet_id", sheetIds)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    records.push(...((data || []) as ReportDispatchRecord[]));
    if (!data || data.length < pageSize) break;
  }

  return records;
}

export async function loadOperationalReport(filters: ReportFilters): Promise<OperationalReport> {
  const supabase = createClient();
  const { data: sheets, error: sheetsError } = await supabase
    .from("daily_sheets")
    .select("id")
    .gte("date", filters.startDate)
    .lte("date", filters.endDate)
    .eq("region", filters.region)
    .order("date");

  if (sheetsError) throw new Error(sheetsError.message);
  const sheetIds = (sheets || []).map((sheet) => sheet.id);
  if (!sheetIds.length) return aggregateOperationalReport([], new Map(), new Map(), 0);

  const [dispatches, driversResult, locationsResult] = await Promise.all([
    fetchAllDispatches(sheetIds),
    supabase.from("drivers").select("id,name,login_matricula"),
    supabase.from("locations").select("id,name"),
  ]);

  if (driversResult.error) throw new Error(driversResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);

  const driversById = new Map(
    (driversResult.data || []).map((driver) => [driver.id, { name: driver.name, login_matricula: driver.login_matricula }])
  );
  const locationsById = new Map((locationsResult.data || []).map((location) => [location.id, location.name]));
  return aggregateOperationalReport(dispatches, driversById, locationsById, sheetIds.length);
}

export async function exportOperationalReport(report: OperationalReport, filters: ReportFilters) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Acionamento Logístico";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 4 }] });
  summary.addRow(["RELATÓRIO OPERACIONAL"]);
  summary.mergeCells("A1:D1");
  summary.addRow(["Período", `${filters.startDate} a ${filters.endDate}`, "Região", filters.region]);
  summary.addRow(["Folhas", report.sheetCount, "Linhas operacionais", report.totalRows]);
  summary.addRow([]);
  summary.addRow(["Indicador", "Valor"]);
  summary.addRows([
    ["Status preenchido", report.filledStatuses],
    ["Jornadas concluídas", report.completedJourneys],
    ["Jornadas em andamento", report.ongoingJourneys],
    ["Média de jornada", formatMinutesForExport(report.averageWorkedMinutes)],
    ["Jornadas acima de 11h10", report.longJourneys],
  ]);
  summary.addRow([]);
  summary.addRow(["Status", "Quantidade", "Participação"]);
  for (const item of report.statuses) summary.addRow([item.status, item.count, item.share / 100]);
  summary.addRow([]);
  summary.addRow(["Destino", "Registros"]);
  for (const item of report.destinations) summary.addRow([item.name, item.count]);
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 20;
  summary.getColumn(3).width = 20;
  summary.getColumn(4).width = 16;

  const drivers = workbook.addWorksheet("Condutores", { views: [{ state: "frozen", ySplit: 1 }] });
  drivers.addRow(["Condutor", "Login", "Status preenchido", "Jornadas concluídas", "Horas trabalhadas", "Acima de 11h10"]);
  report.drivers.forEach((driver) => drivers.addRow([
    driver.driver,
    driver.login,
    driver.dispatches,
    driver.completedJourneys,
    formatMinutesForExport(driver.workedMinutes),
    driver.longJourneys,
  ]));
  drivers.autoFilter = "A1:F1";
  drivers.columns = [{ width: 38 }, { width: 14 }, { width: 20 }, { width: 22 }, { width: 20 }, { width: 18 }];

  for (const worksheet of [summary, drivers]) {
    worksheet.eachRow((row) => row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    }));
    const headerRows = worksheet === summary ? [1, 5, 12, 14 + report.statuses.length] : [1];
    headerRows.forEach((rowNumber) => {
      worksheet.getRow(rowNumber).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF107C41" } };
      });
    });
  }
  summary.getRow(1).height = 24;
  summary.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  summary.getColumn(3).numFmt = "0.0%";

  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio_${filters.region}_${filters.startDate}_${filters.endDate}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatMinutesForExport(minutes: number | null) {
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
