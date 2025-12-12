const btn = document.getElementById("enableBtn");
const circle = document.getElementById("circle");
const outStrength = document.getElementById("strengthValue");
const outScore = document.getElementById("scoreValue");
const outStatus = document.getElementById("statusValue");
const resultText = document.getElementById("resultText");

const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");

// =====================
// 1) 感測：jerk + 濾波
// =====================
let lastAccel = null;
let lastTime = null;
let filteredJerk = 0;

const SMOOTH = 0.86;       // 穩定度
const DEAD_ZONE = 2;       // 靜止顯示 0
const HIT_THRESHOLD = 26;  // 大晃動門檻（依你手機可微調）
const COOLDOWN_MS = 450;   // 防連發

// 旋轉過渡保護（避免直橫切換尖峰誤判）
let ignoreUntil = 0;
window.addEventListener("orientationchange", () => {
  ignoreUntil = performance.now() + 500;
  lastAccel = null;
  lastTime = null;
  filteredJerk = 0;
});

// 直/橫軸向重映射（讓手感一致）
function getGameAxes(a){
  const x = a.x ?? 0;
  const y = a.y ?? 0;
  const z = a.z ?? 0;

  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const o = typeof window.orientation === "number" ? window.orientation : 0;

  if(!isLandscape){
    return { gx: x, gy: y, gz: z };
  }
  if(o === 90){
    return { gx: y, gy: -x, gz: z };
  }
  if(o === -90){
    return { gx: -y, gy: x, gz: z };
  }
  return { gx: x, gy: y, gz: z };
}

let lastHitTime = 0;
function onMotion(e){
  if (performance.now() < ignoreUntil) return;

  const a = e.accelerationIncludingGravity;
  if(!a) return;

  const g = getGameAxes(a);
  const ax = g.gx, ay = g.gy, az = g.gz;

  const t = e.timeStamp; // ms
  if(!lastAccel || !lastTime){
    lastAccel = {x:ax, y:ay, z:az};
    lastTime = t;
    return;
  }

  const dt = (t - lastTime) / 1000;
  if(dt <= 0) return;

  const dax = ax - lastAccel.x;
  const day = ay - lastAccel.y;
  const daz = az - lastAccel.z;

  const jerk = Math.sqrt(dax*dax + day*day + daz*daz) / dt;
  filteredJerk = filteredJerk * SMOOTH + jerk * (1 - SMOOTH);

  const strength = (filteredJerk < DEAD_ZONE) ? 0 : filteredJerk;
  outStrength.textContent = strength.toFixed(2);

  // 嘗試擊中（節奏窗判定在 hitAttempt 裡）
  const now = performance.now();
  if(strength > HIT_THRESHOLD && (now - lastHitTime) > COOLDOWN_MS){
    lastHitTime = now;
    hitAttempt();
  }

  lastAccel = {x:ax, y:ay, z:az};
  lastTime = t;
}

// =====================
// 2) 節奏對拍：時間窗
// =====================
// 一個 cycle：綠 → 紅（charge），到終點沒打到就 fail
const CHARGE_DURATION = 3600; // ms：綠到紅的時間（節奏速度）
const PERFECT_WINDOW = 0.10;  // 最後 10% 時間窗
const GOOD_WINDOW = 0.20;     // 最後 20% 時間窗

let state = "charging"; // charging | hit | fail
let chargeStart = performance.now();
let score = 0;

function progress01(){
  const t = (performance.now() - chargeStart) / CHARGE_DURATION;
  return Math.min(Math.max(t, 0), 1);
}

function setStatus(s){
  outStatus.textContent = s;
}

function showResult(text){
  resultText.textContent = text;
  resultText.classList.remove("hidden");
  clearTimeout(showResult._t);
  showResult._t = setTimeout(() => resultText.classList.add("hidden"), 450);
}

// =====================
// 3) 粒子：Canvas 四散
// =====================
let particles = [];
function resize(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function circleCenter(){
  const rect = circle.getBoundingClientRect();
  return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
}

function spawnParticles(kind){
  const {x, y} = circleCenter();
  const n = (kind === "hit") ? 60 : 80;

  for(let i=0;i<n;i++){
    const ang = Math.random() * Math.PI * 2;
    const spd = (kind === "hit" ? 260 : 320) * (0.6 + Math.random()*0.8);
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 520 + Math.random()*240,
      age: 0,
      r: 2 + Math.random()*3,
      kind
    });
  }
}

function updateParticles(dt){
  particles = particles.filter(p => (p.age += dt) < p.life);
  for(const p of particles){
    p.x += p.vx * dt/1000;
    p.y += p.vy * dt/1000;
    // 空氣阻力
    p.vx *= 0.985;
    p.vy *= 0.985;
    // 些微重力（失敗更重一點）
    p.vy += (p.kind === "fail" ? 420 : 220) * dt/1000;
  }
}

