// 驗證腳本：資料數量、珠位規則、兩種模式的操作、手機版與 3D 失效模式。
// 用法：NODE_PATH=$(npm root -g) node tools/verify.cjs <網址> [截圖資料夾]
// 註：無 GPU 的環境（SwiftShader）每秒只有數幀，鏡頭動畫需等較久，故等待時間設得較長。
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], shots = process.argv[3];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = []; const ok = (n, c, x = '') => out.push((c ? 'PASS' : 'FAIL') + ' ' + n + (x !== '' ? '  ' + x : ''));
  const WAIT = 7000;
  const errs = [];
  const watch = (p, tag) => { p.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) errs.push(tag + 'request failed ' + r.url()); }); p.on('pageerror', e => errs.push(tag + String(e))); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errs.push(tag + m.text()); }); };
  const pane = p => p.textContent('#pane-content');

  /* ---------- 桌面 ---------- */
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p, 'desktop: ');
  await p.goto(url); await p.waitForFunction(() => window.__kmReady, null, { timeout: 90000 });
  await p.click('#motion'); await p.waitForTimeout(1000);
  const st = await p.evaluate(() => KM3D.stats());
  ok('環上108顆', st.beads === 108);
  ok('隔珠在27/54/81/108', JSON.stringify(st.spacers) === '[27,54,81,108]');
  ok('串繩連續貫穿、珠心同圓', st.axisErr < 1e-6 && st.strings === 1);
  ok('相鄰珠不重疊', st.minGap > 0, st.minGap.toFixed(3));
  ok('佛頭珠在第108顆上方、飾穗在佛頭珠尾端', st.guruAbove && st.tasselAbove);
  const d = await p.evaluate(() => {
    const D = KM.D, by = g => D.terms.filter(t => t.group === g).length;
    const slots = D.terms.map(t => t.slot), secs = D.chapters.reduce((a, c) => a + c.sections.length, 0), items = D.chapters.reduce((a, c) => a + c.sections.reduce((x, s) => x + (s.items || []).length, 0), 0);
    const t = n => D.terms.find(x => x.name === n);
    return { terms: D.terms.length, by: [by('見'), by('修'), by('行'), by('果')].join(), uniq: new Set(slots).size === slots.length, assigned: KM.ASSIGNED.length,
      inSpacer: slots.filter(s => s % 27 === 0).length, chapters: D.chapters.length, secs, items, ch14: D.chapters[13].sections.length, extras: D.extras.length,
      chizhou: [t('持咒').slot, t('持咒').show.join()], zhongyou: [t('密宗之中有解脫').slot, t('密宗之中有解脫').show.join()],
      ch7: D.chapters[6].vols.join(), ch9: D.chapters[8].vols.join(), quote: document.querySelector('#quote-full').textContent,
      chBeads: Object.values(KM.CH_BEAD).filter(n => !KM.BEADS[n].spacer).length };
  });
  ok('名相76（見17修21行19果19）', d.terms === 76 && d.by === '17,21,19,19', d.by);
  ok('每個名相唯一主珠位、無放在隔珠', d.uniq && d.inSpacer === 0 && d.assigned === 76);
  ok('持咒：主珠位修區、可顯示於修行', d.chizhou[0] >= 28 && d.chizhou[0] <= 53 && d.chizhou[1] === '修,行', d.chizhou.join(' '));
  ok('中有解脫：主珠位果區、可顯示於果修', d.zhongyou[0] >= 82 && d.zhongyou[0] <= 107 && d.zhongyou[1] === '果,修', d.zhongyou.join(' '));
  ok('17章、節160（含第七章第三節上下半）、目21', d.chapters === 17 && d.secs === 160 && d.items === 21, d.secs + '/' + d.items);
  ok('第十四章40節', d.ch14 === 40);
  ok('第七章跨一二輯、第九章跨二三輯（同一章）', d.ch7 === '1,2' && d.ch9 === '2,3');
  ok('序、附錄、跋等8個入口', d.extras === 8);
  ok('17章各配1顆普通數珠', d.chBeads === 17);
  const Q = '以數珠為喻：西藏密宗乃是以種種虛構之觀想法、持外道咒、天瑜伽、遷識⋯等外道法為數珠，以風瑜伽為隔珠，以佛教教相及僧寶表相為佛頭珠；以自己所定義之般若中觀名相及果位修證名相，作為佛頭珠所懸之飾穗，最後以淫樂之樂空雙運欲界外道雙身法為串繩，貫串密宗之一切成佛理論與行門。如是串成之數珠，即是西藏密教之真實宗義。－－平實導師－－';
  ok('引文逐字一致', d.quote === Q);
  ok('引文預設只顯示開頭', (await p.textContent('#quote')).length < 60);
  await p.click('#quote-toggle'); ok('點選展開完整引文與署名', (await p.textContent('#quote')) === Q); await p.click('#quote-toggle');
  ok('總覽顯示5個部件文字', await p.evaluate(() => [...document.querySelectorAll('.lab-parts')].filter(e => e.style.display !== 'none').length) === 5);
  if (shots) await p.screenshot({ path: shots + '/d1-overview.png' });

  const c5 = await p.evaluate(() => KM3D.screenOf(5)); await p.mouse.click(c5.x, c5.y);
  await p.waitForFunction(() => Math.abs(KM3D.screenOf(5).x - 534) < 30, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500);
  ok('點珠：面板直接顯示名相與來源', (await pane(p)).includes('相關章節與頁碼'));
  const s5 = await p.evaluate(() => KM3D.screenOf(5));
  ok('點珠：珠子轉到畫面中央', Math.abs(s5.x - 534) < 30, Math.round(s5.x) + ',' + Math.round(s5.y));
  ok('聚焦時標出相鄰珠名', await p.$$eval('#fan .nb', e => e.length) >= 2);
  if (shots) await p.screenshot({ path: shots + '/d2-bead.png' });
  await p.evaluate(() => KM.go('bead:17')); await p.click('#next'); await p.waitForTimeout(500);
  ok('下一珠跳過待配置（17→28）', (await p.evaluate(() => KM.getSel().n)) === 28);
  await p.click('#prev'); await p.waitForTimeout(300);
  ok('上一珠（28→17）', (await p.evaluate(() => KM.getSel().n)) === 17);
  await p.evaluate(() => KM.go('bead:20')); await p.waitForTimeout(300);
  ok('未配置珠位顯示待配置', (await pane(p)).includes('待配置珠位'));
  await p.evaluate(() => KM.go('zone:2')); await p.waitForTimeout(300);
  ok('行區列出跨類的持咒（同一珠位）', await p.evaluate(() => !![...document.querySelectorAll('#pane-content .chip.cross')].find(e => e.textContent.includes('持咒') && e.dataset.go === 'bead:' + KM.D.terms.find(t => t.name === '持咒').slot)));
  await p.click('#home'); await p.waitForTimeout(WAIT);
  await p.click('#zoneview'); await p.waitForTimeout(2500);
  ok('依四區查看名相：顯示四區入口', await p.evaluate(() => [...document.querySelectorAll('.lab-zones')].filter(e => e.style.display !== 'none').length) >= 8);
  await p.click('.lab-zones[data-act="zone:0"]'); await p.waitForTimeout(500);
  ok('選區後列出該區名相', (await pane(p)).includes('如來藏'));
  await p.evaluate(() => KM.go('bead:1')); await p.waitForTimeout(300);
  await p.click('#pane-content .ref[data-go="sec:6-1"]'); await p.waitForTimeout(500);
  ok('由名相的章節頁碼進入原書導讀同一節', (await p.evaluate(() => KM.getMode() + ' ' + KM.getSel().id)) === 'book 6-1');

  await p.click('#home'); await p.waitForTimeout(WAIT);
  ok('原書導讀：顯示17章名', await p.evaluate(() => [...document.querySelectorAll('.lab-book')].filter(e => e.style.display !== 'none').length) >= 14);
  if (shots) await p.screenshot({ path: shots + '/d3-book.png' });
  await p.evaluate(() => KM.go('chapter:c14')); await p.waitForTimeout(WAIT);
  ok('章：顯示目前範圍「第1–7節／共40節」', (await pane(p)).includes('第 1–7 節／共 40 節'));
  for (let i = 0; i < 5; i++) { await p.click('[data-batch="c14:1"]'); }
  ok('換批到最後一批（第36–40節）', (await pane(p)).includes('第 36–40 節／共 40 節'));
  ok('最後一批「後一批」停用', await p.$eval('[data-batch="c14:1"]', e => e.disabled));
  if (shots) await p.screenshot({ path: shots + '/d4-chapter.png' });
  await p.click('#next'); await p.waitForTimeout(300);
  ok('下一章只走章入口（14→15）', (await p.evaluate(() => KM.getSel().id)) === 'c15');
  await p.evaluate(() => KM.go('sec:16-1')); await p.waitForTimeout(300);
  ok('選節展開目（第十六章第一節三目）', await p.$$eval('#pane-content .items.open .irow', e => e.length) === 3);
  await p.evaluate(() => KM.go('sec:7-3b')); await p.waitForTimeout(300);
  ok('第七章第三節下半屬同一章（第二輯）', (await pane(p)).includes('第七章') && (await pane(p)).includes('第二輯'));
  await p.click('#tab-toc');
  const toc = await p.evaluate(() => ({ ch: document.querySelectorAll('#pane-toc details').length, rows: document.querySelectorAll('#pane-toc .trow').length }));
  ok('完整目次：17章、181節目＋8入口', toc.ch === 17 && toc.rows === 181 + 8, JSON.stringify(toc));
  await p.click('#mode-mala'); await p.waitForTimeout(300);
  ok('一鍵切回以數珠為喻', (await p.evaluate(() => KM.getMode())) === 'mala');

  await p.close();
  /* ---------- 手機 ---------- */
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }); watch(m, 'mobile: ');
  await m.goto(url); await m.waitForFunction(() => window.__kmReady, null, { timeout: 90000 });
  ok('手機無橫向捲動', (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.evaluate(() => KM.go('chapter:c14')); await m.waitForTimeout(500);
  ok('手機每批5節', (await m.textContent('#pane-content')).includes('第 1–5 節／共 40 節'));
  if (shots) await m.screenshot({ path: shots + '/m1.png' });

  await m.close();
  /* ---------- 3D 失效 ---------- */
  const f = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await f.route('**/vendor/three.min.js', r => r.abort());
  await f.goto(url); await f.waitForTimeout(1500);
  ok('3D 失效：顯示提示且目次可用', await f.isVisible('#gl-fail') && (await f.$$eval('#pane-toc .trow', e => e.length)) === 189);
  await f.evaluate(() => KM.go('sec:14-40'));
  ok('3D 失效：仍可閱讀章節', (await f.textContent('#pane-content')).includes('第四十節'));

  ok('無 JS 錯誤', errs.length === 0, errs.join(' | '));
  console.log(out.join('\n'));
  await b.close();
})();
