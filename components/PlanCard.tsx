'use client';

import type { Plan, TripInput } from '@/lib/types';
import { distributeSpotsToDays } from '@/lib/sample';
import { formatJPDate } from '@/lib/format';
import { spotRoleLabel } from '@/lib/spotRole';
import { spotSearchUrl } from '@/lib/links';

interface Props {
  plan: Plan;
  index: number;
  input: TripInput;
  onSelect: (index: number) => void;
  onRemoveSpot: (index: number, spotName: string) => void;
}

export function PlanCard({ plan, index, input, onSelect, onRemoveSpot }: Props) {
  const area = input.destinations.join(' ');
  // 選択前でも「だいたいの1日の流れ」を見せる（選択時と同じロジックで割り付け）
  const preview = distributeSpotsToDays(plan, input);

  return (
    <div className="card">
      <div className="spread">
        <span className="tag">{plan.themeTag}</span>
        <span className="muted">案 {index + 1} / 5</span>
      </div>
      <h2 style={{ marginTop: 10 }}>{plan.title}</h2>
      <p style={{ marginTop: 0 }}>{plan.description}</p>

      <div className="metrics mt">
        <span>
          徒歩距離<b>{plan.walkLevel}</b>
        </span>
        <span>
          移動回数<b>{plan.moveCount} 回</b>
        </span>
        <span>
          混雑度<b>{plan.congestion}</b>
        </span>
      </div>

      <hr className="rule" />

      {/* 行き先タグ（× で削除。名前タップで検索） */}
      <p className="muted" style={{ marginBottom: 6 }}>
        行き先（<span style={{ color: '#7a5a1e' }}>✦</span> は AI のおすすめ。名前タップで検索、× で除外）
      </p>
      <div className="chips">
        {plan.spots.length === 0 && <span className="muted">スポットがありません</span>}
        {plan.spots.map((s, i) => (
          <span key={`${s.name}-${i}`} className={s.isAiSuggested ? 'chip ai' : 'chip'}>
            <a href={spotSearchUrl(s.name, area)} target="_blank" rel="noreferrer">
              {s.name}
            </a>
            <button type="button" aria-label={`${s.name} を外す`} onClick={() => onRemoveSpot(index, s.name)}>
              ×
            </button>
          </span>
        ))}
      </div>

      {/* かんたんスケジュール */}
      <div className="mt">
        <p className="muted" style={{ marginBottom: 6 }}>かんたんスケジュール（目安）</p>
        <div className="mini-sched">
          {preview.map((day, di) => {
            const spots = day.items.filter((it) => it.type === 'spot');
            return (
              <div key={day.id} className="mini-day">
                <div className="mini-day-head">
                  {di + 1}日目 <span className="muted">{formatJPDate(day.date)}</span>
                </div>
                {spots.length === 0 ? (
                  <div className="muted">（スポットなし）</div>
                ) : (
                  spots.map((it) => {
                    if (it.type !== 'spot') return null;
                    const role = spotRoleLabel(it);
                    return (
                      <div key={it.id} className="mini-row">
                        <span className="mini-time">{it.time || '—'}</span>
                        <span>
                          {it.kind === 'hotel' ? '🛏 ' : ''}
                          {role === '出発地' || role === '到着地' ? (
                            <>
                              <b style={{ fontWeight: 700 }}>{role}</b>
                              {it.name ? `：${it.name}` : ''}
                            </>
                          ) : role === '宿泊先' ? (
                            <>
                              <b style={{ fontWeight: 700 }}>宿泊先：</b>
                              {it.name ? (
                                <a href={spotSearchUrl(it.name, area)} target="_blank" rel="noreferrer">
                                  {it.name}
                                </a>
                              ) : (
                                ''
                              )}
                            </>
                          ) : it.name ? (
                            <a href={spotSearchUrl(it.name, area)} target="_blank" rel="noreferrer">
                              {it.name}
                            </a>
                          ) : (
                            it.name
                          )}
                          {it.isAiSuggested && !role && <span className="ai-mark"> ✦</span>}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button className="btn btn-stamp mt" onClick={() => onSelect(index)} disabled={plan.spots.length === 0}>
        このプランを選ぶ
      </button>
    </div>
  );
}
