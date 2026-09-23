import { describe, expect, it } from 'vitest';
import { firstUrl, isPrivateAddress, parsePreview, shortLink, splitLinks } from './linkPreview';

describe('splitLinks / firstUrl', () => {
  it('wycina link ze zdania bez końcowej interpunkcji', () => {
    expect(splitLinks('patrz https://booking.com/x?a=1. fajne')).toEqual([
      { text: 'patrz ' },
      { text: 'https://booking.com/x?a=1', href: 'https://booking.com/x?a=1' },
      { text: '. fajne' },
    ]);
  });

  it('zostawia nawias, gdy link ma parę', () => {
    expect(firstUrl('(https://pl.wikipedia.org/wiki/Hel_(miasto))')).toBe('https://pl.wikipedia.org/wiki/Hel_(miasto)');
    expect(firstUrl('(zob. https://x.pl/a)')).toBe('https://x.pl/a');
  });

  it('bez linku: jeden kawałek tekstu i brak URL', () => {
    expect(splitLinks('siema')).toEqual([{ text: 'siema' }]);
    expect(firstUrl('koniec.Teraz i foto.jpg oraz 3.14')).toBeNull();
  });

  it('bierze pierwszy z kilku', () => {
    expect(firstUrl('a http://a.pl b https://b.pl')).toBe('http://a.pl');
  });

  it('łapie adresy bez protokołu (jak iMessage), dopisuje https', () => {
    expect(splitLinks('wejdź na vidsrc.sbs.')).toEqual([
      { text: 'wejdź na ' },
      { text: 'vidsrc.sbs', href: 'https://vidsrc.sbs' },
      { text: '.' },
    ]);
    expect(firstUrl('www.x.pl/a?b=1 bez protokołu')).toBe('https://www.x.pl/a?b=1');
    expect(firstUrl('youtube.com/@SERHITO_SH0TY')).toBe('https://youtube.com/@SERHITO_SH0TY');
  });

  it('nie robi linku z maila', () => {
    expect(firstUrl('pisz na ktos@wp.pl')).toBeNull();
  });
});

describe('shortLink', () => {
  it('krótki zostaje, długi traci protokół/www i dostaje wielokropek', () => {
    expect(shortLink('vidsrc.sbs')).toBe('vidsrc.sbs');
    const long = 'https://www.booking.com/searchresults.pl.html?ss=Mazury&checkin=2026-09-23';
    expect(shortLink(long)).toBe('booking.com/searchresults.pl.html?ss=Ma…');
    expect(shortLink(long).length).toBe(40);
  });
});

describe('parsePreview', () => {
  const html = `<html><head>
    <title>Tytuł z title</title>
    <meta content="Domek nad jeziorem &amp; sauna" property="og:title">
    <meta property='og:image' content='/img/a.jpg'>
    <meta name="description" content="Opis   z  meta">
    <meta property="og:site_name" content="Booking.com">
  </head></html>`;

  it('czyta OG w dowolnej kolejności atrybutów, dekoduje encje, obrazek robi absolutnym', () => {
    expect(parsePreview(html, 'https://booking.com/hotel/x')).toEqual({
      url: 'https://booking.com/hotel/x',
      title: 'Domek nad jeziorem & sauna',
      description: 'Opis z meta',
      image: 'https://booking.com/img/a.jpg',
      site: 'Booking.com',
    });
  });

  it('bez OG: tytuł z <title>, reszta pusta', () => {
    expect(parsePreview('<title>Knajpa &#8211; menu</title>', 'https://k.pl')).toEqual({
      url: 'https://k.pl',
      title: 'Knajpa – menu',
      description: null,
      image: null,
      site: null,
    });
  });

  it('odrzuca obrazek z nie-http protokołu', () => {
    expect(parsePreview('<meta property="og:image" content="javascript:alert(1)">', 'https://x.pl').image).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it('blokuje sieci wewnętrzne', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('przepuszcza publiczne', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.1.69', '2a00:1450:4001::200e']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
