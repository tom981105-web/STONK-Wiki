// js/page-index.js — 메인(홈): 히어로 검색 · 시장 요약 · 회사 도감(엔트리 기반)
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader("홈");

  const params = new URLSearchParams(location.search);
  const initialQ = params.get("q") || "";
  let viewMode = "auto"; // auto | room | catalog (연결 시 toggle 노출)

  // ── 히어로 검색 ──
  const heroInput = document.getElementById("heroInput");
  if (initialQ) heroInput.value = initialQ;
  document.getElementById("heroSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    document.getElementById("dogamSearch").value = heroInput.value.trim();
    render();
    document.getElementById("dogam").scrollIntoView({ behavior: "smooth" });
  });

  const popularTags = ["AI·전자", "바이오", "게임", "성장주", "배당주", "방어주", "IPO", "고위험"];
  document.getElementById("heroTags").innerHTML =
    popularTags.map((t) => `<span class="chip b" data-tag="${W.esc(t)}">#${W.esc(t)}</span>`).join("");
  document.getElementById("heroTags").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tag]");
    if (!chip) return;
    document.getElementById("dogamSearch").value = chip.dataset.tag;
    render();
    document.getElementById("dogam").scrollIntoView({ behavior: "smooth" });
  });

  // ── 모바일 1줄 시장요약 ──
  function renderMarketLine() {
    const el = document.getElementById("marketLine");
    if (!el) return;
    const live = window.WikiLive.stocksArray().filter((s) => s.isEquity);
    if (!live.length) {
      el.innerHTML = `<span class="ml-k">시장</span> <b>도감 ${W.CATALOG.length}개 · 업종 ${new Set(W.CATALOG.map(c => c.sector)).size}</b> <span class="muted">· 방 미연결</span>`;
      return;
    }
    const avg = live.reduce((a, s) => a + s.changeRate, 0) / live.length;
    const jospi = 1000 * (1 + avg / 100);
    const up = live.filter((s) => s.changeRate > 0).length;
    const down = live.filter((s) => s.changeRate < 0).length;
    const c = W.dir(avg);
    el.innerHTML = `<span class="ml-k">조스피</span> <b class="${c}">${jospi.toFixed(2)} ${W.arrow(avg)} ${W.pct(avg)}</b> <span class="muted">· 상승 ${up}·하락 ${down} · <span class="accent-g">LIVE</span></span>`;
  }

  // ── 시장 요약 스트립 ──
  function renderStrip() {
    renderMarketLine();
    const strip = document.getElementById("marketStrip");
    const live = window.WikiLive.stocksArray().filter((s) => s.isEquity);
    if (!live.length) {
      strip.innerHTML = `
        <div class="ms-card"><div class="ms-k">등록 기업</div><div class="ms-v">${W.CATALOG.length}</div><div class="ms-s muted">도감 수록</div></div>
        <div class="ms-card"><div class="ms-k">업종 수</div><div class="ms-v">${new Set(W.CATALOG.map(c=>c.sector)).size}</div><div class="ms-s muted">분류</div></div>
        <div class="ms-card"><div class="ms-k">조스피 지수</div><div class="ms-v">—</div><div class="ms-s muted">방 미연결</div></div>
        <div class="ms-card"><div class="ms-k">실시간 시장</div><div class="ms-v">OFF</div><div class="ms-s muted">방 연결 시 활성화</div></div>`;
      return;
    }
    const avg = live.reduce((a, s) => a + s.changeRate, 0) / live.length;
    const jospi = 1000 * (1 + avg / 100);
    const up = live.filter((s) => s.changeRate > 0).length;
    const down = live.filter((s) => s.changeRate < 0).length;
    const totalVal = window.WikiLive.stocksArray().reduce((a, s) => a + s.value, 0);
    const c = W.dir(avg);
    strip.innerHTML = `
      <div class="ms-card"><div class="ms-k">조스피 지수</div><div class="ms-v ${c}">${jospi.toFixed(2)}</div><div class="ms-s ${c}">${W.arrow(avg)} ${W.pct(avg)}</div></div>
      <div class="ms-card"><div class="ms-k">상승 / 하락</div><div class="ms-v"><span class="up">${up}</span> · <span class="down">${down}</span></div><div class="ms-s muted">실시간 종목 ${live.length}</div></div>
      <div class="ms-card"><div class="ms-k">총 거래대금</div><div class="ms-v">${W.short(totalVal)}</div><div class="ms-s muted">원</div></div>
      <div class="ms-card"><div class="ms-k">실시간 시장</div><div class="ms-v accent-g">LIVE</div><div class="ms-s accent-g">${W.esc(window.WikiLive.state.code)} 연결됨</div></div>`;
  }

  // ── 시장 심리지수 (Fear & Greed) ──
  function renderFearGreed() {
    const box = document.getElementById("fearGreed");
    const fg = W.analytics.fearGreed();
    if (!fg) {
      box.innerHTML = `<div class="fg-card off"><div class="fg-head"><b>STONK FEAR &amp; GREED INDEX</b><span class="muted">방 연결 시 활성화</span></div>
        <div class="fg-meter"><div class="fg-fill" style="width:50%"></div><span class="fg-knob" style="left:50%"></span></div>
        <div class="fg-scale"><span>0 극한 공포</span><span>50 중립</span><span>100 극한 탐욕</span></div></div>`;
      return;
    }
    box.innerHTML = `<div class="fg-card ${fg.cls}">
      <div class="fg-head"><b>STONK FEAR &amp; GREED INDEX</b><span class="fg-val">${fg.index} · ${fg.label}</span></div>
      <div class="fg-meter"><div class="fg-fill" style="width:${fg.index}%"></div><span class="fg-knob" style="left:${fg.index}%"></span></div>
      <div class="fg-scale"><span>0 극한 공포</span><span>50 중립</span><span>100 극한 탐욕</span></div>
      <div class="muted" style="font-size:12px;margin-top:6px">상승 ${fg.up} · 하락 ${fg.down} · 뉴스/시장 폭·모멘텀 기반</div>
    </div>`;
  }

  // ── 오늘의 HOT 종목 ──
  let hotTab = "up"; // 모바일 탭 (up/down/volume/fresh)
  function hotCard(key, title, icon, list, valFn) {
    const items = (list || []).filter(Boolean);
    return `<div class="hot-col" data-hot="${key}"><h3 class="hot-h">${icon} ${title}</h3>
      ${items.length ? `<ol class="hot-list">${items.map((s) => {
        const cid = W.getCompanyByName(s.name) ? W.getCompanyByName(s.name).id : "live:" + s.name;
        return `<li><a href="${W.companyHref(cid)}"><span class="hot-name">${W.esc(s.name)}</span><span class="hot-val ${valFn.cls ? valFn.cls(s) : ""}">${valFn(s)}</span></a></li>`;
      }).join("")}</ol>` : `<p class="muted hot-empty">데이터 없음</p>`}
    </div>`;
  }
  function renderHot() {
    const sec = document.getElementById("hotSection");
    const hot = W.analytics.hotStocks();
    if (!hot) {
      sec.innerHTML = `<div class="section-head"><h2>🔥 오늘의 HOT 종목</h2></div>
        <div class="notice">💡 방 연결 시 급등·급락·거래량·신규상장 종목이 실시간으로 표시됩니다.</div>`;
      return;
    }
    const up = (s) => W.pct(s.changeRate); up.cls = () => "up";
    const dn = (s) => W.pct(s.changeRate); dn.cls = () => "down";
    const vol = (s) => W.short(s.value) + "원";
    const fresh = (s) => W.num(s.price) + "원";
    const TABS = [["up", "급등"], ["down", "급락"], ["volume", "거래량"], ["fresh", "신규"]];
    sec.innerHTML = `<div class="section-head"><div><h2>🔥 오늘의 HOT 종목</h2><div class="desc">${W.esc(window.WikiLive.state.code)} 방 실시간</div></div></div>
      <nav class="hot-tabs mobile-only">${TABS.map((t) => `<button data-hottab="${t[0]}" class="${t[0] === hotTab ? "is-active" : ""}">${t[1]}</button>`).join("")}</nav>
      <div class="hot-grid" data-active="${hotTab}">
        ${hotCard("up", "급등 TOP5", "🚀", hot.up, up)}
        ${hotCard("down", "급락 TOP5", "🧊", hot.down, dn)}
        ${hotCard("volume", "거래량 TOP5", "💰", hot.volume, vol)}
        ${hotCard("fresh", "신규 상장", "🆕", hot.fresh, fresh)}
      </div>`;
    sec.querySelectorAll("[data-hottab]").forEach((b) => b.addEventListener("click", () => {
      hotTab = b.dataset.hottab;
      sec.querySelector(".hot-grid").setAttribute("data-active", hotTab);
      sec.querySelectorAll("[data-hottab]").forEach((x) => x.classList.toggle("is-active", x === b));
    }));
  }

  // ── 업종 셀렉트 (활성 엔트리 기준으로 매번 갱신) ──
  function refreshSectorSelect() {
    const sel = document.getElementById("dogamSector");
    const prev = sel.value;
    const sectors = Array.from(new Set(W.activeEntries(effMode()).map((e) => e.sector))).sort();
    sel.innerHTML = `<option value="">전체 업종</option>` + sectors.map((s) => `<option value="${W.esc(s)}">${W.esc(s)}</option>`).join("");
    if (sectors.includes(prev)) sel.value = prev;
  }

  function effMode() { return viewMode === "auto" ? (W.isConnected() ? "room" : "catalog") : viewMode; }

  function render() {
    const q = document.getElementById("dogamSearch").value.trim();
    const sector = document.getElementById("dogamSector").value;
    const sort = document.getElementById("dogamSort").value;
    const mode = effMode();

    let list = W.search(q, mode);
    if (sector) list = list.filter((e) => e.sector === sector);

    list.sort((a, b) => {
      if (sort === "risk") return (W.RISK_NUM[b.risk] || 0) - (W.RISK_NUM[a.risk] || 0);
      if (sort === "growth") return (W.GROW_NUM[b.growthLabel] || 0) - (W.GROW_NUM[a.growthLabel] || 0);
      if (sort === "change") return (b.changeRate ?? -Infinity) - (a.changeRate ?? -Infinity);
      if (sort === "price") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      return a.name.localeCompare(b.name, "ko");
    });

    const total = W.activeEntries(mode).length;
    document.getElementById("dogamCount").textContent =
      mode === "room"
        ? `${list.length}개 종목 · ${W.esc(window.WikiLive.state.code)} 방 실시간 (${total}종목)`
        : `${list.length}개 기업 · 총 ${total}개 수록`;
    // v1.3: 방 연결 시 섹션 제목 변경 ("회사 도감" → "이 방 종목 정보")
    const dogamH2 = document.querySelector("#dogam h2");
    if (dogamH2) dogamH2.textContent = (mode === "room") ? "이 방 종목 정보" : "회사 도감";

    const grid = document.getElementById("dogamGrid");
    grid.innerHTML = list.length ? list.map(W.companyCard).join("")
      : `<div class="empty" style="grid-column:1/-1"><span class="em-ico">🔍</span>검색 결과가 없습니다.</div>`;

    renderNotice(mode);
  }

  function renderNotice(mode) {
    const notice = document.getElementById("dogamNotice");
    const connected = W.isConnected();
    let html = "";
    if (connected) {
      // 모드 토글
      html += `<div class="notice" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span>📡 <b>${W.esc(window.WikiLive.state.code)}</b> 방에 연결됨 — 이 방에서 생성된 실제 종목을 표시합니다.</span>
        <span class="seg" style="margin-left:auto">
          <button data-mode="room" class="${mode === "room" ? "is-active" : ""}">이 방 종목</button>
          <button data-mode="catalog" class="${mode === "catalog" ? "is-active" : ""}">전체 도감</button>
        </span></div>`;
    } else {
      html = `<div class="notice">💡 현재 <b>방 미연결</b> — 도감 기준(백과사전) 정보를 표시합니다. 우측 상단 <b>방 연결</b>에 STONK Battle 방 코드를 입력하면 그 방의 실제 종목과 실시간 시세가 도감에 그대로 나타납니다.</div>`;
    }
    notice.innerHTML = html;
    notice.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => { viewMode = b.dataset.mode; refreshSectorSelect(); render(); }));
  }

  ["dogamSearch", "dogamSector", "dogamSort"].forEach((id) =>
    document.getElementById(id).addEventListener("input", render));

  document.addEventListener("wiki:liveupdate", () => { renderStrip(); renderFearGreed(); renderHot(); refreshSectorSelect(); render(); });

  if (initialQ) document.getElementById("dogamSearch").value = initialQ;
  refreshSectorSelect();
  renderStrip();
  renderFearGreed();
  renderHot();
  render();
})();
