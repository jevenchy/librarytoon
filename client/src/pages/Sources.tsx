import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiX, FiGlobe, FiCopy, FiCheck } from "react-icons/fi";
import type { ScrapingMethod } from "../../../shared/types.js";
import { useSourcesStore } from "../store/sources.js";
import { useUiStore } from "../store/ui.js";
import MicroLabel, { type BadgeColor } from "../components/ui/MicroLabel.js";

const METHOD_COLOR: Record<ScrapingMethod, BadgeColor> = {
  html:      "sky",
  wordpress: "violet",
  api:       "amber",
};

const METHOD_LABEL: Record<ScrapingMethod, string> = {
  html:      "HTML",
  wordpress: "WP",
  api:       "API",
};

const REQ_COLOR: Record<string, BadgeColor> = {
  all:      "faint",
  html:     "sky",
  api:      "amber",
  wp:       "violet",
  optional: "faint",
};

const TEMPLATE = `{
  "$schema":       "../../shared/sources.schema.json",
  "id":            "yoursource",
  "baseUrl":       "https://example.com",
  "method":        "html | wordpress | api",
  "urlFormat":     "slug | numeric | uuid",
  "seriesUrl":     "/series/",
  "chapterUrl":    "/chapter/",
  "apiBase":       "https://api.example.com",
  "proxyImages":   true,
  "color":         "#000000",
  "contentRating": "sfw | nsfw",
  "language":      "id",
  "enabled":       false
}`;

