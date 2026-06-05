export function isLoopbackIp(ip: string | undefined): boolean {
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}

export function isPrivateIpv4(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "255.255.255.255") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.") || ip.startsWith("0.")) return true;
  if (ip.startsWith("192.0.2.") || ip.startsWith("198.51.100.") || ip.startsWith("203.0.113.")) return true;
  // RFC 6890 IETF Protocol Assignments and deprecated 6to4 relay anycast - rarely public, blocked defensively.
  if (ip.startsWith("192.0.0.") || ip.startsWith("192.88.99.")) return true;
  if (ip.startsWith("198.18.") || ip.startsWith("198.19.")) return true;
  const m172 = ip.match(/^172\.(\d+)\./);
  if (m172) { const octet = parseInt(m172[1], 10); if (octet >= 16 && octet <= 31) return true; }
  const m100 = ip.match(/^100\.(\d+)\./);
  if (m100) { const octet = parseInt(m100[1], 10); if (octet >= 64 && octet <= 127) return true; }
  const firstOctet = parseInt(ip.split(".")[0], 10);
  if (firstOctet >= 240) return true;
  return false;
}

export function isPrivateIp(ip: string): boolean {
  // Covers ::1, 0:0:0:0:0:0:0:1, ::0:1, 0:0::1, and other compressed forms of loopback.
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1" || ip === "::" || /^0*(:0*)*:0*1$/i.test(ip)) return true;
  if (/^f[cd]/i.test(ip) || /^fe80/i.test(ip)) return true;
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) return isPrivateIpv4(v4mapped[1]);
  const hexMapped = ip.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
  if (hexMapped) {
    const highWord = parseInt(hexMapped[1], 16);
    const lowWord = parseInt(hexMapped[2], 16);
    return isPrivateIpv4(`${highWord >> 8}.${highWord & 0xff}.${lowWord >> 8}.${lowWord & 0xff}`);
  }
  // 6to4: 2002:xxyy:zzww:: embeds IPv4 xx.yy.zz.ww - check the embedded address.
  const sixToFour = ip.match(/^2002:([0-9a-f]{2})([0-9a-f]{2}):([0-9a-f]{2})([0-9a-f]{2}):/i);
  if (sixToFour) {
    const embedded = `${parseInt(sixToFour[1], 16)}.${parseInt(sixToFour[2], 16)}.${parseInt(sixToFour[3], 16)}.${parseInt(sixToFour[4], 16)}`;
    return isPrivateIpv4(embedded);
  }
  // All private IPv6 ranges are handled above. Do not fall through to IPv4 path (parseInt misclassifies hextets).
  if (ip.includes(":")) return false;
  return isPrivateIpv4(ip);
}

export function isPrivateUrl(urlStr: string): boolean {
  let parsed: URL;
  // Fail closed: treat an unparseable URL as private so callers reject rather than forward malformed input.
  try { parsed = new URL(urlStr); } catch { return true; }
  const raw = parsed.hostname;
  const host = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (host === "localhost") return true;
  return isPrivateIp(host);
}
