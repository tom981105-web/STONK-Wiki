// js/room-analysis.js — STONK WIKI v1.3 방 기반 동적 분석 엔진
// ─────────────────────────────────────────────────────────────
// 방 연결 시, 종목의 설명·위험도·STONK SCORE·펀더멘탈·강점/약점·투자요약·
// AI 의견·공시를 roomId+종목 식별자 기반 "결정적"으로 생성한다.
//   · seed = roomId | stock.id | stock.name | stock.sector | stock.type
//   · 같은 방+같은 종목이면 항상 동일 (Math.random / Date.now 사용 안 함)
//   · 다른 방이면 같은 이름 종목도 다른 personality
//   · 시세·뉴스 같은 라이브 값은 그 위에 실시간으로 반영
// catalog.js는 방 연결 상태에서 이 결과를 덮어쓰지 못한다(보조 자료).
(function () {
  "use strict";
  const W = window.Wiki;
  if (!W) return;

  // ── 결정적 해시 + mulberry32 PRNG (시드 고정 → 재현 가능) ──
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    str = String(str);
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededRng(roomId, s) {
    const seed = `${roomId}|${s.id}|${s.name}|${s.sector}|${s.type}`;
    return mulberry32(hashSeed(seed));
  }
  const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const clamp = (v, lo, hi) => Math.max(lo == null ? 0 : lo, Math.min(hi == null ? 100 : hi, Math.round(v)));
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ── 뉴스 감성(방 latestNews + 종목 news + 등락 기반) ──
  const POS = ["성공", "수주", "호재", "상승", "급등", "흑자", "확대", "계약", "승인", "돌파", "신고가", "개선", "강세", "기대", "수혜", "성장", "최대"];
  const NEG = ["하락", "급락", "손실", "적자", "리스크", "소송", "조사", "철회", "경고", "하한", "축소", "결함", "유출", "파산", "약세", "우려", "부담", "지연", "장애", "정지"];
  function newsTone(stock, room, changeRate) {
    let score = 0, n = 0;
    const texts = [];
    if (stock.news) texts.push(stock.news);
    if (room && room.latestNews && room.latestNews.text) texts.push(room.latestNews.text);
    texts.forEach((t) => { n++; POS.forEach((w) => { if (t.includes(w)) score++; }); NEG.forEach((w) => { if (t.includes(w)) score--; }); });
    if (changeRate >= 3) score++; else if (changeRate <= -3) score--;
    return { n, label: score > 0 ? "pos" : score < 0 ? "neg" : "neu", score, latest: texts[0] || "" };
  }

  // ── 컨텍스트(방 전체 맥락) ──
  const SPECIAL = ["etf", "inverse", "leverage", "bond", "commodity", "reit", "spac", "preferred"];
  function computeContext(e, st) {
    const room = st.room || {};
    const s = e.live;
    const all = window.WikiLive.stocksArray();
    const sid = s.id;
    const peers = all.filter((x) => x.sector === s.sector);
    const sectorAvg = peers.length ? peers.reduce((a, x) => a + x.changeRate, 0) / peers.length : 0;
    const totalValue = all.reduce((a, x) => a + x.value, 0);
    const marketShare = totalValue ? (s.value / totalValue) * 100 : 0;

    // 보유자 통계
    const players = room.players || {};
    let holders = 0, sharesHeld = 0, topHolder = 0;
    Object.values(players).forEach((p) => {
      const q = (p && p.holdings && p.holdings[sid]) || 0;
      if (q > 0) { holders++; sharesHeld += q; if (q > topHolder) topHolder = q; }
    });
    const concentration = sharesHeld ? topHolder / sharesHeld : 0;
    let maxHolders = 0;
    all.forEach((x) => {
      let h = 0; Object.values(players).forEach((p) => { if (p && p.holdings && p.holdings[x.id] > 0) h++; });
      if (h > maxHolders) maxHolders = h;
    });

    const isSpecial = SPECIAL.includes(s.type);
    const isIPO = s.sector === "신규상장" || String(sid).startsWith("ipo") ||
      (room.ipo && room.ipo.name === s.name);
    const hist = (window.WikiLive.priceHistory ? window.WikiLive.priceHistory(sid, "all") : []) || [];
    const hasData = hist.length >= 2;
    const tone = newsTone(s, room, s.changeRate);

    return {
      room, stock: s, sid, changeRate: s.changeRate, sector: s.sector, type: s.type,
      peers, sectorAvg, marketShare, totalValue,
      holders, sharesHeld, concentration, maxHolders,
      isSpecial, isIPO, hasData, tone, openDate: room.createdAt || room.startedAt || null,
    };
  }

  // ── 동적 성향(growthType) — 시드 + 업종/타입 가중(라이브 변화에 흔들리지 않음) ──
  const SECTOR_AGGR = { "바이오": 2, "AI·전자": 2, "반도체": 2, "게임": 1, "모빌리티": 2, "에너지": 1, "2차전지": 1 };
  function dynGrowthType(ctx, rng) {
    if (ctx.isSpecial) {
      if (ctx.type === "bond" || ctx.type === "preferred" || ctx.type === "reit") return "배당 안정형";
      return "특수 자산";
    }
    const aggr = SECTOR_AGGR[ctx.sector] || 0;
    const roll = rng() * 6 + aggr; // 0..8
    if (roll >= 6.5) return "공격 성장형";
    if (roll >= 4.8) return "성장형";
    if (roll >= 3.2) return "균형형";
    if (roll >= 1.8) return "배당 안정형";
    return "안정형";
  }
  const GROWTH_LABEL = { "공격 성장형": "매우 높음", "성장형": "높음", "균형형": "보통", "배당 안정형": "보통", "안정형": "낮음", "가치형": "낮음", "특수 자산": "보통" };

  // ── 동적 위험도 (라이브 반영) ──
  const RISK_NUM = { "낮음": 25, "보통": 50, "높음": 72, "매우 높음": 90 };
  function dynRisk(ctx) {
    let r = 30;
    r += Math.min(35, Math.abs(ctx.changeRate) * 1.6);      // 변동성
    if (ctx.tone.label === "neg") r += 14; else if (ctx.tone.label === "pos") r -= 7;
    if (ctx.isIPO) r += 14;                                 // IPO 직후
    if (ctx.concentration >= 0.6) r += 10;                  // 보유 편중
    if (!ctx.hasData) r += 8;                               // 데이터 부족
    if (ctx.type === "bond" || ctx.type === "preferred") r -= 30;
    if (ctx.type === "reit") r -= 14;
    if (ctx.type === "inverse") r += 20;
    if (ctx.type === "leverage") r += 26;
    if (ctx.type === "commodity") r += 8;
    r = Math.max(0, Math.min(100, r));
    const label = r < 32 ? "낮음" : r < 56 ? "보통" : r < 78 ? "높음" : "매우 높음";
    return { score: r, label };
  }
  function volLabel(ctx, riskLabel) {
    if (ctx.type === "bond" || ctx.type === "preferred") return "낮은";
    const a = Math.abs(ctx.changeRate);
    if (a >= 15 || riskLabel === "매우 높음") return "매우 높은";
    if (a >= 7 || riskLabel === "높음") return "높은";
    if (a >= 2.5) return "보통";
    return "낮은";
  }

  // ── 동적 STONK SCORE (5요소) + 펀더멘탈 7지표 ──
  function dynScoreAndMetrics(ctx, rng, riskLabel, growthType) {
    const cr = ctx.changeRate;
    const toneN = ctx.tone.label === "pos" ? 1 : ctx.tone.label === "neg" ? -1 : 0;
    const tech = (SECTOR_AGGR[ctx.sector] || 0) * 5;

    // 5 요소 (0~100)
    const growth = clamp(rint(rng, 45, 68) + tech + (cr >= 8 ? 12 : cr >= 3 ? 6 : cr <= -3 ? -8 : 0) + toneN * 6);
    let stability = clamp(74 - Math.abs(cr) * 1.6 - (ctx.hasData ? 0 : 15) + (ctx.type === "bond" || ctx.type === "preferred" ? 16 : 0) + (ctx.type === "leverage" || ctx.type === "inverse" ? -12 : 0));
    const demandRaw = (ctx.maxHolders ? (ctx.holders / ctx.maxHolders) * 45 : 0) + Math.min(30, ctx.marketShare * 1.2) + rint(rng, 12, 28);
    const demand = clamp(demandRaw);
    const momentum = clamp(50 + cr * 2.2 + toneN * 8);
    const riskInv = clamp(100 - RISK_NUM[riskLabel]);

    const score = Math.round(Math.max(0, Math.min(100,
      0.25 * growth + 0.20 * stability + 0.20 * demand + 0.20 * momentum + 0.15 * riskInv)) * 10) / 10;

    // 펀더멘탈 7지표 (요소 + 시드)
    const metrics = {
      growth: growth,
      innovation: clamp(growth - 4 + tech + rint(rng, -6, 8)),
      cashFlow: stability,
      reputation: clamp(demand * 0.5 + 42 + toneN * 5),
      management: clamp(stability * 0.5 + rint(rng, 38, 58)),
      debt: clamp(100 - stability + rint(rng, -6, 6)),
      legalRisk: clamp(RISK_NUM[riskLabel] - 6 + rint(rng, -8, 8)),
    };
    return { score, components: { growth, stability, demand, momentum, riskInv }, metrics };
  }

  // ── 등락/관심도 표현 ──
  function trendWord(cr) {
    if (cr >= 8) return "강한 상승"; if (cr >= 1.5) return "완만한 상승";
    if (cr <= -8) return "뚜렷한 하락"; if (cr <= -1.5) return "약세";
    return "보합";
  }
  function interestWord(ctx) {
    const h = ctx.maxHolders ? ctx.holders / ctx.maxHolders : 0;
    const v = ctx.marketShare;
    const sc = h * 60 + v;
    if (sc >= 45) return "높은"; if (sc >= 18) return "보통"; return "낮은";
  }

  // ── 동적 회사 설명 ──
  function dynDescription(e, ctx, growthType) {
    const trend = trendWord(ctx.changeRate);
    const interest = interestWord(ctx);
    const news = ctx.tone.latest;
    const newsPart = news ? `최근 '${news}' 영향으로` : "뚜렷한 단일 이슈 없이";
    if (ctx.isSpecial) {
      const label = e.assetLabel || "특수 자산";
      return `${e.name}은(는) 이번 방에서 거래되는 ${label}입니다. 방 오픈 이후 ${trend} 흐름을 보이고 있으며, ${newsPart} 투자자 관심은 ${interest} 상태입니다. 개별 기업이 아닌 자산 특성상 방향성 해석에 유의가 필요합니다.`;
    }
    return `${e.name}은(는) 이번 방에서 ${ctx.sector} 업종에 속한 ${growthType} 종목입니다. 방 오픈 이후 ${trend} 흐름을 보이고 있으며, ${newsPart} 투자자 관심은 ${interest} 상태입니다.`;
  }

  // ── 동적 강점/약점 ──
  function dynStrengthsWeaknesses(ctx, metrics, riskLabel) {
    const S = [], Wk = [];
    if (!ctx.hasData && ctx.tone.n === 0 && ctx.holders === 0) {
      return { strengths: ["분석 데이터 부족"], weaknesses: ["분석 데이터 부족"] };
    }
    // 강점
    if (ctx.changeRate >= 5) S.push("최근 상승률 우수");
    if (ctx.tone.label === "pos") S.push("긍정 뉴스 발생");
    if (ctx.holders >= Math.max(1, ctx.maxHolders * 0.5)) S.push("보유자 수 견조");
    if (ctx.changeRate > ctx.sectorAvg + 1.5) S.push("업종 내 상대 강세");
    if (ctx.changeRate > 0 && Math.abs(ctx.changeRate) < 6) S.push("변동성 대비 수익률 양호");
    if (ctx.isIPO) S.push("IPO 관심도 높음");
    if (metrics.cashFlow >= 70) S.push("현금흐름 양호");
    if (ctx.type === "bond" || ctx.type === "preferred") S.push("방어적 자산 특성");
    // 약점
    if (Math.abs(ctx.changeRate) >= 15) Wk.push("가격 변동성 높음");
    if (ctx.tone.label === "neg") Wk.push("부정 뉴스 존재");
    if (ctx.concentration >= 0.6) Wk.push("보유 집중도 과도");
    if (!ctx.hasData) Wk.push("가격 데이터 부족");
    if (ctx.changeRate >= 20) Wk.push("단기 급등 추격 매수 위험");
    if (ctx.type === "inverse" || ctx.type === "leverage") Wk.push("방향성 리스크(특수 자산)");
    if (riskLabel === "매우 높음") Wk.push("리스크 등급 매우 높음");

    if (!S.length) S.push("뚜렷한 강점 미확인");
    if (!Wk.length) Wk.push("뚜렷한 약점 미확인");
    return { strengths: S.slice(0, 5), weaknesses: Wk.slice(0, 5) };
  }

  // ── 동적 AI 투자 의견 ──
  function dynOpinion(ctx, score, riskLabel) {
    if (!ctx.hasData && ctx.tone.n === 0 && ctx.holders === 0) return "판단 보류";
    if (riskLabel === "매우 높음" && ctx.tone.label === "neg") return "주의";
    if (score >= 85 && riskLabel !== "매우 높음") return "강력매수";
    if (score >= 72) return "매수";
    if (score >= 58) return "보유";
    if (score >= 45) return "관망";
    if (score < 38) return "매도";
    return "관망";
  }

  // ── 동적 공시/이슈 ──
  const DISCLOSURES = [
    { t: "신규 공급계약 체결", tone: "pos" },
    { t: "대규모 수주 계약 공시", tone: "pos", cond: (c) => c.changeRate >= 8 },
    { t: "신규 시설투자 결정", tone: "neu" },
    { t: "자사주 취득 결정", tone: "pos" },
    { t: "영업이익 전망 상향 정정", tone: "pos", cond: (c) => c.changeRate >= 4 },
    { t: "영업이익 전망 하향 정정", tone: "neg", cond: (c) => c.changeRate <= -4 },
    { t: "단기차입금 증가 결정", tone: "neg" },
    { t: "대표이사 변경", tone: "neu" },
    { t: "특허권 취득", tone: "pos" },
    { t: "임상시험 결과 발표", tone: "neu", cond: (c) => c.sector === "바이오" },
    { t: "투자주의종목 지정", tone: "neg", cond: (c) => Math.abs(c.changeRate) >= 20 },
    { t: "거래정지 예고", tone: "neg", cond: (c) => c.changeRate <= -25 },
    { t: "불성실공시법인 지정", tone: "neg" },
    { t: "배당정책 변경", tone: "neu" },
    { t: "상장폐지 우려 해소", tone: "pos", cond: (c) => c.changeRate >= 10 },
    { t: "신규 시설 가동 개시", tone: "pos" },
  ];
  function dynDisclosures(e, ctx, rng) {
    const out = [];
    // 상장 공시(방 오픈일 = 실제 timestamp)
    out.push({ t: "STONK 시장 신규 상장", tone: "pos", dateMs: ctx.openDate ? W.dateMs(ctx.openDate) : null, kind: "상장" });
    if (ctx.isIPO) out.push({ t: "신규상장 종목 지정", tone: "neu", dateMs: ctx.openDate ? W.dateMs(ctx.openDate) : null, kind: "지정" });
    // 조건 충족 + 시드 선택 (날짜 근거 없음 → 날짜 정보 없음)
    const eligible = DISCLOSURES.filter((d) => !d.cond || d.cond(ctx));
    const count = rint(rng, 1, 3);
    shuffle(rng, eligible).slice(0, count).forEach((d) => out.push({ t: d.t, tone: d.tone, dateMs: null, kind: "공시" }));
    return out;
  }

  // ── 동적 자동 투자 요약 ──
  function dynSummary(e, ctx, score, grade, riskLabel, growthType, opinion) {
    const out = [];
    const trend = trendWord(ctx.changeRate);
    out.push(`${e.name}은(는) 현재 방에서 ${ctx.sector} 업종 내 ${trend} 흐름을 보이는 ${growthType} 종목입니다.`);
    const scoreWord = score >= 80 ? "매우 우수" : score >= 68 ? "양호" : score >= 55 ? "보통" : score >= 42 ? "다소 부진" : "취약";
    out.push(`STONK SCORE는 ${score}점(${grade})으로 ${scoreWord}하며, 동적 위험도는 '${riskLabel}'입니다(${e.price != null ? W.pct(ctx.changeRate) : "시세 부족"}).`);
    if (ctx.tone.label === "pos") out.push(`긍정 뉴스가 반영되어 투자 심리는 우호적입니다.`);
    else if (ctx.tone.label === "neg") out.push(`부정적 뉴스 영향으로 단기 투자 심리가 위축돼 있습니다.`);
    else out.push(`뚜렷한 뉴스 모멘텀은 확인되지 않습니다.`);
    if (Math.abs(ctx.changeRate) >= 12) out.push(`변동성이 높아 단기 추격 매수/매도에는 주의가 필요합니다.`);
    out.push(`현재 AI 투자 의견은 '${opinion}'입니다.`);
    return out;
  }

  // ── 엔트리에 동적 분석 적용 (방 연결 + 라이브 종목일 때만) ──
  function apply(e) {
    const st = window.WikiLive && window.WikiLive.state;
    if (!st || !st.connected || !e.live) return e;   // 방 미연결/비라이브 → catalog 유지
    try {
      const ctx = computeContext(e, st);
      const rng = seededRng(st.code, e.live);
      const growthType = dynGrowthType(ctx, rng);
      const risk = dynRisk(ctx);
      const sm = dynScoreAndMetrics(ctx, rng, risk.label, growthType);
      const grade = W.scoreGrade(sm.score);
      const sw = dynStrengthsWeaknesses(ctx, sm.metrics, risk.label);
      const opinion = dynOpinion(ctx, sm.score, risk.label);
      const disclosures = dynDisclosures(e, ctx, rng);
      const summary = dynSummary(e, ctx, sm.score, grade, risk.label, growthType, opinion);
      const description = dynDescription(e, ctx, growthType);

      // 방 데이터 최우선 — catalog 고정값 덮어쓰기
      e.risk = risk.label;
      e.volatility = volLabel(ctx, risk.label);
      e.growthType = growthType;
      e.growthLabel = GROWTH_LABEL[growthType] || e.growthLabel;
      e.metrics = sm.metrics;
      e.score = sm.score;
      e.grade = grade;
      e.description = description;
      e.roomDyn = {
        strengths: sw.strengths, weaknesses: sw.weaknesses, opinion,
        disclosures, summary, tone: ctx.tone, growthType, risk: risk.label,
        score: sm.score, components: sm.components, ctxLite: {
          changeRate: ctx.changeRate, sectorAvg: ctx.sectorAvg, holders: ctx.holders,
          marketShare: ctx.marketShare, isIPO: ctx.isIPO, hasData: ctx.hasData,
        },
      };
      e.dynamic = true;
    } catch (err) { console.error("[room-analysis]", err); }
    return e;
  }

  window.WikiRoom = { apply, seededRng, hashSeed, newsTone };
})();
