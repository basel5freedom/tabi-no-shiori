'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDraft } from '@/lib/store';
import { formatItinerary, getOwnedItinerary, saveExistingItinerary, saveItinerary } from '@/lib/api';
import { EditTimeline } from '@/components/EditTimeline';
import { DemoBanner } from '@/components/DemoBanner';
import type { EditDay, Itinerary } from '@/lib/types';

function pendingCount(days: EditDay[]) {
  return days.flatMap((d) => d.items).filter((it) => it.type === 'transit' && !it.mode.trim()).length;
}

/** 入力欄とタイムラインの共通レイアウト */
function EditorShell({
  heading,
  title,
  onTitle,
  days,
  area,
  onDays,
  primaryLabel,
  onPrimary,
  busyLabel,
  busy,
  error,
  extraNotice,
  backButton,
}: {
  heading: string;
  title: string;
  onTitle: (v: string) => void;
  days: EditDay[];
  area: string;
  onDays: (d: EditDay[]) => void;
  primaryLabel: string;
  onPrimary: () => void;
  busyLabel: string;
  busy: boolean;
  error: string | null;
  extraNotice?: ReactNode;
  backButton: ReactNode;
}) {
  const pending = pendingCount(days);
  return (
    <div className="page">
      <h1>{heading}</h1>
      <p className="muted">
        ドラッグハンドル <b>⠿</b> で並べ替え、行の「◯日目へ」で別の日に移動できます。並べ替えると、その日の移動ブロックは未設定に戻ります。
      </p>

      <div className="card">
        <div className="field" style={{ margin: 0 }}>
          <label>しおりのタイトル</label>
          <input type="text" value={title} onChange={(e) => onTitle(e.target.value)} />
        </div>
      </div>

      <DemoBanner />

      <div className="mt-lg">
        <EditTimeline days={days} area={area} onChange={onDays} />
      </div>

      <div className="card mt-lg">
        {pending > 0 && (
          <div className="notice warn">
            移動手段が未設定の移動ブロックが {pending} 件あります。未設定のままでも保存できますが、しおりには「未設定」と表示されます。
          </div>
        )}
        {extraNotice}
        {error && <div className="notice warn mt">{error}</div>}
        <button className="btn btn-stamp mt" onClick={onPrimary} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> {busyLabel}
            </>
          ) : (
            primaryLabel
          )}
        </button>
        <span style={{ marginLeft: 10 }}>{backButton}</span>
      </div>
    </div>
  );
}

/** 新規作成フロー（②で選んだプランを編集して完成） */
function DraftEditor() {
  const router = useRouter();
  const { input, plans, selectedPlanIndex, days, setDays, setLastPin } = useDraft();
  const plan = selectedPlanIndex != null ? plans[selectedPlanIndex] : null;

  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    if (!plan || days.length === 0) {
      router.replace('/');
      return;
    }
    setTitle((t) => t || plan.title);
  }, [plan, days.length, router]);

  if (!plan || days.length === 0) return null;

  async function complete() {
    setError(null);
    setNeedLogin(false);
    setLoading(true);
    try {
      const formatted = await formatItinerary({ title, input, days });
      setDays(formatted.days);
      const planMeta: Itinerary['planMeta'] = plan
        ? {
            themeTag: plan.themeTag,
            walkLevel: plan.walkLevel,
            moveCount: plan.moveCount,
            congestion: plan.congestion,
          }
        : null;
      const { id, pin } = await saveItinerary({
        title: formatted.title || title,
        input,
        planMeta,
        days: formatted.days,
        packingNotes: formatted.packingNotes,
      });
      setLastPin(pin, id);
      router.push(`/itinerary/?id=${id}&new=1`);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('ログイン')) setNeedLogin(true);
      else setError(msg || 'しおりの作成に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <EditorShell
      heading="スポットと移動を整える"
      title={title}
      onTitle={setTitle}
      days={days}
      area={input.destinations.join('・')}
      onDays={setDays}
      primaryLabel="しおりを完成させる"
      busyLabel="AI が体裁を整えています…"
      busy={loading}
      onPrimary={complete}
      error={error}
      extraNotice={
        needLogin && (
          <div className="notice mt">
            しおりの保存にはログインが必要です。<Link href="/login">ログイン</Link>
            してから、もう一度「しおりを完成させる」を押してください。
          </div>
        )
      }
      backButton={
        <button className="btn btn-ghost" onClick={() => router.push('/plans')}>
          ← 案の選択に戻る
        </button>
      }
    />
  );
}

/** 作成後の再編集（?id= のとき）。完成前と同じ画面で編集し、同じしおりに上書き保存。 */
function ExistingEditor({ id }: { id: string }) {
  const router = useRouter();
  const [it, setIt] = useState<Itinerary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [title, setTitle] = useState('');
  const [days, setLocalDays] = useState<EditDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOwnedItinerary(id).then((data) => {
      if (data) {
        setIt(data);
        setTitle(data.title);
        setLocalDays(data.days);
        setStatus('ok');
      } else {
        setStatus('notfound');
      }
    });
  }, [id]);

  async function save() {
    if (!it) return;
    setError(null);
    setSaving(true);
    try {
      await saveExistingItinerary({ ...it, title, days });
      router.push(`/itinerary/?id=${id}`);
    } catch (e) {
      setError((e as Error).message || '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') return <div className="page"><span className="spinner" /> 読み込み中…</div>;
  if (status === 'notfound' || !it)
    return (
      <div className="page">
        <div className="notice warn">しおりが見つかりませんでした。</div>
        <Link className="btn btn-ghost mt" href="/history">履歴へ</Link>
      </div>
    );

  return (
    <EditorShell
      heading="しおりを編集する"
      title={title}
      onTitle={setTitle}
      days={days}
      area={it.input.destinations.join('・')}
      onDays={setLocalDays}
      primaryLabel="変更を保存する"
      busyLabel="保存中…"
      busy={saving}
      onPrimary={save}
      error={error}
      backButton={
        <Link className="btn btn-ghost" href={`/itinerary/?id=${id}`}>
          ← 保存せずに戻る
        </Link>
      }
    />
  );
}

function Inner() {
  const params = useSearchParams();
  const editId = params.get('id') || '';
  return editId ? <ExistingEditor id={editId} /> : <DraftEditor />;
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="page"><span className="spinner" /></div>}>
      <Inner />
    </Suspense>
  );
}
