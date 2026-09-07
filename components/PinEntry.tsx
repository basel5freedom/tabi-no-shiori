'use client';

import { useRef, useState } from 'react';

interface Props {
  onSubmit: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
}

/** 4 桁 PIN 入力 */
export function PinEntry({ onSubmit, disabled, error }: Props) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setAt(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
  }

  function submit() {
    const pin = digits.join('');
    if (pin.length === 4) onSubmit(pin);
  }

  return (
    <div className="center">
      <div className="pin-inputs">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            maxLength={1}
            value={d}
            disabled={disabled}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'Enter') submit();
            }}
            onPaste={(e) => {
              const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
              if (p.length) {
                e.preventDefault();
                const next = ['', '', '', ''].map((_, k) => p[k] ?? '');
                setDigits(next);
                refs.current[Math.min(p.length, 3)]?.focus();
              }
            }}
          />
        ))}
      </div>
      {error && <p className="notice warn mt" style={{ display: 'inline-block' }}>{error}</p>}
      <div className="mt">
        <button className="btn btn-primary" disabled={disabled || digits.join('').length < 4} onClick={submit}>
          {disabled ? <span className="spinner" /> : 'しおりを開く'}
        </button>
      </div>
    </div>
  );
}
