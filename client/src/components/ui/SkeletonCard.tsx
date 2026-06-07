export default function SkeletonCard() {
  return (
    <div className="rounded-card-outer bg-panel p-card-inset transition-colors">
      <div className="rounded-card-inner border border-dashed border-edge overflow-hidden transition-colors">
        <div className="aspect-[2/3] skeleton-shimmer" />
        <div className="border-t border-dashed border-edge transition-colors">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="h-[15px] rounded skeleton-shimmer w-2/5" />
            <div className="h-[15px] rounded skeleton-shimmer w-1/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
