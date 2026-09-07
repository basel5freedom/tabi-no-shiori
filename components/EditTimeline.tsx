'use client';

import { nanoid } from 'nanoid';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EditDay, SpotItem, TimelineItem, TransitItem } from '@/lib/types';
import { formatJPDate } from '@/lib/format';
import { spotSearchUrl } from '@/lib/links';
import { spotNotePlaceholder, spotRoleLabel } from '@/lib/spotRole';
import { TransitEstimateButton } from '@/components/TransitEstimateButton';

const PRESET_MODES = ['徒歩', '電車', 'バス', '車', '飛行機'];

interface Props {
  days: EditDay[];
  /** 目的地エリア（AI 所要時間の推定に使う） */
  area: string;
  onChange: (days: EditDay[]) => void;
}

export function EditTimeline({ days, area, onChange }: Props) {
  function setDay(idx: number, day: EditDay) {
    onChange(days.map((d, i) => (i === idx ? day : d)));
  }

  /** ある日の項目を別の日の末尾へ移す（日をまたぐ移動） */
  function moveItemToDay(fromIdx: number, itemId: string, toIdx: number) {
    if (fromIdx === toIdx) return;
    const moving = days[fromIdx]?.items.find((it) => it.id === itemId);
    if (!moving) return;
    onChange(
      days.map((d, i) => {
        if (i === fromIdx) {
          const rest = d.items.filter((it) => it.id !== itemId);
          // 出発日の移動ブロックは隣接が変わるので未設定に戻す
          return {
            ...d,
            items: rest.map((it) =>
              it.type === 'transit'
                ? { ...it, mode: '', duration: '', note: '', needsReview: true }
                : it,
            ),
          };
        }
        if (i === toIdx) return { ...d, items: [...d.items, moving] };
        return d;
      }),
    );
  }

  return (
    <div className="stack">
      {days.map((day, i) => (
        <DayEditor
          key={day.id}
          day={day}
          index={i}
          dayCount={days.length}
          area={area}
          onChange={(d) => setDay(i, d)}
          onMoveItemToDay={(itemId, toIdx) => moveItemToDay(i, itemId, toIdx)}
        />
      ))}
    </div>
  );
}

function newSpot(kind: 'spot' | 'hotel' = 'spot'): SpotItem {
  return { id: nanoid(8), type: 'spot', kind, time: '', name: '', note: '', memo: '', isAiSuggested: false };
}
function newTransit(): TransitItem {
  return { id: nanoid(8), type: 'transit', mode: '', duration: '', note: '', memo: '', needsReview: true };
}

/** transit の前後にある直近スポット名を返す */
function neighbourSpots(items: TimelineItem[], idx: number): { from: string; to: string } {
  let from = '';
  for (let i = idx - 1; i >= 0; i--) {
    if (items[i].type === 'spot') {
      from = (items[i] as SpotItem).name;
      break;
    }
  }
  let to = '';
  for (let i = idx + 1; i < items.length; i++) {
    if (items[i].type === 'spot') {
      to = (items[i] as SpotItem).name;
      break;
    }
  }
  return { from, to };
}

