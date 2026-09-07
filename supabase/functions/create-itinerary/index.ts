import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { admin, userFromRequest } from '../_shared/db.ts';
import { hashPin } from '../_shared/pin.ts';

interface Item {
  type: 'spot' | 'transit';
  kind?: 'spot' | 'hotel' | 'departure' | 'arrival';
  time?: string;
  name?: string;
  note?: string;
  memo?: string;
  isAiSuggested?: boolean;
  mode?: string;
  duration?: string;
}
interface Day {
  dayIndex: number;
  date: string;
  theme: string;
  items: Item[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'ログインが必要です' }, 401);

    const body = (await req.json()) as {
      title: string;
      input: {
        destinations: string[];
        startDate: string;
        endDate: string;
        arrivalTime: string;
        departureTime: string;
        adults: number;
        children: number[];
      };
      planMeta: unknown;
      days: Day[];
      packingNotes: string;
      pin: string;
    };

    if (!/^\d{4}$/.test(body.pin || '')) return json({ error: 'PIN は4桁の数字です' }, 400);
    if (!body.days?.length) return json({ error: '旅程がありません' }, 400);

    const db = admin();
    const { hash, salt } = await hashPin(body.pin);

    const { data: it, error: itErr } = await db
      .from('itineraries')
      .insert({
        user_id: user.id,
        title: body.title || '旅のしおり',
        destination: body.input.destinations ?? [],
        start_date: body.input.startDate,
        end_date: body.input.endDate,
        arrival_time: body.input.arrivalTime ?? null,
        departure_time: body.input.departureTime ?? null,
        adults: body.input.adults ?? 1,
        children: body.input.children ?? [],
        packing_notes: body.packingNotes ?? '',
        plan_meta: body.planMeta ?? {},
        pin_hash: hash,
        pin_salt: salt,
        pin: body.pin, // 作成者本人のみ RLS で閲覧可（共有 API は返さない）
      })
      .select('id')
      .single();
    if (itErr || !it) throw new Error(itErr?.message || 'しおりの作成に失敗しました');

    for (const day of body.days) {
      const { data: dayRow, error: dayErr } = await db
        .from('days')
        .insert({
          itinerary_id: it.id,
          day_index: day.dayIndex,
          date: day.date,
          theme: day.theme ?? '',
        })
        .select('id')
        .single();
      if (dayErr || !dayRow) throw new Error(dayErr?.message || '日程の作成に失敗しました');

      const spots: Record<string, unknown>[] = [];
      const transits: Record<string, unknown>[] = [];
      day.items.forEach((item, order) => {
        if (item.type === 'spot') {
          spots.push({
            day_id: dayRow.id,
            order,
            kind:
              item.kind === 'hotel' || item.kind === 'departure' || item.kind === 'arrival'
                ? item.kind
                : 'spot',
            time: item.time ?? '',
            name: item.name ?? '',
            note: item.note ?? '',
            memo: item.memo ?? '',
            is_ai_suggested: Boolean(item.isAiSuggested),
          });
        } else {
          transits.push({
            day_id: dayRow.id,
            order,
            mode: item.mode ?? '',
            duration: item.duration ?? '',
            note: item.note ?? '',
            memo: item.memo ?? '',
          });
        }
      });
      if (spots.length) {
        const { error } = await db.from('spots').insert(spots);
        if (error) throw new Error(error.message);
      }
      if (transits.length) {
        const { error } = await db.from('transits').insert(transits);
        if (error) throw new Error(error.message);
      }
    }

    return json({ id: it.id, pin: body.pin });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
