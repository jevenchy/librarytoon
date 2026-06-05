type Props = { size?: "sm" | "md" };

export default function Spinner({ size = "md" }: Props) {
  const cls = size === "sm"
    ? "w-3 h-3 border"
    : "w-4 h-4 border-[1.5px]";
  return (
    <span className={`block rounded-full animate-spin border-foreground/15 border-t-foreground/50 ${cls}`} />
  );
}
