function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract one generated BGP protocol block from a complete BIRD config. */
export function extractBgpProtocolConfig(config: unknown, protocolName: unknown): string | null {
  const source = String(config ?? "");
  const name = String(protocolName ?? "").trim();
  if (!source || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  const marker = new RegExp(`^[ \\t]*protocol\\s+bgp\\s+${escapeRegExp(name)}\\s*\\{`, "m").exec(source);
  if (!marker || marker.index < 0) return null;
  const start = marker.index;
  const openingBrace = source.indexOf("{", start);
  if (openingBrace < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "#") {
      lineComment = true;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).trim();
    }
  }
  return null;
}
