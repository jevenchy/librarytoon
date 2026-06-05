import * as cheerio from "cheerio";
import type { Page, SourceConfig } from "../../../shared/types.js";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import { fixUrl, getFetchOpts, extractTsReaderImages, proxyPageImage, processImageUrl, capHtml } from "../shared.js";
import { rkBase, wpApiPath, chapterEndpoint, shouldRunReaderKiru } from "./index.js";

async function rkPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  type RkImg = { page: number; url: string };
  type RkPageRes = { ok: boolean; images?: RkImg[] };
  const res = await fetchJson<RkPageRes>(
    `${cfg.baseUrl}${rkBase(cfg)}/chapter/${chapterId}`,
    getFetchOpts(cfg, "pages", {
      headers: { "Accept": "application/json" },
      retries: 2
    })
  );
  if (!res?.ok || !Array.isArray(res.images) || res.images.length === 0) return [];
  return res.images.map((img, idx) => {
    const imageUrl = img.url.startsWith("http") ? img.url : `https:${img.url}`;
    return { chapterId, imageUrl: proxyPageImage(processImageUrl(imageUrl, cfg), cfg), index: idx };
  });
}

export async function wordpressPages(cfg: SourceConfig, chapterId: string, signal?: AbortSignal): Promise<Page[]> {
  const isRkEnabled = /^\d+$/.test(chapterId) && shouldRunReaderKiru(cfg);
  if (isRkEnabled) {
    try {
      const rkResult = await rkPages(cfg, chapterId);
      if (rkResult.length > 0) return rkResult;
      if (cfg.wordpress?.readerKiru === true) return [];
    } catch (err) {
      if (cfg.wordpress?.readerKiru === true) throw err;
    }
  }
  if (cfg.wordpress?.readerKiru === true) return [];

  if (/^\d+$/.test(chapterId) && cfg.wordpress?.theme !== "comicsera") {
    try {
      const apiPath = wpApiPath(cfg);
      type WpChapter = { content: { rendered: string } };
      const post = await fetchJson<WpChapter>(
        `${cfg.baseUrl}${apiPath}/${chapterEndpoint(cfg)}/${chapterId}`,
        getFetchOpts(cfg, "pages", { retries: 2 })
      );
      if (post?.content?.rendered) {
        const $ = cheerio.load(post.content.rendered);
        const images: string[] = [];
        $("img").each((_slot, el) => {
          const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
          if (src && !src.includes("data:image")) images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
        });
        if (images.length > 0) return images.map((imageUrl, idx) => ({ chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: idx }));
      }
    } catch {
      // REST API chapter request failed or returned empty content. Falls back to direct HTML scrape of the reader page.
    }
  }

  const url = `${cfg.baseUrl}/${chapterId}/`;
  const html = capHtml(await fetchText(url, getFetchOpts(cfg, "pages", { retries: 2 }, signal)));

  const tsPages = extractTsReaderImages(html, chapterId);
  if (tsPages) return tsPages.map(page => ({ ...page, imageUrl: proxyPageImage(processImageUrl(page.imageUrl, cfg), cfg) }));

  const $ = cheerio.load(html);
  const images: string[] = [];

  $([
    "#Baca_Komik img",".main-reading-area img",
    ".reading-content img","#readerarea img",
    ".chapter_ #chapter_body img"
  ].join(",")).each((_slot, el) => {
    const src =
      $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src") ?? "";
    if (src && !src.includes("data:image") && src.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
      images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
    }
  });

  return images.map((imageUrl, idx) => ({ chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: idx }));
}
