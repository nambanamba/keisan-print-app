// 選ぶ・外す画面の検査（本物の Chrome）。長い一覧の下で10回押して、画面の位置・開いたパネルが動かないことと、中身を見るを確かめ、写真を tools/_見本/ に出す。
//   実行:  node tools/検査_選ぶ画面.js
const path = require("path"), fs = require("fs"), http = require("http");
const PW = process.env.PLAYWRIGHT_DIR || "C:/Users/mt-na/AppData/Roaming/npm/node_modules/playwright";
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(__dirname, "_見本");
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, n, x) => { if(c){ pass++; console.log("  PASS " + n); } else { fail++; console.log("  FAIL " + n + (x ? "  " + x : "")); } };
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png" };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]), f = path.join(ROOT, u === "/" ? "index.html" : u);
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(base);
  // ---- 正解登録の一覧 ----
  await page.click("#open-list-btn");
  const n = await page.locator("#list-body .list-item").count();
  ok(n > 40, "一覧は長い（" + n + "問）");
  const stBefore = await page.evaluate(() => localStorage.getItem("keisan_print_stats_v1"));
  await page.evaluate(() => window.scrollTo(0, 2500));
  await page.waitForTimeout(200);
  // 下のほうの行の「中身を見る」を1つ開いておく（開いたまま付け外ししても閉じないこと）
  const rows = page.locator("#list-body .list-row");
  const rowAt = async () => { const k = await page.evaluate(() => { const rs = [...document.querySelectorAll("#list-body .list-row")]; return rs.findIndex(r => r.getBoundingClientRect().top > 200); }); return k; };
  const k0 = await rowAt();
  await rows.nth(k0 + 1).locator(".peek-btn").click();
  ok(await rows.nth(k0 + 1).locator(".peek").isVisible(), "中身を見る：開いた");
  ok(!(await rows.nth(k0 + 1).locator(".peek").innerText()).includes("こたえ"), "中身に答えの欄は無い");
  await page.waitForTimeout(800);   // 図の読み込み待ち
  await page.screenshot({ path: path.join(OUT, "pickui_中身を見る.png") });
  const y0 = await page.evaluate(() => scrollY);
  await page.screenshot({ path: path.join(OUT, "pickui_一覧_押す前.png") });
  for(let i = 0; i < 10; i++){
    await rows.nth(k0 - 1 + (i % 2)).locator(".list-item").evaluate(el => el.click());      // 画面に見えている行を押すのと同じ（playwright の自動スクロールを避ける）
  }
  const y1 = await page.evaluate(() => scrollY);
  ok(y0 === y1, "10回押してもスクロール位置が同じ（" + y0 + " → " + y1 + "）");
  ok(await rows.nth(k0 + 1).locator(".peek").isVisible(), "10回押しても中身を見るが開いたまま");
  const solvedN = await page.locator("#list-body .list-item.solved").count();
  const stat = await page.locator("#list-stat-line").innerText();
  ok(stat.includes("正解ずみ " + solvedN + " /"), "数の表示が合う：" + stat);
  const top = await page.evaluate(() => document.getElementById("list-stat-line").getBoundingClientRect().top);
  ok(top >= -1 && top < 5, "数の表示は画面の上に固定（top=" + top + "）");
  await page.screenshot({ path: path.join(OUT, "pickui_一覧_押した後.png") });
  ok(errs.length === 0, "画面のエラー無し", errs.join("|"));
  // 後始末：検査用の記録は元に戻す
  await page.evaluate(v => { if(v === null) localStorage.removeItem("keisan_print_stats_v1"); else localStorage.setItem("keisan_print_stats_v1", v); }, stBefore);
  // ---- ◎をつける ----
  await page.goto(base);
  await page.evaluate(() => {
    const ids = QA_DATA.slice(0, 30).map(d => d.id), now = Date.now(), p = n => String(n).padStart(2, "0");
    const sheets = [];
    for(let s = 0; s < 3; s++){ sheets.push({ id: "2026-10-0" + (s + 1), date: "2026-10-0" + (s + 1), at: now - (3 - s) * 86400000, ids: ids.slice(s * 10, s * 10 + 10), marks: {} }); }
    localStorage.setItem("keisan_daily_v1", JSON.stringify({ sheets }));
  });
  await page.reload();
  await page.click("#daily-marks-btn");
  await page.locator("#marks-body details").nth(1).evaluate(d => d.open = true);
  const rws = page.locator("#marks-body details").first().locator(".mk-row");
  await rws.nth(6).scrollIntoViewIfNeeded();
  await rws.nth(6).locator(".peek-btn").click();
  await page.screenshot({ path: path.join(OUT, "pickui_◎_中身を見る.png") });
  const z0 = await page.evaluate(() => scrollY), op0 = await page.locator("#marks-body details[open]").count();
  const syms = ["◎", "△", "✕"];
  for(let i = 0; i < 10; i++) await rws.nth(7 + (i % 2)).locator('.mk-btn[data-r="' + syms[i % 3] + '"]').evaluate(el => el.click());
  const z1 = await page.evaluate(() => scrollY), op1 = await page.locator("#marks-body details[open]").count();
  ok(z0 === z1, "◎を10回押してもスクロール位置が同じ（" + z0 + " → " + z1 + "）");
  ok(op0 === 2 && op1 === 2, "開いているパネルは開いたまま（" + op0 + " → " + op1 + "）");
  ok(await rws.nth(6).locator(".peek").isVisible(), "◎を押しても中身を見るが開いたまま");
  ok((await page.locator("#marks-body summary").first().innerText()).includes("未8"), "見出しの数が変わる");
  await page.screenshot({ path: path.join(OUT, "pickui_◎_押した後.png") });
  await browser.close(); srv.close();
  console.log("結果: PASS " + pass + " / FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
