// js/analytics.js — STONK WIKI v1.1 분석 엔진
// 뉴스 감성 · 시장 심리지수(Fear&Greed) · 투자자 통계 · 강점/약점 · 관련기업 추천
// 모든 함수는 데이터가 없으면 안전하게 null/빈값을 반환한다(랜덤 생성 없음).
(function () {
  "use strict";
  const W = window.Wiki;
  if (!W) return;

  // ───────────────── 뉴스 감성 분석 ─────────────────
  const POS = ["성공", "수주", "호재", "상승", "급등", "흑자", "확대", "계약", "승인", "돌파", "신고가", "개선", "강세", "기대", "수혜", "성장"];
  const NEG = ["하락", "급락", "손실", "적자", "리스크", "소송", "조사", "철회", "경고", "하한", "축소", "결함", "유출", "파산", "약세", "우려", "부담", "지연"];
  function classifyText(text, rate) {
    const t = String(text || "");
    let score = 0;
    POS.forEach((w) => { if (t.includes(w)) score += 1; });
    NEG.forEach((w) => { if (t.includes(w)) score -= 1; });
    if (typeof rate === "number") { if (rate >= 3) score += 1; else if (rate <= -3) score -= 1; }
    return score > 0 ? "pos" : score < 0 ? "neg" : "neu";
  }
  // 한 종목의 최근 뉴스 모음 → 감성 비율. items: [{title, rate}]
  function newsSentiment(items) {
    const list = (items || []).filter((i) => i && i.title);
    if (!list.length) return null;
    const c = { pos: 0, neu: 0, neg: 0 };
    list.forEach((i) => { c[classifyText(i.title, i.rate)]++; });
    const n = list.length;
    return {
      count: n,
      pos: Math.round((c.pos / n) * 100),
      neu: Math.round((c.neu / n) * 100),
      neg: Math.round((c.neg / n) * 100),
      raw: c,
    };
  }
  // 엔트리 기준 최근 뉴스 수집 (실시간 방 데이터에서)
  function appendAdminNewsForEntry(out, entry) {
    const adapter = window.MarketAdminAdapter;
    const list = adapter?.loadAdminNews ? adapter.loadAdminNews() : [];
    list.forEach((item) => {
      const matchesCompany = item.targetCompanyId && (item.targetCompanyId === entry.id || item.targetCompanyId === entry.wikiId);
      const matchesName = item.company && item.company === entry.name;
      const matchesSector = item.sector && item.sector === entry.sector;
      if (!matchesCompany && !matchesName && !matchesSector) return;
      const effect = String(item.effect || "").toLowerCase();
      const rate = effect === "up" ? Math.max(1, Number(item.impact || 1)) : effect === "down" ? -Math.max(1, Number(item.impact || 1)) : 0;
      out.push({ title: item.title, rate });
    });
  }

  function collectNewsFor(entry) {
    const room = window.WikiLive.state.room;
    const out = [];
    appendAdminNewsForEntry(out, entry);
    if (!room) return out;
    const s = entry.live;
    if (s && s.news) out.push({ title: s.news, rate: s.changeRate });
    if (entry.changeRate != null) {
      if (entry.changeRate >= 25) out.push({ title: `${entry.name} 상한가 근접`, rate: entry.changeRate });
      else if (entry.changeRate <= -25) out.push({ title: `${entry.name} 하한가 근접`, rate: entry.changeRate });
      else if (entry.changeRate >= 12) out.push({ title: `${entry.name} 급등세`, rate: entry.changeRate });
      else if (entry.changeRate <= -12) out.push({ title: `${entry.name} 급락세`, rate: entry.changeRate });
      else if (entry.changeRate >= 3) out.push({ title: `${entry.name} 강세`, rate: entry.changeRate });
      else if (entry.changeRate <= -3) out.push({ title: `${entry.name} 약세`, rate: entry.changeRate });
    }
    if (room.latestNews && room.latestNews.text) out.push({ title: room.latestNews.text, rate: 0 });
    return out;
  }

  // ───────────────── 시장 심리지수 (Fear & Greed) ─────────────────
  function fearGreed() {
    const live = window.WikiLive.stocksArray().filter((s) => s.isEquity);
    if (!live.length) return null;
    const up = live.filter((s) => s.changeRate > 0).length;
    const down = live.filter((s) => s.changeRate < 0).length;
    const breadth = (up + down) ? (up / (up + down)) * 100 : 50;            // 상승 종목 비중
    const avg = live.reduce((a, s) => a + s.changeRate, 0) / live.length;
    const momentum = Math.max(0, Math.min(100, 50 + avg * 5));              // 평균 등락 모멘텀
    const idx = Math.round(0.5 * breadth + 0.5 * momentum);
    let label, cls;
    if (idx <= 24) { label = "극한 공포"; cls = "fg-extfear"; }
    else if (idx <= 44) { label = "공포"; cls = "fg-fear"; }
    else if (idx <= 55) { label = "중립"; cls = "fg-neutral"; }
    else if (idx <= 74) { label = "탐욕"; cls = "fg-greed"; }
    else { label = "극한 탐욕"; cls = "fg-extgreed"; }
    return { index: idx, label, cls, up, down };
  }

  // ───────────────── 투자자 통계 ─────────────────
  function investorStats(entry) {
    const room = window.WikiLive.state.room;
    const sid = entry.live ? entry.live.id : null;
    if (!room || !sid) return null;
    const players = room.players || {};
    let holders = 0, sharesHeld = 0;
    Object.values(players).forEach((p) => {
      const q = (p && p.holdings && p.holdings[sid]) || 0;
      if (q > 0) { holders++; sharesHeld += q; }
    });
    // 인기 순위: 보유자 수 기준 전체 종목 중 순위
    const allStocks = Object.entries(room.stocks || {}).map(([id]) => {
      let h = 0;
      Object.values(players).forEach((p) => { if (p && p.holdings && p.holdings[id] > 0) h++; });
      return { id, h };
    }).sort((a, b) => b.h - a.h);
    const rank = allStocks.findIndex((x) => x.id === sid) + 1;
    // 시장 점유율(거래대금 기준)
    const totalValue = window.WikiLive.stocksArray().reduce((a, s) => a + s.value, 0);
    const marketShare = totalValue ? (entry.value || 0) / totalValue * 100 : null;
    return {
      holders,
      sharesHeld,
      rank: rank || null,
      totalStocks: allStocks.length,
      marketShare,                 // %
      sharesOutstanding: null,     // 발행주식수: 방 데이터에 없음 → 안전 처리
    };
  }

  // ───────────────── 강점 / 약점 자동 생성 ─────────────────
  function strengthsWeaknesses(entry) {
    if (entry.roomDyn && entry.roomDyn.strengths) {          // v1.3 방 기반 우선
      return { strengths: entry.roomDyn.strengths, weaknesses: entry.roomDyn.weaknesses };
    }
    const m = entry.metrics || W.deriveHidden(entry);
    const S = [], Wk = [];
    if (m.growth >= 75) S.push("성장성 우수");
    if (m.innovation >= 80) S.push("혁신성 높음");
    if (m.cashFlow >= 72) S.push("현금흐름 탄탄");
    if (m.reputation >= 75) S.push("시장 평판 우수");
    if (m.management >= 72) S.push("경영 안정적");
    if (m.debt <= 40) S.push("낮은 부채 수준");
    if (m.legalRisk <= 30) S.push("법적 리스크 낮음");
    if (entry.dividendLabel === "높음") S.push("높은 배당 매력");

    if (m.growth <= 45) Wk.push("성장성 제한적");
    if (m.innovation <= 45) Wk.push("혁신성 부족");
    if (m.cashFlow <= 42) Wk.push("낮은 현금흐름");
    if (m.reputation <= 50) Wk.push("평판 개선 필요");
    if (m.debt >= 65) Wk.push("높은 부채 부담");
    if (m.legalRisk >= 48) Wk.push("법적 리스크 존재");
    if (entry.risk === "높음" || entry.risk === "매우 높음") Wk.push("높은 변동성");

    if (!S.length) S.push("뚜렷한 강점 미확인");
    if (!Wk.length) Wk.push("뚜렷한 약점 미확인");
    return { strengths: S.slice(0, 5), weaknesses: Wk.slice(0, 5) };
  }

  // ───────────────── 관련 기업 추천 (이유 포함) ─────────────────
  function recommendations(entry, limit) {
    const mode = W.isConnected() ? "room" : "catalog";
    const pool = W.activeEntries(mode).filter((x) => x.id !== entry.id);
    const gradeNum = { "낮음": 1, "보통": 2, "높음": 3, "매우 높음": 4 };
    const sameSector = pool.filter((x) => x.sector === entry.sector);
    const base = (sameSector.length ? sameSector : pool);
    const scored = base.map((x) => {
      const growthGap = Math.abs((W.GROW_NUM[x.growthLabel] || 2) - (W.GROW_NUM[entry.growthLabel] || 2));
      const riskGap = Math.abs((gradeNum[x.risk] || 2) - (gradeNum[entry.risk] || 2));
      const scoreGap = Math.abs(x.score - entry.score);
      const reasons = [];
      if (x.sector === entry.sector) reasons.push("동일 업종");
      if (growthGap === 0) reasons.push("비슷한 성장성");
      if ((gradeNum[x.risk] || 2) < (gradeNum[entry.risk] || 2)) reasons.push("더 낮은 위험도");
      else if (riskGap === 0) reasons.push("비슷한 위험도");
      if (scoreGap <= 6) reasons.push("비슷한 STONK SCORE");
      if (!reasons.length) reasons.push("관심 종목군");
      return { entry: x, sortKey: growthGap * 2 + riskGap + scoreGap * 0.1, reasons: reasons.slice(0, 3) };
    }).sort((a, b) => a.sortKey - b.sortKey);
    return scored.slice(0, limit || 4);
  }

  // ───────────────── 오늘의 HOT 종목 ─────────────────
  function hotStocks() {
    const live = window.WikiLive.stocksArray();
    if (!live.length) return null;
    const eq = live.filter((s) => s.isEquity);
    const byUp = [...eq].sort((a, b) => b.changeRate - a.changeRate).slice(0, 5);
    const byDown = [...eq].sort((a, b) => a.changeRate - b.changeRate).slice(0, 5);
    const byVol = [...live].sort((a, b) => b.value - a.value).slice(0, 5);
    const fresh = live.filter((s) => s.sector === "신규상장" || String(s.id).startsWith("ipo")).slice(0, 5);
    return { up: byUp, down: byDown, volume: byVol, fresh };
  }

  W.analytics = {
    classifyText, newsSentiment, collectNewsFor,
    fearGreed, investorStats, strengthsWeaknesses, recommendations, hotStocks,
  };
})();
