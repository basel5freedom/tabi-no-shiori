import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { callClaude, extractJson } from '../_shared/anthropic.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const { area, fromSpot, toSpot, mode } = (await req.json()) as {
      area: string;
      fromSpot: string;
      toSpot: string;
      mode: string;
    };
    if (!fromSpot || !toSpot || !mode) {
      return json({ error: '出発地・目的地・移動手段が必要です' }, 400);
    }

    const system = [
      'あなたは日本国内の移動時間を概算するアシスタントです。実際の道路網・鉄道網に基づいて現実的な所要時間を答えます。',
      '与えられた2地点の間を、指定の交通手段を主体に移動した場合の「ドアtoドア」の所要時間の目安を出します。',
      '# 見積もりの原則',
      '- まず2地点の実際の位置関係（同一市内か、隣接市か、県をまたぐか、直線距離のおおよそ）を思い出す。',
      '- 車の場合: 高速道路・有料道路が使えるルートを優先し、一般道の平均40〜50km/h・高速80〜90km/hで概算。渋滞は見込まない。',
      '  例) 同一〜隣接市（15km以内）は20〜40分、30kmで40〜60分程度。過大に見積もらないこと。',
      '- 電車の場合: 実在する路線・特急/快速の標準所要時間を使う。駅から遠い端は徒歩10〜15分やバスを足す。',
      '- 飛行機の場合: 「出発地→出発空港（アクセス）＋搭乗手続き・保安検査の待ち（国内線は目安60〜90分）＋飛行時間＋到着空港→目的地」を合算した総所要時間を答える。',
      '- 住所・自宅・町名の場合は最寄り駅/IC/空港 までの移動・待ち時間・乗換・目的地までの徒歩を含める。',
      '- 迷ったら「速すぎる」より「実測に近い中央値」を選ぶ。むやみにバッファを積まない。',
      'リアルタイムの渋滞や正確な時刻表は考慮しない概算でよい。',
      '出力は有効な JSON のみ（説明文・コードフェンス禁止）。形式:',
      '{ "duration": "約NN分" または "約N時間NN分",',
      '  "note": "経路の簡単な補足（40字以内。例: 東名阪道→四日市IC→R477。渋滞なし想定)",',
      '  "confidence": "high" | "medium" | "low" }',
      '2地点を明確に特定できたら high、位置関係はわかるが経路が曖昧なら medium、特定できなければ一般的想定で low。',
    ].join('\n');

    const user = [
      area ? `エリア: ${area}` : '',
      `出発地: ${fromSpot}`,
      `目的地: ${toSpot}`,
      `移動手段: ${mode}`,
      '',
      'JSON のみを出力してください。',
    ]
      .filter(Boolean)
      .join('\n');

    const text = await callClaude({ system, user, maxTokens: 700 });
    const parsed = extractJson<{ duration?: string; note?: string; confidence?: string }>(text);

    const duration = String(parsed.duration ?? '').trim();
    if (!duration) return json({ error: '所要時間を推定できませんでした' }, 502);

    return json({
      duration,
      note: String(parsed.note ?? '').trim(),
      confidence: parsed.confidence ?? 'low',
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
