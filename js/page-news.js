// js/page-news.js — 시장 뉴스: 실시간 방의 뉴스/이벤트를 영향도별로 정렬·구분
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader("시장 뉴스");
  const root = document.getElementById("newsRoot");
  let filter = "all";
  let expanded = false; // 모바일 더보기 상태

  // 방 데이터 → 뉴스 아이템 배열
  // v1.2: 뉴스 날짜는 실제 필드(createdAt/publishedAt/date/time)만 사용. 없으면 ms=null → "날짜 정보 없음".
  function newsDate(obj) {
    if (!obj || typeof obj !== "object") return null;
    const v = obj.createdAt ?? obj.publishedAt ?? obj.date ?? obj.time;
    return W.dateMs(v);
  }
  function adminNewsItems() {
    const adapter = window.MarketAdminAdapter;
    const list = adapter?.loadAdminNews ? adapter.loadAdminNews() : [];
    return list.map((n) => {
      const effect = String(n.effect || "").toLowerCase();
      const impact = effect === "up" ? "up" : effect === "down" ? "down" : "flat";
      return {
        impact,
        scope: n.company || n.sector || n.targetSector || n.type || "Market Admin",
        title: n.breaking ? "[BREAKING] " + n.title : n.title,
        ms: newsDate(n),
        rate: Number(n.impact || 0),
        source: "admin",
      };
    });
  }
  function collect() {
    const room = window.WikiLive.state.room;
    const items = adminNewsItems();
    if (!room) return items;

    if (room.latestNews && room.latestNews.text) {
      items.push({ impact: "flat", scope: "시장", title: room.latestNews.text, ms: newsDate(room.latestNews) });
    }
    // 방에 별도 news 컬렉션이 있으면(실제 createdAt 보유) 우선 사용
    const newsColl = room.news ? (Array.isArray(room.news) ? room.news : Object.values(room.news)) : [];
    newsColl.forEach((n) => {
      if (!n || !(n.text || n.title)) return;
      const rate = Number(n.impact || n.rate || 0);
      const impact = rate > 1 ? "up" : rate < -1 ? "down" : "flat";
      items.push({ impact, scope: n.stockName || n.scope || "시장", title: n.text || n.title, ms: newsDate(n), rate });
    });
    // 종목 실시간 뉴스/이벤트 — 타임스탬프 없음 → ms=null (임의 날짜 생성 금지)
    window.WikiLive.stocksArray().forEach((s) => {
      if (s.news) {
        const impact = s.changeRate > 1 ? "up" : s.changeRate < -1 ? "down" : "flat";
        items.push({ impact, scope: s.name, title: `${s.name} — ${s.news}`, ms: null, rate: s.changeRate });
      }
      if (s.changeRate >= 25) items.push({ impact: "up", scope: s.name, title: `${s.name} 상한가 근접 (${W.pct(s.changeRate)})`, ms: null, rate: s.changeRate });
      else if (s.changeRate <= -25) items.push({ impact: "down", scope: s.name, title: `${s.name} 하한가 근접 (${W.pct(s.changeRate)})`, ms: null, rate: s.changeRate });
      else if (s.changeRate >= 12) items.push({ impact: "up", scope: s.name, title: `${s.name} 급등세 (${W.pct(s.changeRate)})`, ms: null, rate: s.changeRate });
      else if (s.changeRate <= -12) items.push({ impact: "down", scope: s.name, title: `${s.name} 급락세 (${W.pct(s.changeRate)})`, ms: null, rate: s.changeRate });
    });
    // 날짜 있는 항목 먼저(최신순), 없는 항목은 영향도(절댓값) 순으로 뒤에
    const dated = items.filter((i) => i.ms != null).sort((a, b) => b.ms - a.ms);
    const undated = items.filter((i) => i.ms == null).sort((a, b) => Math.abs(b.rate || 0) - Math.abs(a.rate || 0));
    return dated.concat(undated);
  }

  const TAGLABEL = { up: "상승", down: "하락", flat: "중립" };

  function render() {
    const connected = window.WikiLive.state.connected;
    const all = collect();
    const hasAdmin = all.some((item) => item.source === "admin");
    const counts = { all: all.length, up: all.filter(i => i.impact === "up").length, down: all.filter(i => i.impact === "down").length, flat: all.filter(i => i.impact === "flat").length };
    const list = filter === "all" ? all : all.filter((i) => i.impact === filter);

    root.innerHTML = `
      <div class="section-head">
        <div><h2>시장 뉴스</h2><div class="desc">${connected ? `${window.WikiLive.state.code} · 실시간 · 영향도순` : "방 연결 시 실시간 뉴스가 표시됩니다"}</div></div>
        <div class="seg">
          ${["all", "up", "down", "flat"].map((f) => `<button data-f="${f}" class="${f === filter ? "is-active" : ""}">${f === "all" ? "전체" : TAGLABEL[f]} ${counts[f]}</button>`).join("")}
        </div>
      </div>
      ${connected || hasAdmin ? "" : `<div class="notice">💡 시장 뉴스는 진행 중인 <b>게임 방</b>에서 생성됩니다. 우측 상단 <b>방 연결</b>로 STONK Battle 방 코드를 입력하세요.</div>`}
      <div class="news-list ${expanded ? "m-expanded" : ""}" data-list="news">
        ${list.length ? list.map((n, i) => `<div class="news-item ${i >= 3 ? "m-overflow" : ""}">
          <span class="ni-tag ${n.impact}">${TAGLABEL[n.impact]}</span>
          <div class="ni-body">
            <div class="ni-title">${W.esc(n.title)}</div>
            <div class="ni-meta">${W.esc(n.scope)} · ${n.ms != null ? W.esc(W.fmtDateTime(n.ms)) : "날짜 정보 없음"}</div>
          </div></div>`).join("")
        : `<div class="empty"><span class="em-ico">📰</span>${connected ? "방에 등록된 뉴스가 없습니다." : "방 연결 시 해당 방의 뉴스가 표시됩니다."}</div>`}
      </div>
      ${list.length > 3 && !expanded ? `<button class="m-more mobile-only" id="newsMore">더 보기 (${list.length})</button>` : ""}`;

    root.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; render(); }));
    const more = document.getElementById("newsMore");
    if (more) more.addEventListener("click", () => { expanded = true; render(); });
  }

  document.addEventListener("wiki:liveupdate", render);
  render();
})();
