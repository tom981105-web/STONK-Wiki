// js/page-sector.js — 업종 분석: 목록 + 상세(?name=)  (활성 엔트리 기준)
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader("업종 분석");
  const root = document.getElementById("sectorRoot");
  const name = new URLSearchParams(location.search).get("name");

  function volLabel(score) { return ["", "낮음", "보통", "높음", "매우 높음"][Math.round(score)] || "보통"; }

  function renderList() {
    const all = W.sectorStats();
    all.sort((a, b) => {
      if (a.avgChange != null && b.avgChange != null) return b.avgChange - a.avgChange;
      if (a.avgChange != null) return -1;
      if (b.avgChange != null) return 1;
      return b.count - a.count;
    });
    const connected = W.isConnected();
    root.innerHTML = `
      <div class="section-head"><div>
        <h2>업종 분석</h2>
        <div class="desc">${all.length}개 업종 · ${connected ? `${W.esc(window.WikiLive.state.code)} 방 실시간` : "도감 기준"} · 클릭하면 업종 내 종목과 순위를 봅니다</div>
      </div></div>
      ${connected ? "" : `<div class="notice">💡 <b>방 미연결</b> — 평균 등락률은 방 연결 시 실시간 계산됩니다. 현재는 도감 기준 업종 구성만 표시합니다.</div>`}
      <div class="sector-grid">
        ${all.map((s) => {
          const avgHTML = s.avgChange == null ? `<b class="muted">—</b>` : `<b class="${W.dir(s.avgChange)}">${W.pct(s.avgChange)}</b>`;
          return `<div class="sector-card" data-sector="${W.esc(s.sector)}">
            <div class="sc-ico">${s.meta.icon}</div>
            <div class="sc-name">${W.esc(s.sector)}</div>
            <div class="sc-blurb">${W.esc(s.meta.blurb || "")}</div>
            <div class="sc-stats">
              <div><span>종목 수</span><b>${s.count}</b></div>
              <div><span>평균 등락</span>${avgHTML}</div>
              <div><span>변동성</span><b>${volLabel(s.volScore)}</b></div>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    root.querySelectorAll("[data-sector]").forEach((el) =>
      el.addEventListener("click", () => { location.href = "sector.html?name=" + encodeURIComponent(el.dataset.sector); }));
  }

  function renderDetail(sec) {
    const list = W.activeEntries().filter((e) => e.sector === sec);
    if (!list.length) { root.innerHTML = `<div class="empty"><span class="em-ico">🚫</span>'${W.esc(sec)}' 업종에 해당하는 종목이 없습니다. <a class="accent-b" href="sector.html">업종 목록</a></div>`; return; }
    const meta = W.SECTOR_META[sec] || { icon: "🏢", blurb: "" };

    const withLive = list.filter((e) => e.price != null);
    const ranked = withLive.slice().sort((a, b) => b.value - a.value);
    const rates = withLive.map((e) => e.changeRate);
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    const avgRiskScore = list.reduce((s, e) => s + (W.RISK_NUM[e.risk] || 2), 0) / list.length;

    root.innerHTML = `
      <a href="sector.html" class="chip" style="margin-bottom:16px">← 업종 목록</a>
      <div class="panel">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="font-size:42px">${meta.icon}</div>
          <div>
            <div style="font-size:26px;font-weight:900">${W.esc(sec)}</div>
            <div class="muted" style="font-size:13px">${W.esc(meta.blurb || "")}</div>
          </div>
        </div>
        <div class="market-strip" style="padding:0;margin-top:18px">
          <div class="ms-card"><div class="ms-k">업종 내 종목</div><div class="ms-v">${list.length}</div></div>
          <div class="ms-card"><div class="ms-k">평균 등락률</div><div class="ms-v ${avg==null?'muted':W.dir(avg)}">${avg==null?'—':W.pct(avg)}</div><div class="ms-s muted">${avg==null?'방 연결 시':'실시간'}</div></div>
          <div class="ms-card"><div class="ms-k">실시간 종목</div><div class="ms-v">${ranked.length}</div><div class="ms-s muted">/ ${list.length}</div></div>
          <div class="ms-card"><div class="ms-k">평균 위험도</div><div class="ms-v">${volLabel(avgRiskScore)}</div></div>
        </div>
      </div>

      ${ranked.length ? `<div class="panel"><h3>💰 거래대금 순위 <span class="badge">시총 대체</span></h3>
        <table class="rank-table"><thead><tr><th>#</th><th>종목</th><th>현재가</th><th>등락률</th><th>거래대금</th></tr></thead>
        <tbody>${ranked.map((e, i) => `<tr>
          <td><span class="rank-pos ${i<3?'top':''}">${i+1}</span></td>
          <td><a class="accent-b" href="company.html?id=${encodeURIComponent(e.id)}">${W.esc(e.name)}</a></td>
          <td>${W.num(e.price)}</td>
          <td class="${W.dir(e.changeRate)}">${W.pct(e.changeRate)}</td>
          <td>${W.short(e.value)}</td></tr>`).join("")}</tbody></table>
        <p class="muted" style="font-size:11.5px;margin-top:8px">※ 발행주식수 데이터가 없어 시가총액은 거래대금으로 대체 표기합니다.</p></div>` : ""}

      <div class="section" style="padding-top:8px">
        <div class="section-head"><h2>업종 내 종목 (${list.length})</h2></div>
        <div class="card-grid">${list.map(W.companyCard).join("")}</div>
      </div>`;
  }

  function render() { name ? renderDetail(name) : renderList(); }
  document.addEventListener("wiki:liveupdate", render);
  render();
})();
