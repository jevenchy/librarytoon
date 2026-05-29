import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiImage } from "react-icons/fi";
import type { SearchResult } from "../../../../shared/types.js";
import { useSourcesStore } from "../../store/sources.js";
import { api } from "../../lib/api.js";
import MicroLabel from "./MicroLabel.js";

type Props = { item: SearchResult };

function decodeHtml(str: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

export default function Card({ item }: Props) {
  const location = useLocation();
  const sourceColor = useSourcesStore(s => s.sources.find(x => x.id === item.sourceId)?.color);
  const isDown  = useSourcesStore(s => s.downSources.has(item.sourceId));
  const markDown = useSourcesStore(s => s.markDown);
  const label = item.sourceId;

  const [fetchedCount, setFetchedCount] = useState<number | null>(null);
  const [imgFailed, setImgFailed]       = useState(false);

  useEffect(() => {
    if (item.latestChapter != null) return;
    let cancelled = false;
    api.chapters(item.sourceId, item.id)
      .then(chs => { if (!cancelled) setFetchedCount(chs.length); })
      .catch((err: unknown) => {
        if (!cancelled && String(err).toLowerCase().includes("down")) markDown(item.sourceId);
      });
    return () => { cancelled = true; };
  }, [item.sourceId, item.id, item.latestChapter, markDown]);

  return (
    <Link
      to={`/source/${item.sourceId}/${encodeURIComponent(item.id)}`}
      state={{ ...item, _back: location.pathname + location.search }}
      className="group block"
    >
      {/* Outer blueprint shell */}
      <div
        className="rounded-3xl bg-panel p-[3px]
                   transition-all duration-300 ease-out
                   group-hover:bg-panel-hover
                   "
      >
        {/* Inner dashed border, brightens on hover */}
        <div
          className="rounded-[20px] border border-dashed border-edge overflow-hidden
                     group-hover:border-edge-bright transition-colors duration-300"
        >
          {/* Thumbnail */}
          <div className="relative aspect-[2/3] bg-panel">
            {item.cover && !imgFailed ? (
              <img
                src={item.cover}
                alt={item.title}
                loading="lazy"
                decoding="async"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover transition-opacity duration-300
                           opacity-80 group-hover:opacity-100 select-none"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <FiImage size={24} className="text-foreground/10" />
                <span className="text-xs text-foreground/20 uppercase tracking-wider">No cover</span>
              </div>
            )}

            {/* Gradient scrim */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.60) 22%, transparent 52%)"
              }}
            />

            {/* Source badge, top-left */}
            <MicroLabel
              variant="badge"
              className="absolute top-2 left-2 backdrop-blur-sm"
              style={sourceColor
                ? { borderColor: `${sourceColor}99`, color: "#fff", backgroundColor: `${sourceColor}77` }
                : undefined
              }
            >
              {label}
            </MicroLabel>

            {/* Down badge, top-right */}
            {isDown && (
              <MicroLabel
                variant="badge"
                color="danger"
                className="absolute top-2 right-2 backdrop-blur-sm"
              >
                down
              </MicroLabel>
            )}

            {/* Chapter banner, bottom */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/50 backdrop-blur-sm">
              <span className="text-xs font-bold uppercase tracking-wide leading-none text-white/50">
                Total Chapter
              </span>
              <span className="font-data text-xs font-bold uppercase tracking-wide leading-none text-white/80">
                {item.latestChapter != null
                  ? item.latestChapter
                  : fetchedCount != null
                  ? fetchedCount
                  : "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Title */}
      <p
        className="mt-2 px-0.5 text-[12px] font-medium leading-snug title-clamp
                   text-foreground/70 group-hover:text-foreground/90 transition-colors duration-200"
      >
        {decodeHtml(item.title)}
      </p>
    </Link>
  );
}
