import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { callClaude, extractJson } from '../_shared/anthropic.ts';

interface TripInput {
  destinations: string[];
  startDate: string;
  endDate: string;
  arrivalTime: string;
  departureTime: string;
  adults: number;
  children: number[];
  wishSpots: string[];
  lodgings?: string[];
  departurePlace?: string;
  arrivalPlace?: string;
}

const WALK = ['少なめ', '普通', '多め'];
const CONG = ['空いている', '普通', '混雑'];

function pick<T>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function normalizePlan(raw: Record<string, unknown>) {
  const spotsRaw = (raw.spots ?? []) as Record<string, unknown>[];
  return {
    title: String(raw.title ?? '無題のプラン'),
    themeTag: String(raw.theme_tag ?? raw.themeTag ?? ''),
    description: String(raw.description ?? ''),
    walkLevel: pick(raw.walk_level ?? raw.walkLevel, WALK, '普通'),
    moveCount: Number(raw.move_count ?? raw.moveCount ?? 3) || 3,
    congestion: pick(raw.congestion, CONG, '普通'),
    spots: spotsRaw.map((s) => ({
      name: String(s.name ?? ''),
      isAiSuggested: Boolean(s.is_ai_suggested ?? s.isAiSuggested ?? false),
    })).filter((s) => s.name),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { input } = (await req.json()) as { input: TripInput };
    if (!input?.destinations?.length || !input.startDate || !input.endDate) {
      return json({ error: '入力が不足しています' }, 400);
    }

    const days = Math.round(
      (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000,
    ) + 1;
    const childInfo = input.children.length
      ? `子ども ${input.children.length} 名（年齢: ${input.children.join(', ')} 歳）`
      : '子どもなし';
    const hasYoungChild = input.children.some((a) => a <= 6);

    const system = [
      'あなたは日本国内旅行のプランナーです。',
      '出力は必ず有効な JSON 配列のみ。前後の説明文やコードフェンスは付けないこと。',
      '配列は要素数ちょうど 5。各要素の形式:',
      '{ "title": string, "theme_tag": string, "description": string,',
      '  "walk_level": "少なめ"|"普通"|"多め", "move_count": number,',
      '  "congestion": "空いている"|"普通"|"混雑",',
      '  "spots": [ { "name": string, "is_ai_suggested": boolean } ] }',
    ].join('\n');

    const user = [
      `目的地: ${input.destinations.join(' / ')}`,
      `日程: ${input.startDate} 〜 ${input.endDate}（${days}日間）`,
      `初日の到着予定: ${input.arrivalTime || '指定なし'}`,
      `最終日の出発予定: ${input.departureTime || '指定なし'}`,
      `人数: 大人 ${input.adults} 名 / ${childInfo}`,
      `行きたい場所（ユーザー入力・必ず各プランに含める。is_ai_suggested は false）: ${
        input.wishSpots.length ? input.wishSpots.join(', ') : 'なし'
      }`,
      `宿泊先（泊ごと。空欄は前泊と同じ宿）: ${
        input.lodgings?.length
          ? input.lodgings.map((l, i) => `${i + 1}泊目=${l || '（1泊目と同じ）'}`).join(' / ')
          : '指定なし'
      }`,
      `出発地: ${input.departurePlace || '指定なし'} ／ 到着地: ${input.arrivalPlace || '指定なし'}`,
      '',
      '# 指示',
      '- spots の name は必ず「実在する固有名詞」にする（例: 清水寺、大阪城、金沢21世紀美術館、〇〇（店名））。',
      '  「老舗の甘味処」「地元の市場」「見晴らしのよい展望台」のような一般名詞・カテゴリ名は禁止。',
      '  自信がない場合でも、その地域に実在する具体的な施設名・店名を挙げること。',
      '- 宿泊先・出発地・到着地は観光スポットではないので spots に含めない（動線の参考にとどめる）。',
      '- 5案はそれぞれ切り口を変える: 王道バランス型 / 子ども連れ省エネ型 / グルメ重視型 / 定番×穴場ミックス型 / 弾丸満喫型。',
      '- 【移動時間を必ず考慮する】同じ日に回るスポットは地理的に近いものでまとめ、実際の移動時間を見積もった上で無理のない順路にする。',
      '  日をまたぐ大きな移動（別の市・観光エリアへの1時間超の移動）は、その日の最初か最後に1回だけにする。',
      '  walk_level が「少なめ」/子ども連れ省エネ型のプランでは、スポット間の移動を片道おおむね30分以内に収め、遠方スポットは入れない。',
      '  弾丸満喫型でも、車/電車で1時間20分といった長距離ホップを1日に何度も入れない。',
      '  move_count は「実際に発生する移動の回数」を正直に反映する（近接スポットのまとめ移動は1回と数える）。',
      '- 各プランには、ユーザーが入力していない周辺のおすすめスポット（実在の固有名詞）も積極的に加え、is_ai_suggested: true を付ける。',
      '  ただし追加スポットも、その日の他スポットと近い場所を選ぶ（動線を崩さない）。',
      `- 初日は到着予定時刻（${input.arrivalTime || '指定なし'}）より前に回るスポットを入れない。最終日は出発予定時刻（${
        input.departureTime || '指定なし'
      }）より後のスポットを入れない。`,
      '- 開始の目安: 2日目以降は10:00頃。初日は到着が「午前」なら10:00頃、「午後」なら13:30頃、「夜」なら19:00頃、具体時刻ならその30分後。',
      '- 宿泊するプランでは、その日の最後にホテル着（チェックイン18:00頃）を想定する。',
      hasYoungChild
        ? '- 未就学児がいるため、5案のうち少なくとも2案は walk_level を「少なめ」、move_count を小さめにする。'
        : '- 家族構成に合わせて徒歩量と移動回数を調整する。',
      `- spots の件数は 1 日あたり 3〜5 件程度を目安に、日程（${days}日）全体で妥当な総数にする。`,
      '- description は 60 字程度の日本語。',
      '',
      'JSON 配列のみを出力してください。',
    ].join('\n');

    const text = await callClaude({ system, user, maxTokens: 4500 });
    const arr = extractJson<Record<string, unknown>[]>(text);
    const plans = (Array.isArray(arr) ? arr : []).slice(0, 5).map(normalizePlan);
    if (plans.length === 0) return json({ error: 'プランを生成できませんでした' }, 502);

    return json({ plans });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
