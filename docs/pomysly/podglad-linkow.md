# Podgląd linków w czacie

Pomysł: wklejony w czat link pokazuje kartę z podglądem (obrazek, tytuł, domena),
jak w iMessage / Messengerze — np. link do domku z Booking, restauracji, mapy.

## Szkic realizacji

- **Pobranie metadanych po stronie serwera** — przeglądarka nie przeczyta cudzej
  strony (CORS). Route `src/app/api/link-preview/route.ts` (Vercel) albo Edge Function:
  fetch URL, wyciąga `og:title`, `og:image`, `og:description`, `og:site_name`
  (fallback: `<title>`, favicon). Limity: timeout ~3 s, max rozmiar odpowiedzi,
  tylko http/https, blokada adresów prywatnych/localhost (SSRF).
- **Cache w bazie** — tabela `link_previews` (url PK + pola OG + fetched_at), żeby
  każdy telefon nie odpytywał tej samej strony; albo kolumna jsonb przy komentarzu.
- **Klient** — wykrywa pierwszy URL w treści wiadomości, pokazuje kartę pod dymkiem
  (obrazek + tytuł + domena), tap otwiera link. Linki w samym tekście klikalne.
- **Obrazek** przez `<img>` z `referrerPolicy="no-referrer"` + `loading="lazy"`.

Status: do zrobienia po wypuszczeniu nowego czatu.
