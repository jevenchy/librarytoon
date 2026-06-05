export const COLORS = {
  reset:         "\x1b[0m",
  dim:           "\x1b[2m",
  bright:        "\x1b[1m",
  red:           "\x1b[31m",
  green:         "\x1b[32m",
  yellow:        "\x1b[33m",
  blue:          "\x1b[34m",
  magenta:       "\x1b[35m",
  cyan:          "\x1b[36m",
  white:         "\x1b[37m",
  brightGreen:   "\x1b[92m",
  brightMagenta: "\x1b[95m",
  brightCyan:    "\x1b[96m",
  orange:        "\x1b[38;5;208m",
  brown:         "\x1b[38;5;130m",
};

const JSON_MODE = process.env.LOG_FORMAT === "json";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function metaStr(meta: unknown): string {
  if (meta === undefined || meta === null) return "";
  if (typeof meta === "string") return ` ${COLORS.dim}${meta}${COLORS.reset}`;
  if (typeof meta !== "object") return ` ${COLORS.dim}${String(meta)}${COLORS.reset}`;
  try {
    const parts = Object.entries(meta as Record<string, unknown>)
      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
      .join("  ");
    return parts ? ` ${COLORS.dim}${parts}${COLORS.reset}` : "";
  } catch {
    return "";
  }
}

function line(color: string, tag: string, msg: string, meta?: unknown): string {
  return (
    `${COLORS.dim}${timestamp()}${COLORS.reset} ` +
    `${color}${COLORS.bright}[${tag}]${COLORS.reset} ` +
    `${msg}` +
    metaStr(meta)
  );
}

function jsonLine(level: string, tag: string, msg: string, meta?: unknown): string {
  const base: Record<string, unknown> = { time: Date.now(), level, tag, msg };
  if (meta !== undefined && meta !== null) {
    if (typeof meta === "object") Object.assign(base, meta);
    else base.detail = meta;
  }
  return JSON.stringify(base);
}

type TagInfo = { tag: string; color: string };

function detectTag(msg: string): TagInfo {
  if (msg.startsWith("server_") || msg.startsWith("request_"))
    return { tag: "SERVER",  color: COLORS.white };
  if (msg.startsWith("doh_"))
    return { tag: "DoH",     color: COLORS.orange };
  if (msg.startsWith("fetch_"))
    return { tag: "FETCH",   color: COLORS.yellow };
  if (msg.startsWith("search_") || msg.startsWith("chapters_") || msg.startsWith("pages_"))
    return { tag: "SCRAPER", color: COLORS.magenta };
  if (msg.startsWith("global_search_"))
    return { tag: "SEARCH",  color: COLORS.brightCyan };
  if (msg.startsWith("adapter_") || msg.startsWith("configurable_"))
    return { tag: "ADAPTER", color: COLORS.blue };
  return { tag: "INFO",    color: COLORS.white };
}

export const LOGGER = {

  info(msg: string, meta?: unknown): void {
    const { tag, color } = detectTag(msg);
    if (JSON_MODE) { console.log(jsonLine("info", tag, msg, meta)); return; }
    console.log(line(color, tag, msg, meta));
  },

  warn(msg: string, meta?: unknown): void {
    const { tag } = detectTag(msg);
    if (JSON_MODE) { console.warn(jsonLine("warn", tag, msg, meta)); return; }
    console.warn(line(COLORS.yellow, tag, msg, meta));
  },

  error(msg: string, meta?: unknown): void {
    if (JSON_MODE) {
      const detail = meta instanceof Error
        ? { error: meta.message, stack: meta.stack }
        : meta;
      console.error(jsonLine("error", "ERROR", msg, detail));
      return;
    }
    const inlineMeta = meta instanceof Error
      ? { error: meta.message, stack: meta.stack }
      : meta;
    console.error(line(COLORS.red, "ERROR", msg, inlineMeta));
  },

  debug(msg: string, meta?: unknown): void {
    if (process.env.DEBUG) {
      if (JSON_MODE) { console.log(jsonLine("debug", "DEBUG", msg, meta)); return; }
      console.log(line(COLORS.dim, "DEBUG", msg, meta));
    }
  },

  server:  (msg: string) => JSON_MODE ? console.log(jsonLine("info", "SERVER", msg)) : console.log(line(COLORS.white,       "SERVER",  msg)),
  doh:     (msg: string) => JSON_MODE ? console.log(jsonLine("info", "DoH",    msg)) : console.log(line(COLORS.orange,      "DoH",     msg)),
  audit:   (msg: string, meta?: unknown) => JSON_MODE ? console.log(jsonLine("info", "AUDIT", msg, meta)) : console.log(line(COLORS.brightCyan, "AUDIT", msg, meta)),
};
