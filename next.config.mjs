// GitHub Pages（プロジェクトページ）では https://<user>.github.io/<repo>/ で配信されるため
// NEXT_PUBLIC_BASE_PATH に "/<repo>" を渡してビルドする（GitHub Actions が自動設定）。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // basePath だけで _next アセットのパスも前置される（export では assetPrefix は不要）
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
