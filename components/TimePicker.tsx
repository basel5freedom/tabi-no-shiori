'use client';

import { ROUGH_TIMES, isRoughTime } from '@/lib/format';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/** 「午前／午後／夜」のざっくり選択、または時刻指定 */
export function TimePicker({ value, onChange }: Props) {
  const mode = isRoughTime(value) || value === '' ? 'rough' : 'exact';
  return (
    <div className="stack">
      <div className="chips">
        {ROUGH_TIMES.map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn-sm ${value === t ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onChange(t)}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          className={`btn btn-sm ${mode === 'exact' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onChange(mode === 'exact' ? value : '10:00')}
        >
          時刻を指定
        </button>
      </div>
      {mode === 'exact' && (
        <input type="time" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 160 }} />
      )}
    </div>
  );
}
