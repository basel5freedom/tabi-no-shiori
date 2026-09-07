'use client';

import type { Itinerary, ItinerarySummary } from './types';

// ─────────────────────────────────────────────────────────────
// デモモード（Supabase 未設定）用の localStorage 保存
//   ※ PIN は平文で保持される。あくまで単一ブラウザ内の動作確認用。
// ─────────────────────────────────────────────────────────────

const KEY = 'shiori:itineraries';

function readAll(): Itinerary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Itinerary[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Itinerary[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function localSaveItinerary(it: Itinerary): void {
  const list = readAll();
  const idx = list.findIndex((x) => x.id === it.id);
  if (idx >= 0) list[idx] = it;
  else list.unshift(it);
  writeAll(list);
}

export function localGetItinerary(id: string): Itinerary | null {
  return readAll().find((x) => x.id === id) ?? null;
}

export function localDeleteItinerary(id: string): void {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function localListSummaries(): ItinerarySummary[] {
  return readAll()
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((it) => ({
      id: it.id,
      title: it.title,
      destinations: it.input.destinations,
      startDate: it.input.startDate,
      endDate: it.input.endDate,
      createdAt: it.createdAt,
    }));
}

export function localVerifyPin(id: string, pin: string): Itinerary | null {
  const it = localGetItinerary(id);
  if (!it) return null;
  return it.pin === pin ? it : null;
}
