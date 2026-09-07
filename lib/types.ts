// ─────────────────────────────────────────────────────────────
// 共通の型定義
// ─────────────────────────────────────────────────────────────

/** ざっくり時刻の選択肢（時刻未指定でも進めるように） */
export type RoughTime = '午前' | '午後' | '夜';

/** 入力画面（①）で集める情報 */
export interface TripInput {
  destinations: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  arrivalTime: string; // "HH:MM" もしくは RoughTime
  departureTime: string; // "HH:MM" もしくは RoughTime
  adults: number;
  children: number[]; // 子どもの年齢の配列
  wishSpots: string[]; // 行きたい場所・お店
  lodgings: string[]; // 宿泊先（ホテル・旅館名など）。観光スポットとは別扱い
  departurePlace: string; // 出発地（自宅・最寄り駅など）
  arrivalPlace: string; // 到着地（旅の終点）
}

export type WalkLevel = '少なめ' | '普通' | '多め';
export type Congestion = '空いている' | '普通' | '混雑';

/** AI が返すプラン内のスポット */
export interface PlanSpot {
  name: string;
  isAiSuggested: boolean;
}

/** ②で提示される 5 案のうちの 1 つ */
export interface Plan {
  title: string;
  themeTag: string;
  description: string;
  walkLevel: WalkLevel;
  moveCount: number;
  congestion: Congestion;
  spots: PlanSpot[];
}

// ─── 手動編集（③）で扱うタイムライン要素 ───────────────────

export interface SpotItem {
  id: string;
  type: 'spot';
  /** 'spot' = 観光・食事 / 'hotel' = 宿泊先 / 'departure' = 出発地 / 'arrival' = 到着地 */
  kind: 'spot' | 'hotel' | 'departure' | 'arrival';
  time: string;
  name: string;
  note: string;
  memo: string; // 旅行中のメモ
  isAiSuggested: boolean;
}

export interface TransitItem {
  id: string;
  type: 'transit';
  mode: string; // 徒歩／電車／バス／車／飛行機／自由入力
  duration: string;
  note: string; // 備考（列車番号・乗換など。編集画面で設定、しおりに表示）
  memo: string; // メモ（旅行中の記録）
  needsReview: boolean; // 並べ替え直後などに再入力を促すフラグ
}

export type TimelineItem = SpotItem | TransitItem;

export interface EditDay {
  id: string;
  dayIndex: number;
  date: string; // YYYY-MM-DD
  theme: string;
  items: TimelineItem[];
}

// ─── 保存・表示される完成しおり ─────────────────────────────

export interface Itinerary {
  id: string;
  title: string;
  input: TripInput;
  planMeta: Pick<Plan, 'themeTag' | 'walkLevel' | 'moveCount' | 'congestion'> | null;
  days: EditDay[];
  packingNotes: string;
  createdAt: string;
  /** デモモード（localStorage 保存）でのみ平文保持。Supabase モードでは返らない。 */
  pin?: string;
}

/** 履歴一覧の 1 行 */
export interface ItinerarySummary {
  id: string;
  title: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  createdAt: string;
}
