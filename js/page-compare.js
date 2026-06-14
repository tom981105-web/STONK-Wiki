// js/page-compare.js — 기업 비교 (v1.1)
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader();
  const root = document.getElementById("compareRoot");
  const params = new URLSearchParams(location.search);

  let slots = [params.get("a"), params.get("b"), params.get("c")].filter(Boolean);
  if (!slots.length) slots = [];

  function options(selectedIds) {
    const mode = W.isConnected() ? "room" : "catalog";
    return W.activeEntries(mode)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map((e) => `<option value="${W.esc(e.id)}" ${selectedIds.includes(e.id) ? "disabled" : ""}>${W.esc(e.name)} (${W.esc(e.ticker)})</option>`)
      .join("");
  }

  const ROWS = [
    { k: "현재가", f: (e) => e.price != null ? W.num(e.price) + "원" : "—", best: (e) => e.price, hi: true },
    { k: "등락률", f: (e) => e.changeRate != null ? `<span class="${W.dir(e.changeRate)}">${W.pct(e.changeRate)}</span>` : "—", best: (e) => e.changeRate, hi: true },
    { k: "시가총액(거래대금)", f: (e) => e.value != null ? W.short(e.value) + "원" : "—", best: (e) => e.value, hi: true },
    { k: "STONK SCORE", f: (e) => W.scoreBadgeHTML(e), best: (e) => e.score, hi: true },
    { k: "성장성", f: (e) => e.metrics.growth, best: (e) => e.metrics.growth, hi: true },
    { k: "혁신성", f: (e) => e.metrics.innovation, best: (e) => e.metrics.innovation, hi: true },
    { k: "현금흐름", f: (e) => e.metrics.cashFlow, best: (e) => e.metrics.cashFlow, hi: true },
    { k: "부채(낮을수록 좋음)", f: (e) => e.metrics.debt, best: (e) => -e.metrics.debt, hi: true },
    { k: "위험도", f: (e) => W.esc(e.risk), best: (e) => -(W.RISK_NUM[e.risk] || 2), hi: true },
    { k: "변동성", f: (e) => W.esc(e.volatility), best: null },
    { k: "배당", f: (e) => W.esc(e.dividendLabel || "없음"), best: null },
    { k: "투자 성향", f: (e) => W.esc(e.growthType), best: null },
  ];

  function render() {
    const entries = slots.map((id) => W.getEntry(id)).filter(Boolean);

    const pickers = `<div class="cmp-pickers">
      ${entries.map((e, i) => `<div class="cmp-pick">
        <span class="cmp-pick-name">${e.sectorMeta.icon} ${W.esc(e.name)}</span>
        <button class="cmp-x" data-remove="${W.esc(e.id)}" title="제거">✕</button>
      </div>`).join("")}
      ${entries.length < 3 ? `<div class="cmp-pick add">
        <select id="cmpAdd"><option value="">+ 기업 추가…</option>${options(slots)}</select>
      </div>` : ""}
    </div>`;

    if (!entries.length) {
      root.innerHTML = `<div class="section-head"><h2>⚖️ 기업 비교</h2></div>
        ${pickers}
        <div class="empty"><span class="em-ico">⚖️</span>비교할 기업을 추가하세요. (최대 3개)</div>`;
      bind();
      return;
    }

    const best = {};
    ROWS.forEach((r, ri) => {
      if (!r.best) return;
      let bi = -1, bv = -Infinity;
      entries.forEach((e, i) => { const v = r.best(e); if (v != null && v > bv) { bv = v; bi = i; } });
      best[ri] = bi;
    });

    root.innerHTML = `
      <div class="section-head"><div><h2>⚖️ 기업 비교</h2><div class="desc">${entries.length}개 기업 · ${W.isConnected() ? "실시간 반영" : "도감 기준"}</div></div></div>
      ${pickers}
      <div class="cmp-table-wrap"><table class="cmp-table">
        <thead><tr><th>항목</th>${entries.map((e) => `<th><a class="accent-b" href="company.html?id=${encodeURIComponent(e.id)}">${W.esc(e.name)}</a><div class="muted" style="font-weight:400;font-size:11px">${W.esc(e.ticker)}</div></th>`).join("")}</tr></thead>
        <tbody>${ROWS.map((r, ri) => `<tr>
          <td class="cmp-k">${r.k}</td>
          ${entries.map((e, i) => `<td class="${best[ri] === i ? "cmp-best" : ""}">${typeof r.f(e) === "number" ? r.f(e) : r.f(e)}${best[ri] === i ? ' <span class="cmp-crown">▲</span>' : ""}</td>`).join("")}
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="muted" style="font-size:12px;margin-top:10px">▲ 표시는 해당 항목에서 가장 우수한 값입니다. 시가총액은 발행주식수 미제공으로 거래대금으로 대체합니다.</p>`;
    bind();
  }

  function bind() {
    const add = document.getElementById("cmpAdd");
    if (add) add.addEventListener("change", () => { if (add.value) { slots.push(add.value); sync(); } });
    root.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => { slots = slots.filter((x) => x !== b.dataset.remove); sync(); }));
  }
  function sync() {
    const q = new URLSearchParams();
    slots.forEach((id, i) => q.set(["a", "b", "c"][i], id));
    history.replaceState(null, "", "compare.html?" + q.toString());
    render();
  }

  document.addEventListener("wiki:liveupdate", render);
  render();
})();
