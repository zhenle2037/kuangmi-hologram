# 一鍵建立後台資料庫（Supabase）— Windows PowerShell 版
# 用法：在 PowerShell 貼上
#   irm https://raw.githubusercontent.com/zhenle2037/kuangmi-hologram/main/tools/setup_supabase.ps1 | iex
# 需要：Supabase Personal Access Token（https://supabase.com/dashboard/account/tokens 產生）。
# Token 只在本次執行中使用，不會存檔、不會上傳。可重複執行：已建立的專案與資料不會重複建立。
function Install-KuangmiBackend {
  $ErrorActionPreference = 'Stop'
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
  $API  = if ($env:KM_API) { $env:KM_API } else { 'https://api.supabase.com/v1' }
  $RAW  = if ($env:KM_RAW) { $env:KM_RAW } else { 'https://raw.githubusercontent.com/zhenle2037/kuangmi-hologram/main' }
  $SITE = 'https://zhenle2037.github.io/kuangmi-hologram'
  $NAME = 'kuangmi-hologram'
  $MIGS = @('20261015000100_schema.sql', '20261015000200_security.sql', '20261015000300_seed.sql')

  function Say($t)  { Write-Host ''; Write-Host ('▶ ' + $t) -ForegroundColor Green }
  function Fail($t) { Write-Host ''; Write-Host ('✖ ' + $t) -ForegroundColor Red; throw 'KM_STOP' }

  # 呼叫 Supabase API；回傳 @{ Code; Body; Data }
  function Call($method, $path, $obj) {
    $h = @{ Authorization = 'Bearer ' + $script:TOKEN }
    $p = @{ Uri = $API + $path; Method = $method; Headers = $h; UseBasicParsing = $true }
    if ($null -ne $obj) {
      $json = ConvertTo-Json -InputObject $obj -Depth 10 -Compress
      $p.Body = [Text.Encoding]::UTF8.GetBytes($json)
      $p.ContentType = 'application/json; charset=utf-8'
    }
    try {
      $r = Invoke-WebRequest @p
      $code = [int]$r.StatusCode
      $body = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    } catch {
      $code = 0; $body = $_.Exception.Message
      if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
      if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
    }
    $data = $null; if ($body) { try { $data = ConvertFrom-Json $body } catch {} }
    return @{ Code = $code; Body = $body; Data = $data }
  }
  function Sql($q) { return Call 'POST' "/projects/$script:REF/database/query" @{ query = $q } }
  function Ok($r) { return ($r.Code -eq 200 -or $r.Code -eq 201) }

  Write-Host ''
  $script:TOKEN = $env:KM_TOKEN
  if (-not $script:TOKEN) {
    $sec = Read-Host '請貼上 Supabase Access Token（貼上後不會顯示，直接按 Enter）' -AsSecureString
    $script:TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  }
  $script:TOKEN = ($script:TOKEN -replace '\s', '')
  if (-not $script:TOKEN) { Fail '沒有輸入 Token' }
  $EMAIL = $env:KM_EMAIL
  if (-not $EMAIL) { $EMAIL = Read-Host '請輸入你登入後台要用的 Email（會成為網站 Owner）' }
  $EMAIL = ($EMAIL -replace '\s', '')
  if ($EMAIL -notmatch '^[^@]+@[^@]+\.[^@]+$') { Fail 'Email 格式不對' }

  Say '1/7 檢查 Token'
  $r = Call 'GET' '/organizations' $null
  if ($r.Code -ne 200) { Fail ("Token 無效（HTTP " + $r.Code + "）：" + $r.Body) }
  $orgs = @($r.Data)
  if ($orgs.Count -eq 0) { Fail '你的 Supabase 帳號還沒有組織（Organization）。請先到 https://supabase.com/dashboard 依畫面建立一個（選 Free），再重跑這個指令。' }
  $ORG = if ($orgs[0].slug) { $orgs[0].slug } else { $orgs[0].id }
  Write-Host "  組織：$ORG"

  Say "2/7 建立專案 $NAME（東京機房）"
  $r = Call 'GET' '/projects' $null
  $script:REF = ''
  foreach ($pj in @($r.Data)) { if ($pj.name -eq $NAME) { $script:REF = $pj.id } }
  if ($script:REF) {
    Write-Host "  已有同名專案，沿用：$script:REF"
  } else {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $bytes = New-Object byte[] 28; $rng.GetBytes($bytes)
    $DBPASS = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    $bodies = @(
      @{ name = $NAME; organization_id = $ORG; db_pass = $DBPASS; region = 'ap-northeast-1' },
      @{ name = $NAME; organization_slug = $ORG; db_pass = $DBPASS; region_selection = @{ type = 'specific'; code = 'ap-northeast-1' } },
      @{ name = $NAME; organization_slug = $ORG; db_pass = $DBPASS; region_selection = @{ type = 'smartGroup'; code = 'apac' } }
    )
    foreach ($b in $bodies) { $r = Call 'POST' '/projects' $b; if (Ok $r) { break } }
    if (-not (Ok $r)) { Fail ("建立專案失敗（HTTP " + $r.Code + "）：" + $r.Body + "`n（免費方案最多 2 個專案；若已滿，請到 Supabase 後台暫停或刪除不用的專案後重跑）") }
    $script:REF = if ($r.Data.id) { $r.Data.id } else { $r.Data.ref }
    $dir = [Environment]::GetFolderPath('Desktop'); if (-not $dir) { $dir = $HOME }
    $pw = Join-Path $dir 'kuangmi-supabase-資料庫密碼.txt'
    try { Set-Content -Path $pw -Value ("Supabase 專案 $script:REF 的資料庫密碼（請自行保管，不要放到 GitHub）：`r`n$DBPASS") -Encoding UTF8 } catch { $pw = '（無法存檔）' + $DBPASS }
    Write-Host "  專案：$script:REF（資料庫密碼已存到桌面：$pw）"
  }

  Say '3/7 等待專案啟動（通常 1–3 分鐘，請勿關閉視窗）'
  $ST = ''
  for ($i = 0; $i -lt 90; $i++) {
    $r = Call 'GET' "/projects/$script:REF" $null
    if ($r.Data) { $ST = $r.Data.status }
    if ($ST -eq 'ACTIVE_HEALTHY') { $t = Sql 'select 1 as ok'; if (Ok $t) { break } }
    Write-Host ("  狀態：" + $(if ($ST) { $ST } else { '啟動中' }) + '…')
    Start-Sleep -Seconds 10
  }
  if ($ST -ne 'ACTIVE_HEALTHY') { Fail '專案 15 分鐘內沒有啟動完成，請稍後重跑同一個指令。' }
  Write-Host '  已啟動'

  Say '4/7 建立資料表、權限並匯入資料'
  $r = Sql "select to_regclass('public.content_revisions') is not null as done"
  $done = (Ok $r) -and @($r.Data).Count -gt 0 -and (@($r.Data)[0].done -eq $true)
  if ($done) {
    Write-Host '  資料庫已建立過，略過（不會覆蓋你已編輯的內容）'
  } else {
    $wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
    foreach ($m in $MIGS) {
      try { $q = $wc.DownloadString("$RAW/supabase/migrations/$m") } catch { Fail "下載 $m 失敗：$($_.Exception.Message)" }
      $r = Sql $q
      if (-not (Ok $r)) { Fail ("$m 執行失敗（HTTP " + $r.Code + "）：" + $r.Body) }
      Write-Host "  ✓ $m"
    }
  }
  $r = Sql "select (select count(*) from public.terms) t, (select count(*) from public.bead_positions) b, (select count(*) from public.content_revisions where kind='publish') p"
  if (Ok $r) { $c = @($r.Data)[0]; Write-Host ("  檢查：名相 " + $c.t + "、珠位 " + $c.b + "、正式版本 " + $c.p) }

  Say "5/7 設定 Owner：$EMAIL"
  $r = Sql ("select public.bootstrap_owner('" + $EMAIL.Replace("'", "''") + "') as r")
  if (-not (Ok $r)) { Fail ("設定 Owner 失敗：" + $r.Body) }
  Write-Host '  ✓ 已授權'

  Say '6/7 設定登入（Email 登入連結、網站網址）'
  $r = Call 'PATCH' "/projects/$script:REF/config/auth" @{ site_url = "$SITE/"; uri_allow_list = "$SITE/admin/,$SITE/,$SITE/**"; external_email_enabled = $true }
  if ($r.Code -eq 200) { Write-Host '  ✓ 完成' } else { Write-Host ("  ⚠ 自動設定失敗（HTTP " + $r.Code + "），之後可在 Supabase 後台手動設定：" + $r.Body) -ForegroundColor Yellow }

  Say '7/7 取得網站要用的公開金鑰'
  $r = Call 'GET' "/projects/$script:REF/api-keys?reveal=true" $null
  $keys = @($r.Data); $KEY = ''
  foreach ($k in $keys) { if ($k.name -eq 'anon' -and $k.api_key) { $KEY = $k.api_key } }
  if (-not $KEY) { foreach ($k in $keys) { if ($k.type -eq 'publishable' -and $k.api_key -and -not $KEY) { $KEY = $k.api_key } } }
  if (-not $KEY) { Fail ("取不到公開金鑰：" + $r.Body) }

  Write-Host ''
  Write-Host '==================== 完成！請把下面這兩行整段複製，貼回給 Claude ====================' -ForegroundColor Cyan
  Write-Host ('supabaseUrl: "https://' + $script:REF + '.supabase.co"')
  Write-Host ('supabaseAnonKey: "' + $KEY + '"')
  Write-Host '==================================================================================' -ForegroundColor Cyan
  Write-Host '（這把是公開金鑰，本來就會放在網站上，可以安心貼出。Token 與資料庫密碼不要貼。）'
  Write-Host ''
}
try { Install-KuangmiBackend } catch { if ("$_" -ne 'KM_STOP') { Write-Host ("✖ 發生錯誤：" + $_) -ForegroundColor Red } }
