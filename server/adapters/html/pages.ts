import type { Page, SourceConfig } from "../../../shared/types.js";
import { fetchText } from "../../services/fetchService.js";
import {
  fixUrl, getFetchOpts, buildUrl, encodePathSegments,
  extractTsReaderImages, proxyPageImage, processImageUrl, capHtml
} from "../shared.js";
import { loadHtml, decodeNextRscStream } from "./index.js";

const DEFAULT_PAGE_IMAGE =
  "#Baca_Komik img,.ts-main-image,#readerarea img,.reading-content img" +
  ",.main-reading-area img,#chapter_body img,#chapter-images img,.reader-area img";
const DEFAULT_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const DEFAULT_IMAGE_EXCLUDE = ["logo", "icon", "avatar"];
const IMAGE_EXT_RE_CACHE = new Map<string, RegExp>();

export function clearImageExtReCache(): void { IMAGE_EXT_RE_CACHE.clear(); }

function imageExtRe(cfg: SourceConfig): RegExp {
  const cached = IMAGE_EXT_RE_CACHE.get(cfg.id);
  if (cached) return cached;
  const exts = cfg.images?.extensions ?? DEFAULT_IMAGE_EXTENSIONS;
  const re = new RegExp(`\\.(${exts.join("|")})`, "i");
  IMAGE_EXT_RE_CACHE.set(cfg.id, re);
  return re;
}

function isExcludedImage(src: string, cfg: SourceConfig): boolean {
  const kw = cfg.images?.excludeKeywords ?? DEFAULT_IMAGE_EXCLUDE;
  return kw.some(keyword => src.includes(keyword));
}

export async function htmlPages(cfg: SourceConfig, chapterId: string, signal?: AbortSignal): Promise<Page[]> {
  const compSep = chapterId.indexOf("/");
  const url = compSep !== -1
    ? `${cfg.baseUrl.replace(/\/$/, "")}/${encodePathSegments(chapterId)}${cfg.chapterUrl.endsWith("/") ? "/" : ""}`
    : buildUrl(cfg, cfg.chapterUrl, chapterId);
  const html = capHtml(await fetchText(url, getFetchOpts(cfg, "pages", { retries: 2 }, signal)));

  if (cfg.nextRsc) {
    const rscPages = extractNextRscPages(html, chapterId, cfg);
    if (rscPages.length > 0) return rscPages;
  }

  const tsPages = extractTsReaderImages(html, chapterId);
  if (tsPages) return tsPages.map(page => ({ ...page, imageUrl: proxyPageImage(processImageUrl(page.imageUrl, cfg), cfg) }));

  const $ = await loadHtml(html);
  const images: string[] = [];
  const extRe  = imageExtRe(cfg);
  const imgAttr = cfg.selectors?.imageAttr;
  const pageImageSel = cfg.selectors?.pageImage ?? DEFAULT_PAGE_IMAGE;

  $(pageImageSel).each((_slot, el) => {
    const src = imgAttr
      ? ($(el).attr(imgAttr) ?? "")
      : ($(el).attr("data-src") ?? $(el).attr("data-lazy-src") ?? $(el).attr("src") ?? "");
    if (src && !src.includes("data:image") && (imgAttr || src.match(extRe))) {
      const wAttr = $(el).attr("width");
      if (wAttr) {
        const width = parseInt(wAttr, 10);
        if (!Number.isNaN(width) && width < (cfg.images?.minWidth ?? 100)) return;
      }
      images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
    }
  });

  // Lazy-loaded images via data-src - CDN URLs may have no file extension
  if (images.length === 0) {
    $("#content-reader img[data-src], .carousel-item img[data-src]").each((_slot, el) => {
      const src = $(el).attr("data-src") ?? "";
      if (src && src.startsWith("http")) images.push(processImageUrl(src, cfg));
    });
  }

  if (images.length === 0) {
    $("img").each((_slot, el) => {
      const src = $(el).attr("data-src") ?? $(el).attr("src") ?? "";
      if (src && src.match(extRe) && !isExcludedImage(src, cfg)) {
        const wAttr = $(el).attr("width");
        if (wAttr) {
          const width = parseInt(wAttr, 10);
          if (!Number.isNaN(width) && width < (cfg.images?.minWidth ?? 100)) return;
        }
        images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
      }
    });
  }

  return images.map((imageUrl, idx) => ({ chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: idx }));
}

// RSC sources: pages[] with relative imageUrl live in self.__next_f.
export function extractNextRscPages(html: string, chapterId: string, cfg: SourceConfig): Page[] {
  const decoded = decodeNextRscStream(html);
  const found: { pageNum: number; url: string }[] = [];
  const seen = new Set<number>();
  const re = /"pageNumber":(\d+),"imageUrl":"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(decoded)) !== null) {
    const pageNum = Number(match[1]);
    if (!match[2] || seen.has(pageNum)) continue;
    seen.add(pageNum);
    found.push({ pageNum, url: match[2] });
  }
  found.sort((page1, page2) => page1.pageNum - page2.pageNum);
  return found.map((page, idx) => ({
    chapterId,
    imageUrl: proxyPageImage(fixUrl(processImageUrl(page.url, cfg), cfg.baseUrl, cfg), cfg),
    index: idx,
  }));
}
