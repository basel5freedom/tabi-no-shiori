import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { verifyPin } from './pin.ts';

const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

export type PinCheck =
  | { ok: true; itinerary: Record<string, unknown> }
  | { ok: false; status: number; error: string; lockedUntil?: string; remaining?: number };

/** PIN 照合 + 試行回数制限。成功時のみしおり本体を返す。 */
export async function checkPin(
  db: SupabaseClient,
  itineraryId: string,
  pin: string,
  clientKey: string,
): Promise<PinCheck> {
  if (!/^\d{4}$/.test(pin || '')) {
    return { ok: false, status: 400, error: 'PIN は4桁の数字です' };
  }

  const now = Date.now();
  const { data: attempt } = await db
    .from('pin_attempts')
    .select('fail_count, locked_until')
    .eq('itinerary_id', itineraryId)
    .eq('client_key', clientKey)
    .maybeSingle();

  if (attempt?.locked_until && Date.parse(attempt.locked_until) > now) {
    return {
      ok: false,
      status: 429,
      error: '試行回数の上限に達しました。しばらく待って再度お試しください。',
      lockedUntil: attempt.locked_until,
    };
  }

  const { data: it } = await db
    .from('itineraries')
    .select('*')
    .eq('id', itineraryId)
    .maybeSingle();
  if (!it) return { ok: false, status: 404, error: 'しおりが見つかりません' };

  const good = await verifyPin(pin, it.pin_salt ?? '', it.pin_hash ?? '');

  if (!good) {
    const fails = (attempt?.fail_count ?? 0) + 1;
    const locked = fails >= MAX_FAILS;
    await db.from('pin_attempts').upsert({
      itinerary_id: itineraryId,
      client_key: clientKey,
      fail_count: locked ? 0 : fails,
      locked_until: locked ? new Date(now + LOCK_MINUTES * 60000).toISOString() : null,
      updated_at: new Date(now).toISOString(),
    });
    return locked
      ? {
          ok: false,
          status: 429,
          error: `PIN の入力に${MAX_FAILS}回失敗しました。${LOCK_MINUTES}分間ロックします。`,
          lockedUntil: new Date(now + LOCK_MINUTES * 60000).toISOString(),
        }
      : { ok: false, status: 401, error: 'PIN が一致しません', remaining: MAX_FAILS - fails };
  }

  // 成功: 試行記録をリセット
  if (attempt) {
    await db
      .from('pin_attempts')
      .delete()
      .eq('itinerary_id', itineraryId)
      .eq('client_key', clientKey);
  }
  return { ok: true, itinerary: it };
}
