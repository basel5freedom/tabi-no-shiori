import { nanoid } from 'nanoid';
import type {
  EditDay,
  Plan,
  PlanSpot,
  SpotItem,
  TimelineItem,
  TripInput,
} from './types';
import { dateRange, minutesToTime, timeToMinutes } from './format';
import { areaSpots, fallbackSpots } from './spotDb';

// ─────────────────────────────────────────────────────────────
// デモモード用のテンプレート生成（Supabase 未設定でもフローを確認できる）
//   AI提案スポットは、主要観光地は実在の固有名詞、それ以外は目的地名ベースの候補を使う。
// ─────────────────────────────────────────────────────────────

/** 目的地の実在スポット候補（案ごとに offset をずらして重複を減らす） */
function pickAiSpots(
  count: number,
  exclude: string[],
  destination: string,
  offset: number,
): PlanSpot[] {
  const pool = areaSpots(destination) ?? fallbackSpots(destination);
  const used = new Set(exclude.map((s) => s.trim()));
  const out: PlanSpot[] = [];
  for (let i = 0; i < pool.length && out.length < count; i++) {
    const name = pool[(offset + i) % pool.length];
    if (used.has(name) || out.some((o) => o.name === name)) continue;
    out.push({ name, isAiSuggested: true });
  }
  return out;
}

function youngestChild(input: TripInput): number | null {
  return input.children.length ? Math.min(...input.children) : null;
}

interface Slant {
  title: (dest: string) => string;
  themeTag: string;
  description: string;
  walkLevel: Plan['walkLevel'];
  congestion: Plan['congestion'];
  aiCount: number;
  moveBias: number;
}

const SLANTS: Slant[] = [
  {
    title: (d) => `王道でめぐる${d}`,
    themeTag: '王道・バランス型',
    description: '定番の見どころを無理のないペースで。初めての訪問でも外さない構成。',
    walkLevel: '普通',
    congestion: '普通',
    aiCount: 2,
    moveBias: 0,
  },
  {
    title: (d) => `子ども連れでゆったり${d}`,
    themeTag: '子ども連れ・省エネ型',
    description: '移動と徒歩を最小限に。休憩をこまめに挟み、屋内スポットも用意。',
    walkLevel: '少なめ',
    congestion: '空いている',
    aiCount: 2,
    moveBias: -1,
  },
  {
    title: (d) => `食べ歩き重視の${d}`,
    themeTag: 'グルメ重視型',
    description: 'ご当地グルメと甘味を中心に。食事のたびに次の目的地へ小移動。',
    walkLevel: '普通',
    congestion: '混雑',
    aiCount: 3,
    moveBias: 1,
  },
  {
    title: (d) => `定番×穴場ミックスの${d}`,
    themeTag: '定番×穴場ミックス型',
    description: '有名どころを押さえつつ、地元で愛される穴場も織り交ぜる。',
    walkLevel: '多め',
    congestion: '普通',
    aiCount: 3,
    moveBias: 0,
  },
  {
    title: (d) => `弾丸で満喫する${d}`,
    themeTag: '弾丸満喫型',
    description: '短時間で見どころを詰め込む欲張りプラン。体力に自信がある人向け。',
    walkLevel: '多め',
    congestion: '混雑',
    aiCount: 2,
    moveBias: 2,
  },
];

