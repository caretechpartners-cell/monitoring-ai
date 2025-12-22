import fs from "fs";
import ExcelJS from "exceljs";
import path from "path";
import { Document, Packer, Paragraph } from "docx";


/* ===============================
   共通ユーティリティ
================================ */

function extractSection(text, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `【${escaped}】([\\s\\S]*?)(?=【検討事項】|【検討内容】|【会議の結論】|【残された課題】|$)`
  );
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function compactSentence(sentence) {
  return sentence
    .replace(/が見られており/g, "があり")
    .replace(/について検討が必要である/g, "を検討")
    .replace(/について検討した/g, "を検討")
    .replace(/必要である/g, "必要")
    .replace(/を中心に話し合った/g, "を検討")
    .replace(/と、それに伴う/g, "、")
    .replace(/との報告があった/g, "とのこと")
    .replace(/していく予定である/g, "予定")
    .replace(/と考えられる/g, "と考える")
    .replace(/今後の/g, "")
    .trim();
}

function removeNextMeetingSentences(text) {
  if (!text) return "";
  return text
    .split("。")
    .map(s => s.trim())
    .filter(s =>
      !s.match(/次回/) &&
      !s.match(/会議.*予定/) &&
      !s.match(/開催.*予定/)
    )
    .join("。");
}

function toBulletText(text, maxLines = 4) {
  if (!text) return "";

  const bullets = text
    .split("。")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `・${compactSentence(s)}`);

  if (bullets.length <= maxLines) {
    return bullets.join("\n");
  }

  return bullets.slice(0, maxLines).join("\n") + "\n（他省略）";
}

