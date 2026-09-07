import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { callClaude, extractJson } from '../_shared/anthropic.ts';

interface Item {
  id: string;
  type: 'spot' | 'transit';
  time?: string;
  name?: string;
  note?: string;
  mode?: string;
  duration?: string;
}
interface Day {
  id: string;
  dayIndex: number;
  date: string;
  theme: string;
  items: Item[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { title, input, days } = (await req.json()) as {
      title: string;
      input: Record<string, unknown>;
      days: Day[];
    };
    if (!Array.isArray(days) || days.length === 0) {
      return json({ error: 'days がありません' }, 400);
    }

    const compact = days.map((d) => ({
      id: d.id,
      date: d.date,
      theme: d.theme,
      spots: d.items
        .filter((i) => i.type === 'spot')
        .map((i) => ({ id: i.id, time: i.time, name: i.name, note: i.note })),
      transits: d.items
        .filter((i) => i.type === 'transit')
        .map((i) => ({ mode: i.mode, duration: i.duration })),
    }));

    const system = [
      'あなたは旅のしおりの編集者です。ユーザーが確定した旅程の「言い回しの調整」と「体裁を整えること」だけを行います。',
      '新しいスポットや移動を追加してはいけません。件数・順番・時刻・スポット名は変更しないこと。',
      '出力は有効な JSON のみ（説明文・コードフェンス禁止）。形式:',
      '{ "title": string,',
      '  "days": [ { "id": string, "theme": string,',
      '             "spots": [ { "id": string, "note": string } ] } ] }',
      'theme は各日の一言テーマ。note は各スポットの短い補足（20〜40字、なければ空文字）。id は入力のものをそのまま返す。',
    ].join('\n');

    const user = [
      `しおりタイトル案: ${title}`,
      `旅行条件: ${JSON.stringify(input)}`,
      '確定済みの旅程:',
      JSON.stringify(compact),
      '',
      '上記の id を保ったまま、theme と note を整えて JSON を出力してください。',
    ].join('\n');

    let polished: {
      title?: string;
      days?: { id: string; theme?: string; spots?: { id: string; note?: string }[] }[];
    } = {};
    try {
      const text = await callClaude({ system, user, maxTokens: 3000 });
      polished = extractJson(text);
    } catch (e) {
      console.warn('format 整形失敗、原文を返します:', (e as Error).message);
    }

    const themeById = new Map<string, string>();
    const noteById = new Map<string, string>();
    for (const d of polished.days ?? []) {
      if (typeof d.theme === 'string') themeById.set(d.id, d.theme);
      for (const s of d.spots ?? []) {
        if (typeof s.note === 'string') noteById.set(s.id, s.note);
      }
    }

    // 元の構造を保ったまま theme / note のみ差し替え（新規追加はしない）
    const merged: Day[] = days.map((d) => ({
      ...d,
      theme: themeById.get(d.id) ?? d.theme,
      items: d.items.map((i) =>
        i.type === 'spot' && noteById.has(i.id) ? { ...i, note: noteById.get(i.id) as string } : i,
      ),
    }));

    return json({
      itinerary: {
        title: polished.title || title,
        days: merged,
        packingNotes: '', // 持ち物・共通メモは自動生成しない（ユーザーが自分で記入）
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
