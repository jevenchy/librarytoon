import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiPlus, FiX, FiGlobe, FiCopy, FiCheck, FiChevronLeft } from "react-icons/fi";
import { api } from "../lib/api.js";
import { useSourcesStore } from "../store/sources.js";
import type { HealthSnapshot, ScrapingMethod, SourceConfig, SourceHealth } from "../../../shared/types.js";
import MicroLabel, { type BadgeColor } from "../components/ui/MicroLabel.js";

const METHOD_COLOR: Record<ScrapingMethod, BadgeColor> = {
  html:      "sky",
  wordpress: "violet",
  api:       "amber",
  graphql:   "orange",
  nextjs:    "teal",
  nuxtjs:    "ok",
};

const METHOD_LABEL: Record<ScrapingMethod, string> = {
  html:      "HTML",
  wordpress: "WP REST",
  api:       "API",
  graphql:   "GraphQL",
  nextjs:    "NextJS",
  nuxtjs:    "NuxtJS",
};

const REQ_COLOR: Record<string, BadgeColor> = {
  all:      "faint",
  html:     "sky",
  api:      "amber",
  wp:       "violet",
  optional: "faint",
};

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "checking...";
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function SkeletonConfigCard() {
  return (
    <div className="rounded-3xl bg-panel p-2">
      <div className="flex flex-col rounded-2xl border border-dashed border-edge p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-[14px] h-[14px] rounded-full skeleton-shimmer" />
            <div className="h-5 w-24 rounded skeleton-shimmer" />
          </div>
          <div className="h-5 w-16 rounded-full skeleton-shimmer" />
        </div>
        {/* Middle Stats Grid */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-dashed border-edge mb-3">
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-3 w-10 rounded skeleton-shimmer" />
            <div className="h-4 w-12 rounded skeleton-shimmer" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-3 w-8 rounded skeleton-shimmer" />
            <div className="h-4 w-10 rounded skeleton-shimmer" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-3 w-12 rounded skeleton-shimmer" />
            <div className="h-4 w-14 rounded skeleton-shimmer" />
          </div>
        </div>
        {/* Bottom Data Rows */}
        <div className="space-y-2 mb-3">
          <div className="flex justify-between">
            <div className="h-3 w-16 rounded skeleton-shimmer" />
            <div className="h-3 w-28 rounded skeleton-shimmer" />
          </div>
          <div className="flex justify-between">
            <div className="h-3 w-20 rounded skeleton-shimmer" />
            <div className="h-3 w-24 rounded skeleton-shimmer" />
          </div>
        </div>
        {/* Lower Badges */}
        <div className="flex gap-1.5 mt-auto">
          <div className="h-4.5 w-14 rounded skeleton-shimmer" />
          <div className="h-4.5 w-12 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

interface ConfigCardProps {
  config:      SourceConfig;
  health?:     SourceHealth;
  resolvedIp?: string;
  isDown?:     boolean;
}

function ConfigCard({ config, health, resolvedIp, isDown }: ConfigCardProps) {
  const method  = config.method  ?? "html";
  const urlFmt  = config.urlFormat ?? "slug";

  const ms      = health?.ms ?? null;
  const status  = health?.status ?? null;

  const msColor =
    !status || status === "error" ? "text-danger"
    : status === "ok"             ? "text-ok"
    :                               "text-warn";

  const remaining = health ? Math.max(0, health.nextCheckAt - Date.now()) : null;
  const countdown = remaining !== null ? formatCountdown(remaining) : null;

  return (
    <div className={`rounded-3xl bg-panel p-2 transition-opacity ${config.enabled ? "" : "opacity-55"}`}>
      <div
        className={`flex flex-col rounded-2xl border border-dashed p-5 ${
          config.enabled ? "border-edge-bright" : "border-edge"
        }`}
      >

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <FiGlobe
              size={14}
              className="shrink-0"
              style={config.color ? { color: config.color } : { color: "hsl(var(--c-foreground) / 0.5)" }}
            />

            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground/85 truncate leading-tight">
                {config.name ?? config.id.charAt(0).toUpperCase() + config.id.slice(1)}
              </h3>

            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isDown && (
              <MicroLabel
                variant="badge"
                color="danger"
              >
                down
              </MicroLabel>
            )}
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
              config.enabled ? "bg-ok/20 text-ok" : "bg-foreground/10 text-foreground/30"
            }`}>
              {config.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        <div
          className={`grid grid-cols-3 items-start gap-2 py-3 border-y border-dashed mb-3 ${
            config.enabled ? "border-edge-bright" : "border-edge"
          }`}
        >
          <div className="text-center">
            <p className="text-xs text-foreground/40 mb-1">Status</p>
            <p className={`text-sm font-semibold font-data ${!status ? "text-foreground/25" : msColor}`}>
              {!status ? "-" : status === "ok" ? "OK" : status === "error" ? "ERR" : "WARN"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-foreground/40 mb-1">Ping</p>
            <p className={`text-sm font-semibold font-data ${health ? msColor : "text-foreground/25"}`}>
              {health ? (ms !== null ? `${ms}ms` : "-") : "..."}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-foreground/40 mb-1">Recheck</p>
            <p className="text-sm font-semibold font-data text-foreground/30">
              {countdown ?? "-"}
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-foreground/40 shrink-0">Base URL</span>
            <span className="font-data text-foreground/50 truncate text-right">{config.baseUrl}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-foreground/40 shrink-0">Resolved IP</span>
            <span className="font-data text-foreground/30">{resolvedIp ?? "-"}</span>
          </div>
          {config.customHeaders && Object.keys(config.customHeaders).length > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-foreground/40 shrink-0">Headers</span>
              <span className="font-data text-foreground/30">
                {Object.keys(config.customHeaders).length} custom header{Object.keys(config.customHeaders).length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <MicroLabel variant="badge" color={METHOD_COLOR[method]}>{METHOD_LABEL[method]}</MicroLabel>
          <MicroLabel variant="badge">{urlFmt}</MicroLabel>
          {config.searchParam && (
            <MicroLabel variant="badge" mono>?{config.searchParam}=</MicroLabel>
          )}
          {config.proxyImages && (
            <MicroLabel variant="badge">proxy img</MicroLabel>
          )}
          {(config.titleAfterPipe || config.titleFromPipe) && (
            <MicroLabel variant="badge">strip prefix</MicroLabel>
          )}
        </div>

      </div>
    </div>
  );
}

const TEMPLATE = `{
  "id":            "yoursource",
  "baseUrl":       "https://example.com",
  "method":        "html | wordpress | api | graphql | nextjs | nuxtjs",
  "urlFormat":     "slug | numeric",
  "seriesUrl":     "https://example.com/series/example-title/",
  "chapterUrl":    "https://example.com/chapter/example-1/",
  "apiBase":       "https://api.example.com",
  "language":      "id",
  "contentRating": "sfw | nsfw | mixed",
  "color":         "#000000",
  "proxyImages":   true,
  "enabled":       false
}`;

export default function Sources() {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "Sources - Librarytoon";
    return () => { document.title = "Librarytoon"; };
  }, []);

  const syncDown = useSourcesStore(s => s.syncDown);

  const [configs, setConfigs]       = useState<SourceConfig[]>([]);
  const [snapshot, setSnapshot]     = useState<HealthSnapshot | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showPrInfo, setShowPrInfo] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [, setTick]                 = useState(0);

  function handleCopy() {
    navigator.clipboard.writeText(TEMPLATE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([api.sourceConfigs.list(), api.health()])
      .then(([cfgs, snap]) => { setConfigs(cfgs); setSnapshot(snap); syncDown(snap.circuitOpen); })
      .finally(() => setLoading(false));
  }, [syncDown]);

  useEffect(() => {
    if (!snapshot) return;
    const values = Object.values(snapshot.sources);
    if (values.length === 0) return;
    const minNext = Math.min(...values.map(s => s.nextCheckAt));
    const delay   = Math.max(5_000, minNext - Date.now() + 2_000);
    const id = setTimeout(() => {
      api.health().then(snap => { setSnapshot(snap); syncDown(snap.circuitOpen); }).catch(() => {});
    }, delay);
    return () => clearTimeout(id);
  }, [snapshot, syncDown]);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-content px-6 py-10">

      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiChevronLeft size={14} />
            Back
          </button>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Sources</h1>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          Sources are stored as individual JSON files in{" "}
          <a
            href="https://github.com/jevenchy/librarytoon"
            target="_blank"
            rel="noreferrer"
            className="text-foreground/80 hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Librarytoon
          </a>.
        </p>
      </div>

      <section>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonConfigCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <button
              onClick={() => setShowPrInfo(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-3xl
                         bg-panel p-2 group transition-colors hover:bg-panel-hover"
            >
              <div className="w-full h-full rounded-2xl border border-dashed border-edge-bright
                              flex flex-col items-center justify-center gap-2 p-5">
                <FiPlus size={14} className="text-foreground/50" />
                <span className="text-xs text-foreground/85">Add Source</span>
              </div>
            </button>

            {configs.map(cfg => {
              const hostname   = hostnameOf(cfg.apiBase || cfg.baseUrl);
              const resolvedIp = snapshot?.doh[hostname];
              const health     = snapshot?.sources[cfg.id];
              const isDown     = snapshot?.circuitOpen.includes(cfg.id) ?? false;
              return (
                <ConfigCard
                  key={cfg.id}
                  config={cfg}
                  health={health}
                  resolvedIp={resolvedIp}
                  isDown={isDown}
                />
              );
            })}
          </div>
        )}
      </section>

      {showPrInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
          onClick={() => setShowPrInfo(false)}
        >
          <div
            className="rounded-3xl bg-panel p-2 max-w-2xl w-full"
            style={{ animation: "modal-in 0.2s ease-out" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="rounded-2xl border border-dashed border-edge-bright overflow-y-auto max-h-[85vh]">

              {/* Header */}
              <div className="px-5">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <h3 className="text-sm font-bold text-foreground/85">Add a New Source</h3>
                  <button
                    onClick={() => setShowPrInfo(false)}
                    className="text-foreground/30 hover:text-foreground/60 transition-colors shrink-0"
                    aria-label="Close"
                  >
                    <FiX size={16} />
                  </button>
                </div>
                <div className="flex items-start gap-3 py-2.5 border-b border-dashed border-edge-bright">
                  <p className="text-xs text-foreground/40 leading-relaxed">
                    Add a source, submit a{" "}
                    <a href="https://github.com/jevenchy/librarytoon/pulls" target="_blank" rel="noreferrer"
                       className="text-foreground/60 hover:text-foreground/80 underline underline-offset-2 transition-colors">
                      pull request
                    </a>.{" "}
                    Request a source or report an issue,{" "}
                    <a href="https://github.com/jevenchy/librarytoon/issues" target="_blank" rel="noreferrer"
                       className="text-foreground/60 hover:text-foreground/80 underline underline-offset-2 transition-colors">
                      open an issue
                    </a>.
                  </p>
                </div>
              </div>

              {/* Files */}
              <div className="px-5">
                <div className="flex items-center gap-3 py-2.5">
                  <h4 className="text-sm font-bold text-foreground/85">File</h4>
                </div>
                <div className="flex items-start gap-3 py-2.5 border-b border-dashed border-edge-bright">
                  <span className="font-data text-xs text-foreground/65 w-28 shrink-0 leading-relaxed">&lt;id&gt;.json</span>
                  <MicroLabel variant="badge" color="ok" className="shrink-0 w-16 text-center mt-[3px]">required</MicroLabel>
                  <span className="text-xs text-foreground/40 leading-relaxed">Config file for the new source. Use the template below.</span>
                </div>
              </div>

              {/* Template */}
              <div className="px-5">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <h4 className="text-sm font-bold text-foreground/85">Template - simple</h4>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
                    aria-label="Copy template"
                  >
                    {copied
                      ? <FiCheck size={14} className="text-ok" />
                      : <FiCopy size={14} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div className="pb-2.5">
                  <p className="text-xs text-foreground/40 leading-relaxed">
                    Read the full{" "}
                    <a href="https://github.com/jevenchy/librarytoon/blob/main/server/sources/TEMPLATE.jsonc"
                       target="_blank" rel="noreferrer"
                       className="text-foreground/60 hover:text-foreground/80 underline underline-offset-2 transition-colors">
                      TEMPLATE.jsonc
                    </a>{" "}
                    for all annotated options.
                  </p>
                </div>
                <div className="py-2.5 border-b border-dashed border-edge-bright">
                  <pre className="bg-bg border border-dashed border-edge-bright rounded-2xl px-4 py-3
                                  font-data text-xs text-foreground/55 overflow-auto max-h-44 leading-relaxed">{TEMPLATE}</pre>
                </div>
              </div>

              {/* Field Reference */}
              <div className="px-5 py-4 space-y-3">
                <h4 className="text-sm font-bold text-foreground/85">Field Reference</h4>
                <div>
                  {([
                    { field: "id",            req: "all",      desc: "Lowercase slug. Used as the JSON file name and routing key." },
                    { field: "baseUrl",       req: "all",      desc: "Public website base URL. No trailing slash." },
                    { field: "method",        req: "all",      desc: "html  /  wordpress  /  api  /  graphql  /  nextjs  /  nuxtjs" },
                    { field: "urlFormat",     req: "all",      desc: "slug  /  numeric" },
                    { field: "seriesUrl",     req: "html",     desc: "Example series page URL used to auto-detect URL patterns." },
                    { field: "chapterUrl",    req: "html",     desc: "Example chapter page URL used to auto-detect URL patterns." },
                    { field: "apiBase",       req: "api",      label: "api  /  gql", desc: "API base URL when it differs from baseUrl." },
                    { field: "language",      req: "optional", desc: "ISO 639-1 language code of the source content (e.g. id, en)." },
                    { field: "contentRating", req: "optional", desc: "sfw  /  nsfw  /  mixed" },
                    { field: "color",         req: "optional", desc: "Hex color for the source badge (e.g. #6366f1)." },
                    { field: "searchParam",   req: "optional", desc: "Search query param name override (e.g. q, title, keyword)." },
                    { field: "proxyImages",   req: "optional", desc: "Route images via /api/img - bypasses ISP DNS block via DoH." },
                    { field: "titleFromPipe", req: "optional", desc: "Extract title from the segment after \" | \" in the <title> tag." },
                    { field: "wpReaderKiru",  req: "wp",       desc: "auto  /  true  /  false - controls use of the ReaderKiru custom API." },
                    { field: "apiEnvelope",   req: "api",      desc: "auto  /  retcode  /  success  /  wrapped  /  bare  /  laravel" },
                    { field: "apiPagination", req: "api",      desc: "page  /  offset  /  cursor  /  none" },
                    { field: "enabled",       req: "all",      desc: "Set true only after manual testing to activate the source." },
                  ] as { field: string; req: string; label?: string; desc: string }[]).map(({ field, req, label, desc }, i, arr) => (
                    <div key={field} className={`flex items-start gap-3 py-2.5 ${i < arr.length - 1 ? "border-b border-dashed border-edge-bright" : ""}`}>
                      <span className="font-data text-xs text-foreground/65 w-28 shrink-0 leading-relaxed">{field}</span>
                      <MicroLabel
                        variant="badge"
                        color={REQ_COLOR[req] ?? "faint"}
                        className="shrink-0 w-16 text-center mt-[3px]"
                      >{label ?? req}</MicroLabel>
                      <span className="text-xs text-foreground/40 leading-relaxed">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
