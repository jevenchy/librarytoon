import { useEffect, useState } from "react";

const QUERY = "(min-width: 640px)";
const WIDE_SIZE = 28;
const NARROW_SIZE = 8;

export function usePageSize(): number {
  const [size, setSize] = useState(() =>
    window.matchMedia(QUERY).matches ? WIDE_SIZE : NARROW_SIZE
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => setSize(event.matches ? WIDE_SIZE : NARROW_SIZE);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return size;
}
