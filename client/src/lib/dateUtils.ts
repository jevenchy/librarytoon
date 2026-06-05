export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffH  = Math.floor(diffMs / 3_600_000);
  const diffD  = Math.floor(diffMs / 86_400_000);

  if (diffH <  1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    ...(diffD >= 365 ? { year: "numeric" } : {}),
  });
}
