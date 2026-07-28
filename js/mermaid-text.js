/**
 * Utilitários de limpeza/minificação de código Mermaid.
 * Conservador: preserva conteúdo dentro de aspas.
 */

function stripInlineComment(line) {
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";

    if (ch === '"' && prev !== "\\" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'" && prev !== "\\" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (!inDouble && !inSingle && ch === "%" && line[i + 1] === "%") {
      return line.slice(0, i).trimEnd();
    }
  }

  return line;
}

/** Remove comentários `%%` (linha inteira ou final de linha). */
export function removeComments(source) {
  const lines = source.split(/\r?\n/u);
  const out = [];

  for (const line of lines) {
    if (line.trimStart().startsWith("%%")) {
      continue;
    }
    out.push(stripInlineComment(line));
  }

  return out.join("\n").replace(/\n{3,}/gu, "\n\n");
}

function collapseSpacesOutsideQuotes(line) {
  let out = "";
  let inDouble = false;
  let inSingle = false;
  let prevSpace = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";

    if (ch === '"' && prev !== "\\" && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      prevSpace = false;
      continue;
    }
    if (ch === "'" && prev !== "\\" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
      prevSpace = false;
      continue;
    }

    if (!inDouble && !inSingle && /\s/u.test(ch)) {
      if (!prevSpace && out.length > 0) {
        out += " ";
        prevSpace = true;
      }
      continue;
    }

    out += ch;
    prevSpace = false;
  }

  return out.trim();
}

/**
 * Minifica: remove comentários, linhas vazias, indentação
 * e espaços repetidos fora de aspas.
 */
export function minifyMermaid(source) {
  return removeComments(source)
    .split(/\r?\n/u)
    .map((line) => collapseSpacesOutsideQuotes(line))
    .filter((line) => line.length > 0)
    .join("\n");
}

const INDENT = "    ";

const BLOCK_OPEN = /^(?:subgraph|section)\b/iu;

/** `end` de subgraph (não confunde com `end Note` de sequenceDiagram). */
function isSubgraphEnd(line) {
  if (/^end\s+(?:Note|note|loop|alt|opt|par|critical|break|rect|and|else)\b/iu.test(line)) {
    return false;
  }
  return /^end(?:\s+\S+)?\s*$/iu.test(line);
}

/**
 * Insere quebras antes de keywords de bloco coladas na mesma linha
 * (fora de aspas).
 */
function breakInlineBlockKeywords(line) {
  let out = "";
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";

    if (ch === '"' && prev !== "\\" && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === "'" && prev !== "\\" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
      continue;
    }

    if (!inDouble && !inSingle && out.trim().length > 0) {
      const rest = line.slice(i);
      if (
        /^(?:subgraph|section|direction|classDef)\b/iu.test(rest) ||
        (isSubgraphEnd(rest.trim()) && /^(?:end)\b/iu.test(rest))
      ) {
        out += "\n";
      }
    }

    out += ch;
  }

  return out.split("\n").map((part) => part.trim()).filter(Boolean);
}

/**
 * Formata: desfaz indentação zerada do minify e realinha
 * aninhamento `subgraph` / `section` → `end`.
 */
export function formatMermaid(source) {
  const rawLines = String(source || "")
    .replace(/\r\n?/gu, "\n")
    .split("\n");

  const statements = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (statements.length > 0 && statements[statements.length - 1] !== "") {
        statements.push("");
      }
      continue;
    }
    statements.push(...breakInlineBlockKeywords(trimmed));
  }

  let depth = 0;
  const out = [];

  for (const statement of statements) {
    if (statement === "") {
      if (out.length > 0 && out[out.length - 1] !== "") {
        out.push("");
      }
      continue;
    }

    if (isSubgraphEnd(statement)) {
      depth = Math.max(0, depth - 1);
    }

    out.push(INDENT.repeat(depth) + statement);

    if (BLOCK_OPEN.test(statement)) {
      depth += 1;
    }
  }

  return out.join("\n").replace(/\n{3,}/gu, "\n\n").replace(/^\n+|\n+$/gu, "");
}
