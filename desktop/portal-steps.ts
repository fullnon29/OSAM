// 포털 화면을 한 걸음씩 움직이는 코드.
//
// 한 번에 다 하는 큰 스크립트로 만들면 어디서 어긋났는지 알 수 없습니다.
// 걸음마다 결과를 돌려주고, 바깥(main.ts)에서 기다렸다가 다음 걸음을 시킵니다.
//
// 화면 구조는 실제로 받아 본 것을 근거로 합니다.
//   목록 화면  npsb210m01
//     ds_SswBusiEntOutTgt  어르신 목록 (LTC_MGMT_NO, FNM, POF_PLNPP_MGMT_NO …)
//     ds_tbnpsb40          그 어르신의 일지 목록 (WRT_DT, VIS_DT, SIGNG_STAT_CD_NM …)
//   기록 창    npsb210p02  → 「양식 인쇄」
//   경고 창    nptz001p03  → 「확인」
//   인쇄 뷰어  ClipReport4 → PDF 내려받기
//
// 단추는 id 가 아니라 적힌 글자로 찾습니다. id 는 화면 개편 때 잘 바뀌지만
// "양식 인쇄" 같은 글자는 잘 바뀌지 않기 때문입니다.

/** 화면 안에서 공통으로 쓰는 도우미. 모든 걸음 앞에 붙습니다. */
const HELPERS = `
  // 포털이 띄우는 알림창은 화면을 멈춰 세웁니다. 자동화가 그대로 얼어붙으므로
  // 글만 받아 두고 넘어갑니다. 무엇이 떴는지는 걸음마다 함께 돌려줍니다.
  //
  // 물어보는 창(confirm)은 '아니오'로 답합니다. 무엇을 묻는지 모르는 채
  // '예'를 누르면 지우기 같은 일이 벌어질 수 있기 때문입니다. 무엇을 물었는지는
  // 기록에 남으니, 필요하면 그때 판단하면 됩니다.
  if (!window.__osamAlerts) {
    window.__osamAlerts = [];
    window.alert = function (m) { window.__osamAlerts.push("알림: " + String(m)); };
    window.confirm = function (m) { window.__osamAlerts.push("확인요청(아니오로 답함): " + String(m)); return false; };
    window.prompt = function (m) { window.__osamAlerts.push("입력요청: " + String(m)); return null; };
  }
  const takeAlerts = () => {
    const out = window.__osamAlerts.slice();
    window.__osamAlerts.length = 0;
    return out;
  };

  const app = nexacro.getApplication();

  // 열려 있는 작업 화면(form)을 찾습니다.
  const findForms = () => {
    const out = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0) return;
      if (!/\\.form$/.test(id)) return;
      if (id.indexOf(":") >= 0) return;
      out.push(id);
    });
    return out;
  };

  const resolve = (path) => {
    let cur = app;
    for (const part of path.split(".")) {
      if (cur == null) return null;
      cur = cur[part];
    }
    return cur;
  };

  // 화면 id(npsb210m01 등)로 작업 화면을 찾습니다.
  const formByScreenId = (screenId) => {
    for (const path of findForms()) {
      const f = resolve(path);
      if (!f) continue;
      try {
        const t = f.sta_bizTitleid;
        if (t && t.text === screenId) return { path, form: f };
        // 기록 창처럼 제목칸이 없는 화면은 자료 묶음으로 알아봅니다.
        if (!t && f.url && String(f.url).indexOf(screenId) >= 0) return { path, form: f };
      } catch (e) {}
    }
    return null;
  };

  // 자료 묶음이 실제로 놓인 화면을 찾습니다.
  //
  // 경로를 미리 적어 두면 화면이 조금만 바뀌어도 어긋납니다. 실제로
  // 그 자료를 가진 화면을 찾아가는 편이 훨씬 안전합니다.
  const formWithDataset = (dsName) => {
    for (const path of findForms()) {
      const f = resolve(path);
      if (!f) continue;
      try {
        const ds = f[dsName];
        if (ds && ds._type_name === "Dataset") return { path, form: f, ds };
      } catch (e) {}
    }
    return null;
  };

  // 적힌 글자로 단추를 찾습니다. 숨겨진 것은 셈에서 뺍니다.
  const buttonsByText = (text) => {
    const hits = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0 || id.indexOf(":") >= 0) return;
      const c = resolve(id);
      if (!c) return;
      const type = c._type_name || "";
      if (type !== "Button" && type !== "Static") return;
      if (typeof c.text !== "string") return;
      if (c.text.replace(/\\s/g, "") !== text.replace(/\\s/g, "")) return;
      if (c.visible === false) return;
      hits.push({ path: id, comp: c });
    });
    return hits;
  };

  const clickByText = (text) => {
    const hits = buttonsByText(text);
    if (!hits.length) return { ok: false, reason: "단추를 찾지 못했습니다: " + text };
    const target = hits[hits.length - 1].comp;  // 나중에 열린 창의 것이 뒤에 옵니다
    try {
      if (typeof target.click === "function") { target.click(); return { ok: true, path: hits[hits.length-1].path }; }
    } catch (e) {}
    // click() 이 없으면 onclick 을 직접 부릅니다.
    try {
      const owner = target.parent;
      const handler = owner && owner[target.name + "_onclick"];
      if (typeof handler === "function") { handler.call(owner, target, {}); return { ok: true, path: hits[hits.length-1].path }; }
    } catch (e) {}
    return { ok: false, reason: "단추를 누르지 못했습니다: " + text };
  };
`;

