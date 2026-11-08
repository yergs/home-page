/** A small CSV reader and writer: quoted fields, doubled quotes, CRLF, and a leading BOM. */

/** Parses CSV text into rows of fields. Blank lines are skipped. */
export const parseCsv = (input: string): ReadonlyArray<ReadonlyArray<string>> => {
  const text = input.startsWith("﻿") ? input.slice(1) : input;
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === '"' && text.charAt(i + 1) === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c !== "\r") {
      field += c;
    }
  }
  endRow();
  return rows;
};

const quote = (field: string): string =>
  /[",\n\r]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;

/** Writes rows as CSV text, quoting fields that need it. */
export const toCsv = (rows: ReadonlyArray<ReadonlyArray<string>>): string =>
  rows.map((row) => row.map(quote).join(",")).join("\n") + (rows.length > 0 ? "\n" : "");
