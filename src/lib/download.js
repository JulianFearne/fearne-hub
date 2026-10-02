// src/lib/download.js
// Hand the browser a file to save, built from text in memory.

export function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One CSV line, quoting anything with a comma, quote or line break. */
export const csvLine = (cells) =>
  cells
    .map((c) => {
      const v = c == null ? "" : String(c);
      return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(",");
