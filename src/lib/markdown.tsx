import React from 'react';

// Lekki renderer markdownu → elementy React (bez surowego HTML = bez ryzyka XSS,
// bez zależności). Obsługuje: **pogrubienie**, *kursywę*/_kursywę_, listy „- "/„* "
// i numerowane „1. ", linki [tekst](url) oraz gołe URL-e. Reszta to zwykły tekst.

const INLINE =
  /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)|[_*](.+?)[_*]/g;

function renderInline(text: string, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`${kp}-b${i}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      out.push(
        <a key={`${kp}-l${i}`} href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <a key={`${kp}-u${i}`} href={m[4]} target="_blank" rel="noopener noreferrer">{m[4]}</a>,
      );
    } else if (m[5] !== undefined) {
      out.push(<em key={`${kp}-i${i}`}>{m[5]}</em>);
    }
    last = INLINE.lastIndex;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isBlank = (l: string) => /^\s*$/.test(l);
const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
const isNumbered = (l: string) => /^\s*\d+\.\s+/.test(l);

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i++;
      continue;
    }
    if (isBullet(lines[i])) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*[-*]\s+/, ''), `li${key}`)}</li>);
        i++;
      }
      blocks.push(<ul key={key++}>{items}</ul>);
      continue;
    }
    if (isNumbered(lines[i])) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && isNumbered(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''), `oli${key}`)}</li>);
        i++;
      }
      blocks.push(<ol key={key++}>{items}</ol>);
      continue;
    }
    // Akapit: ciąg niepustych, nie-listowych linii (pojedynczy newline → <br>).
    const para: React.ReactNode[] = [];
    let first = true;
    while (i < lines.length && !isBlank(lines[i]) && !isBullet(lines[i]) && !isNumbered(lines[i])) {
      if (!first) para.push(<br key={key++} />);
      para.push(...renderInline(lines[i], `p${key++}`));
      first = false;
      i++;
    }
    blocks.push(<p key={key++}>{para}</p>);
  }

  return <>{blocks}</>;
}
