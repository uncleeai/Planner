import { describe, it, expect } from 'vitest';
import { coordsFromMapsLink, looksLikeMapsLink } from './mapsLink';

// Współrzędne w testach są przypadkowe (publiczne place w miastach) — chodzi
// wyłącznie o formaty linków, nie o konkretne miejsca.
describe('coordsFromMapsLink — wyciąganie punktu z wklejonego linku', () => {
  it('Google Maps: /@lat,lon,zoom', () => {
    expect(
      coordsFromMapsLink('https://www.google.com/maps/place/Rynek/@50.0615,19.9371,17z/data=!4m5'),
    ).toEqual({ lat: 50.0615, lon: 19.9371 });
  });

  it('Google Maps: !3d…!4d… (link z „Udostępnij")', () => {
    expect(
      coordsFromMapsLink('https://www.google.com/maps/place/X/data=!3m1!4b1!3d52.2318!4d21.0058'),
    ).toEqual({ lat: 52.2318, lon: 21.0058 });
  });

  it('Google Maps: ?q=lat,lon', () => {
    expect(coordsFromMapsLink('https://maps.google.com/?q=49.2969,19.9488')).toEqual({
      lat: 49.2969,
      lon: 19.9488,
    });
  });

  it('Apple Maps: ?ll=lat,lon', () => {
    expect(coordsFromMapsLink('https://maps.apple.com/?ll=54.3520,18.6466&q=Punkt')).toEqual({
      lat: 54.352,
      lon: 18.6466,
    });
  });

  it('OpenStreetMap: #map=zoom/lat/lon', () => {
    expect(coordsFromMapsLink('https://www.openstreetmap.org/#map=16/51.1079/17.0385')).toEqual({
      lat: 51.1079,
      lon: 17.0385,
    });
  });

  it('geo: z Androida', () => {
    expect(coordsFromMapsLink('geo:53.4285,14.5528')).toEqual({ lat: 53.4285, lon: 14.5528 });
  });

  it('sama para współrzędnych skopiowana z Map', () => {
    expect(coordsFromMapsLink('52.2318, 21.0058')).toEqual({ lat: 52.2318, lon: 21.0058 });
  });

  it('ujemne współrzędne (półkula południowa/zachodnia)', () => {
    expect(coordsFromMapsLink('https://maps.google.com/?q=-33.8688,151.2093')).toEqual({
      lat: -33.8688,
      lon: 151.2093,
    });
  });

  it('zwykły tekst i nazwa miejsca → null', () => {
    expect(coordsFromMapsLink('Myślęcinek')).toBeNull();
    expect(coordsFromMapsLink('u Kuby na działce')).toBeNull();
    expect(coordsFromMapsLink('')).toBeNull();
  });

  it('liczby spoza zakresu współrzędnych → null', () => {
    expect(coordsFromMapsLink('https://maps.google.com/?q=999.1,17.0')).toBeNull();
  });

  it('„Null Island" (0,0) odrzucone — to zwykle błąd parsowania', () => {
    expect(coordsFromMapsLink('https://maps.google.com/?q=0.0,0.0')).toBeNull();
  });

  it('link bez współrzędnych (skrócony) → null, ale rozpoznany jako link do map', () => {
    const short = 'https://maps.app.goo.gl/AbCdEfGhIjK';
    expect(coordsFromMapsLink(short)).toBeNull();
    expect(looksLikeMapsLink(short)).toBe(true);
  });
});

describe('looksLikeMapsLink', () => {
  it('rozpoznaje serwisy map', () => {
    expect(looksLikeMapsLink('https://www.google.com/maps/place/X')).toBe(true);
    expect(looksLikeMapsLink('https://maps.apple.com/?ll=1.0,2.0')).toBe(true);
    expect(looksLikeMapsLink('https://osm.org/#map=5/1/2')).toBe(true);
  });

  it('zwykły adres strony to nie link do map', () => {
    expect(looksLikeMapsLink('https://example.com')).toBe(false);
    expect(looksLikeMapsLink('Krupówki 1')).toBe(false);
  });
});
