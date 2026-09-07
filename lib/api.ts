'use client';

import { nanoid } from 'nanoid';
import type {
  EditDay,
  Itinerary,
  ItinerarySummary,
  Plan,
  TimelineItem,
  TransitItem,
  TripInput,
} from './types';
import { buildTemplatePlans } from './sample';
import { asSpotKind } from './spotRole';
import {
  functionUrl,
  getSupabase,
  isSupabaseConfigured,
  SUPABASE_ANON_KEY,
} from './supabaseClient';
import {
  localDeleteItinerary,
  localGetItinerary,
  localListSummaries,
  localSaveItinerary,
  localVerifyPin,
} from './localStore';

export { isSupabaseConfigured };

// ─────────────────────────────────────────────────────────────
// 共通ヘルパ
// ─────────────────────────────────────────────────────────────

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function callFunction<T>(name: string, body: unknown, accessToken?: string): Promise<T> {
  const res = await fetch(functionUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.error as string) || `${name} が失敗しました (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, payload: json });
  }
  return json as T;
}

async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

// ─── タイムライン <-> DB 行 変換 ─────────────────────────────

interface DayRow {
  id: string;
  day_index: number;
  date: string;
  theme: string | null;
  spots: SpotRow[];
  transits: TransitRow[];
}
interface SpotRow {
  id: string;
  order: number;
  kind: string | null;
  time: string | null;
  name: string;
  note: string | null;
  memo: string | null;
  is_ai_suggested: boolean;
}
interface TransitRow {
  id: string;
  order: number;
  mode: string | null;
  duration: string | null;
  note: string | null;
  memo: string | null;
}

function rowsToDays(rows: DayRow[]): EditDay[] {
  return [...rows]
    .sort((a, b) => a.day_index - b.day_index)
    .map((r) => {
      const items: TimelineItem[] = [
        ...r.spots.map((s) => ({
          order: s.order,
          item: {
            id: s.id,
            type: 'spot' as const,
            kind: asSpotKind(s.kind),
            time: s.time ?? '',
            name: s.name,
            note: s.note ?? '',
            memo: s.memo ?? '',
            isAiSuggested: s.is_ai_suggested,
          },
        })),
        ...r.transits.map((t) => ({
          order: t.order,
          item: {
            id: t.id,
            type: 'transit' as const,
            mode: t.mode ?? '',
            duration: t.duration ?? '',
            note: t.note ?? '',
            memo: t.memo ?? '',
            needsReview: !t.mode,
          } as TransitItem,
        })),
      ]
        .sort((a, b) => a.order - b.order)
        .map((x) => x.item);

      return {
        id: r.id,
        dayIndex: r.day_index,
        date: r.date,
        theme: r.theme ?? '',
        items,
      };
    });
}

// ─────────────────────────────────────────────────────────────
// ② AI プラン 5 案
// ─────────────────────────────────────────────────────────────

export async function generatePlans(input: TripInput): Promise<Plan[]> {
  if (!isSupabaseConfigured()) {
    await new Promise((r) => setTimeout(r, 400));
    return buildTemplatePlans(input);
  }
  try {
    const { plans } = await callFunction<{ plans: Plan[] }>('generate-plans', { input });
    if (Array.isArray(plans) && plans.length > 0) return plans;
    return buildTemplatePlans(input);
  } catch (e) {
    console.warn('generate-plans 失敗。テンプレートにフォールバックします。', e);
    return buildTemplatePlans(input);
  }
}

// ─────────────────────────────────────────────────────────────
// ③ 移動ブロックの所要時間を AI で概算
// ─────────────────────────────────────────────────────────────

export interface TransitEstimate {
  duration: string;
  note: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function estimateTransit(args: {
  area: string;
  fromSpot: string;
  toSpot: string;
  mode: string;
}): Promise<TransitEstimate> {
  if (!isSupabaseConfigured()) {
    // デモモードでは地点間の距離を計算できないため、当てにならない数字は返さない
    return {
      duration: '',
      note: '自動見積もりは本番接続（Supabase＋Anthropic）時のみ使えます。所要時間は手動で入力してください。',
      confidence: 'low',
    };
  }
  try {
    const out = await callFunction<TransitEstimate>('estimate-transit', args);
    return {
      duration: out.duration || '',
      note: out.note || '',
      confidence: out.confidence || 'low',
    };
  } catch (e) {
    console.warn('estimate-transit 失敗', e);
    return {
      duration: '',
      note: '所要時間を自動取得できませんでした。もう一度試すか、手動で入力してください。',
      confidence: 'low',
    };
  }
}

// ─────────────────────────────────────────────────────────────
// ④ AI しおり整形
// ─────────────────────────────────────────────────────────────

export interface FormatResult {
  title: string;
  days: EditDay[];
  packingNotes: string;
}

export async function formatItinerary(args: {
  title: string;
  input: TripInput;
  days: EditDay[];
}): Promise<FormatResult> {
  const fallback: FormatResult = {
    title: args.title,
    days: args.days,
    packingNotes: '',
  };
  if (!isSupabaseConfigured()) {
    await new Promise((r) => setTimeout(r, 400));
    return fallback;
  }
  try {
    const out = await callFunction<{ itinerary: FormatResult }>('format-itinerary', args);
    return out.itinerary ?? fallback;
  } catch (e) {
    console.warn('format-itinerary 失敗。手動編集内容をそのまま使用します。', e);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// 保存（PIN 発行）
// ─────────────────────────────────────────────────────────────

export async function saveItinerary(args: {
  title: string;
  input: TripInput;
  planMeta: Itinerary['planMeta'];
  days: EditDay[];
  packingNotes: string;
  customPin?: string;
}): Promise<{ id: string; pin: string }> {
  const pin = args.customPin && /^\d{4}$/.test(args.customPin) ? args.customPin : randomPin();

  if (!isSupabaseConfigured()) {
    const id = nanoid(10);
    const it: Itinerary = {
      id,
      title: args.title,
      input: args.input,
      planMeta: args.planMeta,
      days: args.days,
      packingNotes: args.packingNotes,
      createdAt: new Date().toISOString(),
      pin,
    };
    localSaveItinerary(it);
    return { id, pin };
  }

  const token = await getAccessToken();
  if (!token) throw new Error('ログインが必要です（履歴保存のため）。');
  const out = await callFunction<{ id: string; pin: string }>(
    'create-itinerary',
    { ...args, pin },
    token,
  );
  return out;
}

/** PIN の再発行（所有者のみ）。customPin を渡せばその4桁に設定、なければランダム。 */
export async function resetPin(id: string, customPin?: string): Promise<string> {
  const pin = customPin && /^\d{4}$/.test(customPin) ? customPin : randomPin();

  if (!isSupabaseConfigured()) {
    const it = localGetItinerary(id);
    if (!it) throw new Error('しおりが見つかりません。');
    localSaveItinerary({ ...it, pin });
    return pin;
  }

  const token = await getAccessToken();
  if (!token) throw new Error('ログインが必要です。');
  const out = await callFunction<{ pin: string }>('reset-pin', { id, pin }, token);
  return out.pin;
}

// ─────────────────────────────────────────────────────────────
// 所有者としての取得・更新
// ─────────────────────────────────────────────────────────────

export async function getOwnedItinerary(id: string): Promise<Itinerary | null> {
  if (!isSupabaseConfigured()) return localGetItinerary(id);

  const sb = getSupabase();
  if (!sb) return null;

  // 認証セッションの復元を待ってから RLS 保護のテーブルを読む
  await sb.auth.getSession();

  const { data, error: itErr } = await sb
    .from('itineraries')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (itErr) {
    console.error('itinerary 取得エラー:', itErr);
    throw new Error(`DB エラー: ${itErr.message}（code ${itErr.code ?? '-'}）`);
  }
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    destination: string[];
    start_date: string;
    end_date: string;
    arrival_time: string | null;
    departure_time: string | null;
    adults: number;
    children: number[];
    packing_notes: string | null;
    plan_meta: Itinerary['planMeta'];
    created_at: string;
    pin: string | null;
  };

  const { data: dayRows, error: dayErr } = await sb
    .from('days')
    .select('id, day_index, date, theme, spots(*), transits(*)')
    .eq('itinerary_id', id);
  if (dayErr) {
    console.error('days 取得エラー:', dayErr);
    throw new Error(`DB エラー（days）: ${dayErr.message}（code ${dayErr.code ?? '-'}）`);
  }

  return {
    id: row.id,
    title: row.title,
    input: {
      destinations: row.destination ?? [],
      startDate: row.start_date,
      endDate: row.end_date,
      arrivalTime: row.arrival_time ?? '',
      departureTime: row.departure_time ?? '',
      adults: row.adults,
      children: row.children ?? [],
      wishSpots: [],
      lodgings: [],
      departurePlace: '',
      arrivalPlace: '',
    },
    planMeta: row.plan_meta ?? null,
    days: rowsToDays((dayRows ?? []) as unknown as DayRow[]),
    packingNotes: row.packing_notes ?? '',
    createdAt: row.created_at,
    pin: row.pin ?? undefined,
  };
}

/** 所有者による編集（タイトル／持ち物メモ／各スポットの感想メモ／移動メモ／テーマ） */
export async function updateOwnedItinerary(it: Itinerary): Promise<void> {
  if (!isSupabaseConfigured()) {
    const existing = localGetItinerary(it.id);
    localSaveItinerary({ ...it, pin: existing?.pin });
    return;
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase 未設定');
  await sb.auth.getSession();

  const updates: PromiseLike<{ error: unknown }>[] = [
    sb.from('itineraries').update({ title: it.title, packing_notes: it.packingNotes }).eq('id', it.id),
  ];
  for (const d of it.days) {
    updates.push(sb.from('days').update({ theme: d.theme }).eq('id', d.id));
    d.items.forEach((item, order) => {
      if (item.type === 'spot') {
        updates.push(
          sb
            .from('spots')
            .update({
              kind: item.kind,
              time: item.time,
              name: item.name,
              note: item.note,
              memo: item.memo,
              order,
            })
            .eq('id', item.id),
        );
      } else {
        updates.push(
          sb
            .from('transits')
            .update({ mode: item.mode, duration: item.duration, note: item.note, memo: item.memo, order })
            .eq('id', item.id),
        );
      }
    });
  }
  const results = await Promise.all(
    updates.map((p) => Promise.resolve(p).catch((e) => ({ error: e }))),
  );
  const failed = results.find((r) => r && (r as { error?: unknown }).error) as
    | { error: { message?: string; code?: string } }
    | undefined;
  if (failed) {
    console.error('updateOwnedItinerary 失敗:', failed.error);
    throw new Error(
      `保存に失敗しました: ${failed.error?.message ?? '不明なエラー'}（code ${failed.error?.code ?? '-'}）`,
    );
  }
}

/** 作成後の再編集を上書き保存（スポット・移動の追加/削除/並べ替え/日またぎに対応）。
 *  既存の days をすべて削除して入れ直す（spots/transits は cascade）。PIN は保持。 */
export async function saveExistingItinerary(it: Itinerary): Promise<void> {
  if (!isSupabaseConfigured()) {
    const existing = localGetItinerary(it.id);
    localSaveItinerary({ ...it, pin: existing?.pin ?? it.pin });
    return;
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase 未設定');
  await sb.auth.getSession();

  const del = await sb.from('days').delete().eq('itinerary_id', it.id);
  if (del.error) throw new Error(del.error.message);

  for (const day of it.days) {
    const { data: dayRow, error: dayErr } = await sb
      .from('days')
      .insert({ itinerary_id: it.id, day_index: day.dayIndex, date: day.date, theme: day.theme })
      .select('id')
      .single();
    if (dayErr || !dayRow) throw new Error(dayErr?.message || '日程の保存に失敗しました。');

    const spots: Record<string, unknown>[] = [];
    const transits: Record<string, unknown>[] = [];
    day.items.forEach((item, order) => {
      if (item.type === 'spot') {
        spots.push({
          day_id: dayRow.id,
          order,
          kind: item.kind,
          time: item.time,
          name: item.name,
          note: item.note,
          memo: item.memo,
          is_ai_suggested: item.isAiSuggested,
        });
      } else {
        transits.push({
          day_id: dayRow.id,
          order,
          mode: item.mode,
          duration: item.duration,
          note: item.note,
          memo: item.memo,
        });
      }
    });
    if (spots.length) {
      const { error } = await sb.from('spots').insert(spots);
      if (error) throw new Error(error.message);
    }
    if (transits.length) {
      const { error } = await sb.from('transits').insert(transits);
      if (error) throw new Error(error.message);
    }
  }

  const { error } = await sb
    .from('itineraries')
    .update({ title: it.title, packing_notes: it.packingNotes, plan_meta: it.planMeta ?? {} })
    .eq('id', it.id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// 履歴一覧
// ─────────────────────────────────────────────────────────────

/** しおりを削除（所有者のみ。days/spots/transits/pin_attempts は cascade で消える） */
export async function deleteItinerary(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    localDeleteItinerary(id);
    return;
  }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase 未設定');
  await sb.auth.getSession();
  const { error } = await sb.from('itineraries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listHistory(): Promise<ItinerarySummary[]> {
  if (!isSupabaseConfigured()) return localListSummaries();

  const sb = getSupabase();
  if (!sb) return [];
  await sb.auth.getSession();
  const { data, error } = await sb
    .from('itineraries')
    .select('id, title, destination, start_date, end_date, created_at')
    .order('created_at', { ascending: false });
  if (error) console.error('history 取得エラー:', error);
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    destinations: r.destination ?? [],
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
  }));
}

// ─────────────────────────────────────────────────────────────
// 共有・閲覧（PIN 照合はサーバー側）
// ─────────────────────────────────────────────────────────────

export type SharedResult =
  | { ok: true; itinerary: Itinerary }
  | { ok: false; error: string; lockedUntil?: string; remaining?: number };

export async function getSharedItinerary(id: string, pin: string): Promise<SharedResult> {
  if (!isSupabaseConfigured()) {
    const it = localVerifyPin(id, pin);
    if (it) return { ok: true, itinerary: it };
    return { ok: false, error: 'PIN が一致しません。' };
  }
  try {
    const out = await callFunction<{ itinerary: Itinerary }>('get-shared', { id, pin });
    return { ok: true, itinerary: out.itinerary };
  } catch (e) {
    const err = e as { message: string; payload?: Record<string, unknown> };
    return {
      ok: false,
      error: err.message,
      lockedUntil: err.payload?.lockedUntil as string | undefined,
      remaining: err.payload?.remaining as number | undefined,
    };
  }
}

export interface SharedChanges {
  spots: { id: string; memo?: string }[];
  transits: { id: string; memo?: string }[];
  packingNotes?: string;
}

export async function updateSharedItinerary(
  id: string,
  pin: string,
  changes: SharedChanges,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const it = localVerifyPin(id, pin);
    if (!it) return { ok: false, error: 'PIN が一致しません。' };
    for (const d of it.days) {
      d.items = d.items.map((item) => {
        if (item.type === 'spot') {
          const ch = changes.spots.find((x) => x.id === item.id);
          return ch ? { ...item, ...ch } : item;
        }
        const ch = changes.transits.find((x) => x.id === item.id);
        return ch ? { ...item, ...ch, needsReview: false } : item;
      });
    }
    if (typeof changes.packingNotes === 'string') it.packingNotes = changes.packingNotes;
    localSaveItinerary(it);
    return { ok: true };
  }
  try {
    await callFunction('update-shared', { id, pin, changes });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────
// 認証（メール＋パスワード。メール送信なしなので iOS ホーム画面追加でも動く）
// ─────────────────────────────────────────────────────────────

/** 新規登録。メール確認 OFF ならその場でセッション確立、ON なら確認待ち。 */
export async function signUpPassword(
  email: string,
  password: string,
): Promise<{ needsConfirm: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error('この環境ではログインは不要です（デモモード）。');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirm: !data.session };
}

/** ログイン */
export async function signInPassword(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('デモモードではログイン不要です。');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}