/* ===============================
   export.js 統合ハンドラ
================================ */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { action } = req.body;

    /* =====================================================
       📊 Excel 出力（旧 export-excel.js）
       ===================================================== */
    if (action === "excel") {
      const { memo, aiResult } = req.body;

      if (!memo || !aiResult) {
        return res.status(400).json({ error: "memo または aiResult が不足" });
      }

    /* ----------------------------
       ① 利用者名抽出
    ---------------------------- */

    let userName = "利用者";

    // ① 明示的に「利用者：山田太郎」があれば最優先
    const explicitMatch = memo.match(/利用者[:：]\s*([^\n　]+)/);
    if (explicitMatch) {
    userName = explicitMatch[1].trim();
  } else {
  // ② 先頭付近の日本人名っぽい行を探す
    const lines = memo
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

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

    const templateBuffer = fs.readFileSync(templatePath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);
    const sheet = workbook.getWorksheet(1);

// ★ 安全対策：テンプレート異常検知
if (!sheet) {
  return res.status(500).json({
    error: "テンプレートの1番目のシートが見つかりません"
  });
}



    const set = (cell, value) => {
      sheet.getCell(cell).value = value;
    };

    /* ============================
       共通スタイルヘルパー（←ここ）
    ============================ */

    const applyWrappedSmallText = (cellAddress) => {
    const cell = sheet.getCell(cellAddress);
    cell.font = { size: 8 };
    cell.alignment = {
    wrapText: true,
    vertical: "top",
  };
};

const applyWrappedNormalText = (cellAddress) => {
  const cell = sheet.getCell(cellAddress);
  cell.font = { size: 11 };
  cell.alignment = {
    wrapText: true,
    vertical: "top",
  };
};

    /* ----------------------------
       ③ 日付関連（仕様通りに修正）
    ---------------------------- */
    // 冒頭1〜2行だけを解析対象にする（次回開催対策）
    const headLines = memo
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

    // M1：作成年月日 → 今日の日付を強制セット
    const now = new Date();
    const today =
     `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
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

    // K5：開催時間（冒頭のみ参照）
    const timeMatch = headLines.match(/(\d{1,2}:\d{2})\s*[〜\-]\s*(\d{1,2}:\d{2})/);
    if (timeMatch) {
    set("K5", `${timeMatch[1]}-${timeMatch[2]}`);
}

    // F5：開催場所（冒頭から推測）
    let place = "";

    // ① 「〇〇にて」「〇〇で」
    const placeMatch1 = headLines.match(
    /(?:\d{1,2}\/\d{1,2})?\s*(?:\d{1,2}:\d{2}[〜\-]\d{1,2}:\d{2})?\s*(.+?)(にて|で)/
);

    if (placeMatch1) {
    place = placeMatch1[1].trim();
}

    // ② 「利用者宅」など単語
    if (!place) {
    const placeMatch2 = headLines.match(/(利用者宅|自宅|事業所|会議室)/);
    if (placeMatch2) {
    place = placeMatch2[1];
  }
}

if (place) {
  set("F5", place);
}

    /* ----------------------------
       ⑤ 参加者
    ---------------------------- */
    // 出席者だけを対象に
    // 欠席・電話・事前は除外
    // 続柄を正規化して familyRelations に入れる

    let careManagerName = "";
    let has本人 = false;
    let familyRelations = [];


    const FAMILY_KEYWORDS = ["兄弟", "姉妹", "妻", "夫", "父", "母"];
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

  applyWrappedSmallText("C8");
  applyWrappedSmallText("C10");
  applyWrappedSmallText("C12");

  applyWrappedSmallText("G8");
  applyWrappedSmallText("G10");
  applyWrappedSmallText("G12");

  applyWrappedSmallText("K8");
  applyWrappedSmallText("K10");
  applyWrappedSmallText("K12");

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

    // 本人判定
    if (m[2].includes("本人") || m[2].includes("利用者")) {
    has本人 = true;
    }

    // 家族判定
    for (const rel of FAMILY_KEYWORDS) {
    if (m[2].includes(rel) && !familyRelations.includes(rel)) {
      familyRelations.push(rel);
    }
}
    // ケアマネ抽出（M3用）
    if (!careManagerName && m[2].includes("ケアマネ")) {
    careManagerName = m[3];
  }

    idx++;
}
}

    // B10：本人
    set("B10", has本人 ? "あり" : "なし");

    // B11・B12：家族
    if (familyRelations.length > 0) {
    set("B11", "あり");
    set("B12", familyRelations.join("、"));
    } else {
    set("B11", "なし");
    set("B12", "");
    }

    // M3：ケアマネジャー名
    if (careManagerName) {
    set("M3", careManagerName);
    }

    /* ----------------------------
       ⑥ AI結果（見出し完全対応）
    ---------------------------- */

    const sectionKento = extractSection(aiResult, "検討事項");
    const sectionNaiyo = extractSection(aiResult, "検討内容");
    const sectionKetsuron = extractSection(aiResult, "会議の結論");
    const sectionKadai = extractSection(aiResult, "残された課題");

    // C14：検討した項目 → 箇条書き
    if (sectionKento) {
    set("C14", toBulletText(sectionKento));
    }

    // C18：検討内容 → 箇条書き
    if (sectionNaiyo) {
    set("C18", toBulletText(sectionNaiyo));
    }

    // C22：会議の結論 → 文章のまま
    if (sectionKetsuron) {
    set("C22", compactSentence(sectionKetsuron));
    }

    // C27：残された課題 → 箇条書き
    if (sectionKadai) {
    const cleanedKadai = removeNextMeetingSentences(sectionKadai);
    set("C27", toBulletText(cleanedKadai));
    }


    applyWrappedNormalText("C14");
    applyWrappedNormalText("C18");
    applyWrappedNormalText("C22");
    applyWrappedNormalText("C27");

function adjustRowHeight(cellAddress) {
  const cell = sheet.getCell(cellAddress);
  const row = sheet.getRow(cell.row);
  const lines = (cell.value || "").toString().split("\n").length;
  row.height = Math.max(18, lines * 18);
}

["C14", "C18", "C22", "C27"].forEach(adjustRowHeight);


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
res.setHeader(
  "Content-Disposition",
  "attachment; filename=kaigiroku.xlsx"
);

await workbook.xlsx.write(res);
res.end();

return;
}

    /* =====================================================
       📄 Word 出力（旧 download.js）
       ===================================================== */
    if (action === "docx") {
      const { text } = req.body;

      const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph(text || "生成データがありません")
      ]
    }
  ],
});


      const buffer = await Packer.toBuffer(doc);

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=monitoring.docx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      res.send(buffer);
      return;
    }

    /* =====================================================
       ❌ 未対応 action
       ===================================================== */
    return res.status(400).json({ error: "unknown_action" });

  } catch (err) {
    console.error("export.js error:", err);
    return res.status(500).json({
      error: "export_failed",
      detail: err.message,
    });
  }
}
