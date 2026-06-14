// js/page-favorites.js — 즐겨찾기(LocalStorage) + 관심종목 수익률 추적 (v1.1)
(function () {
  "use strict";
  const W = window.Wiki;
  W.injectHeader("즐겨찾기");
  const root = document.getElementById("favRoot");

  function returnInfo(e) {
    const meta = W.getFavMeta()[e.id];
    // 1순위: 추가 시점 대비 수익률(실시간 가격 보유 시)
    if (meta && meta.addedPrice && e.price != null) {
      const r = (e.price - meta.addedPrice) / meta.addedPrice * 100;
      return { label: "담은 뒤", rate: r, sub: `${W.num(meta.addedPrice)} → ${W.num(e.price)}` };
    }
    // 2순위: 오늘 등락률
    if (e.changeRate != null) return { label: "오늘", rate: e.changeRate, sub: W.num(e.price) + "원" };
    return null;
  }

  function render() {
    const ids = W.getFavorites();
    const list = ids.map((id) => W.getEntry(id)).filter(Boolean);

    // 수익률 추적 요약 (실시간/등락 데이터가 있는 항목만)
    const tracked = list.map((e) => ({ e, info: returnInfo(e) })).filter((x) => x.info);
    let summary = "";
    if (tracked.length) {
      tracked.sort((a, b) => b.info.rate - a.info.rate);
      summary = `<div class="panel"><h3>📈 관심종목 수익률</h3>
        <table class="rank-table"><thead><tr><th></th><th>종목</th><th>기준</th><th>수익률</th></tr></thead>
        <tbody>${tracked.map((x, i) => `<tr>
          <td><span class="rank-pos ${i === 0 ? "top" : ""}">${i + 1}</span></td>
          <td><a class="accent-b" href="company.html?id=${encodeURIComponent(x.e.id)}">${W.esc(x.e.name)}</a> <span class="muted" style="font-size:11px">${W.esc(x.info.sub)}</span></td>
          <td class="muted" style="font-size:12px">${x.info.label}</td>
          <td class="${W.dir(x.info.rate)}"><b>${W.sign(x.info.rate)}${x.info.rate.toFixed(2)}%</b></td>
        </tr>`).join("")}</tbody></table>
        <p class="muted" style="font-size:11.5px;margin-top:8px">※ '담은 뒤' 수익률은 즐겨찾기에 추가하던 순간(실시간 연결 중)의 가격을 기준으로 계산됩니다.</p>
      </div>`;
    } else if (list.length) {
      summary = `<div class="notice">💡 방에 연결하면 관심종목의 <b>수익률 추적</b>이 활성화됩니다.</div>`;
    }

    root.innerHTML = `
      <div class="section-head"><div>
        <h2>⭐ 즐겨찾기</h2>
        <div class="desc">${list.length}개 관심 종목 · 이 브라우저에 저장됩니다</div>
      </div></div>
      ${summary}
      ${list.length ? `<div class="card-grid" style="margin-top:16px">${list.map(W.companyCard).join("")}</div>`
        : `<div class="empty"><span class="em-ico">☆</span>
            아직 즐겨찾기한 종목이 없습니다.<br/>
            도감 카드의 별(☆) 아이콘을 눌러 관심 종목을 추가하세요.<br/>
            <a class="chip b" style="margin-top:14px" href="index.html#dogam">회사 도감으로 →</a></div>`}`;
  }

  document.addEventListener("wiki:favchange", render);
  document.addEventListener("wiki:liveupdate", render);
  render();
})();
