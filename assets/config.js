/* 網站與 Supabase 的連線設定（公開資訊，可放在 GitHub）。
 * 只填 Project URL 與 anon public key；切勿放入 service_role key 或任何密碼。
 * 兩者留空時，網站會讀取 data/content.js（離線備援）。 */
window.KM_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseJs: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
};
