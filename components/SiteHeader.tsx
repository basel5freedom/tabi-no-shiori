'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteHeader() {
  const pathname = usePathname();
  // 共有ページはヘッダーのナビを出さない（同行者向けの入口を単純化）
  const minimal = pathname?.startsWith('/share');

  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/" className="brand">
          <span className="seal">旅</span>
          旅のしおり
        </Link>
        {!minimal && (
          <nav>
            <Link href="/">つくる</Link>
            <Link href="/history">履歴</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
