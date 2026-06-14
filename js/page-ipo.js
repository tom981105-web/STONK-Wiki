// js/page-ipo.js — IPO 센터: 실시간 청약(room.ipo) + 도감의 IPO/신규상장 후보 목록
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader("IPO 센터");
  const root = document.getElementById("ipoRoot");

  function liveIpoCard() {
    const room = window.WikiLive.state.room;
    const ipo = room && room.ipo;
    if (!ipo || ipo.status !== "subscribing") return "";
    const left = Math.max(0, Math.ceil(((ipo.endsAt || 0) - Date.now()) / 1000));
    const playerDemand = Object.values(ipo.applies || {}).reduce((a, b) => a + (b || 0), 0);
    const ratio = ((ipo.botDemand || 0) + playerDemand) / (ipo.totalShares || 1);
    return `<div class="ipo-card" style="border-color:var(--amber)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="ic-name">${W.esc(ipo.name)}</div><span class="badge ipo">청약 진행중</span>
      </div>
      <div class="ic-grid">
        <div><span>공모가</span><b>${W.num(ipo.offerPrice)}원</b></div>
        <div><span>공모물량</span><b>${W.short(ipo.totalShares)}주</b></div>
        <div><span>경쟁률</span><b class="accent-a">${ratio.toFixed(1)} : 1</b></div>
        <div><span>청약 마감</span><b class="${left <= 5 ? 'down' : ''}">${left}초</b></div>
      </div>
      <div class="progress"><i style="width:${Math.min(100, ratio * 10)}%"></i></div>
      <p class="muted" style="font-size:11.5px;margin:10px 0 0">청약은 STONK Battle 게임 화면에서 진행됩니다.</p>
    </div>`;
  }

  function candidateCard(c) {
    const v = W.entryFromCatalog(c);
    const isIpo = String(c.listingStatus).includes("IPO");
    return `<div class="ipo-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="ic-name">${W.esc(c.name)}</div>
        <span class="badge ${isIpo ? "ipo" : "new"}">${isIpo ? "IPO 후보" : "신규상장 후보"}</span>
      </div>
      <div class="muted" style="font-size:12.5px;margin-top:4px">${v.sectorMeta.icon} ${W.esc(c.sector)} · ${W.esc(c.ticker)}</div>
      <div class="ic-grid">
        <div><span>대표</span><b>${W.esc(c.ceo)}</b></div>
        <div><span>예상 위험도</span><b>${W.esc(c.risk)}</b></div>
        <div><span>성장성</span><b>${W.esc(c.growthLabel)}</b></div>
        <div><span>예상 상장</span><b>${W.esc(v.listingDate)}</b></div>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">${W.esc(c.description)}</p>
      <a class="chip b" style="margin-top:10px" href="company.html?id=${encodeURIComponent(c.id)}">상세 보기 →</a>
    </div>`;
  }

  function render() {
    const candidates = W.CATALOG.filter((c) => /IPO|신규상장/.test(c.listingStatus || ""));
    const live = liveIpoCard();
    root.innerHTML = `
      <div class="section-head"><div>
        <h2>IPO 센터</h2>
        <div class="desc">공모주 청약 현황과 신규 상장 후보 종목</div>
      </div></div>

      <div class="section" style="padding-top:0">
        <h3 style="font-size:16px;margin:0 0 12px">🔥 진행 중인 공모주 <span class="badge live">실시간</span></h3>
        ${live ? `<div class="ipo-grid">${live}</div>`
          : `<div class="notice">현재 진행 중인 공모주 청약이 없습니다. ${window.WikiLive.state.connected ? "" : "방을 연결하면 실시간 청약 정보가 표시됩니다."}</div>`}
      </div>

      <div class="section" style="padding-top:8px">
        <div class="section-head"><div>
          <h2 style="font-size:18px">📋 상장 예정 / IPO 후보 (${candidates.length})</h2>
          <div class="desc">상태: <span class="badge new">예정</span> 도감 등록 후보 — 게임 라운드에서 신규 상장으로 등장할 수 있습니다</div>
        </div></div>
        <div class="ipo-grid">${candidates.map(candidateCard).join("")}</div>
      </div>`;
  }

  document.addEventListener("wiki:liveupdate", render);
  render();
})();
