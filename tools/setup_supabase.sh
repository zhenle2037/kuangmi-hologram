#!/usr/bin/env bash
# 一鍵建立後台資料庫（Supabase）：建立專案 → 建資料表與權限 → 匯入資料 → 設定 Owner 與登入網址 → 印出網站要填的公開設定。
# 用法（Mac / Linux 終端機）：bash <(curl -fsSL https://raw.githubusercontent.com/zhenle2037/kuangmi-hologram/main/tools/setup_supabase.sh)
# 需要：一個 Supabase Personal Access Token（https://supabase.com/dashboard/account/tokens 產生）。
# 這個 Token 只在本次執行中使用，不會存檔、不會上傳到 GitHub。可重複執行：已建立的專案與資料不會重複建立。
set -euo pipefail

API="${KM_API:-https://api.supabase.com/v1}"
RAW="${KM_RAW:-https://raw.githubusercontent.com/zhenle2037/kuangmi-hologram/main}"
SITE="https://zhenle2037.github.io/kuangmi-hologram"
NAME="kuangmi-hologram"
MIGS="20261015000100_schema.sql 20261015000200_security.sql 20261015000300_seed.sql"

say()  { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
command -v curl >/dev/null || fail "找不到 curl"
command -v python3 >/dev/null || fail "找不到 python3（Mac 請先執行：xcode-select --install）"
J() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }   # 解析 JSON 的小工具

TOKEN="${TOKEN:-}"; EMAIL="${EMAIL:-}"; ST=""
if [ -z "$TOKEN" ]; then printf '\n請貼上 Supabase Access Token（輸入時不會顯示），按 Enter：'; read -rs TOKEN </dev/tty; echo; fi
TOKEN=$(printf '%s' "$TOKEN" | tr -d '[:space:]')
[ -n "$TOKEN" ] || fail "沒有輸入 Token"
if [ -z "$EMAIL" ]; then printf '請輸入你登入後台要用的 Email（會成為網站 Owner）：'; read -r EMAIL </dev/tty; fi
EMAIL=$(printf '%s' "$EMAIL" | tr -d '[:space:]')
[[ "$EMAIL" == *@*.* ]] || fail "Email 格式不對"

