'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDraft } from '@/lib/store';
import { getOwnedItinerary, resetPin, updateOwnedItinerary } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { formatParty, formatRange } from '@/lib/format';
import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import type { Itinerary } from '@/lib/types';

function shareUrl(id: string): string {
  if (typeof window === 'undefined') return '';
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${window.location.origin}${base}/share/?id=${id}`;
}

function Inner() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const lastPin = useDraft((s) => s.lastPin);
  const lastPinId = useDraft((s) => s.lastPinId);

  const [it, setIt] = useState<Itinerary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [pinShown, setPinShown] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState('');
  const [regen, setRegen] = useState(false);

  useEffect(() => {
    if (!id) {
      setStatus('notfound');
      return;
    }
    getOwnedItinerary(id)
      .then((data) => {
        if (data) {
          setIt(data);
          setStatus('ok');
          // デモモードは PIN が手元にある。Supabase モードは直近に発行/変更した PIN を localStorage から。
          setPinShown(data.pin ?? (lastPinId === id ? lastPin : null));
        } else {
          setStatus('notfound');
        }
      })
      .catch((e) => {
        setLoadError((e as Error).message || String(e));
        setStatus('notfound');
      });
  }, [id, lastPin, lastPinId]);

  async function regeneratePin() {
    if (pinDraft && !/^\d{4}$/.test(pinDraft)) {
      alert('PIN は4桁の数字で入力してください。');
      return;
    }
    setRegen(true);
    try {
      const newPin = await resetPin(id, pinDraft || undefined);
      setPinShown(newPin);
      useDraft.getState().setLastPin(newPin, id);
      setPinDraft('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRegen(false);
    }
  }

  async function save() {
    if (!it) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateOwnedItinerary(it);
      setSaved(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (status === 'loading') return <div className="page"><span className="spinner" /> 読み込み中…</div>;
  if (status === 'notfound' || !it)
    return (
      <div className="page">
        <div className="notice warn">しおりが見つかりませんでした。</div>
        {loadError && (
          <p className="notice warn mt" style={{ whiteSpace: 'pre-wrap' }}>{loadError}</p>
        )}
        <p className="muted mt">
          作成直後に表示されない場合は、ログインが切れている可能性があります。
          いったんログインし直してから「履歴」を開いてみてください。
        </p>
        <div className="chips mt">
          <Link className="btn btn-primary" href="/login">ログイン</Link>
          <Link className="btn btn-ghost" href="/history">履歴へ</Link>
          <button className="btn btn-ghost" onClick={() => location.reload()}>再読み込み</button>
        </div>
      </div>
    );

  const url = shareUrl(it.id);

  return (
    <div className="page">
      <div className="panel-navy">
        <span className="stamp-title">完成しおり</span>
        <h1 style={{ marginTop: 14 }}>{it.title}</h1>
        <p style={{ opacity: 0.9, margin: 0 }}>
          {formatRange(it.input.startDate, it.input.endDate)}
          <br />
          {formatParty(it.input.adults, it.input.children)} ／ {it.input.destinations.join('・')}
        </p>
      </div>

      <p className="muted mt">
        <span className="chip">✓ 旅行履歴に保存済み</span>
      </p>

      {/* 本文タイムライン */}
      <h2 className="mt-lg">旅程</h2>
      <p className="muted">
        ここでは各ブロックの「メモ」を追記できます（旅行中の記録用）。スポットの追加・削除・並べ替え・
        移動手段・日またぎの移動は、下の「しおりを編集する」から。
      </p>
      <ItineraryTimeline
        days={it.days}
        area={it.input.destinations.join('・')}
        editable
        onChange={(days) => setIt({ ...it, days })}
      />

      {/* 持ち物・共通メモ（旅程の下） */}
      <div className="card mt-lg">
        <h2>持ち物・共通メモ</h2>
        <textarea
          value={it.packingNotes}
          onChange={(e) => setIt({ ...it, packingNotes: e.target.value })}
          placeholder="持ち物、集合場所、緊急連絡先など"
        />
      </div>

      <div className="card mt-lg">
        <div className="chips" style={{ alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" /> 保存中…</> : '変更を保存'}
          </button>
          <Link className="btn btn-stamp" href={`/edit/?id=${it.id}`}>
            しおりを編集する
          </Link>
          {saved && <span className="chip">保存しました</span>}
          <Link className="btn btn-ghost" href="/history">履歴一覧へ</Link>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          「変更を保存」はメモの保存、「しおりを編集する」はスポットや移動の構成変更用です。
        </p>
      </div>

      {/* 共有セクション（ページ末尾） */}
      <div className="panel-navy mt-lg">
        <h2>同行者と共有する</h2>
        <div className="field">
          <label style={{ color: 'var(--paper)' }}>共有 URL</label>
          <div className="inline">
            <input type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-ghost btn-sm" onClick={() => copy(url, 'url')}>
              {copied === 'url' ? 'コピーしました' : 'URL をコピー'}
            </button>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ color: 'var(--paper)' }}>PIN コード（4桁）</label>
          {pinShown ? (
            <div className="inline" style={{ marginBottom: 8 }}>
              <span className="pin-badge">{pinShown}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(pinShown, 'pin')}>
                {copied === 'pin' ? 'コピーしました' : 'PIN をコピー'}
              </button>
            </div>
          ) : (
            <p className="muted" style={{ color: 'var(--paper)', opacity: 0.85 }}>
              PIN は作成直後にのみ表示されます{isSupabaseConfigured() ? '（安全のためサーバーには平文で保存していません）' : ''}。
              忘れた場合は下から再発行してください。
            </p>
          )}

          <div className="inline" style={{ flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="好きな4桁（任意）"
              style={{ maxWidth: 150 }}
            />
            <button className="btn btn-ghost btn-sm" onClick={regeneratePin} disabled={regen}>
              {regen ? <span className="spinner" /> : pinDraft ? 'この PIN に変更' : 'PIN を再発行'}
            </button>
          </div>
        </div>

        <p className="notice mt" style={{ background: 'rgba(255,255,255,.1)', color: 'var(--paper)', borderColor: 'var(--brass)' }}>
          共有 URL と PIN は、メールとメッセージなど<b>別々の手段</b>で相手に伝えてください。
        </p>
      </div>
    </div>
  );
}

export default function ItineraryPage() {
  return (
    <Suspense fallback={<div className="page"><span className="spinner" /></div>}>
      <Inner />
    </Suspense>
  );
}
