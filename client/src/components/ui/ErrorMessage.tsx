import type { ReactNode } from "react";
import { FiWifiOff } from "react-icons/fi";

type Props = {
  message: string;
  className?: string;
  action?: ReactNode;
};

function friendlyError(err: string): string {
  if (err.includes("ECONNREFUSED") || err.includes("ENOTFOUND") || err.includes("unreachable"))
    return "Source Unreachable";
  if (err.includes("network") || err.includes("fetch"))
    return "Network Error";
  if (err.includes("404") || err.includes("not found"))
    return "Content Not Found";
  if (err.includes("429"))
    return "Rate Limited";
  return "Load Failed";
}

export default function ErrorMessage({ message, className, action }: Props) {
  return (
    <div className={`rounded-card-outer bg-panel p-2 transition-colors ${className ?? ""}`}>
      <div className="rounded-card-inner border-2 border-dashed border-edge-bright p-8 flex flex-col items-center gap-3">
        <FiWifiOff size={32} className="text-foreground/20" />
        <p className="text-sm text-foreground/60 text-center">{friendlyError(message)}</p>
        {action}
      </div>
    </div>
  );
}
