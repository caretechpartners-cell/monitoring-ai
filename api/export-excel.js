import ExcelJS from "exceljs";
import path from "path";

function extractSection(text, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `【${escaped}】([\\s\\S]*?)(?=【検討事項】|【検討内容】|【会議の結論】|【残された課題】|$)`
  );

  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { memo, aiResult } = req.body;

    if (!memo || !aiResult) {
      return res.status(400).json({ error: "memo または aiResult が不足" });
    }

    /* ----------------------------
       ① 利用者名抽出
    ---------------------------- */

    let userName = null;

    const explicitMatch = memo.match(/利用者[:：]\s*([^\n　]+)/);
    if (explicitMatch) {
      userName = explicitMatch[1].trim();
    }

    if (!userName) {
      const lines = memo.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (
          /^[一-龥]{2,4}\s*[一-龥]{2,4}/.test(line) &&
          !line.includes("参加") &&
          !line.includes("場所")
        ) {
          userName = line.split(/\s+/)[0];
          break;
        }
      }
    }

    if (!userName) {
      userName = "利用者";
    }

    /* ----------------------------
       ② テンプレート読み込み
    ---------------------------- */

    const templatePath = path.join(
      process.cwd(),
      "templates",
      "kaigiroku.xlsx"
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const sheet = workbook.getWorksheet(1);

    const set = (cell, value) => {
      sheet.getCell(cell).value = value;
    };

    /* ----------------------------
       ③ 日付関連（仕様通りに修正）
    ---------------------------- */

    // M1：作成年月日 → 今日の日付を強制セット
    const today = new Date().toISOString().split("T")[0];
    set("M1", today);

    // B3：利用者名
    set("B3", userName);

    // B5：開催日（年なしOK）
    let meetingDate = "";
    const meetingDateMatch = memo.match(/(\d{1,2})\/(\d{1,2})/);
    if (meetingDateMatch) {
    const year = new Date().getFullYear();
    meetingDate = `${year}/${meetingDateMatch[1]}/${meetingDateMatch[2]}`;
    set("B5", meetingDate);
}

    // K5：時間
    const timeMatch = memo.match(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
    if (timeMatch) set("K5", timeMatch[0]);

    // F5：場所
    const placeMatch = memo.match(/場所[:：]\s*(.+)/);
    if (placeMatch) set("F5", placeMatch[1].trim());

    /* ----------------------------
       ④ 本人・家族
    ---------------------------- */

    if (memo.includes("本人")) set("B10", "あり");

    const familyMatch = memo.match(/家族[:：]\s*([^\n]+)/);
    if (familyMatch) {
      set("B11", "あり");
      set("B12", familyMatch[1].trim());
    }

    /* ----------------------------
       ⑤ 参加者
    ---------------------------- */

    const membersMatch = memo.match(/参加者[:：]\s*([\s\S]*?)(?:\n\s*\n|$)/);

if (membersMatch) {
  const lines = membersMatch[1]
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const targets = [
    ["C8", "E8"], ["C10", "E10"], ["C12", "E12"],
    ["G8", "I8"], ["G10", "I10"], ["G12", "I12"],
    ["K8", "M8"], ["K10", "M10"], ["K12", "M12"]
  ];

  let idx = 0; // ← 有効参加者用インデックス

  for (const line of lines) {
    if (idx >= targets.length) break;

    // 欠席者除外
    if (
      line.includes("欠席") ||
      line.includes("不参加") ||
      line.includes("事前") ||
      line.includes("電話")
    ) {
      continue;
    }

    const m = line.match(/(.+?)（(.+?)）\s*(.+)/);
    if (!m) continue;

    // 所属（職種） → C列
    set(targets[idx][0], `${m[1]}（${m[2]}）`);
    // 氏名 → E列
    set(targets[idx][1], m[3]);

    idx++;
  }
}


    /* ----------------------------
       ⑥ AI結果（見出し完全対応）
    ---------------------------- */

    const sectionKento = extractSection(aiResult, "検討事項");
    const sectionNaiyo = extractSection(aiResult, "検討内容");
    const sectionKetsuron = extractSection(aiResult, "会議の結論");
    const sectionKadai = extractSection(aiResult, "残された課題");

    if (sectionKento) set("C14", sectionKento);
    if (sectionNaiyo) set("C18", sectionNaiyo);
    if (sectionKetsuron) set("C22", sectionKetsuron);
    if (sectionKadai) set("C27", sectionKadai);

    /* ----------------------------
       ⑦ 次回開催日（C31）
    ---------------------------- */

    let nextDate = null;

    // 年あり優先
    const nextFullMatch = memo.match(/次回.*?(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (nextFullMatch) {
      nextDate = `${nextFullMatch[1]}/${nextFullMatch[2]}/${nextFullMatch[3]}`;
    }

    // 年なし（月/日のみ）
    if (!nextDate) {
      const nextShortMatch = memo.match(/次回.*?(\d{1,2})\/(\d{1,2})/);
      if (nextShortMatch) {
        const now = new Date();
        let year = now.getFullYear();
        const month = parseInt(nextShortMatch[1], 10);

        // 年跨ぎ対策
        if (month < now.getMonth() + 1) {
          year += 1;
        }

        nextDate = `${year}/${nextShortMatch[1]}/${nextShortMatch[2]}`;
      }
    }

    if (nextDate) {
      set("C31", nextDate);
    }

    /* ----------------------------
       ⑧ 出力
    ---------------------------- */
    res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
);

await workbook.xlsx.write(res);
res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel生成エラー", detail: err.message });
  }
}
