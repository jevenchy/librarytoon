const colors = {
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

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** Format a meta object as  key=value key=value (dim) */
function metaStr(meta: unknown): string {
  if (meta === undefined || meta === null) return "";
  if (typeof meta === "string") return ` ${colors.dim}${meta}${colors.reset}`;
  if (typeof meta !== "object") return ` ${colors.dim}${String(meta)}${colors.reset}`;
  try {
    const parts = Object.entries(meta as Record<string, unknown>)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("  ");
    return parts ? ` ${colors.dim}${parts}${colors.reset}` : "";
  } catch {
    return "";
  }
}

function line(color: string, tag: string, msg: string, meta?: unknown): string {
  return (
    `${colors.dim}${timestamp()}${colors.reset} ` +
    `${color}${colors.bright}[${tag}]${colors.reset} ` +
    `${msg}` +
    metaStr(meta)
  );
}

// Tag detector: picks tag and color from message key prefix
type TagInfo = { tag: string; color: string };

function detectTag(msg: string): TagInfo {
  if (msg.startsWith("server_") || msg.startsWith("request_"))
    return { tag: "SERVER",  color: colors.white };
  if (msg.startsWith("ws_"))
    return { tag: "WS",      color: colors.cyan };
  if (msg.startsWith("doh_"))
    return { tag: "DoH",     color: colors.orange };
  if (msg.startsWith("health_"))
    return { tag: "HEALTH",  color: colors.brightGreen };
  if (msg.startsWith("fetch_"))
    return { tag: "FETCH",   color: colors.yellow };
  if (msg.startsWith("search_") || msg.startsWith("chapters_") || msg.startsWith("pages_"))
    return { tag: "SCRAPER", color: colors.magenta };
  if (msg.startsWith("global_search_"))
    return { tag: "SEARCH",  color: colors.brightCyan };
  if (msg.startsWith("adapter_") || msg.startsWith("configurable_"))
    return { tag: "ADAPTER", color: colors.blue };
  return { tag: "INFO",    color: colors.white };
}

export const logger = {

  info(msg: string, meta?: unknown): void {
    const { tag, color } = detectTag(msg);
    console.log(line(color, tag, msg, meta));
  },

  warn(msg: string, meta?: unknown): void {
    const { tag } = detectTag(msg);
    console.warn(line(colors.yellow, tag, msg, meta));
  },

  error(msg: string, meta?: unknown): void {
    console.error(line(colors.red, "ERROR", msg));
    if (meta !== undefined) {
      const detail =
        (meta as any)?.stack ??
        (meta as any)?.message ??
        (typeof meta === "string" ? meta : JSON.stringify(meta));
      console.error(`${colors.dim}  ${detail}${colors.reset}`);
    }
  },

  debug(msg: string, meta?: unknown): void {
    if (process.env.DEBUG) {
      console.log(line(colors.dim, "DEBUG", msg, meta));
    }
  },

  // Named shortcuts
  server:  (msg: string) => console.log(line(colors.white,       "SERVER",  msg)),
  ws:      (msg: string) => console.log(line(colors.cyan,        "WS",      msg)),
  doh:     (msg: string) => console.log(line(colors.orange,      "DoH",     msg)),
  fetch:   (msg: string) => console.log(line(colors.yellow,      "FETCH",   msg)),
  scraper: (msg: string) => console.log(line(colors.magenta,     "SCRAPER", msg)),
  adapter: (msg: string) => console.log(line(colors.blue,        "ADAPTER", msg)),
  health:  (msg: string) => console.log(line(colors.brightGreen, "HEALTH",  msg)),

  banner(title: string, subtitle?: string): void {
    console.log();
    console.log(`${colors.bright}${colors.brightCyan}${title}${colors.reset}`);
    if (subtitle) console.log(`${colors.dim}${subtitle}${colors.reset}`);
    console.log();
  },
};
