'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface Props {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  /** 空欄のまま確定したときの値 */
  fallback: number;
  style?: CSSProperties;
  ariaLabel?: string;
}

/**
 * 数値入力。編集中は空欄・途中入力を許し（Backspace で消せる）、
 * フォーカスを外したとき（または Enter）に範囲内の整数へ丸めて確定する。
 */
export function NumberField({ value, onChange, min, max, fallback, style, ariaLabel }: Props) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  function commit() {
    const n = parseInt(text.replace(/[^\d]/g, ''), 10);
    const clamped = Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
    onChange(clamped);
    setText(String(clamped));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      style={style}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
