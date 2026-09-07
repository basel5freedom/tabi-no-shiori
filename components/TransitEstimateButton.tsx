'use client';

import { useState } from 'react';
import { estimateTransit } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

interface Props {
  area: string;
  fromName: string;
  toName: string;
  mode: string;
  /** 既にメモがある場合は AI の経路メモで上書きしない */
  hasNote: boolean;
  onApply: (patch: { duration: string; note?: string }) => void;
}

/** 「✦ AIで所要時間を見積もる」ボタン＋結果表示（③編集画面で使用） */
export function TransitEstimateButton({ area, fromName, toName, mode, hasNote, onApply }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const configured = isSupabaseConfigured();
  const canEstimate = configured && Boolean(mode.trim() && fromName && toName);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await estimateTransit({ area, fromSpot: fromName, toSpot: toName, mode: mode.trim() });
      if (!r.duration) {
        setMsg(r.note || '推定できませんでした。手動で入力してください。');
        return;
      }
      const patch: { duration: string; note?: string } = { duration: r.duration };
      if (r.note && !hasNote) patch.note = r.note;
      onApply(patch);
      const conf =
        r.confidence === 'high' ? '' : r.confidence === 'medium' ? '（参考値）' : '（目安・要確認）';
      setMsg(`AI推定：${fromName} → ${toName} を${mode.trim()}で ${r.duration}${conf}${r.note ? ` / ${r.note}` : ''}`);
    } catch (e) {
      setMsg((e as Error).message || '推定に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <p className="muted" style={{ marginTop: 4 }}>
        所要時間の自動見積もりは本番接続（Supabase＋Anthropic）時に使えます。ここでは手動で入力してください。
      </p>
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-sm btn-stamp" onClick={run} disabled={!canEstimate || busy}>
        {busy ? <span className="spinner" /> : '✦ AIで所要時間を見積もる'}
      </button>
      <p className="muted" style={{ marginTop: 4 }}>
        {msg
          ? msg
          : canEstimate
            ? '前後のスポット名から所要時間の目安を出します（時刻表・渋滞は考慮しない概算）。'
            : '前後にスポット名があると使えます。'}
      </p>
    </div>
  );
}
