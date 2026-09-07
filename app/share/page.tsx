'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSharedItinerary, updateSharedItinerary, type SharedChanges } from '@/lib/api';
import { formatParty, formatRange } from '@/lib/format';
import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import { PinEntry } from '@/components/PinEntry';
import type { Itinerary } from '@/lib/types';

function collectChanges(it: Itinerary): SharedChanges {
  const spots: SharedChanges['spots'] = [];
  const transits: SharedChanges['transits'] = [];
  for (const d of it.days) {
    for (const item of d.items) {
      if (item.type === 'spot') spots.push({ id: item.id, memo: item.memo });
      else transits.push({ id: item.id, memo: item.memo });
    }
  }
  return { spots, transits, packingNotes: it.packingNotes };
}

function Inner() {
  const params = useSearchParams();
  const id = params.get('id') || '';

  const [pin, setPin] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [it, setIt] = useState<Itinerary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function tryOpen(entered: string) {
    setChecking(true);
    setError(null);
    const res = await getSharedItinerary(id, entered);
    setChecking(false);
    if (res.ok) {
      setIt(res.itinerary);
      setPin(entered);
    } else {
      let msg = res.error;
      if (res.lockedUntil) {
        msg = `試行回数が上限に達しました。${new Date(res.lockedUntil).toLocaleTimeString('ja-JP')} 以降に再度お試しください。`;
      } else if (typeof res.remaining === 'number') {
        msg = `${res.error}（あと ${res.remaining} 回）`;
      }
      setError(msg);
    }
  }

  async function save() {
    if (!it || !pin) return;
    setSaving(true);
    setSaved(false);
    const res = await updateSharedItinerary(id, pin, collectChanges(it));
    setSaving(false);
    if (res.ok) setSaved(true);
    else alert(res.error || '保存に失敗しました。');
  }

  if (!id) return <div className="page"><div className="notice warn">URL が正しくありません。</div></div>;

  if (!it) {
    return (
      <div className="page">
        <div className="panel-navy center">
          <span className="stamp-title">共有しおり</span>
          <h1 style={{ marginTop: 16 }}>PIN コードを入力してください</h1>
          <p style={{ opacity: 0.9 }}>作成者から別途伝えられた4桁の PIN を入力すると、しおりを閲覧・追記できます。</p>
        </div>
        <div className="card mt-lg">
          <PinEntry onSubmit={tryOpen} disabled={checking} error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel-navy">
        <span className="stamp-title">旅のしおり</span>
        <h1 style={{ marginTop: 14 }}>{it.title}</h1>
        <p style={{ opacity: 0.9, margin: 0 }}>
          {formatRange(it.input.startDate, it.input.endDate)}
          <br />
          {formatParty(it.input.adults, it.input.children)} ／ {it.input.destinations.join('・')}
        </p>
      </div>

      <h2 className="mt-lg">旅程</h2>
      <p className="muted">スポット・移動ブロックの「メモ」を追記できます（PIN を知っている全員が編集できます）。</p>
      <ItineraryTimeline
        days={it.days}
        area={it.input.destinations.join('・')}
        editable
        onChange={(days) => setIt({ ...it, days })}
      />

      <div className="card mt-lg">
        <h2>持ち物・共通メモ</h2>
        <p className="muted" style={{ marginTop: 0 }}>持ち物・集合場所・緊急連絡先など、みんなで書き足せます。</p>
        <textarea
          value={it.packingNotes}
          placeholder="持ち物、集合場所、緊急連絡先など"
          onChange={(e) => setIt({ ...it, packingNotes: e.target.value })}
        />
      </div>

      <div className="card mt-lg">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner" /> 保存中…</> : 'メモを保存'}
        </button>
        {saved && <span className="chip" style={{ marginLeft: 10 }}>保存しました</span>}
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="page"><span className="spinner" /></div>}>
      <Inner />
    </Suspense>
  );
}
