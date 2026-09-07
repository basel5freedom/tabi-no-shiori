'use client';

import { useState } from 'react';

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/** 入力欄＋「＋ 追加」ボタン、または Enter / カンマ区切りでタグを追加 */
export function TagInput({ values, onChange, placeholder }: Props) {
  const [text, setText] = useState('');

  function add(raw: string) {
    const parts = raw
      .split(/[,、\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = Array.from(new Set([...values, ...parts]));
    onChange(next);
    setText('');
  }

  return (
    <div>
      {values.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {values.map((v) => (
            <span key={v} className="chip">
              {v}
              <button type="button" aria-label={`${v} を削除`} onClick={() => onChange(values.filter((x) => x !== v))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="inline">
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <button type="button" className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => add(text)}>
          ＋ 追加
        </button>
      </div>
    </div>
  );
}
