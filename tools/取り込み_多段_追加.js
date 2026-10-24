// 理科 第8回「何段かで解く計算」の追加 4問（r8d06〜09）を data.js に追記し、図4枚を images/ に置く（2026-10-24）
// ユーザー決定（10-24）: 多段の計算は暗記カードから外して計算プリントへ。第8回週テストで落とした型（上下のばね・一部だけ水中・浮く物と台ばかり）を本から選んだ
//   node tools/取り込み_多段_追加.js --check   … 何も書かずに、やることを表示
//   node tools/取り込み_多段_追加.js --apply   … data.js に追記・画像をコピー
// ★既存の問題には一切さわらない。元データ・画像は sha256 を照合してから読む（違えばまず開き直す。同期の遅れでも合わない）
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP = path.join(__dirname, "..");
const DIR = "G:/マイドライブ/四谷大塚/5年下/quiz_csv_理科/";
const SRCS = [DIR + "第8回_ばね浮力圧力_calc多段_追加.json"];
const EXPECT = {
  [SRCS[0]]: "003eaa27",
  [DIR + "画像プレビュー/r8r_1.jpg"]: "781eb27c",
  [DIR + "画像プレビュー/r8r_2.jpg"]: "eb632645",
  [DIR + "画像プレビュー/r8y_1.jpg"]: "5a55076e",
  [DIR + "画像プレビュー/r8y_2.jpg"]: "ef35951b",
};
const DATA = path.join(APP, "data.js");
const apply = process.argv.includes("--apply");

const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
for (const [f, pre] of Object.entries(EXPECT)) {
  const s = sha(f);
  if (!s.startsWith(pre)) { console.error("★中止: sha256 が宣言と違います（開き直して再実行。それでも違えば相手に確認）\n  " + f + "\n  期待 " + pre + "… 実際 " + s); process.exit(1); }
  console.log("sha256 一致 " + pre + "  " + path.basename(f));
}
const src = SRCS.flatMap(f => JSON.parse(fs.readFileSync(f, "utf8")));
const dataText = fs.readFileSync(DATA, "utf8");
const QA_DATA = eval(dataText + "; QA_DATA");
const existingIds = new Set(QA_DATA.map(d => d.id));
console.log("元データ " + src.length + "件 / 既存 " + QA_DATA.length + "件");

const entries = src.map(o => {
  const e = { id: o.id, subj: o.subject, u: o.genre, q: o.q, note: o.note, a: o.a };
  if (o.file) e.img = o.file;
  e.kai = o.kai; e.kind = o.kind; e.sol = o.sol; e.priority = o.priority; e.level = o.level;
  return e;
});
const errs = [];
for (const e of entries) {
  if (existingIds.has(e.id)) errs.push("id 衝突: " + e.id);
  if (e.level !== "多段") errs.push(e.id + ": level が多段でない");
  if (!/^r8d0[6-9]$/.test(e.id)) errs.push("想定外の id: " + e.id);
  for (const k of ["id", "subj", "u", "q", "note", "a", "kai", "kind", "sol", "priority", "level"]) if (e[k] === undefined || e[k] === "") errs.push(e.id + ": " + k + " が空");
  if (e.img && !fs.existsSync(DIR + "画像プレビュー/" + e.img) && !fs.existsSync(path.join(APP, "images", e.img))) errs.push(e.id + ": 画像元が無い " + e.img);
}
if (entries.length !== 4) errs.push("件数が4でない");
if (errs.length) { console.error("★中止:\n  " + errs.join("\n  ")); process.exit(1); }
console.log("関門: 全通過");
if (!apply) { console.log("--check なので書き込みません"); process.exit(0); }

for (const e of entries) if (e.img) { const to = path.join(APP, "images", e.img); if (fs.existsSync(to)) { console.error("★中止: 画像がすでにある " + e.img); process.exit(1); } fs.copyFileSync(DIR + "画像プレビュー/" + e.img, to); }
const block = entries.map(e => JSON.stringify(e, null, 1).split("\n").map(l => " " + l).join("\n") + ",").join("\n") + "\n";
const at = dataText.lastIndexOf("\n];");
if (at < 0) { console.error("★中止: data.js の末尾 '];' が無い"); process.exit(1); }
fs.writeFileSync(DATA, dataText.slice(0, at + 1) + block + dataText.slice(at + 1));
console.log("追記: " + entries.length + "件、画像 " + entries.filter(e => e.img).length + "枚");
