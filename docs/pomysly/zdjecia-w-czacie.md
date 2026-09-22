# Zdjęcia w czacie

Pomysł: przy planowaniu wrzucać do czatu zdjęcia (screen oferty domku, mapa, menu),
jak w Messengerze — przycisk obok pola pisania, zdjęcie w dymku, tap = pełny ekran.

## Szkic realizacji (reuse galerii)

- **Upload tą samą drogą co galeria** (`src/lib/gallery.ts`): skalowanie w przeglądarce
  (podgląd + miniatura), presigned PUT do R2 przez `/api/gallery-sign` → Edge Function
  `gallery-sign` (klucze pod osobnym prefiksem, np. `chat/<event_id>/…`).
- **Wiadomość ze zdjęciem** = zwykły wiersz `comments` + kolumny `image_path`,
  `image_thumb_path`, `image_w`/`image_h` (proporcje, żeby dymek nie skakał przy
  ładowaniu). Treść opcjonalna (podpis). Realtime i push działają jak dla tekstu;
  push: „📷 Zdjęcie".
- **Podgląd pełnoekranowy** — ten sam viewer co galeria (`EventGallery`, pager).
- **Usuwanie** — miękkie jak tekst (`delete_comment`); pliki z R2 sprząta później
  mechanizm jak `gallery-gc`.
- **Otwarte pytanie:** czy zdjęcia z czatu mają lądować też w galerii wypadu?
  Raczej nie domyślnie (screeny z planowania ≠ foty z wypadu) — ewentualnie akcja
  „dodaj do galerii" pod przytrzymaniem.

Status: do zrobienia po wypuszczeniu nowego czatu (razem albo po podglądzie linków).
