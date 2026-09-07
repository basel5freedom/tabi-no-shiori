// Anthropic Messages API 呼び出しと JSON 抽出

const API_URL = 'https://api.anthropic.com/v1/messages';

export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が未設定です');
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API エラー (${res.status}): ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const text: string = (data.content ?? [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
    .join('\n');
  return text;
}

/** モデル出力から最初の JSON 値を取り出してパースする（余計な前置き・末尾テキストや軽い破損に耐性あり） */
export function extractJson<T>(text: string): T {
  const raw = (text ?? '').trim();
  if (!raw) throw new Error('AI応答が空でした（時間をおいて再試行してください）');

  let s = raw;
  // ```json ... ``` フェンスを除去
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();

  const startIdx = s.search(/[[{]/);
  if (startIdx < 0) throw new Error('AI応答に JSON が見つかりませんでした');
  s = s.slice(startIdx);

  // 文字列とエスケープを考慮して、最初の値の「対応が閉じる」位置まで切り出す
  const open = s[0];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  let endIdx = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      endIdx = i;
      break;
    }
  }
  const candidate = endIdx >= 0 ? s.slice(0, endIdx + 1) : s;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 末尾が途中で切れている等。最後の閉じ括弧までで再挑戦
    const lastClose = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (lastClose > 0) {
      try {
        return JSON.parse(candidate.slice(0, lastClose + 1)) as T;
      } catch {
        /* fallthrough */
      }
    }
    throw new Error('AI応答をJSONとして解釈できませんでした（時間をおいて再試行してください）');
  }
}
