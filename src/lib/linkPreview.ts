// Podgląd linków w czacie: wykrywanie URL-i w treści + wyciąganie metadanych
// Open Graph ze strony (to czyta serwer w /api/link-preview; przeglądarka nie może
// przez CORS). Czysta logika — testy w linkPreview.test.ts.

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
};

// http(s)://… do białego znaku; końcowa interpunkcja zdania („zobacz x.pl.") nie
// należy do linku. Nawias zamykający zostaje tylko do pary z otwierającym
// (Wikipedia: …/Foo_(bar)), nadmiarowe to nawias zdania.
const URL_RE = /https?:\/\/[^\s<>"]+/gi;

function trimUrl(raw: string): string {
  let u = raw.replace(/[.,;:!?'"»]+$/, '');
  const count = (c: string) => u.split(c).length - 1;
  while (u.endsWith(')') && count(')') > count('(')) u = u.slice(0, -1).replace(/[.,;:!?'"»]+$/, '');
  return u;
}

// Tekst pocięty na kawałki: zwykły tekst i linki (do renderowania klikalnych <a>).
export function splitLinks(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function firstUrl(text: string): string | null {
  return splitLinks(text).find((p) => p.href)?.href ?? null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// <meta property="og:title" content="…"> w dowolnej kolejności atrybutów.
function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined);
    const key = (attr('property') ?? attr('name'))?.toLowerCase();
    const content = attr('content');
    if (key && content && !map.has(key)) map.set(key, decode(content));
  }
  return map;
}

export function parsePreview(html: string, pageUrl: string): LinkPreview {
  const meta = metaTags(html);
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v) ?? null;
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  let image = pick('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src');
  if (image) {
    try {
      const abs = new URL(image, pageUrl);
      image = abs.protocol === 'https:' || abs.protocol === 'http:' ? abs.href : null;
    } catch {
      image = null;
    }
  }
  const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return {
    url: pageUrl,
    title: clip(pick('og:title', 'twitter:title') ?? (titleTag ? decode(titleTag) || null : null), 200),
    description: clip(pick('og:description', 'twitter:description', 'description'), 300),
    image,
    site: pick('og:site_name'),
  };
}

// Adres, którego serwer NIE może odpytać (sieć lokalna/wewnętrzna) — ochrona przed
// użyciem endpointu do zaglądania w infrastrukturę (SSRF).
export function isPrivateAddress(ip: string): boolean {
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('::ffff:');
}
