// „Nowe na czacie" — znacznik per urządzenie (localStorage), kiedy ostatnio
// otworzyłeś dany wypad. Dashboard świeci akcentową kropką przy wypadzie,
// w którym są wiadomości nowsze niż ten znacznik (cudze — własnych nie liczymy).

const key = (eventId: string) => `chat-seen-${eventId}`;

export function markChatSeen(eventId: string): void {
  try {
    localStorage.setItem(key(eventId), String(Date.now()));
  } catch { /* brak localStorage */ }
}

export function getChatSeen(eventId: string): number {
  try {
    return Number(localStorage.getItem(key(eventId)) ?? 0);
  } catch {
    return 0;
  }
}
