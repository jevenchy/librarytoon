export function pageNumbers(current: number, total: number, compact = false): (number | "...")[] {
  if (compact) {
    const start = Math.max(1, current - 1);
    const end   = Math.min(total, current + 1);
    return Array.from({ length: end - start + 1 }, (_slot, idx) => start + idx);
  }
  if (total <= 7) return Array.from({ length: total }, (_slot, idx) => idx + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}
