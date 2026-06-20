// js/core.js
// STONK WIKI 공통 코어
// ─────────────────────────────────────────────────────────────
// ★ 데이터 모델: "엔트리(entry)" 통합
//   - 방 미연결 → 정적 카탈로그(40개사)를 엔트리로 변환 (백과사전 모드)
//   - 방 연결   → 그 방에서 실제 생성된 종목을 엔트리로 변환 (실시간 모드)
//        · 카탈로그에 같은 이름이 있으면 프로필(대표/설명/펀더멘털) 병합
//        · 없으면 방 데이터(업종/타입/변동성)로 정보를 결정적으로 생성
//   이렇게 해서 "방마다 이름이 달라도" 도감이 그 방 종목을 그대로 보여준다.
(function () {
  "use strict";

  const CATALOG = (window.WikiCatalog && window.WikiCatalog.companies) || [];
  const SECTOR_META = (window.WikiCatalog && window.WikiCatalog.sectorMeta) || {};

  function adminAdapter() { return window.MarketAdminAdapter || null; }
  function adminCompanies() {
    const adapter = adminAdapter();
    return adapter?.loadAdminCompanies ? adapter.loadAdminCompanies() : [];
  }
  function catalogEntries() {
    const admin = adminCompanies();
    return admin.length ? admin : CATALOG;
  }
  function sectorMetaMap() {
    const map = { ...SECTOR_META };
    const adapter = adminAdapter();
    const sectors = adapter?.loadAdminSectors ? adapter.loadAdminSectors() : [];
    sectors.forEach((sector) => {
      map[sector.name] = {
        ...(map[sector.name] || {}),
        ...sector,
        icon: sector.icon || (map[sector.name] && map[sector.name].icon) || "\uD83C\uDFE2",
        blurb: sector.blurb || sector.description || (map[sector.name] && map[sector.name].blurb) || "",
      };
    });
    return map;
  }
  function sectorMetaFor(name, kind) {
    return sectorMetaMap()[name] || { icon: kind === "special" ? "\uD83E\uDDFA" : "\uD83C\uDFE2", blurb: "" };
  }
  function wikiDocs() {
    const adapter = adminAdapter();
    return adapter?.loadAdminWikiDocs ? adapter.loadAdminWikiDocs() : [];
  }
  function wikiDocById(id) {
    const key = String(id || "");
    return wikiDocs().find((doc) => doc.id === key) || null;
  }
  function wikiDocForEntry(entry) {
    if (!entry) return null;
    // Phase 4: 방 종목에 admin 이 직접 쓴 wiki 설명이 있으면 최우선 사용
    if (entry.roomWiki) {
      return {
        id: "wiki-room-" + (entry.roomStockId || entry.id),
        title: entry.name,
        category: "company",
        summary: entry.oneLine || "",
        content: entry.roomWiki,
        tags: entry.tags || [],
        updatedAt: entry.roomWikiUpdatedAt || Date.now(),
        source: "room",
      };
    }
    if (entry.wikiId) {
      const linked = wikiDocById(entry.wikiId);
      if (linked) return linked;
    }
    return wikiDocs().find((doc) =>
      (doc.relatedCompanyIds || []).includes(entry.id) ||
      (doc.relatedCompanyIds || []).includes(entry.name) ||
      (doc.relatedSectors || []).includes(entry.sector)
    ) || null;
  }

  // ───────────────── 포맷터 ─────────────────
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR") + "원";
  const num = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
  function short(n) {
    n = Number(n) || 0;
    const neg = n < 0 ? "-" : "";
    n = Math.abs(n);
    if (n >= 1e12) return neg + (n / 1e12).toFixed(2) + "조";
    if (n >= 1e8) return neg + (n / 1e8).toFixed(1) + "억";
    if (n >= 1e4) return neg + Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
    return neg + num(n);
  }
  const dir = (r) => (r > 0 ? "up" : r < 0 ? "down" : "flat");
  const arrow = (r) => (r > 0 ? "▲" : r < 0 ? "▼" : "—");
  const sign = (r) => (r > 0 ? "+" : "");
  const pct = (r) => `${sign(r)}${(Number(r) || 0).toFixed(2)}%`;
  // ─── v1.2 통합 날짜 처리 ───
  // Firebase timestamp(ms/sec 숫자), ISO 문자열, "YYYY-MM-DD", "YYYY"(연도), Date 모두 파싱.
  // 파싱 불가 시 null 반환(임의 날짜 생성하지 않음).
  function parseDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "object") {                       // {seconds,..} 형태 방어
      if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
      if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
      return null;
    }
    if (typeof v === "number") {
      const ms = v < 1e12 ? v * 1000 : v;              // 초 단위면 ms로
      const d = new Date(ms);
      return isNaN(d) ? null : d;
    }
    const s = String(v).trim();
    if (/^\d{4}$/.test(s)) return new Date(Number(s), 0, 1);       // 연도만
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);     // epoch sec
    if (/^\d{13}$/.test(s)) return new Date(Number(s));            // epoch ms
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  // 카드용: 2026.06.14
  function fmtDot(v) {
    const d = parseDate(v);
    if (!d) return "날짜 정보 없음";
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  }
  // 상세용: 2026년 6월 14일
  function fmtKo(v) {
    const d = parseDate(v);
    if (!d) return "날짜 정보 없음";
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  // 시간까지: 2026.06.14 15:30
  function fmtDateTime(v) {
    const d = parseDate(v);
    if (!d) return "날짜 정보 없음";
    return `${fmtDot(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  // 연도만 표기(설립연도 등): 2020
  function fmtYear(v) {
    if (typeof v === "number" && v >= 1900 && v <= 2100) return String(v);  // 연도 숫자 우선
    if (typeof v === "string" && /^\d{4}$/.test(v.trim())) return v.trim();
    const d = parseDate(v);
    return d ? String(d.getFullYear()) : "날짜 정보 없음";
  }
  // 정렬용 epoch(ms). 없으면 null.
  function dateMs(v) { const d = parseDate(v); return d ? d.getTime() : null; }
  // 하위호환: 기존 fmtDate 호출부 유지
  const fmtDate = fmtDot;
  function timeAgo(t) {
    const d = parseDate(t);
    if (!d) return "";
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return "방금 전";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    return Math.floor(s / 86400) + "일 전";
  }

  // ───────────────── 해시 / 결정적 생성 ─────────────────
  function hash(str) {
    let h = 2166136261;
    str = String(str || "x");
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function pseudoTicker(name) {
    const h = hash(name);
    const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let t = "";
    let x = h;
    for (let i = 0; i < 4; i++) { t += L[x % 26]; x = Math.floor(x / 26) + 7; }
    return t;
  }

  // 특수 자산 타입(주식이 아닌 종목) 라벨
  const TYPE_LABEL = { preferred: "우선주", etf: "ETF", reit: "리츠", spac: "SPAC", inverse: "인버스", leverage: "레버리지", bond: "채권ETF", commodity: "원자재" };
  const SPECIAL_TYPES = Object.keys(TYPE_LABEL);
  const ROLE_LABEL = { leader: "대장주", sub: "부대장주", related: "관련주", normal: "일반주" };

  const RISK_NUM = { "낮음": 1, "보통": 2, "높음": 3, "매우 높음": 4 };
  const GROW_NUM = { "낮음": 1, "보통": 2, "높음": 3, "매우 높음": 4 };
  const RISK_VOLAT = { "낮음": "낮은", "보통": "보통", "높음": "높은", "매우 높음": "매우 높은" };

  // ───────────────── lore (설립연도/태그/변동성/성향) ─────────────────
  // ※ v1.2: 상장일(listingDate)은 더 이상 해시로 임의 생성하지 않는다.
  //   설립연도(foundedYear)는 연도만 갖는 백과사전 고정 속성으로 유지.
  function deriveLore(e) {
    const h = hash(e.id || e.name);
    const young = (e.risk === "매우 높음" || e.growthLabel === "매우 높음");
    const foundedYear = e.foundedYear || (young ? 2016 + (h % 9) : 2001 + (h % 18));
    const volatility = e.volatility || (RISK_VOLAT[e.risk] || "보통");
    const growthType =
      e.kind === "special" ? "특수 자산" :
      e.growthLabel === "매우 높음" ? "공격 성장형" :
      e.growthLabel === "높음" ? "성장형" :
      e.dividendLabel === "높음" ? "배당 안정형" :
      e.risk === "낮음" ? "안정형" : "균형형";
    const tags = e.tags || buildTags(e, growthType);
    return { foundedYear, volatility, growthType, tags };
  }

  // ───────────────── v1.2 상장일 우선순위 해석 ─────────────────
  // 1.company.listedAt 2.company.listingDate 3.room.createdAt 4.market.createdAt 5.현재 날짜
  function resolveListingDate(e) {
    const st = (window.WikiLive && window.WikiLive.state) || {};
    const room = st.room || null;
    const cands = [
      [e.listedAt, "회사 등록일"],
      [e.listingDateRaw, "회사 상장일"],
      [room && (room.createdAt || room.startedAt), "방 오픈일"],
      [st.marketCreatedAt, "시장 생성일"],
    ];
    for (const [v, src] of cands) {
      const d = parseDate(v);
      if (d) return { raw: v, ms: d.getTime(), source: src };
    }
    return { raw: Date.now(), ms: Date.now(), source: "현재 날짜(임시)" };
  }
  function buildTags(e, growthType) {
    const t = [e.sector];
    if (e.kind === "special") t.push(e.assetLabel || "특수자산");
    if (e.role && ROLE_LABEL[e.role]) t.push(ROLE_LABEL[e.role]);
    if (e.growthLabel === "매우 높음" || e.growthLabel === "높음") t.push("성장주");
    if (e.dividendLabel === "높음" || e.dividendLabel === "보통") t.push("배당주");
    if (e.risk === "낮음") t.push("방어주");
    if (e.risk === "매우 높음") t.push("고위험");
    if (String(e.listingStatus).includes("IPO")) t.push("IPO");
    if (String(e.listingStatus).includes("신규")) t.push("신규상장");
    if (e.hidden && e.hidden.innovation >= 85) t.push("혁신");
    if (e.hidden && e.hidden.cashFlow >= 75) t.push("현금창출");
    if (growthType !== "특수 자산") t.push(growthType);
    return Array.from(new Set(t.filter(Boolean)));
  }

  // ───────────────── 엔트리 빌더 ─────────────────
  // 라이브 종목(s) → 사용 가능한 프로필 추론 (카탈로그 미매칭 시)
  const SPECIAL_DESC = {
    etf: "시장 지수를 추종하는 가상 ETF입니다. 개별 종목보다 분산된 흐름을 보입니다.",
    inverse: "시장 지수를 반대로 추종하는 가상 인버스 ETF입니다. 하락장에서 강합니다.",
    leverage: "시장 지수를 2배로 추종하는 가상 레버리지 ETF입니다. 변동성이 큽니다.",
    bond: "국채를 담는 가상 채권 ETF입니다. 안전자산 성격으로 변동성이 낮습니다.",
    commodity: "원자재 가격을 추종하는 가상 ETF입니다. 실물 수급 이슈에 반응합니다.",
    reit: "부동산에 투자하는 가상 리츠입니다. 배당 매력이 있는 자산입니다.",
    spac: "합병을 목적으로 상장한 가상 기업인수목적회사(SPAC)입니다.",
    preferred: "의결권 대신 배당 우선권을 갖는 우선주입니다. 보통주를 추종합니다.",
  };
  function deriveFromLive(s) {
    const special = SPECIAL_TYPES.includes(s.type);
    const assetLabel = TYPE_LABEL[s.type] || null;
    // 위험도
    let risk;
    if (s.type === "bond" || s.type === "preferred") risk = "낮음";
    else if (s.type === "inverse" || s.type === "leverage" || s.type === "commodity") risk = "높음";
    else if (s.volat != null) risk = s.volat >= 1.6 ? "매우 높음" : s.volat >= 1.05 ? "높음" : s.volat >= 0.7 ? "보통" : "낮음";
    else risk = s.role === "leader" ? "보통" : "높음";
    // 성장성
    let growthLabel;
    if (special) growthLabel = "보통";
    else growthLabel = s.role === "leader" ? "높음" : s.role === "sub" ? "높음" : "보통";
    // 배당
    let dividendLabel = s.type === "bond" || s.type === "reit" ? "높음" : s.type === "preferred" ? "보통" : "없음";
    const sector = special ? assetLabel : (s.sector || "기타");
    const desc = special ? (SPECIAL_DESC[s.type] || "시장에서 거래되는 특수 자산입니다.")
      : `${sector} 업종에서 거래되는 종목입니다.${s.role && ROLE_LABEL[s.role] ? ` 현재 ${ROLE_LABEL[s.role]}으로 분류됩니다.` : ""} 이 방에서 생성된 가상 기업으로, 시세와 뉴스로 정보를 파악할 수 있습니다.`;
    return {
      ticker: pseudoTicker(s.name),
      sector,
      ceo: "비공개",
      business: special ? assetLabel : `${sector} 관련 사업`,
      description: desc,
      risk, growthLabel, dividendLabel,
      listingStatus: s.sector === "신규상장" ? "신규 상장" : (special ? assetLabel : "거래 중"),
      hidden: null,
      kind: special ? "special" : "stock",
      assetLabel,
    };
  }

  // 라이브 시세를 엔트리에 부착
  function attachLive(e, s) {
    if (!s) return e;
    e.live = s;
    e.price = s.price; e.changeRate = s.changeRate; e.diff = s.diff;
    e.volume = s.volume; e.value = s.value; e.base = s.base;
    e.role = e.role || s.role;
    return e;
  }
  function emptyLiveFields(e) {
    e.live = null; e.price = null; e.changeRate = null; e.diff = null;
    e.volume = null; e.value = null; e.base = null;
    return e;
  }

  // 카탈로그 기업 → 엔트리 (연결 중이면 같은 이름 라이브 시세 오버레이)
  function entryFromCatalog(c) {
    const e = Object.assign({ kind: "stock" }, c);
    const live = window.WikiLive && window.WikiLive.stockByName ? window.WikiLive.stockByName(c.name) : null;
    live ? attachLive(e, live) : emptyLiveFields(e);
    return finalize(e, "catalog");
  }

  // 라이브 종목 → 엔트리 (카탈로그 매칭 시 프로필 병합)
  function entryFromLive(s) {
    const match = getCompanyByName(s.name);
    let e;
    if (match) {
      e = Object.assign({ kind: "stock" }, match);
      e.role = s.role || e.role;
    } else {
      e = Object.assign({ name: s.name }, deriveFromLive(s));
      e.role = s.role;
    }
    e.id = match ? match.id : "live:" + s.name; // 즐겨찾기/URL 안정 키
    attachLive(e, s);
    const out = finalize(e, match ? "merged" : "live");
    // Phase 4: 방 종목에 admin 이 쓴 설명/위키가 있으면 표시 데이터에 반영
    out.roomStockId = s.id;
    if (s.description) out.description = s.description;
    if (s.oneLine && !out.oneLine) out.oneLine = s.oneLine;
    if (s.wiki) out.roomWiki = s.wiki;
    return out;
  }

  function finalize(e, source) {
    e.source = source;
    e.assetLabel = e.assetLabel || (SPECIAL_TYPES.includes(e.live ? e.live.type : "") ? TYPE_LABEL[e.live.type] : null);
    e.sectorMeta = sectorMetaFor(e.sector, e.kind);
    Object.assign(e, deriveLore(e));
    // v1.2 상장일: 우선순위 해석 → 표시 텍스트/정렬값/출처
    const ld = resolveListingDate(e);
    e.listingDateRaw = ld.raw; e.listingDateMs = ld.ms; e.listingSource = ld.source;
    e.listingDate = fmtDot(ld.raw);            // 카드/개요 표시용 텍스트(하위호환 필드명 유지)
    e.metrics = deriveHidden(e);     // 7대 펀더멘털 (없으면 결정적 생성)
    e.score = stonkScore(e);         // STONK SCORE (0~100)
    e.grade = scoreGrade(e.score);   // 등급
    // v1.3: 방 연결 + 라이브 종목이면 방 기반 동적 분석으로 덮어씀(catalog 보조)
    if (window.WikiRoom && window.WikiRoom.apply) window.WikiRoom.apply(e);
    return e;
  }

  // ───────────────── STONK SCORE 엔진 ─────────────────
  // 7대 지표: growth, innovation, cashFlow, reputation, management, debt, legalRisk
  // 카탈로그 기업은 hidden 사용. 그 외(라이브 생성 종목)는 risk/growth/role/해시로
  // 결정적(deterministic) 생성 — 랜덤 아님(새로고침해도 동일).
  function deriveHidden(e) {
    if (e.hidden) return e.hidden;
    const h = hash(e.id || e.name);
    const j = (n) => ((h >>> n) % 17) - 8;            // -8~+8 결정적 흔들림
    const G = { "낮음": 42, "보통": 60, "높음": 78, "매우 높음": 92 };
    const RK = { "낮음": 30, "보통": 50, "높음": 70, "매우 높음": 88 };
    const g = G[e.growthLabel] ?? 60;
    const rk = RK[e.risk] ?? 50;
    const clamp = (v) => Math.max(8, Math.min(98, Math.round(v)));
    const techy = /AI|전자|반도체|소프트|바이오|게임|모빌|로보/.test(e.sector + e.name) ? 10 : 0;
    return {
      growth: clamp(g + j(0)),
      innovation: clamp(g - 4 + techy + j(3)),
      cashFlow: clamp(100 - rk - 6 + j(6)),
      reputation: clamp(72 - (rk - 50) * 0.5 + j(9)),
      management: clamp(70 - (rk - 50) * 0.4 + j(12)),
      debt: clamp(rk + j(15)),
      legalRisk: clamp(rk - 12 + j(18)),
    };
  }
  function stonkScore(e) {
    const m = e.metrics || deriveHidden(e);
    const s =
      0.20 * m.growth + 0.15 * m.innovation + 0.15 * m.cashFlow +
      0.12 * m.reputation + 0.11 * m.management +
      0.14 * (100 - m.debt) + 0.13 * (100 - m.legalRisk);
    return Math.round(Math.max(0, Math.min(100, s)) * 10) / 10;
  }
  function scoreGrade(s) {
    if (s >= 95) return "SSS";
    if (s >= 90) return "SS";
    if (s >= 80) return "S";
    if (s >= 70) return "A";
    if (s >= 60) return "B";
    if (s >= 50) return "C";
    return "D";
  }
  function gradeClass(g) {
    return { SSS: "g-sss", SS: "g-ss", S: "g-s", A: "g-a", B: "g-b", C: "g-c", D: "g-d" }[g] || "g-c";
  }
  function scoreBadgeHTML(e, big) {
    return `<span class="stonk-score ${gradeClass(e.grade)} ${big ? "big" : ""}">
      <b>${e.score.toFixed(1)}</b><i>${e.grade}</i></span>`;
  }

  // ───────────────── 위험도 게이지 (4단계 시각화) ─────────────────
  const RISK_GAUGE = { "낮음": { p: 18, label: "안전", cls: "safe" }, "보통": { p: 46, label: "주의", cls: "warn" }, "높음": { p: 72, label: "위험", cls: "danger" }, "매우 높음": { p: 92, label: "매우 위험", cls: "extreme" } };
  function riskGaugeHTML(risk) {
    const g = RISK_GAUGE[risk] || RISK_GAUGE["보통"];
    return `<div class="risk-gauge">
      <div class="rg-track"><span class="rg-marker ${g.cls}" style="left:${g.p}%"></span></div>
      <div class="rg-labels"><span>안전</span><span>주의</span><span>위험</span><span>매우 위험</span></div>
      <div class="rg-now ${g.cls}">${esc(risk)} · ${g.label}</div>
    </div>`;
  }

  // ───────────────── 활성 엔트리 목록 ─────────────────
  // mode: "auto"(기본) | "room" | "catalog"
  function isConnected() { return !!(window.WikiLive && window.WikiLive.state && window.WikiLive.state.connected); }
  function activeMode(mode) {
    if (mode === "room") return "room";
    if (mode === "catalog") return "catalog";
    return isConnected() ? "room" : "catalog";
  }
  function activeEntries(mode) {
    const m = activeMode(mode);
    if (m === "room") {
      const live = window.WikiLive.stocksArray();
      return live.map(entryFromLive);
    }
    return catalogEntries().map(entryFromCatalog);
  }

  function getCompany(id) { return catalogEntries().find((c) => c.id === id) || null; }
  function getCompanyByName(name) { return catalogEntries().find((c) => c.name === name) || null; }

  // id로 엔트리 해석 (카탈로그 id 또는 "live:이름")
  function getEntry(id) {
    const c = getCompany(id);
    if (c) return entryFromCatalog(c);
    // Phase 4: ?company=/?companyId= 로 넘어온 방 종목 id 직접 해석
    const byId = window.WikiLive && window.WikiLive.stockById ? window.WikiLive.stockById(id) : null;
    if (byId) return entryFromLive(byId);
    if (String(id).startsWith("live:")) {
      const name = id.slice(5);
      const s = window.WikiLive && window.WikiLive.stockByName ? window.WikiLive.stockByName(name) : null;
      if (s) return entryFromLive(s);
      // 연결이 끊겼거나 다른 방 → 최소 엔트리
      const e = finalize(Object.assign({ id, name, kind: "stock" }, deriveFromLive({ name, type: "stock", role: "" })), "live");
      emptyLiveFields(e);
      e.unresolved = true;
      return e;
    }
    return null;
  }

  // ───────────────── v1.2 roomId 전파 링크 ─────────────────
  function currentRoomId() {
    try {
      const p = new URLSearchParams(location.search);
      const u = p.get("roomId") || p.get("room");
      if (u) return u;
    } catch (e) {}
    return (window.WikiLive && window.WikiLive.state && window.WikiLive.state.code) || "";
  }
  function companyHref(id) {
    const rid = currentRoomId();
    return `company.html?id=${encodeURIComponent(id)}${rid ? "&roomId=" + encodeURIComponent(rid) : ""}`;
  }

  // ───────────────── 투자 요약 ─────────────────
  function investmentSummary(e) {
    if (e.roomDyn && e.roomDyn.summary) return e.roomDyn.summary;   // v1.3 방 기반 요약 우선
    const out = [];
    if (e.kind === "special") {
      out.push(`${e.name}는 시장에서 거래되는 ${e.assetLabel || "특수 자산"}입니다.`);
      out.push(e.description || "");
      if (e.price != null) {
        const trend = e.changeRate > 1 ? "상승" : e.changeRate < -1 ? "하락" : "보합";
        out.push(`현재가는 ${num(e.price)}원이며 ${trend} 흐름입니다(${pct(e.changeRate)}).`);
      } else {
        out.push("실시간 시장 방에 연결하면 현재가가 표시됩니다.");
      }
      out.push(`변동성은 ${e.volatility} 편으로, 분산 투자나 헤지 수단으로 활용됩니다.`);
      return out.filter(Boolean);
    }
    const growthWord = { "매우 높음": "고성장", "높음": "성장형", "보통": "안정 성장형", "낮음": "저성장 가치형" }[e.growthLabel] || "성장형";
    out.push(`${e.name}는 ${e.sector} 업종의 ${growthWord} 기업입니다.`);
    if (e.price != null) {
      const trend = e.changeRate > 2 ? "상승 흐름을 보이고" : e.changeRate < -2 ? "약세를 보이고" : "보합권에서 움직이고";
      out.push(`현재 주가는 ${num(e.price)}원이며 ${trend} 있습니다(${pct(e.changeRate)}).`);
    } else {
      out.push(`현재 연결된 시장 방이 없어 실시간 주가는 표시되지 않습니다. 도감 기준 정보를 제공합니다.`);
    }
    out.push(`변동성은 ${e.volatility} 편이며, 배당 매력은 ${e.dividendLabel || "정보 없음"} 수준입니다.`);
    const persona = {
      "공격 성장형": "높은 변동성을 감수할 수 있는 공격적인 투자자",
      "성장형": "중장기 성장에 기대를 거는 투자자",
      "배당 안정형": "꾸준한 배당과 현금흐름을 중시하는 투자자",
      "안정형": "원금 방어와 낮은 변동성을 선호하는 보수적 투자자",
      "균형형": "성장과 안정의 균형을 추구하는 투자자",
    }[e.growthType] || "균형 잡힌 투자자";
    out.push(`${persona}에게 적합한 종목으로 분류됩니다.`);
    if (e.risk === "매우 높음") out.push(`다만 리스크 등급이 '매우 높음'이라 단기 루머와 급등락에 유의해야 합니다.`);
    return out;
  }

  // ───────────────── 검색 / 업종 집계 (활성 엔트리 기준) ─────────────────
  function search(query, mode) {
    const entries = activeEntries(mode);
    const q = String(query || "").trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = [e.name, e.ticker, e.sector, e.ceo, e.business, e.description, (e.tags || []).join(" ")]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function sectorStats(mode) {
    const entries = activeEntries(mode);
    const map = {};
    entries.forEach((e) => {
      const s = (map[e.sector] || (map[e.sector] = { sector: e.sector, entries: [], rates: [] }));
      s.entries.push(e);
      if (e.price != null) s.rates.push(e.changeRate);
    });
    return Object.values(map).map((s) => {
      const meta = sectorMetaFor(s.sector);
      const avg = s.rates.length ? s.rates.reduce((a, b) => a + b, 0) / s.rates.length : null;
      const volScore = s.entries.reduce((a, e) => a + (RISK_NUM[e.risk] || 2), 0) / s.entries.length;
      return { sector: s.sector, meta, count: s.entries.length, avgChange: avg, volScore, entries: s.entries };
    }).sort((a, b) => b.count - a.count);
  }

  function riskPercent(risk) { return ({ "낮음": 25, "보통": 50, "높음": 75, "매우 높음": 95 })[risk] || 50; }

  // ───────────────── v1.2.1 모바일 유틸 ─────────────────
  const MOBILE_MQ = "(max-width: 767px)";
  function isMobile() { return window.matchMedia(MOBILE_MQ).matches; }
  // 모바일↔데스크톱 경계를 넘을 때만 콜백 (불필요한 리렌더 방지)
  function onViewportChange(cb) {
    const mq = window.matchMedia(MOBILE_MQ);
    const h = () => cb(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", h); else mq.addListener(h);
    return h;
  }
  // 모바일 투자 의견 한 단어 (점수/등락/위험 기반, 랜덤 아님)
  function stanceLabel(e) {
    if (e.price == null) return e.growthType || "관망";
    if (e.risk === "매우 높음" && e.changeRate <= -5) return "주의";
    if (e.score >= 80) return "적극 관심";
    if (e.score >= 68) return "관심";
    if (e.score >= 55) return "중립";
    return "관망";
  }

  // ───────────────── 공통 회사 카드 ─────────────────
  function companyCard(e) {
    const meta = e.sectorMeta || { icon: "🏢" };
    let priceBlock;
    if (e.price != null) {
      const cls = dir(e.changeRate);
      priceBlock = `<div class="cc-price"><b class="${cls}">${num(e.price)}</b>
        <span class="cc-chg ${cls}">${arrow(e.changeRate)} ${pct(e.changeRate)}</span></div>`;
    } else {
      priceBlock = `<div class="cc-noprice">시세 — <span class="muted">방 연결 시 표시</span></div>`;
    }
    const liveBadge = e.live ? `<span class="badge live">LIVE</span>` : "";
    const roleTag = e.role && ROLE_LABEL[e.role] ? `<span class="badge">${ROLE_LABEL[e.role]}</span>` : "";
    return `<a class="co-card" href="${companyHref(e.id)}">
      ${starButtonHTML(e.id)}
      <div class="cc-top">
        <div class="cc-id">
          <div class="cc-name" title="${esc(e.name)}"><span class="cc-name-t">${esc(e.name)}</span>${liveBadge}</div>
          <div class="cc-ticker">${esc(e.ticker || "")}${roleTag}</div>
        </div>
        ${scoreBadgeHTML(e)}
      </div>
      <div class="cc-sector"><span class="chip" title="${esc(e.sector)}">${meta.icon} <span class="chip-t">${esc(e.sector)}</span></span></div>
      ${priceBlock}
      <div class="cc-meta">
        <div class="m-hide"><span>설립</span><b title="${esc(String(e.foundedYear))}">${esc(String(e.foundedYear))}</b></div>
        <div class="m-hide"><span>대표</span><b title="${esc(e.ceo || "-")}">${esc(e.ceo || "-")}</b></div>
        <div><span>위험도</span><b>${esc(e.risk || "-")}</b></div>
        <div><span>성장성</span><b>${esc(e.growthLabel || "-")}</b></div>
      </div>
      <div class="risk-bar"><i style="width:${riskPercent(e.risk)}%"></i></div>
    </a>`;
  }

  // ───────────────── 즐겨찾기 (LocalStorage) ─────────────────
  const FAV_KEY = "wiki-favorites";
  function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (e) { return []; }
  }
  function isFavorite(id) { return getFavorites().includes(id); }
  const FAV_META_KEY = "wiki-fav-meta";
  function getFavMeta() { try { return JSON.parse(localStorage.getItem(FAV_META_KEY) || "{}"); } catch (e) { return {}; } }
  function setFavMeta(m) { try { localStorage.setItem(FAV_META_KEY, JSON.stringify(m)); } catch (e) {} }
  function toggleFavorite(id) {
    const favs = getFavorites();
    const meta = getFavMeta();
    const i = favs.indexOf(id);
    if (i >= 0) { favs.splice(i, 1); delete meta[id]; }
    else {
      favs.push(id);
      // 추가 시점의 실시간 가격을 기록(수익률 추적 기준). 없으면 비워둠.
      const e = getEntry(id);
      if (e && e.price != null) meta[id] = { addedPrice: e.price, addedAt: Date.now() };
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    setFavMeta(meta);
    document.dispatchEvent(new CustomEvent("wiki:favchange", { detail: { id } }));
    return i < 0;
  }
  function starButtonHTML(id) {
    const on = isFavorite(id);
    return `<button class="wiki-star ${on ? "on" : ""}" data-fav="${esc(id)}" title="즐겨찾기" aria-pressed="${on}">${on ? "★" : "☆"}</button>`;
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fav]");
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const nowOn = toggleFavorite(btn.dataset.fav);
    btn.classList.toggle("on", nowOn);
    btn.textContent = nowOn ? "★" : "☆";
    btn.setAttribute("aria-pressed", String(nowOn));
  });

  // ───────────────── 공통 헤더 / 네비 / 방 연결 바 ─────────────────
  const NAV = [
    { href: "index.html", label: "홈" },
    { href: "index.html#dogam", label: "회사 도감" },
    { href: "sector.html", label: "업종 분석" },
    { href: "news.html", label: "시장 뉴스" },
    { href: "ipo.html", label: "IPO 센터" },
    { href: "ranking.html", label: "시장 랭킹" },
    { href: "favorites.html", label: "즐겨찾기" },
  ];

  // 사이트 간 이동 링크(roomCode 유지) — 다른 GitHub Pages 주소로 배포돼도 동작
  function crossSiteNav() {
    const SC = window.SiteConfig;
    if (!SC) return "";
    const code = SC.getCurrentRoomCode();
    const company = SC.getUrlCompanyId ? SC.getUrlCompanyId() : "";
    const arcade = SC.buildArcadeUrl ? SC.buildArcadeUrl(code) : SC.buildSiteUrl("arcade", { room: code });
    const gacha = SC.buildGachaUrl ? SC.buildGachaUrl(code) : SC.buildSiteUrl("gacha", { room: code });
    // 관리자 페이지 링크는 '관리자'에게만 노출(firebase-wiki 가 인증 세션으로 판별해 hidden 해제).
    return (
      `<a class="wiki-cross" href="${SC.buildBattleUrl(code)}" target="_blank" rel="noopener">주식시장</a>` +
      `<a class="wiki-cross" href="${SC.buildBoardUrl(code)}" target="_blank" rel="noopener">주식소식</a>` +
      `<a class="wiki-cross" href="${arcade}" target="_blank" rel="noopener">아케이드</a>` +
      `<a class="wiki-cross" href="${gacha}" target="_blank" rel="noopener">가챠</a>` +
      `<a id="wikiNavAdmin" class="wiki-cross" href="${SC.buildAdminUrl(code)}" target="_blank" rel="noopener" hidden>관리자 페이지</a>`
    );
  }

  function injectHeader(active) {
    const mount = document.getElementById("wikiHeader");
    if (!mount) return;
    const page = (location.pathname.split("/").pop() || "index.html");
    mount.innerHTML = `
      <header class="wiki-top">
        <div class="wiki-top-inner">
          <a class="wiki-brand" href="index.html">
            <span class="wiki-logo">STONK</span><span class="wiki-logo accent">WIKI</span>
            <span class="wiki-tagline">가상 주식시장의 모든 정보</span>
          </a>
          <div class="wiki-search-mini">
            <input id="wikiQuickSearch" type="search" placeholder="회사 · 종목코드 · 업종 · 태그 검색" autocomplete="off" />
          </div>
          <button id="wikiRoomBtn" class="wiki-room-btn" type="button">
            <span class="wiki-dot"></span><span id="wikiRoomLabel">방 연결</span>
          </button>
        </div>
        <nav class="wiki-nav">
          ${NAV.map((n) => {
            const base = n.href.split("#")[0];
            const on = (active && active === n.label) || base === page;
            return `<a href="${n.href}" class="${on ? "is-active" : ""}">${n.label}</a>`;
          }).join("")}
          ${crossSiteNav()}
        </nav>
      </header>`;

    const qs = document.getElementById("wikiQuickSearch");
    qs.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && qs.value.trim()) {
        location.href = "index.html?q=" + encodeURIComponent(qs.value.trim()) + "#dogam";
      }
    });
    document.getElementById("wikiRoomBtn").addEventListener("click", openRoomDialog);
    buildRoomDialog();
    refreshRoomChip();
  }

  function buildRoomDialog() {
    if (document.getElementById("wikiRoomModal")) return;
    const m = document.createElement("div");
    m.id = "wikiRoomModal";
    m.className = "wiki-modal hidden";
    m.innerHTML = `
      <div class="wiki-modal-card">
        <button class="wiki-modal-x" type="button" aria-label="닫기">✕</button>
        <h2 class="wiki-modal-title">실시간 시장 연결</h2>
        <p class="wiki-modal-sub">STONK Battle / Board 와 같은 <b>방 코드</b>를 입력하면<br/>그 방에서 생성된 <b>실제 종목</b>이 도감에 그대로 표시됩니다.</p>
        <input id="wikiRoomInput" class="wiki-modal-input" maxlength="6" placeholder="방 코드 (예: ABC123)" autocomplete="off" spellcheck="false" />
        <button id="wikiRoomConnect" class="wiki-btn primary" type="button">연결하기</button>
        <p id="wikiRoomMsg" class="wiki-modal-msg"></p>
        <button id="wikiRoomDisc" class="wiki-btn ghost hidden" type="button">연결 해제</button>
        <p class="wiki-modal-foot">연결 없이도 도감·업종·기업정보는 모두 열람할 수 있습니다.</p>
      </div>`;
    document.body.appendChild(m);

    const input = m.querySelector("#wikiRoomInput");
    input.addEventListener("input", () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") m.querySelector("#wikiRoomConnect").click(); });
    m.querySelector("#wikiRoomConnect").addEventListener("click", () => {
      const code = input.value.trim().toUpperCase();
      const msg = m.querySelector("#wikiRoomMsg");
      if (code.length < 4) { msg.textContent = "방 코드를 입력하세요."; return; }
      msg.textContent = `${code} 연결 중...`;
      window.WikiLive.connect(code);
    });
    m.querySelector("#wikiRoomDisc").addEventListener("click", () => { window.WikiLive.disconnect(); closeRoomDialog(); });
    m.querySelector(".wiki-modal-x").addEventListener("click", closeRoomDialog);
    m.addEventListener("click", (e) => { if (e.target === m) closeRoomDialog(); });

    window.WikiLive.onChange(() => { refreshRoomChip(); refreshRoomDialog(); });
  }
  function openRoomDialog() {
    const m = document.getElementById("wikiRoomModal");
    if (!m) return;
    m.classList.remove("hidden");
    refreshRoomDialog();
    setTimeout(() => { const i = document.getElementById("wikiRoomInput"); if (i && !window.WikiLive.state.connected) i.focus(); }, 50);
  }
  function closeRoomDialog() { document.getElementById("wikiRoomModal")?.classList.add("hidden"); }
  function refreshRoomDialog() {
    const m = document.getElementById("wikiRoomModal");
    if (!m) return;
    const s = window.WikiLive.state;
    const msg = m.querySelector("#wikiRoomMsg");
    const disc = m.querySelector("#wikiRoomDisc");
    if (s.error) { msg.textContent = s.error; msg.className = "wiki-modal-msg err"; }
    else if (s.connected) {
      const n = s.room && s.room.stocks ? Object.keys(s.room.stocks).length : 0;
      msg.textContent = `✅ ${s.code} 연결됨 · ${s.status} · ${n}종목`;
      msg.className = "wiki-modal-msg ok";
    } else { msg.className = "wiki-modal-msg"; }
    disc.classList.toggle("hidden", !s.connected && !s.code);
  }
  function refreshRoomChip() {
    const label = document.getElementById("wikiRoomLabel");
    const btn = document.getElementById("wikiRoomBtn");
    if (!label || !btn) return;
    const s = window.WikiLive.state;
    if (s.connected) {
      // v1.2: 전체("시장 코드 X · 시장 진행중") / 모바일 축약("X · 진행중")를 CSS로 전환
      // wiki 는 읽기 중심 — '읽기전용' 명시(시장 보정은 battle/admin 이 수행)
      label.innerHTML = `<span class="rc-full">시장 코드 ${esc(s.code)} · ${esc(s.status)} · 읽기전용</span>` +
        `<span class="rc-short">${esc(s.code)} · ${esc(s.statusShort || s.status)}</span>`;
      btn.classList.add("on");
    } else {
      label.innerHTML = `<span class="rc-full">방 연결</span><span class="rc-short">연결</span>`;
      btn.classList.remove("on");
    }
  }

  window.addEventListener("marketadmin:update", () => {
    document.dispatchEvent(new CustomEvent("wiki:liveupdate", { detail: { source: "market-admin" } }));
  });

  if (window.WikiLive) {
    window.WikiLive.onChange(() => {
      document.dispatchEvent(new CustomEvent("wiki:liveupdate", { detail: window.WikiLive.state }));
    });
  }

  const api = {
    TYPE_LABEL, ROLE_LABEL, RISK_NUM, GROW_NUM,
    esc, won, num, short, dir, arrow, sign, pct, timeAgo,
    parseDate, fmtDate, fmtDot, fmtKo, fmtDateTime, fmtYear, dateMs,
    deriveLore, resolveListingDate, currentRoomId, companyHref,
    getCompany, getCompanyByName, getEntry,
    entryFromCatalog, entryFromLive, activeEntries, isConnected,
    catalogEntries, sectorMetaMap, sectorMetaFor, wikiDocs, wikiDocById, wikiDocForEntry,
    deriveHidden, stonkScore, scoreGrade, gradeClass, scoreBadgeHTML, riskGaugeHTML,
    isMobile, onViewportChange, stanceLabel,
    investmentSummary, search, sectorStats, riskPercent, companyCard,
    getFavorites, getFavMeta, isFavorite, toggleFavorite, starButtonHTML,
    injectHeader,
  };
  Object.defineProperty(api, "CATALOG", { enumerable: true, get: catalogEntries });
  Object.defineProperty(api, "SECTOR_META", { enumerable: true, get: sectorMetaMap });
  window.Wiki = api;
})();
