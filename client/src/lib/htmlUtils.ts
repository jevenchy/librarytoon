const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeHtml(str: string): string {
  return str
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, match => ENTITY_MAP[match] ?? match)
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}
