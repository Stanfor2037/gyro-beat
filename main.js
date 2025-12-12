const btn = document.getElementById("enableBtn");
const out = document.getElementById("strengthValue");

let count = 0;

function show(msg) {
  out.textContent = msg;
}

function onMotion(e) {
  count++;
  const a = e.accelerationIncludingGravity;
  const r = e.rotationRate;

  // 每 5 次更新一次畫面（避免太頻繁）
  if (count % 5 !== 0) return;

  const ax = a?.x, ay = a?.y, az = a?.z;
  const ra = r?.alpha, rb = r?.beta, rg = r?.gamma;

  show(
    `events:${count} ` +
    `acc:${ax?.toFixed?.(2) ?? "null"},${ay?.toFixed?.(2) ?? "null"},${az?.toFixed?.(2) ?? "null"} ` +
    `rot:${ra?.toFixed?.(2) ?? "null"},${rb?.toFixed?.(2) ?? "null"},${rg?.toFixed?.(2) ?? "null"}`
  );
}

async function enable() {
  try {
    if (!window.matchMedia("(orientation: landscape)").matches) {
      alert("請先把手機轉成橫向再開始互動");
      return;
    }

    // iOS 可能需要 motion + orientation 都請求（保險做法）
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const p = await DeviceMotionEvent.requestPermission();
      alert("DeviceMotion permission = " + p);
      if (p !== "granted") return;
    }

    window.addEventListener("devicemotion", onMotion, { passive: true });
    btn.textContent = "已啟用";
    btn.disabled = true;

    // 1 秒後看有沒有事件
    setTimeout(() => {
      if (count === 0) {
        alert("目前沒有收到 devicemotion 事件（通常是 Safari/權限/安全環境問題）");
      }
    }, 1000);

  } catch (err) {
    alert("啟用失敗：" + err.message);
  }
}

btn.onclick = enable;
show("0.00");