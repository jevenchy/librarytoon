import * as cheerio from "cheerio";

export type CssRule = {
  kind: "css";
  selector: string;
  attr?: string;
  output?: "text" | "html" | "outerHtml";
  multiple?: boolean;
  transform?: (value: string) => string;
};

export type RegexRule = {
  kind: "regex";
  pattern: RegExp;
  group?: number;
  multiple?: boolean;
  transform?: (value: string) => string;
};

export type JsonRule = {
  kind: "json";
  scriptSelector?: string;
  jsonPath: string[];
  transform?: (value: unknown) => string;
};

export type ExtractionRule = CssRule | RegexRule | JsonRule;
export type ExtractionStrategy = { rules: ExtractionRule[] };

export function extract(html: string, strategy: ExtractionStrategy): string[] {
  for (const rule of strategy.rules) {
    try {
      const result = runRule(html, rule);
      if (result.length > 0) return result;
    } catch {
      continue;
    }
  }
  return [];
}

function runRule(html: string, rule: ExtractionRule): string[] {
  if (rule.kind === "css") return runCss(html, rule);
  if (rule.kind === "regex") return runRegex(html, rule);
  return runJson(html, rule);
}

function runCss(html: string, rule: CssRule): string[] {
  const $ = cheerio.load(html);
  const results: string[] = [];
  $(rule.selector).each((_, el) => {
    const node = $(el);
    let value = rule.attr
      ? (node.attr(rule.attr) ?? "")
      : rule.output === "html"
        ? (node.html() ?? "")
        : rule.output === "outerHtml"
          ? $.html(node)
          : node.text();
    value = value.trim();
    if (rule.transform) value = rule.transform(value);
    if (value) results.push(value);
    if (!rule.multiple && results.length > 0) return false;
    return undefined;
  });
  return results;
}

function runRegex(html: string, rule: RegexRule): string[] {
  const results: string[] = [];
  if (rule.multiple) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
    const re = new RegExp(rule.pattern.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const v = m[rule.group ?? 1] ?? "";
      const out = rule.transform ? rule.transform(v) : v;
      if (out) results.push(out);
    }
  } else {
    const m = rule.pattern.exec(html);
    if (m) {
      const v = m[rule.group ?? 1] ?? "";
      const out = rule.transform ? rule.transform(v) : v;
      if (out) results.push(out);
    }
  }
  return results;
}

function runJson(html: string, rule: JsonRule): string[] {
  let payload: string | undefined;
  if (rule.scriptSelector) {
    const $ = cheerio.load(html);
    payload = $(rule.scriptSelector).first().html() ?? undefined;
  } else {
    payload = html;
  }
  if (!payload) return [];
  const parsed = JSON.parse(payload);
  const value = walkPath(parsed, rule.jsonPath);
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => (rule.transform ? rule.transform(v) : String(v))).filter(Boolean);
  }
  const out = rule.transform ? rule.transform(value) : String(value);
  return out ? [out] : [];
}

function walkPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(key);
      if (!Number.isNaN(idx)) { cur = cur[idx]; continue; }
      cur = cur.map((c) => (c as Record<string, unknown>)?.[key]);
      continue;
    }
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[key];
      continue;
    }
    return undefined;
  }
  return cur;
}

export function absUrl(base: string, href: string): string {
  if (!href) return "";
  try { return new URL(href, base).toString(); }
  catch { return href; }
}