# 呼叫 API：call 方法 路徑 [JSON 內容或 @檔案]；回傳內容放在 $BODY，HTTP 碼放在 $CODE
call() {
  local m=$1 p=$2 d=${3:-}; local tmp; tmp=$(mktemp)
  if [ -n "$d" ]; then CODE=$(curl -sS -o "$tmp" -w '%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary "$d") || CODE=000
  else CODE=$(curl -sS -o "$tmp" -w '%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $TOKEN") || CODE=000; fi
  BODY=$(cat "$tmp"); rm -f "$tmp"
}
sql() { # 在資料庫執行 SQL（字串）
  local f; f=$(mktemp); python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' >"$f" <<<"$1"
  call POST "/projects/$REF/database/query" "@$f"; rm -f "$f"
}

say "1/7 檢查 Token"
call GET /organizations
[ "$CODE" = 200 ] || fail "Token 無效（HTTP $CODE）：$BODY"
ORG=$(echo "$BODY" | J 'print(d[0].get("slug") or d[0]["id"]) if d else print("")')
[ -n "$ORG" ] || fail "你的 Supabase 帳號還沒有組織（Organization）。請先到 https://supabase.com/dashboard 依畫面建立一個（選 Free），再重跑這個指令。"
echo "  組織：$ORG"

say "2/7 建立專案 $NAME（東京機房）"
call GET /projects
REF=$(echo "$BODY" | J "print(next((p['id'] for p in d if p.get('name')=='$NAME'), ''))")
if [ -n "$REF" ]; then
  echo "  已有同名專案，沿用：$REF"
else
  DBPASS=$(python3 -c 'import secrets,string; a=string.ascii_letters+string.digits; print("".join(secrets.choice(a) for _ in range(28)))')
  for body in \
    "{\"name\":\"$NAME\",\"organization_id\":\"$ORG\",\"db_pass\":\"$DBPASS\",\"region\":\"ap-northeast-1\"}" \
    "{\"name\":\"$NAME\",\"organization_slug\":\"$ORG\",\"db_pass\":\"$DBPASS\",\"region_selection\":{\"type\":\"specific\",\"code\":\"ap-northeast-1\"}}" \
    "{\"name\":\"$NAME\",\"organization_slug\":\"$ORG\",\"db_pass\":\"$DBPASS\",\"region_selection\":{\"type\":\"smartGroup\",\"code\":\"apac\"}}"; do
    call POST /projects "$body"
    if [ "$CODE" = 201 ] || [ "$CODE" = 200 ]; then break; fi
  done
  [ "$CODE" = 201 ] || [ "$CODE" = 200 ] || fail "建立專案失敗（HTTP $CODE）：$BODY
（免費方案最多 2 個專案；若已滿，請到 Supabase 後台暫停或刪除不用的專案後重跑）"
  REF=$(echo "$BODY" | J 'print(d.get("id") or d.get("ref"))')
  PWFILE="$HOME/kuangmi-supabase-資料庫密碼.txt"
  printf 'Supabase 專案 %s 的資料庫密碼（請自行保管，不要放到 GitHub）：\n%s\n' "$REF" "$DBPASS" >"$PWFILE"; chmod 600 "$PWFILE"
  echo "  專案：$REF（資料庫密碼已存到 $PWFILE）"
fi

say "3/7 等待專案啟動（通常 1–3 分鐘）"
for i in $(seq 1 90); do
  call GET "/projects/$REF"
  ST=$(echo "$BODY" | J 'print(d.get("status",""))' 2>/dev/null || true)
  if [ "$ST" = ACTIVE_HEALTHY ]; then sql "select 1" ; [ "$CODE" = 201 ] || [ "$CODE" = 200 ] && break; fi
  printf '  狀態：%s… \r' "${ST:-啟動中}"; sleep 10
done
[ "$ST" = ACTIVE_HEALTHY ] || fail "專案 15 分鐘內沒有啟動完成，請稍後重跑同一個指令。"
echo "  已啟動            "

say "4/7 建立資料表、權限並匯入資料"
sql "select to_regclass('public.content_revisions') is not null as done"
DONE=$(echo "$BODY" | J 'print(d[0]["done"])' 2>/dev/null || echo False)
if [ "$DONE" = True ]; then
  echo "  資料庫已建立過，略過（不會覆蓋你已編輯的內容）"
else
  for m in $MIGS; do
    f=$(mktemp); curl -fsSL "$RAW/supabase/migrations/$m" -o "$f" || fail "下載 $m 失敗"
    sql "$(cat "$f")"; rm -f "$f"
    [ "$CODE" = 201 ] || [ "$CODE" = 200 ] || fail "$m 執行失敗（HTTP $CODE）：$BODY"
    echo "  ✓ $m"
  done
fi
sql "select (select count(*) from public.terms) t, (select count(*) from public.bead_positions) b, (select count(*) from public.content_revisions where kind='publish') p"
echo "  檢查：$(echo "$BODY" | J 'r=d[0]; print("名相 %s、珠位 %s、正式版本 %s" % (r["t"], r["b"], r["p"]))')"

say "5/7 設定 Owner：$EMAIL"
Q=$(python3 -c 'import sys; print("select public.bootstrap_owner(\x27" + sys.argv[1].replace("\x27","\x27\x27") + "\x27) as r")' "$EMAIL")
sql "$Q"; [ "$CODE" = 201 ] || [ "$CODE" = 200 ] || fail "設定 Owner 失敗：$BODY"
echo "  ✓ 已授權"

say "6/7 設定登入（Email 登入連結、網站網址）"
call PATCH "/projects/$REF/config/auth" "{\"site_url\":\"$SITE/\",\"uri_allow_list\":\"$SITE/admin/,$SITE/,$SITE/**\",\"external_email_enabled\":true}"
if [ "$CODE" = 200 ]; then echo "  ✓ 完成"; else echo "  ⚠ 自動設定失敗（HTTP $CODE），稍後在 Supabase 後台手動設定即可：$BODY"; fi

say "7/7 取得網站要用的公開金鑰"
call GET "/projects/$REF/api-keys?reveal=true"
KEY=$(echo "$BODY" | J '
k=[x for x in d if x.get("name")=="anon" or x.get("type")=="legacy" and "anon" in (x.get("name") or "")]
k=k or [x for x in d if x.get("type")=="publishable"]
print(k[0]["api_key"] if k else "")')
[ -n "$KEY" ] || fail "取不到公開金鑰：$BODY"

cat <<EOF

==================== 完成！請把下面這兩行整段複製，貼回給 Claude ====================
supabaseUrl: "https://$REF.supabase.co"
supabaseAnonKey: "$KEY"
==================================================================================
（這把是公開金鑰，本來就會放在網站上，可以安心貼出。Token 與資料庫密碼不要貼。）

EOF
