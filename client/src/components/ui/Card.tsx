import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiImage } from "react-icons/fi";
import type { SearchResult } from "../../../../shared/types.js";
import { useSourcesStore } from "../../store/sources.js";
import { decodeHtml } from "../../lib/htmlUtils.js";
import { formatDate } from "../../lib/dateUtils.js";
import { API } from "../../lib/api.js";
import MicroLabel from "./MicroLabel.js";

type Props = { item: SearchResult };

export default function Card({ item }: Props) {
  const location = useLocation();
  const source   = useSourcesStore(state => state.sources.find(src => src.id === item.sourceId));
  const sourceColor = source?.color;
  const sourceLang  = source?.language ?? "id";

  const [isImageFailed, setIsImageFailed] = useState(false);
  const [extra, setExtra] = useState<Pick<SearchResult, "cover" | "latestChapter" | "seriesUpdatedAt"> | null>(null);

  useEffect(() => {
    if (item.cover && item.latestChapter != null && item.seriesUpdatedAt) return;
    let cancelled = false;
    API.titleInfo(item.sourceId, item.id)
      .then(info => {
        if (!cancelled && info) {
          setExtra({
            cover: item.cover || info.cover,
            latestChapter: info.latestChapter ?? item.latestChapter,
            seriesUpdatedAt: item.seriesUpdatedAt || info.seriesUpdatedAt,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.sourceId, item.id, item.cover, item.latestChapter, item.seriesUpdatedAt]);

  const cover           = extra?.cover ?? item.cover;
  const latestChapter   = extra?.latestChapter ?? item.latestChapter;
  const seriesUpdatedAt = extra?.seriesUpdatedAt ?? item.seriesUpdatedAt;
  const title         = decodeHtml(item.title);

  return (
    <Link
      to={`/detail/${item.sourceId}/${encodeURIComponent(item.id)}`}
      state={{ ...item, _back: location.pathname + location.search }}
      className="group block"
    >
      <div className="rounded-card-outer bg-panel p-card-inset transition-all duration-300 ease-out group-hover:bg-panel-hover">
        <div className="rounded-card-inner border border-dashed border-edge overflow-hidden group-hover:border-edge-bright transition-colors duration-300">

          <div className="relative aspect-[2/3] bg-panel">
            {cover && !isImageFailed ? (
              <img
                src={cover}
                alt={item.title}
                loading="lazy"
                decoding="async"
                onError={() => setIsImageFailed(true)}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300 select-none"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <FiImage size={24} className="text-foreground/10" />
                <span className="text-xs text-foreground/20 uppercase tracking-wider">No cover</span>
              </div>
            )}

            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.50) 30%, transparent 60%)" }}
            />

            <div className="absolute top-2 left-2 flex items-center gap-1">
              <MicroLabel
                variant="badge"
                className="backdrop-blur-sm"
                style={sourceColor
                  ? { borderColor: `${sourceColor}99`, color: "#fff", backgroundColor: `${sourceColor}77` }
                  : undefined}
              >
                {item.sourceId}
              </MicroLabel>
              <MicroLabel variant="badge" color="faint" className="backdrop-blur-sm">
                {sourceLang}
              </MicroLabel>
            </div>

            <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 text-center">
              <p className="text-[11px] font-bold leading-snug text-white/90 line-clamp-2">
                {title}
              </p>
            </div>
          </div>

          <div className="border-t border-dashed border-edge">
            <div className="flex items-center justify-between px-3 py-2">
              {latestChapter != null ? (
                <span className="text-[10px] font-semibold text-foreground/65 truncate">
                  Chapter {latestChapter}
                </span>
              ) : (
                <span className="text-[10px] text-foreground/25">-</span>
              )}
              {latestChapter != null && (
                <span className="text-[10px] text-foreground/35 shrink-0 ml-2">
                  {formatDate(seriesUpdatedAt)}
                </span>
              )}
            </div>
          </div>

        </div>
      </div>
    </Link>
  );
}
