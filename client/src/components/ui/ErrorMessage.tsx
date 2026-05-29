import { FiWifiOff } from "react-icons/fi";

interface ErrorMessageProps {
  message: string;
  sourceId?: string;
  className?: string;
}

function friendlyError(err: string, sourceId?: string): string {
  const src = sourceId ?? "Source";
  if (err.includes("timeout") || err.includes("ETIMEDOUT"))
    return `${src} is not responding. It may be temporarily down.`;
  if (err.includes("unreachable") || err.includes("ECONNREFUSED") || err.includes("ENOTFOUND"))
    return `Cannot reach ${src}. Try again later.`;
  if (err.includes("network") || err.includes("fetch"))
    return `Could not reach ${src}.`;
  if (err.includes("404") || err.includes("not found")) return "Content not found on this source.";
  if (err.includes("429"))                               return "Source rate-limited. Try again in a moment.";
  return "An error occurred while loading this content.";
}

export default function ErrorMessage({ message, sourceId, className }: ErrorMessageProps) {
  return (
    <div className={`rounded-3xl bg-panel p-2 ${className ?? ""}`}>
      <div className="rounded-2xl border border-dashed border-edge-bright p-6 flex flex-col items-center gap-2">
        <FiWifiOff size={20} className="text-foreground/20" />
        <p className="text-sm text-foreground/40 text-center">{friendlyError(message, sourceId)}</p>
      </div>
    </div>
  );
}
