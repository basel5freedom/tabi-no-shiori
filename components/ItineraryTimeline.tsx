'use client';

import type { EditDay, TimelineItem } from '@/lib/types';
import { formatJPDate } from '@/lib/format';
import { spotRoleLabel } from '@/lib/spotRole';
import { spotSearchUrl } from '@/lib/links';

interface Props {
  days: EditDay[];
  /** 目的地エリア（地図リンクに使用） */
  area?: string;
  /** editable=true のとき「メモ」だけ編集できる（構成の変更は /edit?id= の編集画面で） */
  editable?: boolean;
  onChange?: (days: EditDay[]) => void;
}

export function ItineraryTimeline({ days, area = '', editable = false, onChange }: Props) {
  function patchItem(dayIdx: number, itemId: string, patch: Partial<TimelineItem>) {
    if (!onChange) return;
    const next = days.map((d, di) =>
      di !== dayIdx
        ? d
        : {
            ...d,
            items: d.items.map((it) =>
              it.id === itemId ? ({ ...it, ...patch } as TimelineItem) : it,
            ),
          },
    );
    onChange(next);
  }

  return (
    <div className="stack">
      {days.map((day, di) => (
        <section key={day.id} className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>
              {di + 1}日目 <span className="muted">/ {formatJPDate(day.date)}</span>
            </h2>
          </div>
          {day.theme && <p className="muted" style={{ marginTop: 4 }}>{day.theme}</p>}

          <div className="timeline mt">
            {day.items.map((item) => {
              const role = item.type === 'spot' ? spotRoleLabel(item) : null;
              return item.type === 'spot' ? (
                <div key={item.id} className="tl-item">
                  <div className={role ? 'tl-spot hotel' : 'tl-spot'}>
                    <div className="spread">
                      <span className="time">
                        {item.kind === 'hotel' ? '🛏 ' : ''}
                        {item.time || '時刻未定'}
                      </span>
                      {item.isAiSuggested && !role && (
                        <span className="chip ai" style={{ padding: '1px 8px' }}>✦ AI提案</span>
                      )}
                    </div>
                    <div className="sname">
                      {role ? (
                        role
                      ) : item.name ? (
                        <a href={spotSearchUrl(item.name, area)} target="_blank" rel="noreferrer">
                          {item.name}
                        </a>
                      ) : (
                        item.name
                      )}
                    </div>
                    {role && item.name && (
                      <div className="muted">
                        {item.kind === 'hotel' ? (
                          <a href={spotSearchUrl(item.name, area)} target="_blank" rel="noreferrer">
                            {item.name}
                          </a>
                        ) : (
                          item.name
                        )}
                      </div>
                    )}
                    {item.note && <div className="muted">{item.note}</div>}

                    {editable ? (
                      <div className="item-memo">
                        <label>メモ（旅行中の記録）</label>
                        <textarea
                          value={item.memo}
                          placeholder="当日の気づき、感想、次回への覚え書きなど"
                          onChange={(e) => patchItem(di, item.id, { memo: e.target.value })}
                        />
                      </div>
                    ) : (
                      item.memo && <div className="memo-readonly">メモ：{item.memo}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={item.id} className="tl-item is-transit">
                  <div className={`tl-transit${!item.mode ? ' needs-review' : ''}`}>
                    {item.mode ? (
                      <b>
                        {item.mode}
                        {item.duration ? `・${item.duration}` : ''}
                      </b>
                    ) : (
                      <span>移動手段が未設定です（「しおりを編集する」で設定できます）</span>
                    )}
                    {item.note && <div className="muted">{item.note}</div>}

                    {editable ? (
                      <div className="item-memo">
                        <label>メモ（旅行中の記録）</label>
                        <input
                          type="text"
                          value={item.memo}
                          placeholder="遅延・混雑・実際にかかった時間など"
                          onChange={(e) => patchItem(di, item.id, { memo: e.target.value })}
                        />
                      </div>
                    ) : (
                      item.memo && <div className="memo-readonly">メモ：{item.memo}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
