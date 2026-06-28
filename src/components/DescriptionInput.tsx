'use client';

import { useRef } from 'react';

// Pole opisu z paskiem formatowania (B / lista / link). Wstawia/owija zaznaczenie
// lekkim markdownem; render po stronie wypadu robi <Markdown> (src/lib/markdown.tsx).
export default function DescriptionInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Owiń zaznaczenie znacznikami (albo wstaw placeholder, gdy brak zaznaczenia).
  function surround(before: string, after: string, ph: string) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = value.slice(s, e) || ph;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      const ns = s + before.length;
      el.setSelectionRange(ns, ns + sel.length);
    });
  }

  // Dodaj/zdejmij „- " na zaznaczonych liniach (toggle).
  function toggleList() {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const ls = value.lastIndexOf('\n', s - 1) + 1;
    let le = value.indexOf('\n', e);
    if (le === -1) le = value.length;
    const block = value.slice(ls, le);
    const allBulleted = block.split('\n').every((l) => l.trim() === '' || /^\s*-\s+/.test(l));
    const nb = block
      .split('\n')
      .map((l) => {
        if (l.trim() === '') return l;
        return allBulleted ? l.replace(/^(\s*)-\s+/, '$1') : `- ${l}`;
      })
      .join('\n');
    onChange(value.slice(0, ls) + nb + value.slice(le));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ls, ls + nb.length);
    });
  }

  return (
    <div className="desc-input">
      <div className="desc-toolbar">
        <button type="button" className="desc-tool" onClick={() => surround('**', '**', 'pogrubienie')} aria-label="Pogrubienie">
          <b>B</b>
        </button>
        <button type="button" className="desc-tool" onClick={toggleList} aria-label="Lista">
          • Lista
        </button>
        <button type="button" className="desc-tool" onClick={() => surround('[', '](https://)', 'tekst')} aria-label="Link">
          🔗 Link
        </button>
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