function DayEditor({
  day,
  index,
  dayCount,
  area,
  onChange,
  onMoveItemToDay,
}: {
  day: EditDay;
  index: number;
  dayCount: number;
  area: string;
  onChange: (day: EditDay) => void;
  onMoveItemToDay: (itemId: string, toDayIdx: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function setItems(items: TimelineItem[]) {
    onChange({ ...day, items });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = day.items.findIndex((it) => it.id === active.id);
    const newIndex = day.items.findIndex((it) => it.id === over.id);
    let moved = arrayMove(day.items, oldIndex, newIndex);
    // 並べ替えで隣接関係が変わるため、この日の移動ブロックは未設定に戻して再入力を促す
    moved = moved.map((it) =>
      it.type === 'transit'
        ? { ...it, mode: '', duration: '', note: '', needsReview: true }
        : it,
    );
    setItems(moved);
  }

  function patch(id: string, p: Partial<TimelineItem>) {
    setItems(day.items.map((it) => (it.id === id ? ({ ...it, ...p } as TimelineItem) : it)));
  }
  function remove(id: string) {
    setItems(day.items.filter((it) => it.id !== id));
  }
  function insertAfter(idx: number, item: TimelineItem) {
    const next = [...day.items];
    next.splice(idx + 1, 0, item);
    setItems(next);
  }

  return (
    <section className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>
          {index + 1}日目 <span className="muted">/ {formatJPDate(day.date)}</span>
        </h2>
      </div>
      <div className="field mt">
        <label>この日のテーマ</label>
        <input
          type="text"
          value={day.theme}
          onChange={(e) => onChange({ ...day, theme: e.target.value })}
          placeholder="例：到着後は移動控えめでゆっくり"
        />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={day.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
          <div className="timeline">
            {day.items.map((item, idx) => {
              const nb = item.type === 'transit' ? neighbourSpots(day.items, idx) : null;
              return (
                <div key={item.id}>
                  <SortableRow
                    item={item}
                    area={area}
                    fromName={nb?.from ?? ''}
                    toName={nb?.to ?? ''}
                    dayIndex={index}
                    dayCount={dayCount}
                    onPatch={patch}
                    onRemove={remove}
                    onMoveToDay={(toIdx) => onMoveItemToDay(item.id, toIdx)}
                  />
                  <div style={{ margin: '2px 0 12px' }}>
                    {item.type === 'spot' && day.items[idx + 1]?.type !== 'transit' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => insertAfter(idx, newTransit())}
                      >
                        ＋ ここに移動ブロック
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="chips">
        <button className="btn btn-ghost btn-sm" onClick={() => setItems([...day.items, newSpot()])}>
          ＋ スポットを追加
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setItems([...day.items, newSpot('hotel')])}>
          ＋ 宿泊先を追加
        </button>
      </div>
    </section>
  );
}

function SortableRow({
  item,
  area,
  fromName,
  toName,
  dayIndex,
  dayCount,
  onPatch,
  onRemove,
  onMoveToDay,
}: {
  item: TimelineItem;
  area: string;
  fromName: string;
  toName: string;
  dayIndex: number;
  dayCount: number;
  onPatch: (id: string, p: Partial<TimelineItem>) => void;
  onRemove: (id: string) => void;
  onMoveToDay: (toDayIdx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const role = item.type === 'spot' ? spotRoleLabel(item) : null;
  const innerClass =
    item.type !== 'spot' ? 'tl-transit' : role ? 'tl-spot hotel' : 'tl-spot';
  const canMoveDay = item.type === 'spot' && item.kind === 'spot' && dayCount > 1;

  return (
    <div ref={setNodeRef} style={style} className={`tl-item${item.type === 'transit' ? ' is-transit' : ''}`}>
      <div className={innerClass}>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <span className="drag-handle" {...attributes} {...listeners} aria-label="ドラッグして並べ替え">
            ⠿
          </span>
          <div className="inline" style={{ gap: 6 }}>
            {canMoveDay && (
              <select
                aria-label="別の日へ移動"
                value=""
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) onMoveToDay(v);
                }}
                style={{ width: 'auto', padding: '4px 6px', fontSize: 12 }}
              >
                <option value="">別の日へ…</option>
                {Array.from({ length: dayCount }, (_, i) => i)
                  .filter((i) => i !== dayIndex)
                  .map((i) => (
                    <option key={i} value={i}>
                      {i + 1}日目へ移動
                    </option>
                  ))}
              </select>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onRemove(item.id)}>
              削除
            </button>
          </div>
        </div>

        {item.type === 'spot' ? (
          <SpotFields item={item} onPatch={onPatch} />
        ) : (
          <TransitFields item={item} area={area} fromName={fromName} toName={toName} onPatch={onPatch} />
        )}
      </div>
    </div>
  );
}

function SpotFields({
  item,
  onPatch,
}: {
  item: SpotItem;
  onPatch: (id: string, p: Partial<TimelineItem>) => void;
}) {
  const isHotel = item.kind === 'hotel';
  const role = spotRoleLabel(item); // 出発地／到着地／宿泊先 or null
  const nameLabel = role === '宿泊先' ? '宿泊先名' : role ?? 'スポット名';
  const namePlaceholder =
    role === '出発地'
      ? '例：自宅、大阪駅'
      : role === '到着地'
        ? '例：自宅、伊丹空港'
        : role === '宿泊先'
          ? '例：〇〇ホテル'
          : '例：清水寺';
  return (
    <div className="stack" style={{ marginTop: 6 }}>
      {role && (
        <span className="chip" style={{ alignSelf: 'flex-start' }}>
          {role}
        </span>
      )}
      {isHotel && (
        <label className="inline" style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked
            onChange={(e) => {
              if (!e.target.checked) onPatch(item.id, { kind: 'spot', note: '' });
            }}
          />
          宿泊先として扱う（外すと通常のスポットに）
        </label>
      )}
      <div className="row">
        <div style={{ flex: '0 0 110px' }}>
          <label>時刻</label>
          <input type="time" value={item.time} onChange={(e) => onPatch(item.id, { time: e.target.value })} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label>
            {nameLabel}
            {item.name.trim() && role !== '出発地' && role !== '到着地' && (
              <>
                {'　'}
                <a
                  href={spotSearchUrl(item.name)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontWeight: 400, fontSize: 12 }}
                >
                  🔎 検索
                </a>
              </>
            )}
          </label>
          <input
            type="text"
            value={item.name}
            onChange={(e) => onPatch(item.id, { name: e.target.value })}
            placeholder={namePlaceholder}
          />
        </div>
      </div>
      <div>
        <label>備考（しおりに表示されます）</label>
        <input
          type="text"
          value={item.note}
          onChange={(e) => onPatch(item.id, { note: e.target.value })}
          placeholder={spotNotePlaceholder(item.kind)}
        />
      </div>
      {item.isAiSuggested && !role && (
        <span className="chip ai" style={{ alignSelf: 'flex-start', padding: '1px 8px' }}>
          ✦ AI提案スポット
        </span>
      )}
    </div>
  );
}

function TransitFields({
  item,
  area,
  fromName,
  toName,
  onPatch,
}: {
  item: TransitItem;
  area: string;
  fromName: string;
  toName: string;
  onPatch: (id: string, p: Partial<TimelineItem>) => void;
}) {
  const selectValue = PRESET_MODES.includes(item.mode) ? item.mode : item.mode ? 'その他' : '';
  const showCustom = selectValue === 'その他';
  const mode = item.mode.trim();

  return (
    <div className="stack" style={{ marginTop: 6 }}>
      {(item.needsReview || !item.mode) && (
        <div className="notice warn">移動手段を選択してください（並べ替えにより未設定に戻りました）。</div>
      )}
      <div className="row">
        <div style={{ flex: '1 1 140px' }}>
          <label>移動手段</label>
          <select
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              onPatch(item.id, { mode: v === 'その他' ? ' ' : v, needsReview: false });
            }}
          >
            <option value="">選択してください</option>
            {PRESET_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="その他">その他（自由入力）</option>
          </select>
        </div>
        <div style={{ flex: '0 0 120px' }}>
          <label>所要時間</label>
          <input
            type="text"
            value={item.duration}
            onChange={(e) => onPatch(item.id, { duration: e.target.value })}
            placeholder="例：25分"
          />
        </div>
      </div>

      {mode && (
        <TransitEstimateButton
          area={area}
          fromName={fromName}
          toName={toName}
          mode={mode}
          hasNote={Boolean(item.note.trim())}
          onApply={(p) => onPatch(item.id, { ...p, needsReview: false })}
        />
      )}

      {showCustom && (
        <div>
          <label>手段（自由入力）</label>
          <input
            type="text"
            value={item.mode.trim()}
            onChange={(e) => onPatch(item.id, { mode: e.target.value })}
            placeholder="例：フェリー"
          />
        </div>
      )}
      <div>
        <label>備考（列車番号・乗換など。しおりに表示されます）</label>
        <input
          type="text"
          value={item.note}
          onChange={(e) => onPatch(item.id, { note: e.target.value })}
          placeholder="例：のぞみ235号 / 京都駅で近鉄に乗換"
        />
      </div>
    </div>
  );
}
