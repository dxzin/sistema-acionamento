import ExcelJS from "exceljs";

function cellValue(value) {
  if (value && typeof value === "object" && "result" in value) return value.result ?? null;
  if (value && typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  return value ?? null;
}

export async function readWorksheetRows(workbookPath, worksheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.getWorksheet(worksheetName);
  if (!worksheet) throw new Error(`Aba não encontrada: ${worksheetName}`);
  const rows = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    rows.push(Array.from({ length: worksheet.columnCount }, (_, index) => cellValue(row.getCell(index + 1).value)));
  }
  return rows;
}

export async function readWorksheetObjects(workbookPath, worksheetName) {
  const rows = await readWorksheetRows(workbookPath, worksheetName);
  const headers = (rows.shift() || []).map((value) => String(value ?? "").trim());
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}
