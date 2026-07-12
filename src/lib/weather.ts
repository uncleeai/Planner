// Pogoda przez Open-Meteo (darmowe, bez klucza). Dwa kroki: geokodowanie miejscowości
// (nazwa → lat/lon) i prognoza dzienna na konkretny dzień wypadu. Wszystko po stronie
// przeglądarki. Prognoza sięga ~16 dni w przód — dalej/po fakcie zwracamy null.

export type Place = {
  name: string;
  admin1: string | null; // województwo/region
  country: string | null;
  latitude: number;
  longitude: number;
};

export type DayWeather = {
  code: number;
  tempMax: number;
  tempMin: number;
};

// Podpowiedzi miejscowości do autouzupełniania pola „Miasto (pogoda)".
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=5&language=pl&format=json`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      name: r.name as string,
      admin1: (r.admin1 as string) ?? null,
      country: (r.country as string) ?? null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
    }));
  } catch {
    return [];
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Cache w pamięci (per sesja) — żeby po powrocie z eventu pogoda była od razu, bez
// doskoku/przeskoku layoutu. Trzymamy też deterministyczne null (poza zasięgiem).
const weatherCache = new Map<string, DayWeather | null>();
const wKey = (lat: number, lon: number, dateISO: string) => `${lat},${lon},${dateISO}`;

// Synchroniczny podgląd cache'a (do inicjalizacji stanu bez pop-inu). undefined = jeszcze
// nie pobrane; null = pobrane, ale brak prognozy.
export function peekDayWeather(lat: number, lon: number, dateISO: string): DayWeather | null | undefined {
  return weatherCache.get(wKey(lat, lon, dateISO));
}

// Prognoza na dzień (lokalna data YYYY-MM-DD). Null gdy poza zasięgiem (przeszłość lub
// dalej niż ~16 dni) albo przy błędzie sieci.
export async function fetchDayWeather(
  latitude: number,
  longitude: number,
  dateISO: string,
): Promise<DayWeather | null> {
  const key = wKey(latitude, longitude, dateISO);
  const cached = weatherCache.get(key);
  if (cached !== undefined) return cached;

  const target = new Date(`${dateISO}T12:00:00`);
  const days = Math.floor((target.getTime() - Date.now()) / DAY_MS);
  if (Number.isNaN(days) || days < -1 || days > 15) {
    weatherCache.set(key, null);
    return null;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto` +
    `&start_date=${dateISO}&end_date=${dateISO}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // błąd przejściowy — nie cache'ujemy, pozwól ponowić
    const d = await res.json();
    const code = d.daily?.weather_code?.[0];
    const tMax = d.daily?.temperature_2m_max?.[0];
    const tMin = d.daily?.temperature_2m_min?.[0];
    if (code == null || tMax == null) {
      weatherCache.set(key, null);
      return null;
    }
    const result: DayWeather = { code, tempMax: Math.round(tMax), tempMin: Math.round(tMin) };
    weatherCache.set(key, result);
    return result;
  } catch {
    return null; // sieć padła — nie cache'ujemy
  }
}

// Prognoza godzinowa na dzień wypadu (modal szczegółów po tapnięciu kafelka pogody).
export type HourWeather = {
  time: string;   // ISO w strefie lokalnej miejsca (timezone=auto)
  temp: number;
  code: number;
  precip: number; // szansa opadów w %
};

const hourlyCache = new Map<string, HourWeather[] | null>();

export async function fetchHourlyWeather(
  latitude: number,
  longitude: number,
  dateISO: string,
): Promise<HourWeather[] | null> {
  const key = wKey(latitude, longitude, dateISO);
  const cached = hourlyCache.get(key);
  if (cached !== undefined) return cached;

  const target = new Date(`${dateISO}T12:00:00`);
  const days = Math.floor((target.getTime() - Date.now()) / DAY_MS);
  if (Number.isNaN(days) || days < -1 || days > 15) {
    hourlyCache.set(key, null);
    return null;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto` +
    `&start_date=${dateISO}&end_date=${dateISO}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // błąd przejściowy — nie cache'ujemy, pozwól ponowić
    const d = await res.json();
    const times: string[] = d.hourly?.time ?? [];
    const temps: number[] = d.hourly?.temperature_2m ?? [];
    const codes: number[] = d.hourly?.weather_code ?? [];
    const precs: number[] = d.hourly?.precipitation_probability ?? [];
    const rows: HourWeather[] = times.map((t, i) => ({
      time: t,
      temp: Math.round(temps[i] ?? 0),
      code: codes[i] ?? 0,
      precip: Math.round(precs[i] ?? 0),
    }));
    const result = rows.length > 0 ? rows : null;
    hourlyCache.set(key, result);
    return result;
  } catch {
    return null; // sieć padła — nie cache'ujemy
  }
}

// Kod pogody WMO → emoji + krótki polski opis.
export function describeWeather(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Słonecznie' };
  if (code === 1) return { emoji: '🌤️', label: 'Przeważnie słonecznie' };
  if (code === 2) return { emoji: '⛅', label: 'Częściowe zachmurzenie' };
  if (code === 3) return { emoji: '☁️', label: 'Pochmurno' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Mgła' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Mżawka' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Deszcz' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'Śnieg' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: 'Przelotny deszcz' };
  if (code === 85 || code === 86) return { emoji: '🌨️', label: 'Przelotny śnieg' };
  if (code >= 95) return { emoji: '⛈️', label: 'Burza' };
  return { emoji: '🌡️', label: 'Pogoda' };
}
