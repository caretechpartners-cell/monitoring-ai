import { Document, Packer, Paragraph } from "docx";

let latestResult = "生成データがありません";

export default async function handler(req, res) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [new Paragraph(latestResult)],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  res.setHeader("Content-Disposition", "attachment; filename=monitoring.docx");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  res.send(buffer);
}
