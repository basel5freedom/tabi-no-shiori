#!/usr/bin/env bash
# Supabase Edge Functions をまとめてデプロイする。
#
# 使い方:
#   1) Supabase CLI にログイン（初回のみ、ブラウザが開く）
#        npx supabase@latest login
#   2) Anthropic のキーを登録（<ref> はプロジェクトの Reference ID）
#        npx supabase@latest secrets set --project-ref <ref> ANTHROPIC_API_KEY=sk-ant-xxxxx
#   3) このスクリプトを実行
#        SUPABASE_PROJECT_REF=<ref> bash scripts/deploy-functions.sh
#      もしくは
#        bash scripts/deploy-functions.sh <ref>
set -euo pipefail

REF="${1:-${SUPABASE_PROJECT_REF:-}}"
if [ -z "$REF" ]; then
  echo "エラー: プロジェクトの Reference ID を渡してください（引数 または SUPABASE_PROJECT_REF）" >&2
  echo "  例) bash scripts/deploy-functions.sh abcdefghijklmnop" >&2
  exit 1
fi

SUPABASE="${SUPABASE_BIN:-npx supabase@latest}"

FUNCS=(
  generate-plans
  estimate-transit
  format-itinerary
  create-itinerary
  reset-pin
  get-shared
  update-shared
)

for f in "${FUNCS[@]}"; do
  echo "── deploy: $f"
  $SUPABASE functions deploy "$f" --project-ref "$REF" --no-verify-jwt
done

echo "✓ done (${#FUNCS[@]} functions)"
echo "確認: $SUPABASE functions list --project-ref $REF"
