import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { admin } from '../_shared/db.ts';
import { clientKey } from '../_shared/pin.ts';
import { checkPin } from '../_shared/guard.ts';
import { buildItinerary } from '../_shared/shape.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { id, pin } = (await req.json()) as { id: string; pin: string };
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

    const { data: dayRows, error } = await db
      .from('days')
      .select('id, day_index, date, theme, spots(*), transits(*)')
      .eq('itinerary_id', id);
    if (error) throw new Error(error.message);

    return json({ itinerary: buildItinerary(check.itinerary, dayRows ?? []) });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
