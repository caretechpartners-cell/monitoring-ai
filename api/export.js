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

      /* -------- 利用者名抽出 -------- */
      let userName = "利用者";
      const explicitMatch = memo.match(/利用者[:：]\s*([^\n　]+)/);
      if (explicitMatch) {
        userName = explicitMatch[1].trim();
      } else {
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

      /* -------- テンプレート -------- */
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

      const applyWrapped = (cell, size = 11) => {
        const c = sheet.getCell(cell);
        c.font = { size };
        c.alignment = { wrapText: true, vertical: "top" };
      };

      /* -------- 日付 -------- */
      const now = new Date();
      set("M1", `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`);
      set("B3", userName);

      const dateMatch = memo.match(/(\d{1,2})\/(\d{1,2})/);
      if (dateMatch) {
        set("B5", `${now.getFullYear()}/${dateMatch[1]}/${dateMatch[2]}`);
      }

      /* -------- AI結果 -------- */
      const kento = extractSection(aiResult, "検討事項");
      const naiyo = extractSection(aiResult, "検討内容");
      const ketsuron = extractSection(aiResult, "会議の結論");
      const kadai = extractSection(aiResult, "残された課題");

      if (kento) set("C14", toBulletText(kento));
      if (naiyo) set("C18", toBulletText(naiyo));
      if (ketsuron) set("C22", compactSentence(ketsuron));
      if (kadai) set("C27", toBulletText(removeNextMeetingSentences(kadai)));

      ["C14", "C18", "C22", "C27"].forEach(c => applyWrapped(c));

      /* -------- 出力 -------- */
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              new Paragraph(text || "生成データがありません"),
            ],
          },
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
