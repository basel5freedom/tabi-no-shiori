import type { RoughTime } from './types';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** "2026-09-06" → Date（ローカル正午。タイムゾーンずれ回避） */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 開始日〜終了日の日付配列（両端含む） */
export function dateRange(startISO: string, endISO: string): string[] {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  const out: string[] = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 60) {
    out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return out;
}

export function nights(startISO: string, endISO: string): number {
  return Math.max(0, dateRange(startISO, endISO).length - 1);
}

/** "9月6日(土)" 形式 */
export function formatJPDate(iso: string): string {
  if (!iso) return '';
  const d = parseDate(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
}

export function formatRange(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return '';
  const n = nights(startISO, endISO);
  const label = n === 0 ? '日帰り' : `${n}泊${n + 1}日`;
  return `${formatJPDate(startISO)} 〜 ${formatJPDate(endISO)}（${label}）`;
}

export const ROUGH_TIMES: RoughTime[] = ['午前', '午後', '夜'];

export function isRoughTime(v: string): v is RoughTime {
  return (ROUGH_TIMES as string[]).includes(v);
}

/** 人数の表示文字列 */
export function formatParty(adults: number, children: number[]): string {
  const parts = [`大人${adults}名`];
  if (children.length > 0) {
    const ages = children.map((a) => `${a}歳`).join('・');
    parts.push(`子ども${children.length}名（${ages}）`);
  }
  return parts.join(' / ');
}

/** "HH:MM" を分に。ざっくり時刻は代表値に丸める。 */
export function timeToMinutes(t: string): number | null {
  if (!t) return null;
  if (t === '午前') return 9 * 60;
  if (t === '午後') return 14 * 60;
  if (t === '夜') return 19 * 60;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
