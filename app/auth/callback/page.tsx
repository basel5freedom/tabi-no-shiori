'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('ログイン処理中…');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      router.replace('/');
      return;
    }
    (async () => {
      // detectSessionInUrl によりハッシュ／クエリのトークンは自動処理される。
      // PKCE の場合に備えて明示的に交換も試みる。
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('code')) {
          await sb.auth.exchangeCodeForSession(window.location.href);
        }
      } catch {
        /* 既にセッション確立済みなら無視 */
      }
      const { data } = await sb.auth.getSession();
      if (data.session) {
        setMsg('ログインしました。履歴へ移動します…');
        router.replace('/history');
      } else {
        setMsg('ログインに失敗しました。もう一度お試しください。');
        setTimeout(() => router.replace('/login'), 1800);
      }
    })();
  }, [router]);

  return (
    <div className="page center">
      <p className="mt-lg">
        <span className="spinner" /> {msg}
      </p>
    </div>
  );
}