/** 지금 열린 화면이 무엇이고 어르신·일지가 몇 건인지 봅니다. */
export const STEP_PROBE = `(() => { try {
  ${HELPERS}
  const screen = formByScreenId("npsb210m01");
  const tgtHolder = formWithDataset("ds_SswBusiEntOutTgt");
  if (!tgtHolder) {
    return JSON.stringify({
      ok: false,
      reason: "어르신 목록 자료(ds_SswBusiEntOutTgt)를 어느 화면에서도 찾지 못했습니다. "
        + "업무수행일지 목록 화면이 열려 있고 조회가 된 상태인지 확인해 주십시오.",
      screenFound: !!screen,
      formsOpen: findForms().length,
    });
  }
  const logHolder = formWithDataset("ds_tbnpsb40");
  return JSON.stringify({
    ok: true,
    formPath: tgtHolder.path,
    recipients: tgtHolder.ds.getRowCount(),
    recipientRow: tgtHolder.ds.rowposition,
    logs: logHolder ? logHolder.ds.getRowCount() : -1,
  });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/** 어르신 목록에서 i 번째를 고릅니다. 고르면 그 어르신의 일지가 채워집니다. */
export function stepSelectRecipient(index: number): string {
  return `(() => { try {
    ${HELPERS}
    const holder = formWithDataset("ds_SswBusiEntOutTgt");
    if (!holder) return JSON.stringify({ ok: false, reason: "어르신 목록 자료를 찾지 못했습니다." });
    const tgt = holder.ds;
    if (${index} >= tgt.getRowCount()) return JSON.stringify({ ok: false, done: true });
    tgt.set_rowposition(${index});
    return JSON.stringify({
      ok: true,
      index: ${index},
      total: tgt.getRowCount(),
      ltcNo: tgt.getColumn(${index}, "LTC_MGMT_NO"),
      grade: tgt.getColumn(${index}, "LTC_RCGT_GRADE_NM"),
    });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/** 지금 고른 어르신의 일지 목록을 봅니다. */
export const STEP_LIST_LOGS = `(() => { try {
  ${HELPERS}
  const holder = formWithDataset("ds_tbnpsb40");
  if (!holder) return JSON.stringify({ ok: false, reason: "일지 목록 자료를 찾지 못했습니다." });
  const ds = holder.ds;
  const rows = [];
  for (let i = 0; i < ds.getRowCount(); i++) {
    rows.push({
      i: i,
      wrtDt: ds.getColumn(i, "WRT_DT"),
      visDt: ds.getColumn(i, "VIS_DT"),
      status: ds.getColumn(i, "SIGNG_STAT_CD_NM"),
    });
  }
  return JSON.stringify({ ok: true, rows: rows });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/** 일지 j 번째를 열어 기록 창을 띄웁니다. */
export function stepOpenLog(index: number): string {
  return `(() => { try {
    ${HELPERS}
    const holder = formWithDataset("ds_tbnpsb40");
    if (!holder) return JSON.stringify({ ok: false, reason: "일지 목록 자료를 찾지 못했습니다." });
    const ds = holder.ds;
    if (${index} >= ds.getRowCount()) return JSON.stringify({ ok: false, done: true });
    ds.set_rowposition(${index});

    // 표를 두 번 눌러 여는 것이 사람이 하는 동작입니다. 그 처리기를 직접 부릅니다.
    const owner = holder.form;
    const grid = owner.grd_list;
    if (!grid) return JSON.stringify({ ok: false, reason: "일지 표(grd_list)를 찾지 못했습니다." });
    const handler = owner["grd_list_oncelldblclick"] || owner["grd_list_oncellclick"];
    if (typeof handler !== "function") {
      return JSON.stringify({ ok: false, reason: "표를 여는 처리기를 찾지 못했습니다." });
    }
    handler.call(owner, grid, { row: ${index}, cell: 0 });
    return JSON.stringify({ ok: true, index: ${index} });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/** 「양식 인쇄」를 누릅니다. */
export const STEP_CLICK_PRINT = `(() => { try {
  ${HELPERS}
  return JSON.stringify(clickByText("양식 인쇄"));
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/**
 * 개인정보 열람 경고에서 사유를 고르고 「확인」을 누릅니다.
 *
 * 콤보의 속 자료를 직접 뒤지지 않고 Nexacro 가 내주는 방법(getItemCount·
 * getItemText·set_index)을 씁니다. 속 구조는 판마다 다르지만 이 방법은
 * 그대로이기 때문입니다.
 *
 * 이 사유는 공단에 그대로 기록됩니다. 그래서 실제로 무엇이 들어갔는지와
 * 고를 수 있었던 값들을 함께 돌려줍니다.
 */
export function stepConfirmWarning(reason: string): string {
  return `(() => { try {
    ${HELPERS}
    const want = ${JSON.stringify(reason)}.replace(/\s/g, "");

    const combos = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0 || id.indexOf(":") >= 0) return;
      const c = resolve(id);
      if (!c || c._type_name !== "Combo" || c.visible === false) return;
      combos.push({ path: id, c: c });
    });

    if (!combos.length) {
      return JSON.stringify({ ok: false, reason: "열람 사유를 고르는 칸을 찾지 못했습니다.", alerts: takeAlerts() });
    }

    const seen = [];
    let picked = null;
    let pickedPath = null;

    for (const item of combos) {
      const c = item.c;
      let n = 0;
      try { n = c.getItemCount ? c.getItemCount() : 0; } catch (e) { n = 0; }
      if (!n) continue;

      for (let i = 0; i < n; i++) {
        let label = "";
        try { label = String(c.getItemText ? c.getItemText(i) : ""); } catch (e) {}
        if (label) seen.push(label);
        if (!label || label.replace(/\s/g, "").indexOf(want) < 0) continue;

        try {
          if (typeof c.set_index === "function") c.set_index(i);
          else if (typeof c.set_value === "function" && c.getItemValue) c.set_value(c.getItemValue(i));
          // 고른 것을 화면과 자료에 반영합니다.
          if (typeof c.updateToDataset === "function") c.updateToDataset();
          picked = c.text || label;
          pickedPath = item.path;
        } catch (e) {}
        break;
      }
      if (picked !== null) break;
    }

    if (picked === null) {
      // 못 골랐으면 확인을 누르지 않습니다. 눌러 봐야 막힐 뿐입니다.
      return JSON.stringify({
        ok: false,
        reason: "열람 사유 " + ${JSON.stringify(reason)} + " 를 고를 수 없었습니다.",
        options: seen,
        combos: combos.length,
        alerts: takeAlerts(),
      });
    }

    const clicked = clickByText("확인");
    return JSON.stringify({
      ok: clicked.ok,
      reason: clicked.reason,
      recordedAs: picked,
      pickedPath: pickedPath,
      options: seen,
      alerts: takeAlerts(),
    });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/** 인쇄 뷰어에서 PDF 내려받기를 누릅니다. */
export const STEP_EXPORT_PDF = `(() => { try {
  ${HELPERS}
  // 뷰어는 별도 문서(iframe)로 들어옵니다. 그 안의 PDF 단추를 찾습니다.
  const frames = document.querySelectorAll("iframe");
  for (const fr of frames) {
    let doc = null;
    try { doc = fr.contentDocument; } catch (e) { continue; }
    if (!doc) continue;
    const btn = doc.querySelector("#btnPdf, .btnPdf, [title*='PDF'], [alt*='PDF'], img[src*='pdf']");
    if (btn) { btn.click(); return JSON.stringify({ ok: true, where: "iframe" }); }
  }
  const btn = document.querySelector("#btnPdf, .btnPdf, [title*='PDF'], [alt*='PDF'], img[src*='pdf']");
  if (btn) { btn.click(); return JSON.stringify({ ok: true, where: "page" }); }
  return JSON.stringify({ ok: false, reason: "PDF 단추를 찾지 못했습니다." });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/** 열려 있는 창을 닫아 다음 건으로 넘어갈 수 있게 합니다. */
export const STEP_CLOSE = `(() => { try {
  ${HELPERS}
  const closed = [];
  for (const text of ["닫기", "취소"]) {
    const r = clickByText(text);
    if (r.ok) closed.push(text);
  }
  return JSON.stringify({ ok: true, closed: closed });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
