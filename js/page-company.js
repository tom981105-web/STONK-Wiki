// js/page-company.js — 회사 상세 (v1.1)
// 프로필 · STONK SCORE · 미니차트 · 투자요약 · 투자자통계 · 감성분석 ·
// 강점/약점 · 펀더멘털 · 히스토리 · 관련기업 추천 · 비교하기
(function () {
  "use strict";
  const W = window.Wiki;
  const A = W.analytics;
  W.injectHeader();

  // Phase 4: ?id= 외에 ?company= / ?companyId= 도 회사 식별자로 허용
  const _params = new URLSearchParams(location.search);
  const id = _params.get("id") || _params.get("company") || _params.get("companyId");
  const root = document.getElementById("companyRoot");
  let chartPeriod = "all";

  function metricBar(label, val, invert) {
    const v = Math.max(0, Math.min(100, Number(val) || 0));
    const score = invert ? 100 - v : v;
    const cls = score >= 70 ? "good" : score >= 45 ? "" : score >= 25 ? "warn" : "bad";
    return `<div class="metric"><div class="ml"><span>${label}</span><b>${v}</b></div>
      <div class="mb"><i class="${cls}" style="width:${v}%"></i></div></div>`;
  }

  // v1.2 회사 히스토리: 실제 날짜만 사용(임의 날짜 생성 금지), 날짜 없는 항목은 맨 아래.
  // 항목: {ms|null, dateText, label, title, cls}
  let histOrder = "desc"; // desc(최신순, 기본) | asc(오래된순)
  function buildHistory(e) {
    const items = [];
    const room = window.WikiLive.state.room;

    // 1) 설립 (연도만, 백과사전 고정 속성)
    const foundedMs = e.foundedYear ? new Date(Number(e.foundedYear), 0, 1).getTime() : null;
    items.push({ ms: foundedMs, dateText: e.foundedYear ? String(e.foundedYear) : "날짜 정보 없음",
      label: "설립", title: `${e.name} 설립${e.ceo && e.ceo !== "비공개" ? ` (대표 ${e.ceo})` : ""}`, cls: "flat" });

    // 2) 주요 사업/제품 (날짜 근거 없음 → 날짜 정보 없음)
    String(e.business || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2)
      .forEach((b) => items.push({ ms: null, dateText: "날짜 정보 없음", label: "사업", title: `${b} 사업 본격화`, cls: "flat" }));

    // 3) 상장 (우선순위 해석된 상장일)
    items.push({ ms: e.listingDateMs, dateText: W.fmtDot(e.listingDateRaw), label: "상장",
      title: `STONK 시장 상장 (${e.ticker})`, cls: "up" });

    // 4) 뉴스 이벤트 — 실시간 종목 뉴스. 타임스탬프가 없으므로 날짜 정보 없음.
    if (e.live && e.live.news) items.push({ ms: null, dateText: "날짜 정보 없음", label: "뉴스",
      title: e.live.news, cls: W.dir(e.changeRate) });

    // 5) 시장 이벤트 — latestNews(실제 time 있음)
    if (room && room.latestNews && room.latestNews.text) {
      const t = room.latestNews.time;
      items.push({ ms: W.dateMs(t), dateText: W.fmtDot(t), label: "시장",
        title: room.latestNews.text, cls: "flat" });
    }

    // 6) v1.3 방 기반 공시/이슈
    if (e.roomDyn && e.roomDyn.disclosures) {
      e.roomDyn.disclosures.forEach((d) => items.push({
        ms: d.dateMs != null ? d.dateMs : null,
        dateText: d.dateMs != null ? W.fmtDot(d.dateMs) : "날짜 정보 없음",
        label: d.kind || "공시", title: d.t,
        cls: d.tone === "pos" ? "up" : d.tone === "neg" ? "down" : "flat",
      }));
    }

    // 정렬: 날짜 있는 항목 우선(최신/오래된순), 날짜 없는 항목은 맨 아래(원래 순서 유지)
    const dated = items.filter((i) => i.ms != null);
    const undated = items.filter((i) => i.ms == null);
    dated.sort((a, b) => histOrder === "desc" ? b.ms - a.ms : a.ms - b.ms);
    return dated.concat(undated);
  }

  function sentimentHTML(e) {
    const sent = A.newsSentiment(A.collectNewsFor(e));
    if (!sent) return `<p class="muted">${W.isConnected() ? "이 종목·방에 등록된 뉴스가 없습니다." : "방 연결 시 해당 방의 뉴스 감성을 분석합니다."}</p>`;
    return `<div class="sent-bar">
        <span class="sb pos" style="width:${sent.pos}%" title="긍정 ${sent.pos}%"></span>
        <span class="sb neu" style="width:${sent.neu}%" title="중립 ${sent.neu}%"></span>
        <span class="sb neg" style="width:${sent.neg}%" title="부정 ${sent.neg}%"></span>
      </div>
      <div class="sent-legend">
        <span><i class="dot pos"></i>긍정 ${sent.pos}%</span>
        <span><i class="dot neu"></i>중립 ${sent.neu}%</span>
        <span><i class="dot neg"></i>부정 ${sent.neg}%</span>
        <span class="muted">· 표본 ${sent.count}건</span>
      </div>`;
  }

  function investorHTML(e) {
    const st = A.investorStats(e);
    if (!st) return `<p class="muted">투자자 통계는 <b>방 연결 시</b> 표시됩니다.</p>`;
    return `<div class="stat-grid">
      <div class="stat-cell"><span>보유자 수</span><b>${W.num(st.holders)}명</b></div>
      <div class="stat-cell"><span>인기 순위</span><b>${st.rank ? st.rank + "위" : "-"}<small class="muted"> / ${st.totalStocks}</small></b></div>
      <div class="stat-cell"><span>보유 주식 수</span><b>${W.num(st.sharesHeld)}주</b></div>
      <div class="stat-cell"><span>시장 점유율</span><b>${st.marketShare != null ? st.marketShare.toFixed(1) + "%" : "-"}<small class="muted"> 거래대금</small></b></div>
      <div class="stat-cell"><span>총 발행 주식 수</span><b class="muted">정보 없음</b></div>
    </div>`;
  }

  function swHTML(e) {
    const { strengths, weaknesses } = A.strengthsWeaknesses(e);
    return `<div class="sw-grid">
      <div><h4 class="sw-h good">💪 강점</h4><ul class="sw-list">${strengths.map((s) => `<li class="good">✔ ${W.esc(s)}</li>`).join("")}</ul></div>
      <div><h4 class="sw-h bad">⚠️ 약점</h4><ul class="sw-list">${weaknesses.map((s) => `<li class="bad">✖ ${W.esc(s)}</li>`).join("")}</ul></div>
    </div>`;
  }

  function recommendHTML(e) {
    const recs = A.recommendations(e, 4);
    if (!recs.length) return `<p class="muted">추천할 관련 기업이 없습니다.</p>`;
    return `<div class="rec-grid">${recs.map((r) => {
      const x = r.entry;
      const price = x.price != null ? `<span class="${W.dir(x.changeRate)}">${W.num(x.price)} (${W.pct(x.changeRate)})</span>` : `<span class="muted">시세 없음</span>`;
      return `<a class="rec-card" href="${W.companyHref(x.id)}">
        <div class="rec-top"><b class="rec-name" title="${W.esc(x.name)}">${W.esc(x.name)}</b>${W.scoreBadgeHTML(x)}</div>
        <div class="muted rec-sub">${x.sectorMeta.icon} ${W.esc(x.sector)} · ${price}</div>
        <div class="rec-reasons">${r.reasons.map((rs) => `<span class="chip g">${W.esc(rs)}</span>`).join("")}</div>
      </a>`;
    }).join("")}</div>`;
  }

  // v1.3 공시/이슈 섹션
  function disclosureHTML(e) {
    if (!e.roomDyn || !e.roomDyn.disclosures || !e.roomDyn.disclosures.length) {
      return `<p class="muted">${W.isConnected() ? "이 종목에 표시할 공시가 없습니다." : "방 연결 시 이 방의 공시·이슈가 표시됩니다."}</p>`;
    }
    return `<ul class="disc-list">${e.roomDyn.disclosures.map((d) => {
      const cls = d.tone === "pos" ? "up" : d.tone === "neg" ? "down" : "flat";
      const date = d.dateMs != null ? W.fmtDot(d.dateMs) : "날짜 정보 없음";
      return `<li class="disc-item">
        <span class="ni-tag ${cls}">${W.esc(d.kind || "공시")}</span>
        <div class="ni-body"><div class="ni-title">${W.esc(d.t)}</div>
        <div class="ni-meta">${W.esc(date)}</div></div></li>`;
    }).join("")}</ul>`;
  }

  function wikiTextBlock(text) {
    const safe = W.esc(text || "").replace(/\r\n/g, "\n");
    return safe.split(/\n{2,}/).map((part) => `<p>${part.replace(/\n/g, "<br>")}</p>`).join("");
  }

  function wikiDocHTML(e) {
    const doc = W.wikiDocForEntry ? W.wikiDocForEntry(e) : null;
    if (!doc) return "";
    const tags = (doc.tags || []).map((tag) => `<span class="chip b">#${W.esc(tag)}</span>`).join("");
    return `<div class="panel wiki-sec" data-sec="wiki" id="sec-wiki">
      <h3>STONK Admin Wiki</h3>
      <div class="muted" style="font-size:12px;margin-bottom:8px">${W.esc(doc.category || "guide")} · ${W.esc(W.fmtDateTime(doc.updatedAt))}</div>
      <h4 style="margin:0 0 8px;font-size:15px">${W.esc(doc.title)}</h4>
      ${doc.summary ? `<div class="summary-box"><p>${W.esc(doc.summary)}</p></div>` : ""}
      <div style="color:var(--text-dim);font-size:13.5px;line-height:1.75">${wikiTextBlock(doc.content)}</div>
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
    </div>`;
  }

  function chartSection(e) {
    if (!e.live) {
      return `<div class="panel wiki-sec" data-sec="chart" id="sec-chart"><h3>📉 주가 차트</h3>
        <div class="chart-empty"><span class="em-ico">🔌</span>가격 데이터 부족 — <span class="muted">방에 연결되면 실시간 가격이 기록되어 차트가 그려집니다.</span></div></div>`;
    }
    const periods = [["1d", "1일"], ["7d", "7일"], ["30d", "30일"], ["all", "전체"]];
    return `<div class="panel wiki-sec" data-sec="chart" id="sec-chart"><h3>📉 주가 차트 <span class="badge live">실시간 기록</span></h3>
      <div class="seg" style="margin-bottom:10px">${periods.map((p) => `<button data-period="${p[0]}" class="${p[0] === chartPeriod ? "is-active" : ""}">${p[1]}</button>`).join("")}</div>
      <div class="chart-wrap"><canvas id="nbChart"></canvas><div id="chartEmpty" class="chart-empty" hidden><span class="em-ico">📊</span>가격 데이터 부족<br/><span class="muted">관측된 가격 기록이 쌓이면 표시됩니다.</span></div></div>
      <p class="muted" style="font-size:11.5px;margin:8px 0 0">※ 실제 관측된 시세만 기록합니다(랜덤 생성 없음). 세션 동안 누적됩니다.</p>
    </div>`;
  }

  function drawChart(e) {
    if (!e.live) return;
    const canvas = document.getElementById("nbChart");
    const empty = document.getElementById("chartEmpty");
    if (!canvas) return;
    const pts = window.WikiLive.priceHistory(e.live.id, chartPeriod);
    if (!pts || pts.length < 2) {
      canvas.style.visibility = "hidden";
      if (empty) empty.hidden = false;
      return;
    }
    canvas.style.visibility = "visible";
    if (empty) empty.hidden = true;
    window.WikiChart.draw(canvas, pts);
  }

  // ───────────── v1.2.1 모바일 전용 UI ─────────────
  // 모바일 핵심 요약 카드 (현재가/등락/SCORE/위험도/의견/상장일)
  function mobileSummaryCard(e) {
    const priceHTML = e.price != null
      ? `<b class="${W.dir(e.changeRate)}">${W.num(e.price)}<small>원</small></b>
         <span class="chg ${W.dir(e.changeRate)}">${W.arrow(e.changeRate)} ${W.pct(e.changeRate)}</span>`
      : `<b class="muted" style="font-size:20px">시세 없음</b>`;
    return `<div class="m-summary mobile-only">
      <div class="m-sum-top">
        <div class="m-sum-price">${priceHTML}</div>
        ${W.scoreBadgeHTML(e)}
      </div>
      <div class="m-sum-grid">
        <div><span>위험도</span><b>${W.esc(e.risk || "-")}</b></div>
        <div><span>의견</span><b>${W.esc(e.roomDyn ? e.roomDyn.opinion : W.stanceLabel(e))}</b></div>
        <div><span>상장일</span><b>${W.esc(W.fmtDot(e.listingDateRaw))}</b></div>
      </div>
    </div>`;
  }

  // 빠른 이동 탭 (sticky, 가로 스크롤)
  const QUICK = [
    { go: "top", label: "요약" },
    { go: "sec-chart", label: "차트" },
    { go: "sec-news", label: "뉴스" },
    { go: "sec-disclosure", label: "공시" },
    { go: "sec-history", label: "이슈" },
    { go: "sec-fundamental", label: "펀더멘탈" },
    { go: "sec-related", label: "관련종목" },
  ];
  function mobileQuickNav() {
    return `<nav class="m-quicknav mobile-only">${QUICK.map((q) =>
      `<button data-go="${q.go}">${q.label}</button>`).join("")}</nav>`;
  }

  // 하단 액션 바
  function mobileActionBar(e) {
    const fav = W.isFavorite(e.id);
    return `<div class="m-actionbar mobile-only">
      <button data-act="fav" class="${fav ? "on" : ""}"><span class="ab-ico">${fav ? "★" : "☆"}</span>관심</button>
      <a data-act="compare" href="compare.html?a=${encodeURIComponent(e.id)}${W.currentRoomId() ? "&roomId=" + encodeURIComponent(W.currentRoomId()) : ""}"><span class="ab-ico">⚖️</span>비교</a>
      <a data-act="news" href="news.html${W.currentRoomId() ? "?roomId=" + encodeURIComponent(W.currentRoomId()) : ""}"><span class="ab-ico">📰</span>뉴스</a>
      <button data-act="top"><span class="ab-ico">↑</span>위로</button>
    </div>`;
  }

  // 섹션 접기/펼치기 (모바일 전용) — 펼침 상태 localStorage 기억
  const SEC_DEFAULT_OPEN = { chart: true }; // 그 외 모바일 기본 접힘
  function secOpenKey(k) { return "wiki-sec-" + k; }
  function isSecOpen(k) {
    const v = localStorage.getItem(secOpenKey(k));
    if (v === "1") return true;
    if (v === "0") return false;
    return !!SEC_DEFAULT_OPEN[k]; // 저장값 없으면 기본값
  }
  function setSecOpen(k, open) { try { localStorage.setItem(secOpenKey(k), open ? "1" : "0"); } catch (e) {} }

  function applyCollapsible() {
    const mobile = W.isMobile();
    root.querySelectorAll(".wiki-sec").forEach((p) => {
      const head = p.querySelector(":scope > .panel-head") || p.querySelector(":scope > h3");
      if (!head) return;
      // 토글 버튼 1회 주입
      if (!head.querySelector(".sec-toggle")) {
        head.classList.add("sec-head");
        const btn = document.createElement("button");
        btn.className = "sec-toggle"; btn.type = "button"; btn.setAttribute("aria-label", "섹션 접기/펼치기");
        btn.innerHTML = "<span>▾</span>";
        head.appendChild(btn);
      }
      const key = p.dataset.sec;
      if (!mobile) { p.classList.remove("collapsed"); return; }   // PC는 항상 펼침
      p.classList.toggle("collapsed", !isSecOpen(key));
    });
  }

  function stickyOffset() {
    const hdr = document.querySelector(".wiki-top");
    const qn = root.querySelector(".m-quicknav");
    const h = (hdr ? hdr.offsetHeight : 0);
    if (qn && W.isMobile()) qn.style.top = h + "px";
    return h + (qn && W.isMobile() ? qn.offsetHeight : 0) + 8;
  }

  function enhanceMobile(e) {
    applyCollapsible();
    stickyOffset();

    // 섹션 헤더 클릭 → 접기/펼치기 (내부 seg 버튼 클릭은 제외)
    root.querySelectorAll(".wiki-sec > .sec-head").forEach((head) => {
      head.addEventListener("click", (ev) => {
        if (!W.isMobile()) return;
        if (ev.target.closest("[data-order]")) return; // 정렬 토글은 통과
        const panel = head.closest(".wiki-sec");
        const open = panel.classList.contains("collapsed");
        panel.classList.toggle("collapsed", !open);
        setSecOpen(panel.dataset.sec, open);
        if (open && panel.dataset.sec === "chart") drawChart(e);
      });
    });

    // 빠른 이동 탭
    root.querySelectorAll(".m-quicknav [data-go]").forEach((b) => b.addEventListener("click", () => {
      const go = b.dataset.go;
      if (go === "top") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const target = document.getElementById(go);
      if (!target) return;
      if (target.classList.contains("collapsed")) {  // 접혀 있으면 펼치고 이동
        target.classList.remove("collapsed"); setSecOpen(target.dataset.sec, true);
        if (target.dataset.sec === "chart") drawChart(e);
      }
      const top = target.getBoundingClientRect().top + window.scrollY - stickyOffset();
      window.scrollTo({ top, behavior: "smooth" });
    }));

    // 하단 액션 바
    const bar = root.querySelector(".m-actionbar");
    if (bar) {
      bar.querySelector('[data-act="fav"]').addEventListener("click", () => {
        const on = W.toggleFavorite(e.id);
        const btn = bar.querySelector('[data-act="fav"]');
        btn.classList.toggle("on", on);
        btn.querySelector(".ab-ico").textContent = on ? "★" : "☆";
      });
      bar.querySelector('[data-act="top"]').addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    // 히스토리 더 보기 (모바일 3개 제한)
    root.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
      const list = root.querySelector(`[data-list="${b.dataset.more}"]`);
      if (list) list.classList.add("m-expanded");
      b.remove();
    }));
  }

  function render() {
    const e = id ? W.getEntry(id) : null;
    if (!e) {
      const connected = W.isConnected();
      const room = W.currentRoomId();
      const msg = !id
        ? "회사 ID가 지정되지 않았습니다. (?company=회사ID 또는 ?id=회사ID)"
        : !room
        ? "방 코드가 없습니다. ?room=방코드 로 접속하거나 상단 ‘방 연결’로 방을 연결하세요."
        : !connected
        ? `‘${W.esc(room)}’ 방에 연결 중이거나 응답이 없습니다. 잠시 후 다시 시도하세요.`
        : `‘${W.esc(room)}’ 방에서 ‘${W.esc(id)}’ 회사를 찾을 수 없습니다.`;
      root.innerHTML = `<div class="empty"><span class="em-ico">🚫</span>
        ${msg} <a class="accent-b" href="index.html#dogam">도감으로 돌아가기</a></div>`;
      return;
    }
    document.getElementById("pageTitle").textContent = `${e.name} (${e.ticker}) · STONK WIKI`;
    document.getElementById("metaDesc").setAttribute("content", `${e.name} — ${e.sector} · STONK SCORE ${e.score}`);

    const summary = W.investmentSummary(e);
    const liveBadge = e.live ? `<span class="badge live">● LIVE</span>` : e.unresolved ? `<span class="badge">방 미연결</span>` : `<span class="badge">도감</span>`;

    let priceBlock;
    if (e.price != null) {
      const cls = W.dir(e.changeRate);
      priceBlock = `<div class="co-price-big">
        <b class="${cls}">${W.num(e.price)}<span style="font-size:18px;font-weight:600">원</span></b>
        <span class="chg ${cls}">${W.arrow(e.changeRate)} ${W.sign(e.diff)}${W.num(e.diff)} (${W.pct(e.changeRate)})</span></div>`;
    } else {
      priceBlock = `<div class="co-price-big"><b class="muted" style="font-size:26px">시세 정보 없음</b></div>
        <p class="muted" style="font-size:13px;margin:0">${e.unresolved ? "이 종목은 특정 게임 방에서 생성된 종목입니다. 해당 방에 연결하면 정보가 표시됩니다." : "실시간 시장 방에 연결하면 현재가가 표시됩니다."}</p>`;
    }

    const conn = W.isConnected();
    const sourceNote = e.dynamic
      ? `<div class="notice" style="margin-top:14px">📡 <b>방 기준 분석</b> — 이 종목의 설명·위험도·STONK SCORE·강점/약점·투자요약·공시는 <b>${W.esc(W.currentRoomId())} 방 데이터</b>로 결정적 생성되었습니다(같은 방·종목이면 항상 동일, 다른 방이면 달라짐).</div>`
      : (e.source === "live" ? `<div class="notice" style="margin-top:14px">ℹ️ 이 종목은 <b>현재 연결된 방에서 생성된 종목</b>입니다.</div>` : "");
    const hist = buildHistory(e);

    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <a href="index.html#dogam" class="chip">← ${conn ? "이 방 종목" : "회사 도감"}</a>
        <a class="wiki-btn-sm" href="compare.html?a=${encodeURIComponent(e.id)}${W.currentRoomId() ? "&roomId=" + encodeURIComponent(W.currentRoomId()) : ""}">⚖️ 비교하기</a>
      </div>

      ${mobileSummaryCard(e)}
      ${mobileQuickNav(e)}

      <div class="detail-grid">
        <div>
          <div class="panel">
            <div class="co-hero"><div style="flex:1">
              <div class="ch-name">${W.esc(e.name)} ${W.starButtonHTML(e.id)}</div>
              <div class="ch-sub">${W.esc(e.ticker)} · ${e.sectorMeta.icon} ${W.esc(e.sector)} · ${liveBadge}${e.role && W.ROLE_LABEL[e.role] ? " · " + W.ROLE_LABEL[e.role] : ""}</div>
              ${priceBlock}
            </div>
            <div class="score-hero">${W.scoreBadgeHTML(e, true)}<span class="score-cap">STONK SCORE</span></div>
            </div>
            <p style="color:var(--text-dim);font-size:14.5px;line-height:1.75;margin:16px 0 4px">${W.esc(e.description)}</p>
            <div class="tag-row">${(e.tags || []).map((t, i) => `<span class="chip b ${i >= 3 ? "m-taghide" : ""}">#${W.esc(t)}</span>`).join("")}${(e.tags || []).length > 3 ? `<span class="chip b m-tagmore mobile-only">+${(e.tags || []).length - 3}</span>` : ""}</div>
            ${sourceNote}
          </div>

          ${chartSection(e)}

          <div style="margin-top:16px">
            <h3 style="margin:0 0 10px;font-size:16px;font-weight:800">🤖 ${conn ? "방 기준 투자 요약" : "자동 투자 요약"}</h3>
            <div class="summary-box">${summary.map((s) => `<p>${W.esc(s)}</p>`).join("")}</div>
          </div>
          ${wikiDocHTML(e)}


          <div class="panel wiki-sec" data-sec="strength" id="sec-strength"><h3>💪 강점 · 약점 분석</h3>${swHTML(e)}</div>

          <div class="panel wiki-sec" data-sec="news" id="sec-news"><h3>📰 뉴스 감성 분석</h3>${sentimentHTML(e)}</div>

          <div class="panel wiki-sec" data-sec="disclosure" id="sec-disclosure"><h3>📑 ${conn ? "이 방 공시·이슈" : "공시·이슈"}</h3>${disclosureHTML(e)}</div>

          <div class="panel wiki-sec" data-sec="history" id="sec-history">
            <div class="panel-head">
              <h3>📈 ${conn ? "이 방 종목 이슈" : "회사 히스토리"}</h3>
              <div class="seg seg-sm">
                <button data-order="desc" class="${histOrder === "desc" ? "is-active" : ""}">최신순</button>
                <button data-order="asc" class="${histOrder === "asc" ? "is-active" : ""}">오래된순</button>
              </div>
            </div>
            <div class="timeline" data-list="history">
              ${hist.map((h, i) => `<div class="tl-item ${h.cls} ${h.ms == null ? "tl-undated" : ""} ${i >= 3 ? "m-overflow" : ""}">
                <div class="tl-date">${W.esc(h.dateText)}</div>
                <div class="tl-title"><span class="tl-label">[${W.esc(h.label)}]</span> ${W.esc(h.title)}</div></div>`).join("")}
            </div>
            ${hist.length > 3 ? `<button class="m-more mobile-only" data-more="history">전체 보기 (${hist.length})</button>` : ""}
          </div>

          <div class="panel wiki-sec" data-sec="related" id="sec-related"><h3>🏷️ ${conn ? "이 방 관련 종목" : "관련 기업 추천"}</h3>${recommendHTML(e)}</div>
        </div>

        <div>
          <div class="panel wiki-sec" data-sec="overview" id="sec-overview">
            <h3>${conn ? "방 기준 종목 개요" : "기업 개요"}</h3>
            <dl class="kv">
              <dt>대표자</dt><dd>${W.esc(e.ceo || "-")}</dd>
              <dt>설립연도</dt><dd>${e.foundedYear ? e.foundedYear + "년" : "정보 없음"}</dd>
              <dt>상장일</dt><dd>${W.esc(W.fmtKo(e.listingDateRaw))}<br><small class="muted">${W.esc(e.listingSource)} 기준</small></dd>
              <dt>업종</dt><dd>${W.esc(e.sector)}</dd>
              <dt>주요 사업</dt><dd class="dd-wrap">${W.esc(e.business || "-")}</dd>
              <dt>상장 상태</dt><dd>${W.esc(e.listingStatus || "-")}</dd>
              <dt>기준가</dt><dd>${e.base != null ? W.won(e.base) : "<span class='muted'>방 연결 시</span>"}</dd>
              <dt>변동성</dt><dd>${W.esc(e.volatility)}</dd>
              <dt>배당</dt><dd>${e.dividendLabel && e.dividendLabel !== "없음" ? "있음 (" + W.esc(e.dividendLabel) + ")" : "없음"}</dd>
              <dt>투자 성향</dt><dd>${W.esc(e.growthType)}</dd>
            </dl>
          </div>

          <div class="panel wiki-sec" data-sec="risk" id="sec-risk"><h3>🚦 위험도</h3>${W.riskGaugeHTML(e.risk)}</div>

          <div class="panel wiki-sec" data-sec="investor" id="sec-investor"><h3>👥 투자자 통계</h3>${investorHTML(e)}</div>

          <div class="panel wiki-sec" data-sec="fundamental" id="sec-fundamental">
            <h3>📊 기업 펀더멘털</h3>
            ${metricBar("성장성", e.metrics.growth)}
            ${metricBar("혁신성", e.metrics.innovation)}
            ${metricBar("현금흐름", e.metrics.cashFlow)}
            ${metricBar("평판", e.metrics.reputation)}
            ${metricBar("경영 안정성", e.metrics.management)}
            ${metricBar("부채(낮을수록 양호)", e.metrics.debt, true)}
            ${metricBar("법적 리스크(낮을수록 양호)", e.metrics.legalRisk, true)}
            ${e.hidden ? "" : `<p class="muted" style="font-size:11.5px;margin:8px 0 0">※ 카탈로그 외 종목은 방 데이터 기반 추정 지표입니다.</p>`}
          </div>

          ${e.live ? `<div class="panel wiki-sec" data-sec="live" id="sec-live">
            <h3>실시간 시세</h3>
            <dl class="kv">
              <dt>시가</dt><dd>${W.num(e.live.open)}</dd>
              <dt>고가</dt><dd class="up">${W.num(e.live.high)}</dd>
              <dt>저가</dt><dd class="down">${W.num(e.live.low)}</dd>
              <dt>거래량</dt><dd>${W.num(e.live.volume)}주</dd>
              <dt>거래대금</dt><dd>${W.short(e.live.value)}원</dd>
            </dl></div>` : ""}
        </div>
      </div>
      ${mobileActionBar(e)}`;

    // 차트 그리기 + 기간 버튼
    drawChart(e);
    root.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => {
      chartPeriod = b.dataset.period;
      root.querySelectorAll("[data-period]").forEach((x) => x.classList.toggle("is-active", x === b));
      drawChart(e);
    }));
    // 히스토리 정렬 토글
    root.querySelectorAll("[data-order]").forEach((b) => b.addEventListener("click", () => {
      histOrder = b.dataset.order; render();
    }));
    // 모바일 전용 강화 (접기/탭/액션바/더보기)
    enhanceMobile(e);
  }

  document.addEventListener("wiki:liveupdate", render);
  window.addEventListener("resize", () => { const e = W.getEntry(id); if (e) drawChart(e); });
  // 모바일↔PC 경계 전환 시 접힘 상태 재적용
  W.onViewportChange(() => { const e = W.getEntry(id); if (e) applyCollapsible(); });
  render();
})();
