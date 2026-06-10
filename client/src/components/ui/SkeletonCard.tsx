export default function SkeletonCard() {
  return (
    <div className="rounded-card-outer bg-panel p-2 transition-colors">
      <div className="rounded-card-inner border-2 border-dashed border-edge-dim overflow-hidden transition-colors">
        <div className="aspect-[3/4] skeleton-shimmer" />
        <div className="border-t-2 border-dashed border-edge-dim transition-colors">
          <div className="flex items-center justify-between px-2.5 py-2">
            <div className="h-3 rounded skeleton-shimmer w-2/5" />
            <div className="h-3 rounded skeleton-shimmer w-1/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
