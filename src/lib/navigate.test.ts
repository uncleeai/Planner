import { describe, it, expect, vi, afterEach } from 'vitest';
import { navigationUrl, canNavigate } from './navigate';

function withUA(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints });
}
afterEach(() => vi.unstubAllGlobals());

// Punkt testowy: Rynek Główny w Krakowie (miejsce publiczne).
const POINT = { lat: 50.0615, lon: 19.9371, place: 'Rynek Główny, Kraków' };

describe('navigationUrl — mapy systemu, nie strona www', () => {
  it('iPhone → Mapy Apple, od razu trasa', () => {
    withUA('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 5);
    const url = navigationUrl(POINT)!;
    expect(url).toContain('maps.apple.com');
    expect(url).toContain('daddr=50.0615%2C19.9371');
    expect(url).toContain('dirflg=d');
  });

  it('iPad (podaje się za Maca, ale ma dotyk) → Mapy Apple', () => {
    withUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5);
    expect(navigationUrl(POINT)).toContain('maps.apple.com');
  });

  it('Mac bez dotyku → Google Maps', () => {
    withUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
    expect(navigationUrl(POINT)).toContain('google.com/maps/dir');
  });

  it('Android → Google Maps z celem', () => {
    withUA('Mozilla/5.0 (Linux; Android 14)', 5);
    const url = navigationUrl(POINT)!;
    expect(url).toContain('google.com/maps/dir');
    expect(url).toContain('destination=50.0615%2C19.9371');
  });

  it('bez współrzędnych prowadzi po nazwie miejsca', () => {
    withUA('Mozilla/5.0 (Linux; Android 14)', 5);
    const url = navigationUrl({ place: 'u Kuby na działce' })!;
    expect(url).toContain('destination=u%20Kuby%20na%20dzia%C5%82ce');
  });

  it('bez punktu i bez nazwy → null (nie ma dokąd prowadzić)', () => {
    withUA('Mozilla/5.0 (iPhone;)', 5);
    expect(navigationUrl({ place: '' })).toBeNull();
    expect(navigationUrl({ lat: null, lon: null, place: null })).toBeNull();
  });

  it('sama szerokość bez długości nie wystarcza', () => {
    withUA('Mozilla/5.0 (iPhone;)', 5);
    expect(navigationUrl({ lat: 50.0615, lon: null, place: null })).toBeNull();
  });
});

describe('canNavigate', () => {
  it('punkt albo nazwa wystarczą, pustka nie', () => {
    expect(canNavigate(POINT)).toBe(true);
    expect(canNavigate({ place: 'gdziekolwiek' })).toBe(true);
    expect(canNavigate({ lat: null, lon: null, place: '   ' })).toBe(false);
  });
});