export function buildTemplatePlans(input: TripInput): Plan[] {
  const dest = input.destinations[0] || '目的地';
  const days = Math.max(1, dateRange(input.startDate, input.endDate).length);
  const wish: PlanSpot[] = input.wishSpots.map((name) => ({ name, isAiSuggested: false }));
  const young = youngestChild(input);

  let slants = SLANTS;
  // 小さな子どもがいる場合は省エネ型・王道を先頭へ
  if (young !== null && young <= 6) {
    slants = [...SLANTS].sort((a, b) => a.walkLevel.length - b.walkLevel.length || a.moveBias - b.moveBias);
  }

  return slants.map((s, idx) => {
    const ai = pickAiSpots(s.aiCount + Math.max(0, days - 2), input.wishSpots, dest, idx * 3);
    const spots = [...wish, ...ai];
    const baseMove = Math.max(2, Math.round(spots.length * 0.6));
    return {
      title: s.title(dest),
      themeTag: s.themeTag,
      description: s.description,
      walkLevel: s.walkLevel,
      moveCount: Math.max(1, baseMove + s.moveBias),
      congestion: s.congestion,
      spots,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 選択したプランのスポットを日ごとに割り付けてタイムライン化
// ─────────────────────────────────────────────────────────────

/** 初日の最初のスポットの開始時刻（分）。ざっくり到着はデフォルト値、具体時刻は到着＋30分。 */
function firstSpotStartMin(arrivalTime: string): number {
  if (arrivalTime === '午前') return 10 * 60; // 10:00
  if (arrivalTime === '午後') return 13 * 60 + 30; // 13:30
  if (arrivalTime === '夜') return 19 * 60; // 19:00
  const m = timeToMinutes(arrivalTime);
  return m != null ? m + 30 : 10 * 60;
}

function spreadTimes(count: number, startMin: number, endMin: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [minutesToTime(startMin)];
  const step = Math.max(45, Math.floor((endMin - startMin) / count));
  return Array.from({ length: count }, (_, i) =>
    minutesToTime(Math.min(endMin - 30, startMin + i * step)),
  );
}

export function distributeSpotsToDays(plan: Plan, input: TripInput): EditDay[] {
  const dates = dateRange(input.startDate, input.endDate);
  const dayCount = dates.length;
  const spots = plan.spots;
  const nightCount = Math.max(0, dayCount - 1);
  // 各泊の宿泊先を解決（空文字 = 1泊目と同じ）
  const rawLodgings = input.lodgings ?? [];
  const lodgingByNight: string[] = Array.from({ length: nightCount }, (_, i) => {
    const v = (rawLodgings[i] ?? '').trim();
    return i > 0 && !v ? (rawLodgings[0] ?? '').trim() : v;
  });

  // 均等割り（端数は前半の日に寄せる）
  const perDay: PlanSpot[][] = Array.from({ length: dayCount }, () => []);
  spots.forEach((s, i) => {
    perDay[i % dayCount].push(s);
  });

  const departure = timeToMinutes(input.departureTime);

  return dates.map((date, di) => {
    const isFirst = di === 0;
    const isLast = di === dayCount - 1;
    let startMin = isFirst ? firstSpotStartMin(input.arrivalTime) : 10 * 60;
    let endMin = 19 * 60;
    if (isLast && departure != null) endMin = Math.min(endMin, departure - 30);
    if (endMin - startMin < 90) endMin = startMin + 90;

    const daySpots = perDay[di];
    const times = spreadTimes(daySpots.length, startMin, endMin);
    const items: TimelineItem[] = daySpots.map((s, i) => {
      const spot: SpotItem = {
        id: nanoid(8),
        type: 'spot',
        kind: 'spot',
        time: times[i] || '',
        name: s.name,
        note: '',
        memo: '',
        isAiSuggested: s.isAiSuggested,
      };
      return spot;
    });

    // 宿泊先は観光スポットと分けて、チェックイン／チェックアウトとして差し込む
    const hotelItem = (name: string, label: string, time: string): SpotItem => ({
      id: nanoid(8),
      type: 'spot',
      kind: 'hotel',
      time,
      name,
      note: label,
      memo: '',
      isAiSuggested: false,
    });
    // 前夜の宿（この日の朝チェックアウト） / 当夜の宿（この日の夜チェックイン）
    const prevHotel = di >= 1 ? lodgingByNight[di - 1] : '';
    const nextHotel = di < nightCount ? lodgingByNight[di] : '';
    if (prevHotel) {
      const label = nextHotel && nextHotel === prevHotel ? '宿泊先を出発' : 'チェックアウト';
      // チェックアウト（宿泊先を出発）のデフォルトは 9:00
      items.unshift(hotelItem(prevHotel, label, minutesToTime(9 * 60)));
    }
    if (nextHotel) {
      const label = prevHotel && prevHotel === nextHotel ? '宿泊先に戻る' : 'チェックイン';
      // 宿泊先の到着（チェックイン）はデフォルト 18:00（その日の終わりを超えない範囲で）
      const checkInMin = Math.min(endMin, 18 * 60);
      items.push(hotelItem(nextHotel, label, minutesToTime(checkInMin)));
    }

    // 出発地（初日の先頭）／到着地（最終日の末尾）。編集・削除可、日またぎ移動は不可。
    const endpoint = (name: string, kind: 'departure' | 'arrival'): SpotItem => ({
      id: nanoid(8),
      type: 'spot',
      kind,
      time: '',
      name,
      note: '',
      memo: '',
      isAiSuggested: false,
    });
    if (isFirst && (input.departurePlace ?? '').trim()) {
      items.unshift(endpoint(input.departurePlace.trim(), 'departure'));
    }
    if (isLast && (input.arrivalPlace ?? '').trim()) {
      items.push(endpoint(input.arrivalPlace.trim(), 'arrival'));
    }

    // この日のテーマは、その日に回るスポット名から自動生成する
    const spotNames = daySpots.map((s) => s.name.trim()).filter(Boolean);
    let theme: string;
    if (spotNames.length === 0) {
      theme = isFirst ? '移動日' : isLast ? '帰路' : `${di + 1}日目`;
    } else if (spotNames.length === 1) {
      theme = `${spotNames[0]}へ`;
    } else {
      theme = spotNames.slice(0, 3).join('・') + (spotNames.length > 3 ? ' ほか' : '');
    }

    return { id: nanoid(8), dayIndex: di, date, theme, items };
  });
}
