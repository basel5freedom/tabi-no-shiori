'use client';

import { isSupabaseConfigured } from '@/lib/supabaseClient';

/** Supabase 未設定時に表示する案内 */
export function DemoBanner() {
  if (isSupabaseConfigured()) return null;
  return (
    <div className="notice warn mt" role="status">
      <b>デモモード</b>：Supabase が未設定のため、AI 提案はテンプレート生成、しおりはこのブラウザ内（localStorage）にのみ保存されます。
      共有 URL も同じブラウザでしか開けません。本番構成は README を参照してください。
    </div>
  );
}
