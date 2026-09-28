// Excel quotes cells containing tabs, line breaks or quotes when copying a range.
export function parseGridClipboard(text: string): string[][] {
  if (!text) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (quoted || cell === "") {
        quoted = !quoted;
      } else {
        cell += character;
      }
    } else if (!quoted && character === "\t") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" && text[index + 1] === "\n") {
      if (quoted) cell += "\n";
      else {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      index++;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell !== "" || row.length) rows.push([...row, cell]);
  return rows;
}
