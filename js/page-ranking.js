// js/page-ranking.js — 시장 랭킹: 거래대금 / 상승률 / 하락률 / 거래량 TOP 20 (실시간 방)
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader("시장 랭킹");
  const root = document.getElementById("rankRoot");
  let tab = "value";

  const TABS = [
    { key: "value", label: "거래대금 TOP", col: "거래대금", note: "시가총액 대체(발행주식수 미제공)" },
    { key: "up", label: "상승률 TOP", col: "등락률", note: "" },
    { key: "down", label: "하락률 TOP", col: "등락률", note: "" },
    { key: "volume", label: "거래량 TOP", col: "거래량", note: "" },
  ];

  function ranked() {
    let list = window.WikiLive.stocksArray();
    if (tab === "value") list = list.sort((a, b) => b.value - a.value);
    else if (tab === "volume") list = list.sort((a, b) => b.volume - a.volume);
    else if (tab === "up") list = list.filter(s => s.isEquity).sort((a, b) => b.changeRate - a.changeRate);
    else if (tab === "down") list = list.filter(s => s.isEquity).sort((a, b) => a.changeRate - b.changeRate);
    return list.slice(0, 20);
  }

  function entryIdByName(name) {
    const c = W.getCompanyByName(name);
    return c ? c.id : "live:" + name;
  }

  function valCell(s) {
    if (tab === "value") return W.short(s.value);
    if (tab === "volume") return W.num(s.volume) + "주";
    return W.pct(s.changeRate);
  }

  function render() {
    const connected = window.WikiLive.state.connected;
    const rows = ranked();
    const meta = TABS.find((t) => t.key === tab);

    root.innerHTML = `
      <div class="section-head"><div>
        <h2>시장 랭킹</h2>
        <div class="desc">${connected ? `${window.WikiLive.state.code} · 실시간 TOP 20` : "방 연결 시 실시간 순위가 표시됩니다"}</div>
      </div>
      <div class="seg">${TABS.map((t) => `<button data-tab="${t.key}" class="${t.key === tab ? "is-active" : ""}">${t.label}</button>`).join("")}</div>
      </div>
      ${connected ? "" : `<div class="notice">💡 랭킹은 진행 중인 <b>게임 방</b>의 실시간 시세로 계산됩니다. 우측 상단 <b>방 연결</b>을 이용하세요.</div>`}
      ${meta.note ? `<p class="muted" style="font-size:12px;margin:-4px 0 12px">※ ${meta.note}</p>` : ""}
      ${rows.length ? `<div class="panel" style="padding:8px 16px">
        <table class="rank-table">
          <thead><tr><th>#</th><th>종목</th><th>현재가</th><th>등락률</th><th>${W.esc(meta.col)}</th></tr></thead>
          <tbody>${rows.map((s, i) => {
            const cid = entryIdByName(s.name);
            const nameCell = `<a class="accent-b" href="company.html?id=${encodeURIComponent(cid)}">${W.esc(s.name)}</a>`;
            return `<tr>
              <td><span class="rank-pos ${i < 3 ? "top" : ""}">${i + 1}</span></td>
              <td>${nameCell} <span class="muted" style="font-size:11px">${W.esc(s.sector || "")}</span></td>
              <td>${W.num(s.price)}</td>
              <td class="${W.dir(s.changeRate)}">${W.pct(s.changeRate)}</td>
              <td><b>${valCell(s)}</b></td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>`
      : `<div class="empty"><span class="em-ico">🏆</span>표시할 랭킹 데이터가 없습니다.</div>`}`;

    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
  }

  document.addEventListener("wiki:liveupdate", render);
  render();
})();