function drawParticles(){
  ctx.clearRect(0,0,window.innerWidth,window.innerHeight);

  for(const p of particles){
    const t = 1 - (p.age / p.life); // 1 → 0
    ctx.globalAlpha = Math.max(0, t);

    // hit：黃光；fail：偏紅橘
    if(p.kind === "hit"){
      ctx.fillStyle = "rgba(255, 230, 80, 1)";
    }else{
      ctx.fillStyle = "rgba(255, 90, 60, 1)";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// =====================
// 4) 音效＋震動
// =====================
// WebAudio：用最短路徑做「點一下」聲（不需要音檔）
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if(audioCtx.state === "suspended"){
    audioCtx.resume();
  }
}

function playClick(type){
  if(!audioCtx) return;

  const t0 = audioCtx.currentTime;

  // oscillator + gain 做短促的 click
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // hit 比較亮、fail 比較低沉
  osc.type = "square";
  osc.frequency.setValueAtTime(type === "hit" ? 880 : 220, t0);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.14);
}

function vibrate(pattern){
  if(navigator.vibrate){
    navigator.vibrate(pattern);
  }
}

// =====================
// 命中/失敗邏輯
// =====================
function hitAttempt(){
  if(state !== "charging") return;

  const p = progress01();       // 0~1
  const remain = 1 - p;         // 越接近 0 越接近紅點

  // 節奏窗：只允許最後一段時間擊中
  if(remain <= PERFECT_WINDOW){
    doHit("Perfect", 3);
  }else if(remain <= GOOD_WINDOW){
    doHit("Good", 1);
  }else{
    // 太早打：算 Miss（也可以選擇什麼都不發生）
    doMiss("Too Early");
  }
}

function doHit(label, add){
  state = "hit";
  score += add;
  outScore.textContent = String(score);
  setStatus("hit");
  showResult(label);

  // 圓變黃 + 小跳
  circle.classList.remove("failPop");
  circle.classList.add("hitPop");
  circle.style.background = "hsl(52, 95%, 55%)";

  // 粒子
  spawnParticles("hit");

  // 音效＋震動
  playClick("hit");
  vibrate([30, 30, 30]);

  setTimeout(() => {
    circle.classList.remove("hitPop");
    resetCycle();
  }, 260);
}

function doMiss(reason){
  setStatus("miss");
  showResult("Miss");
  // 你也可以選擇：miss 不重置、只是提示
  // 這裡先做「miss 也給一個很小的回饋」
  playClick("fail");
  vibrate(20);
}

function failTimeout(){
  // 到紅點還沒 hit → fail
  state = "fail";
  setStatus("fail");
  showResult("Fail");

  // 紅色爆掉 + 粒子
  circle.classList.remove("hitPop");
  circle.classList.add("failPop");
  circle.style.background = "hsl(6, 90%, 55%)";
  spawnParticles("fail");

  playClick("fail");
  vibrate([80, 40, 80]);

  setTimeout(() => {
    circle.classList.remove("failPop");
    resetCycle();
  }, 420);
}

function resetCycle(){
  state = "charging";
  chargeStart = performance.now();
  setStatus("charging");
  circle.style.opacity = "1";
  circle.style.background = "hsl(120, 80%, 50%)";
}

// =====================
// 充能顏色（綠→紅）＋失敗判定
// =====================
function updateCharging(){
  if(state !== "charging") return;

  const p = progress01(); // 0~1

  // 綠(120) → 紅(0)
  const hue = 120 - 120 * p;
  circle.style.background = `hsl(${hue}, 80%, 50%)`;

  // 到頭了就 fail
  if(p >= 1){
    failTimeout();
  }
}

// =====================
// 主迴圈
// =====================
let lastFrame = performance.now();
function loop(){
  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;

  updateCharging();
  updateParticles(dt);
  drawParticles();

  requestAnimationFrame(loop);
}
loop();

// =====================
// 啟用按鈕：感測器＋音效初始化
// =====================
async function enable(){
  try{
    // 音效需要 user gesture 先初始化
    ensureAudio();

    // iOS motion permission
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      const p = await DeviceMotionEvent.requestPermission();
      alert("DeviceMotion permission = " + p);
      if(p !== "granted") return;
    }

    window.addEventListener("devicemotion", onMotion, { passive:true });

    btn.disabled = true;
    btn.textContent = "已啟用";
    setStatus("charging");

  }catch(err){
    alert("啟用失敗：" + err.message);
  }
}

btn.onclick = enable;
setStatus("ready");
