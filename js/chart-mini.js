// js/chart-mini.js — 가벼운 캔버스 라인 차트 (외부 라이브러리 불필요, 오프라인 동작)
// 실제 가격 기록(priceHistory)만 그린다. 데이터가 부족하면 호출측에서 안내 표시.
(function () {
  "use strict";

  // canvas 엘리먼트에 points([{t,p}])를 그린다. up/down 색상 자동.
  function draw(canvas, points) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 220;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 2) return;

    const ys = points.map((p) => p.p);
    let hi = Math.max(...ys), lo = Math.min(...ys);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12; hi += pad; lo -= pad;
    const padL = 8, padR = 8, padT = 8, padB = 18;
    const W2 = w - padL - padR, H2 = h - padT - padB;
    const x = (i) => padL + (W2 / (points.length - 1)) * i;
    const y = (p) => padT + H2 * (1 - (p - lo) / (hi - lo));

    const first = points[0].p, last = points[points.length - 1].p;
    const up = last >= first;
    const col = up ? "#f23645" : "#2f6bff";

    // 그리드(가로 3선)
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) {
      const yy = padT + (H2 / 3) * g;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    }
    // 면적
    const grad = ctx.createLinearGradient(0, padT, 0, padT + H2);
    grad.addColorStop(0, up ? "rgba(242,54,69,0.22)" : "rgba(47,107,255,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.moveTo(x(0), padT + H2);
    points.forEach((p, i) => ctx.lineTo(x(i), y(p.p)));
    ctx.lineTo(x(points.length - 1), padT + H2);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // 라인
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.p)) : ctx.moveTo(x(i), y(p.p))));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    // 마지막 점
    ctx.beginPath(); ctx.arc(x(points.length - 1), y(last), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();

    // 고가/저가 라벨
    ctx.fillStyle = "rgba(159,176,204,0.85)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("고 " + Math.round(Math.max(...ys)).toLocaleString("ko-KR"), padL + 2, padT + 11);
    ctx.fillText("저 " + Math.round(Math.min(...ys)).toLocaleString("ko-KR"), padL + 2, padT + H2 - 4);
  }

  window.WikiChart = { draw };
})();
