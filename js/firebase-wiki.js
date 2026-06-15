// js/firebase-wiki.js
// STONK WIKI ↔ Market Battle 실시간 연동 (읽기 전용)
// ─────────────────────────────────────────────────────────────
// 데이터 원천은 두 갈래입니다.
//   1) 정적 카탈로그(WikiCatalog.companies)      → 방 없이도 백과사전 동작
//   2) rooms/{코드} 실시간 스냅샷(읽기 전용)        → 방 코드 연결 시 시세 오버레이
// STONK BOARD 의 firebase-link.js 와 동일한 방 코드 게이트 방식을 따릅니다.
//
// 외부에 노출하는 객체: window.WikiLive
//   - WikiLive.state           : { connected, code, status, room, demo }
//   - WikiLive.connect(code)
//   - WikiLive.disconnect()
//   - WikiLive.onChange(cb)     : 방 데이터 갱신 시 cb(room) 호출 (구독 해제 함수 반환)
//   - WikiLive.stocksArray()    : 현재 방 종목 배열(정규화) — 없으면 []
//   - WikiLive.stockByName(nm)  : 이름으로 실시간 종목 1건
(function () {
  "use strict";

  // ★ Market Battle / Board 와 동일한 Firebase 프로젝트 (같은 DB 공유)
  const firebaseConfig = {
    apiKey: "AIzaSyARFa-vzKVmIdxP5xDRXVzasL2ui94eZ-w",
    authDomain: "market-6e66a.firebaseapp.com",
    databaseURL: "https://market-6e66a-default-rtdb.firebaseio.com",
    projectId: "market-6e66a",
    storageBucket: "market-6e66a.firebasestorage.app",
    messagingSenderId: "402312269082",
    appId: "1:402312269082:web:cf304afc54057ea162b0a3",
  };

  const SDK = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js",
  ];
  const ROOM_KEY = "wiki-room"; // 연결한 방 코드 (페이지 간 공유)

  let db = null;
  let activeRef = null;
  const listeners = new Set();

  const state = {
    connected: false,
    code: "",
    status: "",
    statusShort: "",
    roomCreatedAt: null,
    marketCreatedAt: null,
    room: null,
    demo: false,
    gotData: false,
    error: "",
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load fail: " + src));
      document.head.appendChild(s);
    });
  }

  async function initFirebase() {
    if (window.firebase && window.firebase.database) {
      if (!db) db = window.firebase.database();
      return true;
    }
    try {
      for (const src of SDK) {
        if (!document.querySelector(`script[src="${src}"]`)) await loadScript(src);
      }
      if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
      db = window.firebase.database();
      return true;
    } catch (e) {
      console.error("[wiki] Firebase 로드 실패:", e);
      state.error = "Firebase에 연결할 수 없습니다. 네트워크를 확인하세요.";
      emit();
      return false;
    }
  }

  function emit() {
    listeners.forEach((cb) => {
      try { cb(state.room, state); } catch (e) { console.error(e); }
    });
  }

  // ── 종목 정규화 (board-live.js 와 동일 규칙) ──
  const SPECIAL_TYPES = ["etf", "inverse", "leverage", "bond", "commodity", "reit", "spac", "preferred"];
  function isEquity(t) { return !SPECIAL_TYPES.includes(t); }

  function stocksArray() {
    const room = state.room;
    if (!room || !room.stocks) return [];
    const overrides = (room.adminOverrides && room.adminOverrides.companies) || {};
    return Object.entries(room.stocks).map(([id, s]) => {
      const base = s.basePrice || s.previousPrice || s.price || 0;
      const cr = Number.isFinite(Number(s.changeRate))
        ? Number(s.changeRate)
        : base ? +(((s.price - base) / base) * 100).toFixed(2) : 0;
      const ov = overrides[id] || {};
      return {
        id,
        name: s.name || id,
        type: s.type || "stock",
        role: s.role || "",
        sector: ov.sector || s.sector || "",
        price: s.price || 0,
        base,
        changeRate: cr,
        diff: (s.price || 0) - base,
        volume: s.volume || 0,
        value: s.value || 0,
        high: s.high || s.price || 0,
        low: s.low || s.price || 0,
        open: s.open || base,
        volat: s.volat || null,
        news: s.news || "",
        isEquity: isEquity(s.type || "stock"),
        // Phase 4: STONK Admin 이 쓴 회사 설명/위키 (adminOverrides 우선 → stocks 노드)
        wiki: ov.wiki || s.wiki || "",
        description: ov.description || s.description || "",
        oneLine: ov.oneLine || s.oneLine || s.news || "",
        ticker: ov.ticker || s.ticker || "",
      };
    });
  }

  // 방 종목 id 로 직접 1건 조회 (?company=COMPANYID / ?companyId= 대응)
  function stockById(id) {
    const room = state.room;
    if (!room || !room.stocks || !room.stocks[id]) return null;
    return stocksArray().find((s) => s.id === id) || null;
  }

  // 원본 stock 노드(history 포함) — 압축 캔들 차트용. 정규화 전 데이터.
  function stockRaw(id) {
    const room = state.room;
    if (!room || !room.stocks) return null;
    return room.stocks[id] || null;
  }

  // ── 가격 기록(priceHistory): 실시간으로 관찰된 실제 가격만 누적 (랜덤 생성 안 함) ──
  // 1순위: 방에 priceHistory 노드가 있으면 그대로 사용
  // 2순위: 없으면 마켓틱이 바뀔 때마다 관찰값을 sessionStorage에 누적
  const HIST_CAP = 720;
  let hist = {};          // stockId -> [{t, p}]
  let histRoom = "";
  let histLastTick = -1;
  function histKey(code) { return "wiki-hist-" + code; }
  function histReset(code) {
    histRoom = code;
    histLastTick = -1;
    try { hist = JSON.parse(sessionStorage.getItem(histKey(code)) || "{}"); } catch (e) { hist = {}; }
    if (!hist || typeof hist !== "object") hist = {};
  }
  function recordHistory(room) {
    // 방이 자체 priceHistory 를 제공하면 그것을 우선 신뢰
    if (room.priceHistory && typeof room.priceHistory === "object") {
      hist = {};
      Object.entries(room.priceHistory).forEach(([id, arr]) => {
        const a = Array.isArray(arr) ? arr : Object.values(arr || {});
        hist[id] = a.map((x) => ({ t: x.t || x.time || 0, p: x.p || x.price || 0 })).filter((x) => x.p);
      });
      return;
    }
    const tick = room.marketTick || 0;
    if (tick === histLastTick) return;     // 같은 틱이면 중복 기록 방지
    histLastTick = tick;
    const now = Date.now();
    Object.entries(room.stocks || {}).forEach(([id, s]) => {
      const p = s.price || 0;
      if (!p) return;
      const arr = hist[id] || (hist[id] = []);
      const last = arr[arr.length - 1];
      if (last && last.p === p && now - last.t < 1500) return;
      arr.push({ t: now, p });
      if (arr.length > HIST_CAP) arr.splice(0, arr.length - HIST_CAP);
    });
    try { sessionStorage.setItem(histKey(histRoom), JSON.stringify(hist)); } catch (e) {}
  }
  // period: "1d" | "7d" | "30d" | "all" — 게임은 분 단위 진행이라 시간창으로 매핑
  const PERIOD_MS = { "1d": 5 * 60 * 1000, "7d": 30 * 60 * 1000, "30d": 3 * 60 * 60 * 1000, "all": Infinity };
  function priceHistory(stockId, period) {
    const arr = hist[stockId] || [];
    if (period && PERIOD_MS[period] !== Infinity) {
      const cut = Date.now() - PERIOD_MS[period];
      return arr.filter((x) => x.t >= cut);
    }
    return arr.slice();
  }

  const byNameCache = { tick: -1, map: null };
  function stockByName(name) {
    const room = state.room;
    if (!room || !room.stocks) return null;
    const tick = room.marketTick || 0;
    if (byNameCache.tick !== tick || !byNameCache.map) {
      byNameCache.map = {};
      stocksArray().forEach((s) => { byNameCache.map[s.name] = s; });
      byNameCache.tick = tick;
    }
    return byNameCache.map[name] || null;
  }

  // ── 연결 / 해제 ──
  async function connect(code) {
    code = String(code || "").trim().toUpperCase();
    if (code.length < 4) { state.error = "방 코드를 확인하세요."; emit(); return; }
    const ok = await initFirebase();
    if (!ok) return;

    if (activeRef) activeRef.off();
    state.code = code;
    state.demo = false;
    state.gotData = false;
    state.error = "";
    localStorage.setItem(ROOM_KEY, code);
    try { if (window.SiteConfig) window.SiteConfig.setLastRoomCode(code); } catch (e) {}

    histReset(code);
    activeRef = db.ref("rooms/" + code);
    activeRef.on(
      "value",
      (snap) => {
        const room = snap.val();
        state.gotData = true;
        state.room = room;
        if (room) recordHistory(room);
        state.connected = !!room;
        // v1.2 시장 상태 라벨 (full / short)
        const LAB = { playing: ["시장 진행중", "진행중"], ended: ["장 마감", "마감"], waiting: ["대기중", "대기중"] };
        const l = room ? (LAB[room.status] || [room.status || "대기중", room.status || "대기중"]) : ["", ""];
        state.status = l[0];
        state.statusShort = l[1];
        state.roomCreatedAt = room ? (room.createdAt || room.startedAt || null) : null;
        if (!room) state.error = `'${code}' 방을 찾을 수 없습니다.`;
        emit();
      },
      (err) => {
        console.error("[wiki] 구독 오류:", err);
        state.error = "구독 오류 (DB 규칙을 확인하세요).";
        emit();
      }
    );

    setTimeout(() => {
      if (state.code === code && !state.gotData) {
        state.error = `'${code}' 방 응답이 없습니다. 코드를 확인하세요.`;
        emit();
      }
    }, 4000);
  }

  function disconnect() {
    if (activeRef) activeRef.off();
    activeRef = null;
    state.connected = false;
    state.code = "";
    state.status = "";
    state.room = null;
    state.gotData = false;
    state.error = "";
    localStorage.removeItem(ROOM_KEY);
    emit();
  }

  function onChange(cb) {
    listeners.add(cb);
    // 현재 상태 즉시 1회 전달
    try { cb(state.room, state); } catch (e) {}
    return () => listeners.delete(cb);
  }

  // 자동 연결: URL ?roomId= (또는 ?room=) 우선, 없으면 저장된 방
  function autoConnect() {
    let urlRoom = null;
    try {
      const p = new URLSearchParams(location.search);
      urlRoom = p.get("roomId") || p.get("room");
    } catch (e) {}
    const saved = localStorage.getItem(ROOM_KEY);
    const target = urlRoom || saved;
    if (target) connect(target);
  }

  window.WikiLive = {
    state,
    connect,
    disconnect,
    onChange,
    autoConnect,
    stocksArray,
    stockByName,
    stockById,
    stockRaw,
    isEquity,
    priceHistory,
  };

  document.addEventListener("DOMContentLoaded", autoConnect);
})();
