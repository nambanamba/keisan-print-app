// 理科 第7回「物の燃焼」calc 11問（r7c01〜11）を data.js に追記し、図2枚を images/ に置く（2026-10-07）
//   node tools/取り込み_第7回.js --check   … 何も書かずに、やることを表示
//   node tools/取り込み_第7回.js --apply   … data.js に追記・画像をコピー
// ★既存の問題には一切さわらない。元データ・画像は sha256 を照合してから読む（違えばまず開き直す。同期の遅れでも合わない）
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP = path.join(__dirname, "..");
const DIR = "G:/マイドライブ/四谷大塚/5年下/quiz_csv_理科/";
const SRC = DIR + "第7回_物の燃焼_calc.json";
const EXPECT = {
  [SRC]: "77b314dd",
  [DIR + "画像プレビュー/r7c_01.jpg"]: "dde4dac9",
  [DIR + "画像プレビュー/r7c_02.jpg"]: "c814d251",
};
const DATA = path.join(APP, "data.js");
const apply = process.argv.includes("--apply");

const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
for (const [f, pre] of Object.entries(EXPECT)) {
  const s = sha(f);
  if (!s.startsWith(pre)) { console.error("★中止: sha256 が宣言と違います（開き直して再実行。それでも違えば相手に確認）\n  " + f + "\n  期待 " + pre + "… 実際 " + s); process.exit(1); }
  console.log("sha256 一致 " + pre + "  " + path.basename(f));
}
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
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
  if (!/^r7c(0[1-9]|1[01])$/.test(e.id)) errs.push("想定外の id: " + e.id);
  for (const k of ["id", "subj", "u", "q", "note", "a", "kai", "kind", "sol", "priority", "level"]) if (e[k] === undefined || e[k] === "") errs.push(e.id + ": " + k + " が空");
  if (e.img && !fs.existsSync(DIR + "画像プレビュー/" + e.img)) errs.push(e.id + ": 画像元が無い " + e.img);
}
if (entries.length !== 11) errs.push("件数が11でない");
if (errs.length) { console.error("★中止:\n  " + errs.join("\n  ")); process.exit(1); }
console.log("関門: 全通過");
if (!apply) { console.log("--check なので書き込みません"); process.exit(0); }

for (const e of entries) if (e.img) fs.copyFileSync(DIR + "画像プレビュー/" + e.img, path.join(APP, "images", e.img));
const block = entries.map(e => JSON.stringify(e, null, 1).split("\n").map(l => " " + l).join("\n") + ",").join("\n") + "\n";
const at = dataText.lastIndexOf("\n];");
if (at < 0) { console.error("★中止: data.js の末尾 '];' が無い"); process.exit(1); }
fs.writeFileSync(DATA, dataText.slice(0, at + 1) + block + dataText.slice(at + 1));
console.log("追記: " + entries.length + "件、画像 " + entries.filter(e => e.img).length + "枚");
