// Emotki 7TV w tekście wiadomości. W bazie (comments.body) emotka to znacznik
// [7tv:<id>:<nazwa>], w polu pisania — czytelne :nazwa: (mapa nazwa → id żyje w
// komponencie, bo pod jedną nazwą 7TV ma wiele różnych emotek). Push / zajawki /
// „Kopiuj" widzą samą nazwę (toPlain).

const TOKEN = /\[7tv:([0-9A-Za-z]{20,32}):([^\]\s]{1,100})\]/g;

export type Emote = { id: string; name: string };
export type EmotePart = { text: string } | { emote: Emote };

export const emoteUrl = (id: string, size: 1 | 2 | 3 | 4 = 4) => `https://cdn.7tv.app/emote/${id}/${size}x.webp`;

export const emoteToken = (e: Emote) => `[7tv:${e.id}:${e.name}]`;

export function splitEmotes(body: string): EmotePart[] {
  const out: EmotePart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: body.slice(last, at) });
    out.push({ emote: { id: m[1], name: m[2] } });
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

export const toPlain = (body: string) => body.replace(TOKEN, '$2');

// Sama emotka (do 3, ewentualnie ze spacjami) = duże emotki bez dymka, jak emoji-only.
export function emotesOnly(body: string): boolean {
  const parts = splitEmotes(body.trim());
  const emotes = parts.filter((p) => 'emote' in p).length;
  return emotes > 0 && emotes <= 3 && parts.every((p) => 'emote' in p || !p.text.trim());
}

// Baza → pole pisania (edycja): znaczniki na :nazwa: + mapa do powrotnej zamiany.
export function toDraft(body: string): { text: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  const text = body.replace(TOKEN, (_, id: string, name: string) => {
    map.set(name, id);
    return `:${name}:`;
  });
  return { text, map };
}

// Pole pisania → baza: :nazwa: znanych emotek (z mapy) wraca do znacznika.
export function fromDraft(text: string, map: Map<string, string>): string {
  if (!map.size) return text;
  return text.replace(/:([^\s:]{1,100}):/g, (m, name: string) => {
    const id = map.get(name);
    return id ? emoteToken({ id, name }) : m;
  });
}
