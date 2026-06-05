import * as cheerio from "cheerio";
import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import { fixUrl, getFetchOpts, proxyCover, capHtml, derivePattern } from "../shared.js";
import { htmlTitleInfo } from "../html/index.js";
import { extractYoastCover, wpApiPath, seriesEndpoint, shouldRunReaderKiru, rkSeriesDetail, type WpPost } from "./index.js";

function parseClassList(classList: string[] = []): Pick<SearchResult, "genres" | "type"> {
  const genres: string[] = [];
  let type: string | undefined;
  for (const cls of classList) {
    if      (cls.startsWith("tipe-")) type = cls.slice(5);
    else if (cls.startsWith("genre-") && !cls.startsWith("genreutama-")) {
      genres.push(cls.slice(6).replace(/-/g, " "));
    }
  }
  return { genres: genres.length ? genres : undefined, type };
}

export async function wordpressEnrichTitleFromBareArray(
  cfg: SourceConfig,
  titleId: string
): Promise<{ seriesUpdatedAt?: string; alternativeTitle?: string }> {
  const wpPost = await fetchJson<Record<string, unknown>>(
    `${cfg.baseUrl}${wpApiPath(cfg)}/${seriesEndpoint(cfg)}/${titleId}`,
    getFetchOpts(cfg, "search", { timeout: 5000, retries: 0 })
  );
  const seriesUpdatedAt = typeof wpPost?.modified_gmt === "string" ? wpPost.modified_gmt : undefined;
  if (typeof wpPost?.slug !== "string") return { seriesUpdatedAt };

  const seriesPrefix = derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix;
  const htmlPage = capHtml(await fetchText(
    `${cfg.baseUrl}${seriesPrefix}${encodeURIComponent(wpPost.slug as string)}/`,
    getFetchOpts(cfg, "search", { timeout: 5000, retries: 0 })
  ));
  const $page = cheerio.load(htmlPage);
  let alternativeTitle: string | undefined;
  $page("tr,li,.info-row").each((_slot, el) => {
    if (!/[Aa]lternatif/.test($page(el).text())) return;
    const candidate = $page(el).find("span,td,div,a").last().text().trim();
    if (candidate && !/[Aa]lternatif/.test(candidate)) {
      alternativeTitle = candidate;
      return false as const;
    }
  });
  return { seriesUpdatedAt, alternativeTitle };
}

export async function wordpressTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const isRkEnabled = shouldRunReaderKiru(cfg);
  if (isRkEnabled) {
    try {
      const rkResult = await rkSeriesDetail(cfg, titleId);
      if (rkResult) return rkResult;
      if (cfg.wordpress?.readerKiru === true) return null;
    } catch (err) {
      if (cfg.wordpress?.readerKiru === true) throw err;
    }
  }
  if (cfg.wordpress?.readerKiru === true) return null;

  let htmlResult: SearchResult | null = null;
  try { htmlResult = await htmlTitleInfo(cfg, titleId); } catch { /* html unavailable */ }

  if (cfg.wordpress?.theme === "comicsera") {
    return htmlResult;
  }

  const apiPath = wpApiPath(cfg);
  const list = await fetchJson<WpPost[]>(
    `${cfg.baseUrl}${apiPath}/${seriesEndpoint(cfg)}`,
    getFetchOpts(cfg, "search", {
      params: { slug: titleId, per_page: 1, _fields: "slug,title,link,excerpt,yoast_head,class_list,modified_gmt" },
      retries: 2
    })
  );

  if (!Array.isArray(list) || list.length === 0) {
    return htmlResult;
  }
  const post = list[0];
  const wpTitle = post.title?.rendered?.trim() ?? "";
  if (!wpTitle) return htmlResult;

  const coverUrl = (cfg.wordpress?.yoastCover !== false) ? extractYoastCover(post.yoast_head) : "";
  const wpCover = coverUrl ? proxyCover(fixUrl(coverUrl, cfg.baseUrl, cfg), cfg) : "";
  const rawExcerpt = post.excerpt?.rendered ?? "";
  const wpDesc = rawExcerpt ? cheerio.load(rawExcerpt).text().trim() : undefined;
  const { genres: wpGenres, type: wpType } = parseClassList(post.class_list);

  return {
    ...(htmlResult ?? { id: titleId, cover: "", sourceId: cfg.id }),
    title:            wpTitle,
    cover:            htmlResult?.cover || wpCover || "",
    description:      htmlResult?.description || wpDesc || undefined,
    genres:           htmlResult?.genres?.length ? htmlResult.genres : wpGenres,
    type:             htmlResult?.type  || wpType,
    seriesUpdatedAt:  htmlResult?.seriesUpdatedAt || post.modified_gmt || undefined,
    alternativeTitle: htmlResult?.alternativeTitle,
  };
}
