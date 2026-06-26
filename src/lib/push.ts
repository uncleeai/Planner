'use client';

import { supabase } from '@/lib/supabaseClient';

// Klucz publiczny VAPID (Supabase → ustaw w env). Bez niego powiadomień nie da się włączyć.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

// Web Push działa tylko gdy przeglądarka ma Service Worker + Push API. Na iOS jest to
// dostępne WYŁĄCZNIE w aplikacji dodanej do ekranu głównego (standalone), iOS 16.4+.
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

// Czy apka działa jako zainstalowany PWA (na iOS warunek powiadomień).
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Alokacja na świeżym ArrayBuffer (nie SharedArrayBuffer) — wymóg typu BufferSource.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

// Czy bieżąca przeglądarka ma już aktywną subskrypcję push.
export async function getPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}

// Włącz powiadomienia: poproś o zgodę, zasubskrybuj i zapisz subskrypcję w bazie.
// Musi być wywołane z gestu użytkownika (kliknięcie) — wymóg iOS/Safari.
export async function subscribeToPush(userId: string): Promise<void> {
  if (!isPushSupported()) throw new Error('Powiadomienia nie są tu wspierane.');
  const reg = await ensureRegistration();
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Brak zgody na powiadomienia.');

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Niepełna subskrypcja push.');
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      user_id: userId,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

// Po cichu dosynchronizuj subskrypcję przeglądarki do bazy pod AKTUALNE konto.
// Wołane przy logowaniu — bez proszenia o zgodę i bez rejestrowania SW od zera.
// Naprawia rozjazd „przeglądarka ma subskrypcję, ale w bazie jej nie ma" (np. po
// wyczyszczeniu bazy albo zalogowaniu na inne konto) — bez ręcznego przeklikiwania.
export async function resyncPushSubscription(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return; // brak subskrypcji w przeglądarce — użytkownik jej nie włączył
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      user_id: userId,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  );
}

// Wyłącz powiadomienia: usuń subskrypcję z bazy i z przeglądarki.
export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