export default function Sources() {
  const sources  = useSourcesStore(state => state.sources);
  const language        = useUiStore(state => state.language);
  const setLanguage     = useUiStore(state => state.setLanguage);
  const contentRating   = useUiStore(state => state.contentRating);
  const setContentRating = useUiStore(state => state.setContentRating);

  const filteredSources = useMemo(() =>
    sources.filter(source => (source.language ?? "id") === language && (source.contentRating ?? "sfw") === contentRating),
  [sources, language, contentRating]);

  useEffect(() => {
    document.title = "Sources - Librarytoon";
    return () => { document.title = "Librarytoon"; };
  }, []);

  const [isPrInfoVisible, setIsPrInfoVisible] = useState(false);
  const [isCopied, setIsCopied]         = useState(false);

  const addSourceBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef        = useRef<HTMLDivElement>(null);

  const closePrInfo = useCallback(() => {
    setIsPrInfoVisible(false);
    addSourceBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isPrInfoVisible) return;
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closePrInfo(); return; }
      if (event.key !== "Tab") return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [isPrInfoVisible, closePrInfo]);

  function handleCopy() {
    navigator.clipboard.writeText(TEMPLATE)
      .then(() => setIsCopied(true))
      .catch(() => {})
      .finally(() => setTimeout(() => setIsCopied(false), 2000));
  }

  return (
    <div className="min-h-full bg-bg flex flex-col overflow-x-hidden">

      <div className="border-b-2 border-dashed border-edge">
        <div className="mx-auto w-full max-w-content px-6 py-6 flex items-center justify-between gap-4">
          <h1 className="page-title flex items-center gap-2">
            <FiGlobe size={20} className="text-foreground/40" aria-hidden />
            Sources
          </h1>
          <span className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLanguage(language === "id" ? "en" : "id")}
              aria-label={`Language: ${language.toUpperCase()} (click to switch)`}
              className="text-sm font-semibold text-foreground/55 hover:text-foreground/80 active:text-foreground/80 transition-colors min-w-[1.5rem] text-center"
            >
              {language.toUpperCase()}
            </button>
            <span aria-hidden className="text-foreground/30 text-sm">|</span>
            <button
              onClick={() => setContentRating(contentRating === "sfw" ? "nsfw" : "sfw")}
              aria-label={`Content rating: ${contentRating.toUpperCase()} (click to switch)`}
              className={`text-sm font-semibold transition-colors min-w-[2.5rem] text-center ${
                contentRating === "nsfw" ? "text-foreground/80" : "text-foreground/55 hover:text-foreground/80 active:text-foreground/80"
              }`}
            >
              {contentRating.toUpperCase()}
            </button>
            <span aria-hidden className="text-foreground/30 text-sm">|</span>
            <span className="text-sm font-semibold text-foreground/55">
              {filteredSources.length} source{filteredSources.length === 1 ? "" : "s"}
            </span>
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-content px-6 pt-8 pb-20">

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            <button
              ref={addSourceBtnRef}
              onClick={() => setIsPrInfoVisible(true)}
              aria-haspopup="dialog"
              className="flex flex-col items-center justify-center gap-2 rounded-card-outer
                         bg-panel p-2 group transition-colors hover:bg-panel-hover"
            >
              <div className="w-full h-full rounded-card-inner border-2 border-dashed border-edge-bright
                              flex flex-col items-center justify-center gap-2 p-5">
                <FiPlus size={16} className="text-foreground/50" />
                <span className="text-sm text-foreground/85">Add Source</span>
              </div>
            </button>

            {filteredSources.map(source => (
              <div
                key={source.id}
                className="rounded-card-outer bg-panel p-2 transition-colors"
              >
                <div className={`flex flex-col justify-center gap-3 rounded-card-inner border-2 border-dashed border-edge-bright p-4 h-full ${source.enabled ? "" : "opacity-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FiGlobe
                        size={16}
                        className="shrink-0 text-foreground/60"
                      />
                      <h3 className="text-base font-bold text-foreground/85 leading-tight truncate">
                        {source.name ?? source.id.charAt(0).toUpperCase() + source.id.slice(1)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {source.language && (
                        <MicroLabel variant="badge">{source.language.toUpperCase()}</MicroLabel>
                      )}
                      {source.contentRating && (
                        <MicroLabel variant="badge">{source.contentRating.toUpperCase()}</MicroLabel>
                      )}
                      <MicroLabel variant="badge" color={source.enabled ? "ok" : "faint"}>
                        {source.enabled ? "ACTIVE" : "INACTIVE"}
                      </MicroLabel>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-foreground/55 shrink-0">Base URL</span>
                    <span className="font-data text-foreground/55 truncate text-right">{source.baseUrl}</span>
                  </div>

                  {source.method && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground/55 shrink-0">Method</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {source.urlFormat && (
                          <MicroLabel variant="badge" color="faint">{source.urlFormat.toUpperCase()}</MicroLabel>
                        )}
                        <MicroLabel variant="badge" color={METHOD_COLOR[source.method]}>{METHOD_LABEL[source.method]}</MicroLabel>
                      </div>
                    </div>
                  )}

                  {source.note && (
                    <p className="text-xs text-foreground/50">{source.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {isPrInfoVisible && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={closePrInfo}
          >
            <div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-source-title"
              className="rounded-card-outer bg-panel p-2 max-w-2xl w-full"
              style={{ animation: "modal-in 0.2s ease-out" }}
              onClick={event => event.stopPropagation()}
            >
              <div className="rounded-card-inner border-2 border-dashed border-edge-bright overflow-y-auto max-h-[85vh]">

                <div className="px-5">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <h3 id="add-source-title" className="text-base font-bold text-foreground/85">Add a New Source</h3>
                    <button
                      onClick={closePrInfo}
                      className="text-foreground/30 hover:text-foreground/60 transition-colors shrink-0"
                      aria-label="Close"
                    >
                      <FiX size={16} />
                    </button>
                  </div>
                  <div className="flex items-start gap-3 py-2.5 border-b-2 border-dashed border-edge-bright">
                    <p className="text-xs text-foreground/50 leading-relaxed">
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

                <div className="px-5">
                  <div className="flex items-center gap-3 py-2.5">
                    <h4 className="section-eyebrow">File</h4>
                  </div>
                  <div className="flex items-start gap-3 py-2.5 border-b-2 border-dashed border-edge-bright">
                    <span className="font-data text-xs text-foreground/65 w-28 shrink-0 leading-relaxed">&lt;id&gt;.json</span>
                    <MicroLabel variant="badge" color="ok" className="shrink-0 text-center mt-0.5">required</MicroLabel>
                    <span className="text-xs text-foreground/40 leading-relaxed">Config file for the new source. Use the template below.</span>
                  </div>
                </div>

                <div className="px-5">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <h4 className="section-eyebrow">Template</h4>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
                      aria-label="Copy template"
                    >
                      {isCopied
                        ? <FiCheck size={14} className="text-foreground" />
                        : <FiCopy size={14} />}
                      <span>{isCopied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <div className="pb-2.5">
                    <p className="text-xs text-foreground/50 leading-relaxed">
                      Read the full{" "}
                      <a href="https://github.com/jevenchy/librarytoon/blob/main/server/sources/template.jsonc"
                         target="_blank" rel="noreferrer"
                         className="text-foreground/60 hover:text-foreground/80 underline underline-offset-2 transition-colors">
                        TEMPLATE
                      </a>{" "}
                      for all annotated options.
                    </p>
                  </div>
                  <div className="py-2.5 border-b-2 border-dashed border-edge-bright">
                    <pre className="bg-bg border-2 border-dashed border-edge-bright rounded-card-inner px-4 py-3
                                    font-data text-xs text-foreground/55 overflow-auto max-h-44 leading-relaxed">{TEMPLATE}</pre>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3">
                  <h4 className="section-eyebrow">Field Reference</h4>
                  <div>
                    {([
                      { field: "id",            req: "all",      desc: "Lowercase slug. Used as the JSON file name and routing key." },
                      { field: "baseUrl",       req: "all",      desc: "Public website base URL. No trailing slash." },
                      { field: "method",        req: "all",      desc: "html  /  wordpress  /  api" },
                      { field: "urlFormat",     req: "all",      desc: "slug  /  numeric  /  uuid" },
                      { field: "seriesUrl",     req: "html",     desc: "Path prefix for series pages (e.g. /manga/)." },
                      { field: "chapterUrl",    req: "html",     desc: "Path prefix for chapter pages (e.g. /chapter/)." },
                      { field: "apiBase",       req: "api",      desc: "API base URL when it differs from baseUrl." },
                      { field: "api",           req: "api",      desc: "searchEndpoints  /  chapterEndpoints  /  fieldMap" },
                      { field: "wordpress",     req: "wp",       desc: "theme  /  seriesEndpoint  /  chapterEndpoint" },
                      { field: "proxyImages",   req: "optional", desc: "Route images via /api/img - bypasses ISP DNS block via DoH." },
                      { field: "color",         req: "optional", desc: "Hex color for the source badge (e.g. #6366f1)." },
                      { field: "contentRating", req: "optional", desc: "sfw  /  nsfw" },
                      { field: "language",      req: "optional", desc: "ISO 639-1 language code of the source content (e.g. id, en)." },
                      { field: "enabled",       req: "all",      desc: "Set true only after manual testing to activate the source." },
                    ] as { field: string; req: string; desc: string }[]).map(({ field, req, desc }, idx, arr) => (
                      <div key={field} className={`flex items-start gap-3 py-2.5 ${idx < arr.length - 1 ? "border-b-2 border-dashed border-edge-bright" : ""}`}>
                        <span className="font-data text-xs text-foreground/65 w-28 shrink-0 leading-relaxed">{field}</span>
                        <MicroLabel
                          variant="badge"
                          color={REQ_COLOR[req] ?? "faint"}
                          className="shrink-0 text-center mt-0.5"
                        >{req}</MicroLabel>
                        <span className="text-xs text-foreground/50 leading-relaxed">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
