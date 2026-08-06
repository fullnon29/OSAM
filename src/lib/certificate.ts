import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKst } from "./format";

export function generateCertNo(at: Date) {
  const year = at.getFullYear();
  const random = crypto.randomUUID().split("-")[0].toUpperCase();
  return `${year}-${random}`;
}

function loadFontBytes(file: string) {
  return readFileSync(path.join(process.cwd(), "src/assets/fonts", file));
}

async function buildCertificatePdf(params: {
  employeeName: string;
  courseName: string;
  completedAt: Date;
  certNo: string;
}) {
  const { employeeName, courseName, completedAt, certNo } = params;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 420]); // A5 가로

  // 참고: @pdf-lib/fontkit의 런타임 서브셋팅(subset:true)은 한글처럼 글리프가
  // 많은 폰트에서 일부 글자가 누락되는 버그가 있어, 미리 한글 전체+ASCII로만
  // 축소해둔 폰트를 subset:false로 통째로 임베드합니다. (scripts/subset-fonts.mjs)
  const bold = await doc.embedFont(loadFontBytes("NotoSansKR-Bold-subset.ttf"), {
    subset: false,
  });
  const regular = await doc.embedFont(loadFontBytes("NotoSansKR-Regular-subset.ttf"), {
    subset: false,
  });

  const pine = rgb(0.118, 0.2, 0.153);
  const ochre = rgb(0.753, 0.541, 0.204);
  const ink = rgb(0.149, 0.188, 0.165);

  const pageWidth = 595;

  function centerX(text: string, size: number, font: typeof bold) {
    return (pageWidth - font.widthOfTextAtSize(text, size)) / 2;
  }

  page.drawRectangle({
    x: 14,
    y: 14,
    width: 595 - 28,
    height: 420 - 28,
    borderColor: pine,
    borderWidth: 4,
  });

  const eyebrow = "CERTIFICATE OF COMPLETION";
  page.drawText(eyebrow, {
    x: centerX(eyebrow, 12, regular),
    y: 350,
    size: 12,
    font: regular,
    color: ochre,
  });
  page.drawText("수료증", {
    x: centerX("수료증", 30, bold),
    y: 300,
    size: 30,
    font: bold,
    color: pine,
  });
  page.drawText(employeeName, {
    x: centerX(employeeName, 22, bold),
    y: 240,
    size: 22,
    font: bold,
    color: ink,
  });
  const courseLine = `"${courseName}" 교육 과정을 이수하였음을 증명합니다.`;
  page.drawText(courseLine, {
    x: centerX(courseLine, 13, regular),
    y: 200,
    size: 13,
    font: regular,
    color: ink,
  });

  const dateStr = formatKst(completedAt.toISOString());
  page.drawText(`이수일시: ${dateStr}`, {
    x: 60,
    y: 60,
    size: 10,
    font: regular,
    color: ink,
  });
  page.drawText(`번호 ${certNo}`, {
    x: 420,
    y: 60,
    size: 10,
    font: regular,
    color: ink,
  });
  page.drawText("오샘재가복지센터", {
    x: 60,
    y: 40,
    size: 10,
    font: regular,
    color: ink,
  });

  return doc.save();
}

export async function recordCompletion(
  admin: SupabaseClient,
  params: {
    employeeId: string;
    employeeName: string;
    courseId: string;
    courseName: string;
    completedAt?: Date;
  }
) {
  const completedAt = params.completedAt ?? new Date();
  const certNo = generateCertNo(completedAt);
  const pdfBytes = await buildCertificatePdf({
    employeeName: params.employeeName,
    courseName: params.courseName,
    completedAt,
    certNo,
  });

  const path = `${params.employeeId}/${params.courseId}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("certificates")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;

  const { data, error } = await admin
    .from("course_completions")
    .upsert(
      {
        employee_id: params.employeeId,
        course_id: params.courseId,
        completed_at: completedAt.toISOString(),
        cert_no: certNo,
        cert_pdf_url: path,
      },
      { onConflict: "employee_id,course_id" }
    )
    .select()
    .single();
  if (error) throw error;

  return data;
}
