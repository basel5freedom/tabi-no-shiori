/** スポット名（＋エリア）から「どういう場所か」を調べる Google 検索 URL を作る。
 *  公式の場所ページ URL を持てないため、検索結果ページで代替する。 */
export function spotSearchUrl(name: string, area?: string): string {
  const q = [name, area].map((s) => (s || '').trim()).filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
