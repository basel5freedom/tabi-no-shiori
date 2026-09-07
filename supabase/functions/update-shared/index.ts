import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { admin } from '../_shared/db.ts';
import { clientKey } from '../_shared/pin.ts';
import { checkPin } from '../_shared/guard.ts';

interface Changes {
  spots?: { id: string; memo?: string }[];
  transits?: { id: string; memo?: string }[];
  packingNotes?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { id, pin, changes } = (await req.json()) as {
      id: string;
      pin: string;
      changes: Changes;
    };
    if (!id) return json({ error: 'id が必要です' }, 400);

    const db = admin();
    const key = await clientKey(req);
    const check = await checkPin(db, id, pin, key);
    if (!check.ok) {
      return json(
        { error: check.error, lockedUntil: check.lockedUntil, remaining: check.remaining },
        check.status,
      );
    }

    // このしおりに属する ID だけを対象にする
    const { data: days } = await db.from('days').select('id').eq('itinerary_id', id);
    const dayIds = (days ?? []).map((d) => d.id);
    if (dayIds.length === 0) return json({ ok: true });

    const { data: spotRows } = await db.from('spots').select('id').in('day_id', dayIds);
    const { data: transitRows } = await db.from('transits').select('id').in('day_id', dayIds);
    const validSpots = new Set((spotRows ?? []).map((r) => r.id));
    const validTransits = new Set((transitRows ?? []).map((r) => r.id));

    const ops: PromiseLike<{ error: { message?: string } | null }>[] = [];
    for (const s of changes?.spots ?? []) {
      if (validSpots.has(s.id) && typeof s.memo === 'string') {
        ops.push(db.from('spots').update({ memo: s.memo }).eq('id', s.id));
      }
    }
    for (const t of changes?.transits ?? []) {
      if (validTransits.has(t.id) && typeof t.memo === 'string') {
        ops.push(db.from('transits').update({ memo: t.memo }).eq('id', t.id));
      }
    }
    if (typeof changes?.packingNotes === 'string') {
      ops.push(
        db.from('itineraries').update({ packing_notes: changes.packingNotes }).eq('id', id),
      );
    }

    const results = await Promise.all(ops);
    const failed = results.find((r) => r && r.error);
    if (failed) {
      console.error('update-shared 失敗:', failed.error);
      return json({ error: `保存に失敗: ${failed.error?.message ?? '不明'}` }, 500);
    }

    return json({ ok: true, updated: ops.length });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
