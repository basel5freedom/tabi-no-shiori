import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { admin, userFromRequest } from '../_shared/db.ts';
import { hashPin } from '../_shared/pin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'ログインが必要です' }, 401);

    const { id, pin } = (await req.json()) as { id: string; pin: string };
    if (!id) return json({ error: 'id が必要です' }, 400);
    if (!/^\d{4}$/.test(pin || '')) return json({ error: 'PIN は4桁の数字です' }, 400);

    const db = admin();

    // 所有者確認
    const { data: it } = await db
      .from('itineraries')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    if (!it) return json({ error: 'しおりが見つかりません' }, 404);
    if (it.user_id !== user.id) return json({ error: '権限がありません' }, 403);

    const { hash, salt } = await hashPin(pin);
    const { error } = await db
      .from('itineraries')
      .update({ pin_hash: hash, pin_salt: salt, pin })
      .eq('id', id);
    if (error) throw new Error(error.message);

    // 古い試行ロックはリセットしておく
    await db.from('pin_attempts').delete().eq('itinerary_id', id);

    return json({ pin });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
