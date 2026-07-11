// Budowanie terminu (slot) z trzech pól: Od / Do / Godzina.
// Pokrywa wszystkie warianty jednym modelem:
//  - Od + Godzina               → konkretny moment (all_day=false, ends_at=null)
//  - Od, bez Godziny            → cały dzień        (all_day=true,  ends_at=null)
//  - Od + Do, bez Godziny       → zakres dni        (all_day=true,  ends_at=Do)
//  - Od + Do + Godzina          → zakres z godziną wyjazdu (all_day=false, ends_at=Do)

export type SlotRange = { od: string; doDate: string; time: string };

export const EMPTY_SLOT_RANGE: SlotRange = { od: '', doDate: '', time: '' };

// Dzisiejsza data w formacie input[type=date] ("YYYY-MM-DD", czas lokalny).
export function todayDate(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export type SlotTimes = { starts_at: string; ends_at: string | null; all_day: boolean };

// Odwrotność buildSlotTimes — istniejący slot z powrotem na pola Od / Do / Godzina
// (czas lokalny), do prefillu formularza edycji terminu.
export function slotToRange(slot: SlotTimes): SlotRange {
  const local = (iso: string) => {
    const d = new Date(iso);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString();
  };
  const start = local(slot.starts_at);
  return {
    od: start.slice(0, 10),
    doDate: slot.ends_at ? local(slot.ends_at).slice(0, 10) : '',
    time: slot.all_day ? '' : start.slice(11, 16),
  };
}

// Zamień pola formularza na wartości do zapisu w tabeli `slots`.
// Zwraca null, gdy brak daty „Od".
export function buildSlotTimes(r: SlotRange): SlotTimes | null {
  if (!r.od) return null;
  const allDay = !r.time;
  const start = new Date(`${r.od}T${r.time || '00:00'}`);
  let ends_at: string | null = null;
  // „Do" liczy się tylko gdy późniejsze niż „Od" (godzina na dniu końcowym nieistotna).
  if (r.doDate && r.doDate > r.od) {
    ends_at = new Date(`${r.doDate}T${r.time || '00:00'}`).toISOString();
  }
  return { starts_at: start.toISOString(), ends_at, all_day: allDay };
}
