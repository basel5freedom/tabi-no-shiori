'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDraft } from '@/lib/store';
import { generatePlans } from '@/lib/api';
import { formatJPDate, formatRange, nights, dateRange } from '@/lib/format';
import { TagInput } from '@/components/TagInput';
import { TimePicker } from '@/components/TimePicker';
import { NumberField } from '@/components/NumberField';
import { DemoBanner } from '@/components/DemoBanner';

export default function InputPage() {
  const router = useRouter();
  const { input, setInput } = useDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tripNights = input.startDate && input.endDate ? nights(input.startDate, input.endDate) : 0;
  const dates = input.startDate && input.endDate ? dateRange(input.startDate, input.endDate) : [];

  // 宿泊数に合わせて lodgings 配列の長さをそろえる（各要素 = その泊の宿泊先。空文字 = 1泊目と同じ）
  useEffect(() => {
    const cur = input.lodgings ?? [];
    if (cur.length === tripNights) return;
    const next = Array.from({ length: tripNights }, (_, i) => cur[i] ?? '');
    setInput({ lodgings: next });
  }, [tripNights]); // eslint-disable-line react-hooks/exhaustive-deps

  function setChildAge(i: number, age: number) {
    const next = [...input.children];
    next[i] = age;
    setInput({ children: next });
  }

  function setLodging(i: number, value: string) {
    const next = [...(input.lodgings ?? [])];
    next[i] = value;
    setInput({ lodgings: next });
  }

  const lodgings = input.lodgings ?? [];

  async function submit() {
    setError(null);
    if (input.destinations.length === 0) return setError('目的地を1つ以上入力してください。');
    if (!input.startDate || !input.endDate) return setError('日程（開始日・終了日）を入力してください。');
    if (input.endDate < input.startDate) return setError('終了日は開始日以降にしてください。');
    if (input.adults < 1) return setError('大人の人数は1名以上にしてください。');

    setLoading(true);
    try {
      const plans = await generatePlans(input);
      useDraft.getState().setPlans(plans);
      router.push('/plans');
    } catch (e) {
      setError((e as Error).message || 'プランの生成に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="panel-navy">
        <span className="stamp-title">旅のしおり</span>
        <h1 style={{ marginTop: 14 }}>行きたい場所から、旅の一日をくみ立てる</h1>
        <p style={{ marginBottom: 0, opacity: 0.9 }}>
          日程と行きたいスポットを入力すると、AI が旅程を5案提案します。選んで手直しし、しおりに仕上げましょう。
        </p>
      </div>
      <DemoBanner />

      <div className="card mt-lg">
        <div className="field">
          <label>目的地（都道府県・市区町村・エリア名）</label>
          <TagInput
            values={input.destinations}
            onChange={(v) => setInput({ destinations: v })}
            placeholder="例：京都市 と入力して「＋ 追加」"
          />
          <p className="muted" style={{ marginTop: 4 }}>複数の地域を追加できます。</p>
        </div>

        <div className="field">
          <label>日程</label>
          <div className="row">
            <input
              type="date"
              value={input.startDate}
              onChange={(e) => setInput({ startDate: e.target.value })}
            />
            <input
              type="date"
              value={input.endDate}
              min={input.startDate || undefined}
              onChange={(e) => setInput({ endDate: e.target.value })}
            />
          </div>
          {input.startDate && input.endDate && (
            <p className="muted" style={{ marginTop: 6 }}>{formatRange(input.startDate, input.endDate)}</p>
          )}
        </div>

        <div className="field">
          <label>初日の到着予定</label>
          <TimePicker value={input.arrivalTime} onChange={(v) => setInput({ arrivalTime: v })} />
          <p className="muted" style={{ marginTop: 4 }}>この時刻より前には初日のスポットを入れません。</p>
        </div>

        <div className="field">
          <label>最終日の出発予定</label>
          <TimePicker value={input.departureTime} onChange={(v) => setInput({ departureTime: v })} />
          <p className="muted" style={{ marginTop: 4 }}>
            この時刻より後には最終日のスポットを入れません。{tripNights === 0 && '（日帰り）'}
          </p>
        </div>

        <div className="field">
          <label>出発地・到着地（任意）</label>
          <div className="row">
            <input
              type="text"
              value={input.departurePlace ?? ''}
              onChange={(e) => setInput({ departurePlace: e.target.value })}
              placeholder="出発地（例：自宅、東京駅）"
            />
            <input
              type="text"
              value={input.arrivalPlace ?? ''}
              onChange={(e) => setInput({ arrivalPlace: e.target.value })}
              placeholder="到着地（例：自宅、空港）"
            />
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            出発地は初日の先頭に、到着地は最終日の末尾にスポットとして入ります（あとで編集・削除できます）。
          </p>
        </div>

        <div className="field">
          <label>人数</label>
          <div className="row">
            <div>
              <span className="muted">大人</span>
              <NumberField
                value={input.adults}
                min={1}
                max={20}
                fallback={1}
                ariaLabel="大人の人数"
                onChange={(n) => setInput({ adults: n })}
              />
            </div>
            <div>
              <span className="muted">子ども</span>
              <NumberField
                value={input.children.length}
                min={0}
                max={12}
                fallback={0}
                ariaLabel="子どもの人数"
                onChange={(n) =>
                  setInput({ children: Array.from({ length: n }, (_, i) => input.children[i] ?? 6) })
                }
              />
            </div>
          </div>
          {input.children.length > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              {input.children.map((age, i) => (
                <div key={i} style={{ flex: '0 0 120px' }}>
                  <span className="muted">{i + 1}人目の年齢</span>
                  <NumberField
                    value={age}
                    min={0}
                    max={17}
                    fallback={0}
                    ariaLabel={`${i + 1}人目の子どもの年齢`}
                    onChange={(n) => setChildAge(i, n)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>行きたい場所・お店（任意）</label>
          <TagInput
            values={input.wishSpots}
            onChange={(v) => setInput({ wishSpots: v })}
            placeholder="場所やお店の名前を入力して「＋ 追加」"
          />
          <p className="muted" style={{ marginTop: 4 }}>
            目的地の中で具体的に行きたい観光・食事スポットがあれば追加してください。宿泊先は下の欄へ。
          </p>
        </div>

        {tripNights >= 1 && (
          <div className="field">
            <label>宿泊先（任意・{tripNights}泊）</label>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
              入力すると、旅程にチェックイン／チェックアウトの予定として入ります（観光スポットとは分けて扱います）。
            </p>
            <div className="stack">
              {Array.from({ length: tripNights }, (_, i) => {
                const sameAsFirst = i > 0 && (lodgings[i] ?? '') === '';
                const nightLabel = dates[i]
                  ? `${i + 1}泊目（${formatJPDate(dates[i])} 泊）`
                  : `${i + 1}泊目`;
                return (
                  <div key={i} className="lodging-row">
                    <div className="spread" style={{ marginBottom: 4 }}>
                      <span className="muted">{nightLabel}</span>
                      {i > 0 && (
                        <label className="inline" style={{ fontWeight: 400, margin: 0 }}>
                          <input
                            type="checkbox"
                            style={{ width: 'auto' }}
                            checked={sameAsFirst}
                            onChange={(e) => setLodging(i, e.target.checked ? '' : lodgings[0] || '')}
                          />
                          1泊目と同じ
                        </label>
                      )}
                    </div>
                    {!sameAsFirst && (
                      <input
                        type="text"
                        value={lodgings[i] ?? ''}
                        onChange={(e) => setLodging(i, e.target.value)}
                        placeholder={i === 0 ? '例：〇〇ホテル（駅前）' : 'ホテル・旅館名'}
                      />
                    )}
                    {sameAsFirst && (
                      <div className="muted" style={{ fontSize: 13 }}>
                        → {lodgings[0] ? lodgings[0] : '（1泊目の宿泊先を入力してください）'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <div className="notice warn">{error}</div>}

        <button className="btn btn-primary mt" onClick={submit} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" /> AI がプランを考えています…
            </>
          ) : (
            'プランを5案もらう'
          )}
        </button>
      </div>
    </div>
  );
}
