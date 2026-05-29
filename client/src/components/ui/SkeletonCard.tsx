export default function SkeletonCard() {
  return (
    <div>
      <div className="rounded-3xl bg-panel p-[3px]">
        <div className="rounded-[20px] border border-dashed border-edge overflow-hidden">
          <div className="aspect-[2/3] skeleton-shimmer" />
        </div>
      </div>
      <div className="mt-2 h-3 rounded skeleton-shimmer w-4/5" />
      <div className="mt-1.5 h-3 rounded skeleton-shimmer w-3/5" />
    </div>
  );
}
