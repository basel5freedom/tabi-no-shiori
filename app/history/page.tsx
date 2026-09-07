'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { deleteItinerary, getCurrentUserEmail, listHistory, signOut } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { formatJPDate, formatRange } from '@/lib/format';
import { DemoBanner } from '@/components/DemoBanner';
import type { ItinerarySummary } from '@/lib/types';

export default function HistoryPage() {
  const [rows, setRows] = useState<ItinerarySummary[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const needsLogin = isSupabaseConfigured() && !email;

  async function handleDelete(r: ItinerarySummary) {
    if (!window.confirm(`「${r.title}」を削除します。元に戻せません。よろしいですか？`)) return;
    setBusyId(r.id);
    try {
      await deleteItinerary(r.id);
      setRows((cur) => (cur ? cur.filter((x) => x.id !== r.id) : cur));
    } catch (e) {
      alert((e as Error).message || '削除に失敗しました。');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    (async () => {
      const e = await getCurrentUserEmail();
      setEmail(e);
      if (isSupabaseConfigured() && !e) {
        setRows([]);
        return;
      }
      setRows(await listHistory());
    })();
  }, []);

  return (
    <div className="page">
      <div className="spread">
        <h1 style={{ margin: 0 }}>旅行履歴</h1>
        {email && (
          <span className="muted">
            {email}{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => signOut().then(() => location.reload())}>
              ログアウト
            </button>
          </span>
        )}
      </div>

      <DemoBanner />

      {needsLogin && (
        <div className="card mt">
          <p>履歴を見るにはログインが必要です。</p>
          <Link className="btn btn-primary" href="/login">
            ログイン / 新規登録
          </Link>
        </div>
      )}

      {rows === null && <p className="mt"><span className="spinner" /> 読み込み中…</p>}

      {rows && rows.length === 0 && !needsLogin && (
        <div className="card mt">
          <p>まだ保存されたしおりがありません。</p>
          <Link className="btn btn-primary" href="/">
            しおりをつくる
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="mt">
          {rows.map((r) => (
            <div key={r.id} className="history-row">
              <div className="spread" style={{ alignItems: 'flex-start', gap: 8 }}>
                <Link
                  href={`/itinerary/?id=${r.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
                >
                  <div className="h-title">{r.title}</div>
                  <div className="muted">
                    {r.destinations.join('・')} ／ {formatRange(r.startDate, r.endDate)}
                  </div>
                  <div className="muted">作成日：{formatJPDate(r.createdAt.slice(0, 10))}</div>
                </Link>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDelete(r)}
                  disabled={busyId === r.id}
                >
                  {busyId === r.id ? <span className="spinner" /> : '削除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
