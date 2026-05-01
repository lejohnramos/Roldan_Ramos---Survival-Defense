/* ──────────────────────────────────────────────
   SURVIVAL DEFENSE · game.js
   State machine: idle → playing ↔ upgrade ↔ paused → end
   + Multiplayer via WebSocket (server.js)
   + Camera / scrolling world map
────────────────────────────────────────────── */

// ==================== POLYFILL for roundRect ====================
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.moveTo(x+r, y);
    this.lineTo(x+w-r, y);
    this.quadraticCurveTo(x+w, y, x+w, y+r);
    this.lineTo(x+w, y+h-r);
    this.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    this.lineTo(x+r, y+h);
    this.quadraticCurveTo(x, y+h, x, y+h-r);
    this.lineTo(x, y+r);
    this.quadraticCurveTo(x, y, x+r, y);
    return this;
  };
}

const sShoot = document.getElementById('sShoot');
const sHit   = document.getElementById('sHit');
const sLevel = document.getElementById('sLevel');
const sHover = document.getElementById('sHover');

function addHoverSound(selector) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('mouseenter', () => playSound(sHover));
  });
}

function playSound(s) {
  if (!s) return;
  s.currentTime = 0;
  s.volume = sfxVol;
  s.play().catch(() => {});
}

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// ── MENU BACKGROUND ANIMATION ──────────────────
const menuBgCanvas = document.getElementById('menuBg');
const mbCtx = menuBgCanvas.getContext('2d');
menuBgCanvas.width  = window.innerWidth;
menuBgCanvas.height = window.innerHeight;
const MW = menuBgCanvas.width, MH = menuBgCanvas.height;
window.addEventListener('resize', () => {
  menuBgCanvas.width  = window.innerWidth;
  menuBgCanvas.height = window.innerHeight;
  MB_RADAR.x = menuBgCanvas.width  * 0.5;
  MB_RADAR.y = menuBgCanvas.height * 0.5;
  MB_RADAR.r = Math.min(menuBgCanvas.width, menuBgCanvas.height) * 0.42;
});
const TAU = Math.PI * 2;
const mrng = (a,b) => a + Math.random()*(b-a);

const MB_STARS = Array.from({length:150}, () => ({
  x: Math.random(), y: Math.random(),
  r: mrng(0.4,1.6), a: mrng(0.15,0.7),
  tw: mrng(0, TAU), tws: mrng(0.4,1.4),
}));

class MBParticle {
  constructor(init) { this.mbReset(init); }
  mbReset(fromBottom=false) {
    this.x = mrng(0,MW); this.y = fromBottom ? MH+20 : mrng(0,MH);
    this.vx=mrng(-0.3,0.3); this.vy=mrng(-0.5,-0.12);
    this.r=mrng(1,3.2); this.life=1; this.decay=mrng(0.0008,0.003);
    this.color=Math.random()<0.3?'#a78bfa':Math.random()<0.5?'#60a5fa':'#818cf8';
    this.pulse=mrng(0,TAU); this.ps=mrng(0.5,2.5);
  }
  update(dt) {
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.life-=this.decay*dt; this.pulse+=this.ps*dt;
    if(this.life<=0||this.y<-20) this.mbReset(true);
  }
  draw() {
    const a=this.life*(0.5+0.4*Math.sin(this.pulse));
    mbCtx.globalAlpha=a; mbCtx.fillStyle=this.color;
    mbCtx.shadowColor=this.color; mbCtx.shadowBlur=this.r*4;
    mbCtx.beginPath(); mbCtx.arc(this.x,this.y,this.r,0,TAU); mbCtx.fill();
    mbCtx.shadowBlur=0;
  }
}

class MBStreak {
  constructor() { this.mbsReset(); }
  mbsReset() {
    this.x=mrng(0,MW); this.y=mrng(0,MH*0.7);
    this.len=mrng(40,120); this.angle=mrng(Math.PI*0.1,Math.PI*0.5);
    this.speed=mrng(4,10); this.life=1; this.decay=mrng(0.02,0.06);
    this.width=mrng(0.5,1.5); this.delay=mrng(0,3); this.active=false;
  }
  update(dt) {
    if(!this.active){this.delay-=dt*0.016;if(this.delay<=0)this.active=true;return;}
    this.x+=Math.cos(this.angle)*this.speed; this.y+=Math.sin(this.angle)*this.speed;
    this.life-=this.decay;
    if(this.life<=0||this.x>MW+100||this.y>MH+100) this.mbsReset();
  }
  draw() {
    if(!this.active) return;
    mbCtx.globalAlpha=this.life*0.7;
    const ex=this.x-Math.cos(this.angle)*this.len, ey=this.y-Math.sin(this.angle)*this.len;
    const g=mbCtx.createLinearGradient(ex,ey,this.x,this.y);
    g.addColorStop(0,'transparent'); g.addColorStop(1,'#93c5fd');
    mbCtx.strokeStyle=g; mbCtx.lineWidth=this.width;
    mbCtx.beginPath(); mbCtx.moveTo(ex,ey); mbCtx.lineTo(this.x,this.y); mbCtx.stroke();
  }
}

class MBExplosion {
  constructor() { this.mbeReset(); }
  mbeReset() {
    this.x=mrng(MW*0.05,MW*0.95); this.y=mrng(MH*0.1,MH*0.9);
    this.r=0; this.maxR=mrng(30,90); this.life=1; this.decay=mrng(0.005,0.018);
    this.delay=mrng(1,8); this.active=false;
    this.color=Math.random()<0.4?'#f87171':Math.random()<0.5?'#fb923c':'#60a5fa';
  }
  update(dt) {
    if(!this.active){this.delay-=dt*0.016;if(this.delay<=0)this.active=true;return;}
    this.r+=(this.maxR/30)*dt*0.5; this.life-=this.decay*dt*0.5;
    if(this.life<=0) this.mbeReset();
  }
  draw() {
    if(!this.active||this.r<=0) return;
    const pct=this.r/this.maxR;
    mbCtx.globalAlpha=this.life*(1-pct)*0.45;
    mbCtx.strokeStyle=this.color; mbCtx.lineWidth=1.5*(1-pct);
    mbCtx.shadowColor=this.color; mbCtx.shadowBlur=14;
    mbCtx.beginPath(); mbCtx.arc(this.x,this.y,this.r,0,TAU); mbCtx.stroke();
    mbCtx.shadowBlur=0;
    mbCtx.globalAlpha=this.life*(1-pct)*0.2;
    mbCtx.fillStyle=this.color;
    mbCtx.beginPath(); mbCtx.arc(this.x,this.y,this.r*0.3,0,TAU); mbCtx.fill();
  }
}

const MB_RADAR = { x:MW*0.5, y:MH*0.5, r:Math.min(MW,MH)*0.42, angle:0, blips:[], blipTimer:0 };
const MB_HEX = Array.from({length:10},()=>({
  x:Math.random(),y:Math.random(),size:mrng(40,85),
  alpha:mrng(0.01,0.035),pulse:mrng(0,TAU),ps:mrng(0.2,0.8),
}));
const MB_PARTICLES  = Array.from({length:80}, ()=>new MBParticle(false));
const MB_STREAKS    = Array.from({length:7},  ()=>new MBStreak());
const MB_EXPLOSIONS = Array.from({length:5},  ()=>new MBExplosion());

let mbScanY=0, mbGridOff=0, mbLast=0, mbRaf=null;

function drawMenuBackground(now) {
  const dt=Math.min(now-mbLast,50); mbLast=now;
  const t=now*0.001;

  mbCtx.fillStyle='#070a0f'; mbCtx.fillRect(0,0,MW,MH);

  // Stars
  for(const s of MB_STARS){
    const tw=0.5+0.5*Math.sin(t*s.tws+s.tw);
    mbCtx.globalAlpha=s.a*tw; mbCtx.fillStyle='#e2e8f0';
    mbCtx.beginPath(); mbCtx.arc(s.x*MW,s.y*MH,s.r,0,TAU); mbCtx.fill();
  }

  // Grid
  mbGridOff=(mbGridOff+0.12*dt*0.5)%60;
  mbCtx.globalAlpha=0.025; mbCtx.strokeStyle='#60a5fa'; mbCtx.lineWidth=0.5;
  for(let x=mbGridOff;x<MW;x+=60){mbCtx.beginPath();mbCtx.moveTo(x,0);mbCtx.lineTo(x,MH);mbCtx.stroke();}
  for(let y=mbGridOff;y<MH;y+=60){mbCtx.beginPath();mbCtx.moveTo(0,y);mbCtx.lineTo(MW,y);mbCtx.stroke();}

  // Hex tiles
  for(const h of MB_HEX){
    h.pulse+=h.ps*0.016;
    const a=h.alpha*(0.6+0.4*Math.sin(h.pulse));
    mbCtx.globalAlpha=a; mbCtx.strokeStyle='#60a5fa'; mbCtx.lineWidth=0.5;
    const hx=h.x*MW, hy=h.y*MH, s=h.size;
    mbCtx.beginPath();
    for(let i=0;i<6;i++){const a2=(i/6)*TAU-Math.PI/6;i===0?mbCtx.moveTo(hx+Math.cos(a2)*s,hy+Math.sin(a2)*s):mbCtx.lineTo(hx+Math.cos(a2)*s,hy+Math.sin(a2)*s);}
    mbCtx.closePath(); mbCtx.stroke();
  }

  // Scan line
  mbScanY=(mbScanY+0.35*dt*0.5)%MH;
  const sg=mbCtx.createLinearGradient(0,mbScanY-50,0,mbScanY+20);
  sg.addColorStop(0,'transparent'); sg.addColorStop(0.7,'rgba(96,165,250,0.022)'); sg.addColorStop(1,'transparent');
  mbCtx.globalAlpha=1; mbCtx.fillStyle=sg; mbCtx.fillRect(0,mbScanY-50,MW,70);

  // Radar
  MB_RADAR.angle+=0.008*dt;
  MB_RADAR.blipTimer-=dt*0.016;
  if(MB_RADAR.blipTimer<=0){
    MB_RADAR.blipTimer=mrng(30,90);
    const ba=Math.random()*TAU, br=mrng(MB_RADAR.r*0.15,MB_RADAR.r*0.9);
    MB_RADAR.blips.push({x:MB_RADAR.x+Math.cos(ba)*br,y:MB_RADAR.y+Math.sin(ba)*br,life:1,size:mrng(2,4.5),color:Math.random()<0.3?'#f87171':'#34d399'});
  }
  for(const b of MB_RADAR.blips)b.life-=0.006*dt*0.5;
  MB_RADAR.blips=MB_RADAR.blips.filter(b=>b.life>0);
  const {x:rx,y:ry,r:rr,angle:ra}=MB_RADAR;
  mbCtx.globalAlpha=0.035; mbCtx.strokeStyle='#60a5fa'; mbCtx.lineWidth=0.5;
  for(let ring=1;ring<=4;ring++){mbCtx.beginPath();mbCtx.arc(rx,ry,rr*(ring/4),0,TAU);mbCtx.stroke();}
  for(let i=0;i<8;i++){const a2=(i/8)*TAU;mbCtx.beginPath();mbCtx.moveTo(rx,ry);mbCtx.lineTo(rx+Math.cos(a2)*rr,ry+Math.sin(a2)*rr);mbCtx.stroke();}
  mbCtx.globalAlpha=0.05; mbCtx.fillStyle='#60a5fa';
  mbCtx.beginPath();mbCtx.moveTo(rx,ry);mbCtx.arc(rx,ry,rr,ra-Math.PI*0.55,ra);mbCtx.closePath();mbCtx.fill();
  mbCtx.globalAlpha=0.12; mbCtx.strokeStyle='#60a5fa'; mbCtx.lineWidth=1.2;
  mbCtx.shadowColor='#60a5fa'; mbCtx.shadowBlur=6;
  mbCtx.beginPath();mbCtx.moveTo(rx,ry);mbCtx.lineTo(rx+Math.cos(ra)*rr,ry+Math.sin(ra)*rr);mbCtx.stroke();mbCtx.shadowBlur=0;
  for(const b of MB_RADAR.blips){
    mbCtx.globalAlpha=b.life*0.8;mbCtx.fillStyle=b.color;mbCtx.shadowColor=b.color;mbCtx.shadowBlur=7;
    mbCtx.beginPath();mbCtx.arc(b.x,b.y,b.size,0,TAU);mbCtx.fill();mbCtx.shadowBlur=0;
  }

  // Explosions, streaks, particles
  for(const e of MB_EXPLOSIONS){e.update(dt);e.draw();}
  for(const s of MB_STREAKS){s.update(dt);s.draw();}
  for(const p of MB_PARTICLES){p.update(dt);p.draw();}

  // Vignette
  mbCtx.globalAlpha=1;
  const vg=mbCtx.createRadialGradient(MW/2,MH/2,MH*0.2,MW/2,MH/2,MH*0.82);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.78)');
  mbCtx.fillStyle=vg; mbCtx.fillRect(0,0,MW,MH);
}

let mbAnimating = false;
function startMenuBg() {
  if(mbAnimating) return;
  addHoverSound('button, .upgrade-card, .csp-card, .diff-btn');
  mbAnimating=true; mbLast=performance.now();
  function mbLoop(now){ if(!mbAnimating)return; drawMenuBackground(now); mbRaf=requestAnimationFrame(mbLoop); }
  mbRaf=requestAnimationFrame(mbLoop);
}
function stopMenuBg() {
  mbAnimating=false;
  if(mbRaf){cancelAnimationFrame(mbRaf);mbRaf=null;}
  mbCtx.clearRect(0,0,MW,MH);
}

let fireMode = 'auto';       // 'auto' | 'manual'
let mouseX   = W / 2;        // mouse position in SCREEN space
let mouseY   = H / 2;
let mouseDown = false;        // is left mouse button held
let achievementStats = {};

// ── World / Camera ────────────────────────────
const WORLD_W = W * 3;   // 3120 px wide
const WORLD_H = H * 3;   // 2400 px tall
let camX = 0;
let camY = 0;

function toScreen(wx, wy) {
  return { x: wx - camX, y: wy - camY };
}

function updateCamera() {
  if (!player) return;
  camX = player.x - W / 2;
  camY = player.y - H / 2;
  camX = Math.max(0, Math.min(WORLD_W - W, camX));
  camY = Math.max(0, Math.min(WORLD_H - H, camY));
}

// ── State ────────────────────────────────────

let shopWindow = null;

const SHOP_WEAPON_MAP = {
  pistol:  'basic',
  shotgun: 'spread',
  bow:     'sniper',
  sniper:  'sniper',
  rocket:  'rocket',
};

const DIARITE_REWARDS = {
  boss:     50,
  elite:    15,
  shielded: 12,
  splitter: 10,
  standard: 5,
};

const ACHIEVEMENTS = [
  { id: 'first_blood',    name: 'FIRST BLOOD',     desc: 'Kill your first enemy',          req: (s) => s.kills >= 1,        reward: 10,  icon: '🩸' },
  { id: 'killer_10',      name: 'ROOKIE',           desc: 'Kill 10 enemies in one run',     req: (s) => s.kills >= 10,       reward: 15,  icon: '💀' },
  { id: 'killer_50',      name: 'VETERAN',          desc: 'Kill 50 enemies in one run',     req: (s) => s.kills >= 50,       reward: 25,  icon: '⚔️'  },
  { id: 'killer_100',     name: 'SLAUGHTERER',      desc: 'Kill 100 enemies in one run',    req: (s) => s.kills >= 100,      reward: 50,  icon: '☠️'  },
  { id: 'wave_4',         name: 'HOLD THE LINE',    desc: 'Reach wave 4',                   req: (s) => s.wave >= 4,         reward: 20,  icon: '🌊' },
  { id: 'wave_7',         name: 'LAST STAND',       desc: 'Reach wave 7',                   req: (s) => s.wave >= 7,         reward: 40,  icon: '🔥' },
  { id: 'level_5',        name: 'LEVELED UP',       desc: 'Reach level 5',                  req: (s) => s.level >= 5,        reward: 20,  icon: '⭐' },
  { id: 'boss_kill',      name: 'BOSS SLAYER',      desc: 'Kill a boss enemy',              req: (s) => s.bossKills >= 1,    reward: 50,  icon: '👑' },
  { id: 'combo_10',       name: 'COMBO KING',       desc: 'Get a 10-kill combo',            req: (s) => s.maxCombo >= 10,    reward: 30,  icon: '✨' },
  { id: 'survive_90',     name: 'SURVIVOR',         desc: 'Survive for 90 seconds',         req: (s) => s.timeAlive >= 90,   reward: 35,  icon: '⏱️' },
  { id: 'survive_full',   name: 'INDESTRUCTIBLE',   desc: 'Survive the full 2 minutes',     req: (s) => s.survived === true, reward: 100, icon: '🏆' },
  { id: 'all_weapons',    name: 'ARMS DEALER',      desc: 'Unlock 4 different weapons',     req: (s) => s.weaponsUnlocked >= 4, reward: 60, icon: '🔫' },
];

const SECRET_WEAPON = {
  id: 'plasma',
  name: 'PLASMA CANNON',
  desc: 'Unlocked by completing all achievements. Fires a massive plasma orb that pierces everything.',
  icon: '🔮',
};

function loadShopState() {
  try { 
    const r = localStorage.getItem('sdShop'); 
    if (r) {
      const parsed = JSON.parse(r);
      if (!parsed.characters) parsed.characters = { soldier: true };
      if (!parsed.characters.soldier) parsed.characters.soldier = true;
      if (!parsed.equippedCharacter) parsed.equippedCharacter = 'soldier';
      return parsed;
    }
  } catch(e){}
  return { 
    diarite: 0, 
    upgrades: { hp_upgrade: 0, firerate_upgrade: 0 }, 
    weapons: { pistol: false, shotgun: false, bow: false, sniper: false, rocket: false }, 
    equippedWeapon: null,
    characters: { soldier: true },
    equippedCharacter: 'soldier'
  };
}

function saveShopDiarite(newTotal) {
  try {
    const s = loadShopState();
    s.diarite = newTotal;
    localStorage.setItem('sdShop', JSON.stringify(s));
  } catch(e) {}
}

function awardDiarite(amount) {
  const s = loadShopState();
  s.diarite = (s.diarite || 0) + amount;
  localStorage.setItem('sdShop', JSON.stringify(s));
  if (shopWindow && !shopWindow.closed) {
    shopWindow.postMessage({ type: 'addDiarite', amount }, '*');
  }
  // update HUD (only if game is active and player exists)
  const el = document.getElementById('diariteVal');
  if (el) el.textContent = s.diarite;
  if (player) addFloatingText(player.x, player.y - 55, '+' + amount + ' ◆', '#a78bfa');
}

let cachedShopState = null;
function refreshHUDDiarite() {
  if (!cachedShopState) cachedShopState = loadShopState();
  const el = document.getElementById('diariteVal');
  if (el) el.textContent = cachedShopState.diarite || 0;
}
function invalidateShopCache() { cachedShopState = null; }

function loadAchievements() {
  try {
    const r = localStorage.getItem('sdAchievements');
    return r ? JSON.parse(r) : {};
  } catch(e) { return {}; }
}

function saveAchievement(id) {
  const a = loadAchievements();
  a[id] = true;
  localStorage.setItem('sdAchievements', JSON.stringify(a));
}

function checkAchievements() {
  const unlocked = loadAchievements();
  let newlyUnlocked = [];

  for (const a of ACHIEVEMENTS) {
    if (!unlocked[a.id] && a.req(achievementStats)) {
      saveAchievement(a.id);
      awardDiarite(a.reward);
      newlyUnlocked.push(a);
    }
  }

  function showAchievementPopup(achievement) {
  const existing = document.getElementById('achPopup');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'achPopup';
  el.innerHTML = `
    <div style="font-size:11px;letter-spacing:3px;color:rgba(251,191,36,0.7);margin-bottom:4px;">ACHIEVEMENT UNLOCKED</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:26px">${achievement.icon}</span>
      <div>
        <div style="font-family:'Orbitron',monospace;font-size:13px;font-weight:700;color:#fbbf24;letter-spacing:2px;">${achievement.name}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px;">${achievement.desc}</div>
      </div>
      <div style="margin-left:auto;font-family:'Orbitron',monospace;font-size:14px;font-weight:800;color:#a78bfa;">+${achievement.reward}◆</div>
    </div>
  `;
  el.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:rgba(8,12,22,0.97); border:1px solid rgba(251,191,36,0.5);
    border-radius:10px; padding:14px 20px; min-width:340px; max-width:90vw;
    z-index:9999; font-family:'Share Tech Mono',monospace;
    box-shadow:0 0 30px rgba(251,191,36,0.2);
    animation:achSlideIn 0.4s cubic-bezier(0.22,1,0.36,1);
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 3500);
}

function showSecretWeaponPopup() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="font-size:11px;letter-spacing:3px;color:rgba(167,139,250,0.8);margin-bottom:8px;text-align:center;">🎉 ALL ACHIEVEMENTS COMPLETE 🎉</div>
    <div style="font-size:32px;text-align:center;margin-bottom:8px;">🔮</div>
    <div style="font-family:'Orbitron',monospace;font-size:16px;font-weight:900;color:#a78bfa;letter-spacing:3px;text-align:center;margin-bottom:6px;">PLASMA CANNON</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.6;">Secret weapon unlocked!<br>Fires a massive piercing orb. Available as an upgrade.</div>
  `;
  el.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    background:rgba(8,12,22,0.99); border:1px solid rgba(167,139,250,0.7);
    border-radius:14px; padding:28px 36px; z-index:99999;
    font-family:'Share Tech Mono',monospace;
    box-shadow:0 0 60px rgba(167,139,250,0.4);
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.6s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 600);
  }, 5000);
}

  for (const a of newlyUnlocked) {
    showAchievementPopup(a);
  }

  // Check if all achievements done → unlock secret weapon
  if (!isSecretWeaponUnlocked() && checkAllAchievementsComplete()) {
    unlockSecretWeapon();
    setTimeout(() => showSecretWeaponPopup(), 2000);
  }
}

function isAchievementUnlocked(id) {
  return !!loadAchievements()[id];
}

function checkAllAchievementsComplete() {
  const unlocked = loadAchievements();
  return ACHIEVEMENTS.every(a => unlocked[a.id]);
}

function isSecretWeaponUnlocked() {
  try {
    const s = localStorage.getItem('sdShop');
    if (!s) return false;
    return JSON.parse(s).secretWeapon === true;
  } catch(e) { return false; }
}

function unlockSecretWeapon() {
  try {
    const s = loadShopState();
    s.secretWeapon = true;
    localStorage.setItem('sdShop', JSON.stringify(s));
  } catch(e) {}
}

function applyShopState() {
  const s = loadShopState();
  cachedShopState = s;
  refreshHUDDiarite();

  // Sync character from shop
  if (s.equippedCharacter && CHARACTERS[s.equippedCharacter]) {
    currentCharacter = s.equippedCharacter;
    localStorage.setItem('selectedCharacter', currentCharacter);
    renderCharSelector();
  }

  const hpLevels = (s.upgrades && s.upgrades.hp_upgrade) || 0;
  if (hpLevels > 0 && maxHp === 100) {
    maxHp += hpLevels * 30;
    hp = maxHp;
  }

  const frLevels = (s.upgrades && s.upgrades.firerate_upgrade) || 0;
  if (frLevels > 0 && abilities.fireRate === 1) {
    abilities.fireRate *= Math.pow(1.25, frLevels);
  }

  const eq = s.equippedWeapon;
  if (eq && SHOP_WEAPON_MAP[eq]) {
    weaponType = SHOP_WEAPON_MAP[eq];
    unlockedWeapons.add(weaponType);
    if (weaponType === 'orbit' && orbitBullets.length === 0) {
      for (let i = 0; i < 4; i++)
        orbitBullets.push({ angle: (i / 4) * Math.PI * 2, hitCooldown: {} });
    }
    if (player) addFloatingText(player.x, player.y - 40, eq.toUpperCase() + ' EQUIPPED', '#fbbf24');
  }
}

function openShop() {
  if (state === 'playing') pauseGame();
  const url = 'shop.html';
  shopWindow = window.open(url, 'diariteShop', 'width=1100,height=720,resizable=yes');
  if (shopWindow) {
    shopWindow.addEventListener('load', () => {
      const s = loadShopState();
      shopWindow.postMessage({ type: 'shopInit', state: s }, '*');
    });
  }
}

window.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'shopUpdate') {
    invalidateShopCache();
    const s = e.data.state;
    if (s.equippedCharacter && CHARACTERS[s.equippedCharacter]) {
      currentCharacter = s.equippedCharacter;
      renderCharSelector();
    }
    if (state === 'paused') {
      const el = document.getElementById('diariteVal');
      if (el) el.textContent = s.diarite || 0;
    }
  }
});

// ==================== CHARACTER SYSTEM ====================
const CHARACTERS = {
  soldier:  { name: 'Soldier',  stats: { baseSpeed: 2.4, baseHp: 100, baseDamage: 1,   baseFireRate: 1,   hpRegenBonus: 0, xpBonus: 1.0 } },
  ninja:    { name: 'Ninja',    stats: { baseSpeed: 3.2, baseHp: 80,  baseDamage: 0.8, baseFireRate: 1.5, hpRegenBonus: 0, xpBonus: 1.0 } },
  heavy:    { name: 'Heavy',    stats: { baseSpeed: 1.6, baseHp: 180, baseDamage: 1.5, baseFireRate: 0.7, hpRegenBonus: 0, xpBonus: 1.0 } },
  assassin: { name: 'Assassin', stats: { baseSpeed: 2.8, baseHp: 90,  baseDamage: 1.3, baseFireRate: 1.2, hpRegenBonus: 0, xpBonus: 1.0 } },
  medic:    { name: 'Medic',    stats: { baseSpeed: 2.0, baseHp: 120, baseDamage: 0.9, baseFireRate: 0.9, hpRegenBonus: 3, xpBonus: 1.2 } },
};

let currentCharacter = 'soldier';
let characterXpBonus = 1.0; // will be set in initGame

// Character selector UI
const CSP_CHARS = [
  { id:'soldier',  icon:'🔫', name:'SOLDIER',  desc:'Balanced operative. No weaknesses.',           badge:'BALANCED', badgeCls:'blue',   spd:65, dmg:65, hp:65 },
  { id:'ninja',    icon:'🗡️', name:'NINJA',    desc:'+15% speed · +20% fire rate · -10% damage.',   badge:'AGILE',    badgeCls:'green',  spd:85, dmg:52, hp:55 },
  { id:'heavy',    icon:'🛡️', name:'HEAVY',    desc:'+30 HP · +20% damage · -15% speed.',           badge:'TANK',     badgeCls:'red',    spd:42, dmg:80, hp:95 },
  { id:'assassin', icon:'🔪', name:'ASSASSIN', desc:'+25% damage · +10% speed · -15% fire rate.',   badge:'BURST',    badgeCls:'gold',   spd:75, dmg:90, hp:50 },
  { id:'medic',    icon:'💉', name:'MEDIC',    desc:'+3 HP/sec regen · +20% XP gain.',              badge:'SUPPORT',  badgeCls:'purple', spd:60, dmg:60, hp:75 },
];

function renderCharSelector() {
  const shopState = loadShopState();
  const ownedChars = shopState.characters || { soldier: true };

  const grid = document.getElementById('cspGrid');
  if (!grid) return;
  grid.innerHTML = CSP_CHARS.map(c => {
    const owned = !!ownedChars[c.id];
    const isActive = c.id === currentCharacter;
    return `
    <div class="csp-card ${isActive ? 'active' : ''} ${!owned ? 'locked' : ''}" 
         onclick="${owned ? `selectChar('${c.id}')` : `showToast('Buy ${c.name} in the shop first!')`}">
      <span class="csp-emoji">${owned ? c.icon : '🔒'}</span>
      <span class="csp-name">${c.name}</span>
      <div class="csp-bars">
        <div class="csp-bar-row"><span class="csp-bar-key">SPD</span><div class="csp-bar-track"><div class="csp-bar-fill spd" style="width:${c.spd}%"></div></div></div>
        <div class="csp-bar-row"><span class="csp-bar-key">DMG</span><div class="csp-bar-track"><div class="csp-bar-fill dmg" style="width:${c.dmg}%"></div></div></div>
        <div class="csp-bar-row"><span class="csp-bar-key">HP</span> <div class="csp-bar-track"><div class="csp-bar-fill hp"  style="width:${c.hp}%"></div></div></div>
      </div>
    </div>
  `}).join('');

  const ch = CSP_CHARS.find(c => c.id === currentCharacter);
  if (ch) {
    document.getElementById('cspIcon').textContent  = ch.icon;
    document.getElementById('cspName').textContent  = ch.name;
    document.getElementById('cspDesc').textContent  = ch.desc;
    const badge = document.getElementById('cspBadge');
    badge.textContent = ch.badge;
    badge.className   = 'csp-badge ' + ch.badgeCls;
  }
}

window.selectChar = function(id) {
  if (CHARACTERS[id]) {
    currentCharacter = id;
    localStorage.setItem('selectedCharacter', currentCharacter);
    renderCharSelector();
    // If game is running, reapply character stats (optional)
    if (state === 'playing' && player) {
      applyCharacterStats();
    }
  }
};

// Apply character stats to the player (called during init and optionally on-the-fly)
function applyCharacterStats() {
  if (!player) return;
  const stats = CHARACTERS[currentCharacter].stats;
  player.speed = stats.baseSpeed;
  maxHp = stats.baseHp;
  if (hp > maxHp) hp = maxHp;
  abilities.damage = stats.baseDamage;
  abilities.fireRate = stats.baseFireRate;
  abilities.hpRegen = stats.hpRegenBonus;
  characterXpBonus = stats.xpBonus;
  updateHUD();
}

let state = 'idle'; // idle | playing | paused | upgrade | end
let player, enemies, projectiles, pickups, particles, floatingTexts;
let kills, wave, level, xp, xpNext, hp, maxHp;
let gameTimer, waveTimer, shootTimer;
let keys = {};
let abilities;
let weaponType = 'basic';
let lastTime = 0, dt = 0;
let lastWave = null, lastKills = null;
let shootAnim = 0;
let nextEnemyId = 0;

let musicVol   = 0.4;
let sfxVol     = 0.8;
let difficulty = 'normal';

const DIFF = {
  easy:   { speedMult: 0.75, hpMult: 0.7,  dmgMult: 0.6,  spawnMult: 0.7  },
  normal: { speedMult: 1.0,  hpMult: 1.0,  dmgMult: 1.0,  spawnMult: 1.0  },
  hard:   { speedMult: 1.3,  hpMult: 1.5,  dmgMult: 1.4,  spawnMult: 1.35 },
};

let combo        = 0;
let comboTimer   = 0;
const COMBO_WINDOW = 2.5;

let bossTimer  = 0;
let bossActive = false;
let bossRef    = null;

let shakeTimer = 0;
let shakeMag   = 0;
function triggerShake(mag, dur) {
  if (mag > shakeMag) { shakeMag = mag; shakeTimer = dur; }
}

let vignetteTimer = 0;
function triggerVignette() { vignetteTimer = 0.45; }

let waveAnnounce     = null;
let lastAnnouncedWave = 0;
function triggerWaveAnnounce(w) {
  waveAnnounce = { text: 'WAVE ' + w, life: 1 };
  lastAnnouncedWave = w;
}

let shockwaves = [];
let bloodSplatters = [];
let scorchMarks = [];
let lightningTimer = 0;
let lightningFlash = 0;
let nextLightning = 15 + Math.random() * 20;

function addShockwave(x, y, maxR = 80, color = 'rgba(255,255,255,0.6)') {
  shockwaves.push({ x, y, r: 0, maxR, life: 1, color });
}
let envProps = [];
const PROP_TYPES = ['tree', 'tree', 'tree', 'ruin', 'ruin', 'gravestone', 'gravestone', 'lamp', 'rock'];

function generateEnv() {
  envProps = [];
  const rng = (min, max) => min + Math.random() * (max - min);
  const count = 120;
  const centerX = WORLD_W / 2, centerY = WORLD_H / 2;
  const clearR  = 220;

  for (let i = 0; i < count; i++) {
    let x, y, tries = 0;
    do {
      x = rng(30, WORLD_W - 30);
      y = rng(30, WORLD_H - 30);
      tries++;
    } while (Math.hypot(x - centerX, y - centerY) < clearR && tries < 30);

    const type = PROP_TYPES[Math.floor(Math.random() * PROP_TYPES.length)];
    const scale = rng(0.75, 1.25);
    envProps.push({ x, y, type, scale, seed: Math.random() * 1000 });
  }
  envProps.sort((a, b) => a.y - b.y);
}

function drawProp(p) {
  const sx = p.x - camX;
  const sy = p.y - camY;
  const margin = 80;
  if (sx < -margin || sx > W + margin || sy < -margin || sy > H + margin) return;

  const { type, scale, seed } = p;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);

  if (type === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 10, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d1a0e';
    ctx.fillRect(-3, -8, 6, 18);
    ctx.strokeStyle = '#1a1005';
    ctx.lineWidth = 2;
    const branches = [[0,-8,-14,-28],[0,-8,14,-26],[0,-14,-10,-34],[0,-14,10,-32],[-8,-20,-20,-36],[8,-20,18,-34]];
    for (const [x1,y1,x2,y2] of branches) {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(45,40,20,0.8)';
    const leafPositions = [[-14,-30],[-10,-36],[14,-28],[18,-36],[-20,-38],[10,-34],[-6,-40],[2,-42]];
    for (const [lx,ly] of leafPositions) {
      ctx.beginPath(); ctx.arc(lx + Math.sin(seed+lx)*2, ly, 2.5, 0, Math.PI*2); ctx.fill();
    }
  } else if (type === 'ruin') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 14, 22, 6, 0, 0, Math.PI*2); ctx.fill();
    const wallColor = '#2a2520';
    const cracks    = '#1a1510';
    ctx.fillStyle = wallColor;
    ctx.fillRect(-22, -30, 10, 44);
    ctx.fillRect(10, -18, 10, 32);
    ctx.fillRect(-12, -20, 22, 8);
    ctx.strokeStyle = cracks; ctx.lineWidth = 0.8;
    for (let row = -28; row < 14; row += 7) {
      ctx.beginPath(); ctx.moveTo(-22, row); ctx.lineTo(-12, row); ctx.stroke();
    }
    for (let row = -16; row < 14; row += 7) {
      ctx.beginPath(); ctx.moveTo(10, row); ctx.lineTo(20, row); ctx.stroke();
    }
    ctx.fillStyle = '#1e1a16';
    ctx.beginPath(); ctx.ellipse(-6, 15, 18, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#2a2520';
    for (const [rx,ry,rr] of [[-14,13,4],[2,16,3],[10,12,3.5],[-4,18,2.5]]) {
      ctx.beginPath(); ctx.arc(rx,ry,rr,0,Math.PI*2); ctx.fill();
    }
  } else if (type === 'gravestone') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 10, 10, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#252525';
    ctx.fillRect(-8, 0, 16, 12);
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-8, -14); ctx.arc(0, -14, 8, Math.PI, 0); ctx.lineTo(8, 0); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(2,-2); ctx.stroke();
    ctx.fillStyle = 'rgba(30,50,20,0.4)';
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-8, -14); ctx.arc(0, -14, 8, Math.PI, 0); ctx.lineTo(8, 0); ctx.closePath();
    ctx.fill();
  } else if (type === 'lamp') {
    const grd = ctx.createRadialGradient(0,0,2,0,0,45);
    grd.addColorStop(0, 'rgba(255,200,80,0.12)');
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0,0,45,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,20); ctx.lineTo(0,-30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(10,-28); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.fillRect(6,-32,10,8);
    ctx.fillStyle = 'rgba(255,220,100,0.9)';
    ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(11,-28,3,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  } else if (type === 'rock') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 8, 16, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.moveTo(-14, 6); ctx.lineTo(-16, -2); ctx.lineTo(-10, -10);
    ctx.lineTo(0, -13); ctx.lineTo(12, -8); ctx.lineTo(14, 2);
    ctx.lineTo(8, 8); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-14,6); ctx.lineTo(-16,-2); ctx.lineTo(-10,-10); ctx.lineTo(0,-13); ctx.stroke();
    ctx.fillStyle = '#181818';
    ctx.beginPath(); ctx.ellipse(12, 5, 5, 3.5, 0.3, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

const UPGRADES = [
  { id: 'wPlasma', icon: '🔮', name: 'PLASMA CANNON', desc: 'Massive piercing orb · unlocks after all achievements', weaponUnlock: 'plasma' },
  { id: 'speed',      icon: '⚡', name: 'SWIFT BOOTS',   desc: '+20% move speed'                    },
  { id: 'damage',     icon: '🔥', name: 'POWER STRIKE',  desc: '+50% bullet damage'                 },
  { id: 'fireRate',   icon: '🌀', name: 'RAPID FIRE',    desc: '+30% fire rate'                     },
  { id: 'multiShot',  icon: '✨', name: 'MULTI-SHOT',    desc: '+1 extra projectile'                },
  { id: 'bulletSize', icon: '💠', name: 'BIG BULLET',    desc: '+50% bullet size'                   },
  { id: 'hpRegen',    icon: '💚', name: 'REGENERATION',  desc: '+5 HP/sec regen'                    },
  { id: 'maxHp',      icon: '❤️',  name: 'FORTIFY',       desc: '+30 max HP + heal'                  },
  { id: 'wSpread',    icon: '🌊', name: 'SPREAD SHOT',   desc: '5-way spread fire',                 weaponUnlock: 'spread'  },
  { id: 'wSniper',    icon: '🎯', name: 'SNIPER',         desc: 'Piercing long-range shot ×3 dmg',  weaponUnlock: 'sniper'  },
  { id: 'wLaser',     icon: '🔴', name: 'LASER BEAM',    desc: 'Continuous beam melts enemies',     weaponUnlock: 'laser'   },
  { id: 'wRocket',    icon: '🚀', name: 'ROCKET',         desc: 'Homing rockets that explode',       weaponUnlock: 'rocket'  },
  { id: 'wOrbit',     icon: '🔮', name: 'ORBIT SHIELD',  desc: '4 rotating orbs deal contact dmg',  weaponUnlock: 'orbit'   },
];

let unlockedWeapons = new Set(['basic']);

function randUpgrades() {
  const pool = UPGRADES.filter(u => {
    if (u.id === 'wPlasma') return isSecretWeaponUnlocked() && !unlockedWeapons.has('plasma');
    if (u.weaponUnlock) return !unlockedWeapons.has(u.weaponUnlock);
    return true;
  });
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
}

// ==================== MULTIPLAYER ====================
let mp = {
  active:    false,
  ws:        null,
  myId:      null,
  myColor:   null,
  isHost:    false,
  mpDiff:    'normal',
  remotePlayers: {},
  gameState: {},
};

function mpSend(obj) {
  if (mp.ws && mp.ws.readyState === WebSocket.OPEN) {
    mp.ws.send(JSON.stringify(obj));
  }
}

function mpConnect() {
  const raw = document.getElementById('mpIpInput').value.trim();
  if (!raw) { mpSetStatus('Enter an IP address or localhost', 'err'); return; }

  const host = raw.includes(':') ? raw : raw + ':8080';
  const url  = 'ws://' + host;

  mpSetStatus('Connecting...', 'info');
  document.getElementById('mpConnectBtn').disabled = true;

  if (mp.ws) { try { mp.ws.close(); } catch(e){} }

  const ws = new WebSocket(url);
  mp.ws = ws;

  const timeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      ws.close();
      mpSetStatus('Connection timed out. Check the IP and try again.', 'err');
      document.getElementById('mpConnectBtn').disabled = false;
    }
  }, 5000);

  ws.onopen = () => {
    clearTimeout(timeout);
    mpSetStatus('Connected! Waiting for server...', 'ok');
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch(e) { return; }
    handleMpMessage(msg);
  };

  ws.onclose = () => {
    clearTimeout(timeout);
    if (mp.active && state === 'playing') {
      endGame(false);
      mpSetStatus('Disconnected from server.', 'err');
    }
    mpCleanup();
  };

  ws.onerror = () => {
    clearTimeout(timeout);
    mpSetStatus('Could not connect. Is the server running?', 'err');
    document.getElementById('mpConnectBtn').disabled = false;
  };
}

function handleMpMessage(msg) {
  switch (msg.type) {
    case 'error':
      mpSetStatus(msg.msg, 'err');
      document.getElementById('mpConnectBtn').disabled = false;
      if (mp.ws) { try { mp.ws.close(); } catch(e){} }
      break;
    case 'init':
      mp.myId    = msg.id;
      mp.myColor = msg.color;
      mp.isHost  = msg.isHost;
      hideOverlay('mpConnectOverlay');
      showOverlay('mpLobbyOverlay');
      updateLobbyUI(null);
      if (mp.isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('lobbyWaitingHint').style.display = 'none';
        document.getElementById('lobbySubtitle').textContent = '— YOU ARE THE HOST —';
      }
      break;
    case 'lobby':
      updateLobbyUI(msg);
      break;
    case 'youAreHost':
      mp.isHost = true;
      document.getElementById('hostControls').style.display = 'block';
      document.getElementById('lobbyWaitingHint').style.display = 'none';
      document.getElementById('lobbySubtitle').textContent = '— YOU ARE NOW THE HOST —';
      break;
    case 'gameStarted':
      difficulty = msg.difficulty || 'normal';
      startMpGame();
      break;
    case 'state':
      handleMpState(msg);
      break;
    case 'upgrade':
      showUpgradesMP(msg.options, msg.level);
      break;
    case 'upgradeApplied':
      hideOverlay('upgradeOverlay');
      if (state === 'upgrade') state = 'playing';
      break;
    case 'playerDied':
      hp    = 0;
      state = 'end';
      endGame(false);
      break;
    case 'gameEnd':
      handleMpGameEnd(msg);
      break;
  }
}

function updateLobbyUI(msg) {
  const slots = ['lslot0','lslot1','lslot2','lslot3'];
  slots.forEach(id => {
    const el = document.getElementById(id);
    el.className = 'lobby-slot';
    el.innerHTML = '<div class="lobby-dot"></div><span>EMPTY</span>';
  });
  if (!msg || !msg.players) return;

  const COLORS = ['#60a5fa','#34d399','#fbbf24','#f87171'];
  const pList  = Object.values(msg.players);
  pList.forEach((p, i) => {
    if (i >= 4) return;
    const el  = document.getElementById(slots[i]);
    const col = COLORS[i] || '#60a5fa';
    const isMe = p.id === mp.myId;
    el.className = 'lobby-slot filled' + (isMe ? ' is-you' : '');
    el.innerHTML = `
      <div class="lobby-dot" style="background:${col}; color:${col}"></div>
      <span>PLAYER ${i+1}</span>
      ${isMe ? '<span class="lobby-you-tag">YOU</span>' : ''}
    `;
  });
}

function startMpGame() {
  mp.active = true;
  hideOverlay('mpLobbyOverlay');
  hideOverlay('mpConnectOverlay');
  hideOverlay('menuOverlay');
  hideOverlay('endOverlay');
  hideOverlay('pauseOverlay');
  hideOverlay('upgradeOverlay');

  enemies       = [];
  projectiles   = [];
  pickups       = [];
  particles     = [];
  floatingTexts = [];
  kills = 0; wave = 1; level = 1;
  xp = 0; xpNext = 20;
  hp = 100; maxHp = 100;
  gameTimer = 120;
  abilities = { speed: 1, damage: 1, fireRate: 1, multiShot: 1, bulletSize: 1, hpRegen: 0 };
  weaponType = 'basic';
  orbitBullets = []; rockets = []; laserTimer = 0;
  combo = 0; comboTimer = 0;
  unlockedWeapons = new Set(['basic']);
  document.getElementById('comboDisplay').style.display = 'none';

  state    = 'playing';
  lastTime = performance.now();

  document.getElementById('mpScoreboard').style.display = 'block';

  updateHUD();
  requestAnimationFrame(mpRenderLoop);
  startMpInputLoop();
}

let mpInputInterval = null;
function startMpInputLoop() {
  clearInterval(mpInputInterval);
  mpInputInterval = setInterval(() => {
    if (!mp.active || !mp.ws) return;
    let dx = 0, dy = 0;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;
    mpSend({ type: 'input', dx, dy });
  }, 50);
}

function handleMpState(msg) {
  if (!mp.active) return;

  gameTimer = msg.gameTimer;
  wave      = msg.wave;

  enemies       = msg.enemies       || [];
  projectiles   = msg.projectiles   || [];
  pickups       = msg.pickups       || [];
  particles     = msg.particles     || [];
  floatingTexts = msg.floatingTexts || [];

  const me = msg.players && msg.players[mp.myId];
  if (me) {
    hp      = me.hp;
    maxHp   = me.maxHp;
    kills   = me.kills;
    level   = me.level;
    xp      = me.xp;
    xpNext  = me.xpNext;
    weaponType = me.weaponType || 'basic';

    orbitBullets = (me.orbitBullets || []).map(o => ({ ...o, hitCooldown: {} }));
    laserTimer   = me.laserTimer || 0;
    laserAngleMP = me.laserAngle || 0;
    rockets      = me.rockets    || [];

    if (!player) player = { x: WORLD_W/2, y: WORLD_H/2, r: 12, speed: 2.4 };
    player.x = me.x || player.x;
    player.y = me.y || player.y;
  }

  mp.remotePlayers = msg.players || {};

  updateMpScoreboard(msg.players);
  updateCamera();
  updateHUD();
}

let laserAngleMP = 0;

function updateMpScoreboard(players) {
  if (!players) return;
  const COLORS = ['#60a5fa','#34d399','#fbbf24','#f87171'];
  const rows   = document.getElementById('sbRows');
  rows.innerHTML = '';
  const pList  = Object.values(players);
  pList.forEach((p, i) => {
    const col = COLORS[i] || '#60a5fa';
    const row = document.createElement('div');
    row.className = 'sb-row' + (!p.alive ? ' sb-dead' : '');
    const isMe = p.id === mp.myId;
    row.innerHTML = `
      <div class="sb-dot" style="background:${col}"></div>
      <span class="sb-name">${isMe ? 'YOU' : 'P' + (i+1)}</span>
      <span class="sb-kills">${p.kills}k</span>
    `;
    rows.appendChild(row);
  });
}

function handleMpGameEnd(msg) {
  mp.active = false;
  clearInterval(mpInputInterval);
  document.getElementById('mpScoreboard').style.display = 'none';

  state    = 'end';
  lastWave  = msg.wave;
  lastKills = kills;

  const won = msg.won;
  document.getElementById('endIcon').textContent  = won ? '🏆' : '💀';
  document.getElementById('endTitle').textContent = won ? 'MISSION COMPLETE' : 'SQUAD WIPED';
  document.getElementById('endTitle').style.color = won ? 'var(--green)' : 'var(--red)';
  document.getElementById('endSub').textContent   = won
    ? 'Your squad survived every wave!'
    : 'Your squad fell in battle.';
  document.getElementById('esWave').textContent  = msg.wave;
  document.getElementById('esKills').textContent = kills;
  document.getElementById('esLevel').textContent = level;

  if (msg.players) {
    const COLORS = ['#60a5fa','#34d399','#fbbf24','#f87171'];
    const box    = document.getElementById('mpEndScores');
    const rows   = document.getElementById('mpEndRows');
    box.style.display  = 'block';
    rows.innerHTML = '';
    Object.values(msg.players).forEach((p, i) => {
      const col = COLORS[i] || '#60a5fa';
      const row = document.createElement('div');
      row.className = 'mp-end-row';
      row.innerHTML = `
        <div class="mp-end-dot" style="background:${col}"></div>
        <span style="flex:1">PLAYER ${i+1}${p.id === mp.myId ? ' (YOU)' : ''}</span>
        <span style="color:#fbbf24">${p.kills} kills</span>
        <span style="color:#a78bfa; margin-left:10px">LVL ${p.level}</span>
      `;
      rows.appendChild(row);
    });
  }

  showOverlay('endOverlay');
}

function mpCleanup() {
  mp.active  = false;
  mp.ws      = null;
  mp.myId    = null;
  mp.isHost  = false;
  mp.remotePlayers = {};
  clearInterval(mpInputInterval);
  document.getElementById('mpScoreboard').style.display = 'none';
  document.getElementById('mpEndScores').style.display  = 'none';
  document.getElementById('hostControls').style.display = 'none';
  document.getElementById('lobbyWaitingHint').style.display = 'block';
  document.getElementById('lobbySubtitle').textContent = '— WAITING FOR PLAYERS —';
  document.getElementById('mpConnectBtn').disabled = false;
}

function mpSetStatus(msg, type) {
  const el = document.getElementById('mpStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'mp-status ' + (type || 'info');
}

function mpRenderLoop(timestamp) {
  if (!mp.active) return;
  if (state !== 'playing' && state !== 'upgrade') return;
  if (state !== 'playing') { requestAnimationFrame(mpRenderLoop); return; }

  dt       = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (combo > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      document.getElementById('comboDisplay').style.display = 'none';
    }
  }

  if (shootAnim > 0) shootAnim -= dt;

  updateCamera();
  drawMinimap();
  renderMP();
  requestAnimationFrame(mpRenderLoop);
}

function showUpgradesMP(options, lvl) {
  state = 'upgrade';
  document.getElementById('upgradeLvlBadge').textContent = 'LVL ' + lvl;

  const container = document.getElementById('upgradeCards');
  container.innerHTML = '';

  for (const up of options) {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `
      <div class="upgrade-icon">${up.icon}</div>
      <div class="upgrade-name">${up.name}</div>
      <div class="upgrade-desc">${up.desc}</div>
    `;
    card.onclick = () => {
      mpSend({ type: 'upgrade', upgradeId: up.id });
      hideOverlay('upgradeOverlay');
      // state will be set to 'playing' when server confirms with upgradeApplied
    };
    container.appendChild(card);
  }

  showOverlay('upgradeOverlay');
}

function renderMP() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#080c10';
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.18;
  const startGX = Math.floor(camX / 80) * 80;
  const startGY = Math.floor(camY / 80) * 80;
  for (let gx = startGX; gx < camX + W + 80; gx += 80) {
    for (let gy = startGY; gy < camY + H + 80; gy += 80) {
      const v = Math.sin(gx*0.07+gy*0.05)*0.5+0.5;
      ctx.fillStyle = v > 0.6 ? '#0d1520' : '#060a0e';
      ctx.fillRect(gx - camX, gy - camY, 80, 80);
    }
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(96,165,250,0.04)';
  ctx.lineWidth   = 0.5;
  const gridStartX = Math.floor(camX / 40) * 40;
  const gridStartY = Math.floor(camY / 40) * 40;
  for (let x = gridStartX; x <= camX + W; x += 40) {
    const sx = x - camX;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  }
  for (let y = gridStartY; y <= camY + H; y += 40) {
    const sy = y - camY;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  }

  drawWorldBorder();

  for (const p of envProps) drawProp(p);

  for (const pk of pickups) {
    const sx = pk.x - camX, sy = pk.y - camY;
    ctx.globalAlpha = Math.max(0.3, 1 - (pk.age || 0) / 8);
    ctx.fillStyle   = pk.color;
    ctx.shadowColor = pk.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(sx, sy, pk.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  for (const p of particles) {
    const sx = p.x - camX, sy = p.y - camY;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const e of enemies) {
    const sx = e.x - camX, sy = e.y - camY;
    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
    if (e.shieldHp > 0) {
      const sPct = e.shieldHp / e.shieldMax;
      ctx.strokeStyle = `rgba(56,189,248,${0.4 + sPct * 0.6})`;
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(sx, sy, e.r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (e.type === 'boss') {
      ctx.strokeStyle = 'rgba(255,68,68,0.3)'; ctx.lineWidth = 2;
      ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(sx, sy, e.r + 8 + Math.sin(Date.now() / 200) * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = e.color; ctx.shadowColor = e.color;
    ctx.shadowBlur = e.type === 'boss' ? 24 : 12;
    ctx.beginPath(); ctx.arc(sx, sy, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(sx - e.r, sy - e.r - 7, e.r * 2, 3);
    ctx.fillStyle = e.color;
    ctx.fillRect(sx - e.r, sy - e.r - 7, e.r * 2 * (e.hp / e.maxHp), 3);
    if (e.shieldMax > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - e.r, sy - e.r - 12, e.r * 2, 3);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(sx - e.r, sy - e.r - 12, e.r * 2 * Math.max(0, e.shieldHp / e.shieldMax), 3);
    }
  }

  for (const p of projectiles) {
    const sx = p.x - camX, sy = p.y - camY;
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  const COLORS = ['#60a5fa','#34d399','#fbbf24','#f87171'];
  const pList  = Object.values(mp.remotePlayers);
  pList.forEach((p, i) => {
    if (!p.alive) return;
    const col = p.color || COLORS[i] || '#60a5fa';
    const isMe = p.id === mp.myId;
    const sx = (p.x || 0) - camX;
    const sy = (p.y || 0) - camY;

    if (p.rockets) {
      for (const rk of p.rockets) {
        const angle = Math.atan2(rk.vy, rk.vx);
        const rx = rk.x - camX, ry = rk.y - camY;
        ctx.save();
        ctx.translate(rx, ry); ctx.rotate(angle);
        ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#fb923c';
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fef3c7'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(6,-4); ctx.lineTo(6,4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(251,191,36,0.85)'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(-20,-3); ctx.lineTo(-20,3); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
      }
    }

    if (p.orbitBullets) {
      for (const o of p.orbitBullets) {
        const ox = o.x - camX, oy = o.y - camY;
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    if (p.laserTimer > 0 && p.weaponType === 'laser') {
      const ang = isMe ? laserAngleMP : (p.laserAngle || 0);
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const blen = Math.max(W, H) * 1.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(244,63,94,0.25)'; ctx.lineWidth = 18; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + cos * blen, sy + sin * blen); ctx.stroke();
      ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 4; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + cos * blen, sy + sin * blen); ctx.stroke();
      ctx.restore(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = col; ctx.lineWidth = isMe ? 2.5 : 1.5;
    ctx.shadowColor = col; ctx.shadowBlur = isMe ? 22 : 12;
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? `rgba(${hexToRgb(col)},0.15)` : `rgba(${hexToRgb(col)},0.08)`;
    ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;

    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.7;
    ctx.fillText(isMe ? 'YOU' : ('P' + (i + 1)), sx, sy - p.r - 6);
    ctx.globalAlpha = 1;
  });

  ctx.font = '11px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  for (const ft of floatingTexts) {
    const sx = ft.x - camX, sy = ft.y - camY;
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.fillStyle   = ft.color;
    ctx.fillText(ft.text, sx, sy);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

// ==================== SINGLE PLAYER ====================

function initGame() {
  // Apply character stats first
  const stats = CHARACTERS[currentCharacter].stats;
  player = { x: WORLD_W / 2, y: WORLD_H / 2, r: 12, speed: stats.baseSpeed };
  nextEnemyId = 0;
  enemies       = [];
  projectiles   = [];
  pickups       = [];
  particles     = [];
  floatingTexts = [];
  kills         = 0;
  wave          = 1;
  level         = 1;
  xp            = 0;
  xpNext        = 20;
  maxHp         = stats.baseHp;
  hp            = maxHp;
  gameTimer     = 120;
  waveTimer     = 0;
  shootTimer    = 0;
  abilities     = { 
    speed: 1, 
    damage: stats.baseDamage, 
    fireRate: stats.baseFireRate, 
    multiShot: 1, 
    bulletSize: 1, 
    hpRegen: stats.hpRegenBonus 
  };
  weaponType    = 'basic';
  orbitBullets  = [];
  rockets       = [];
  laserTimer    = 0;
  combo         = 0;
  achievementStats = {
  kills: 0,
  wave: 1,
  level: 1,
  bossKills: 0,
  maxCombo: 0,
  timeAlive: 0,
  weaponsUnlocked: 1,
  survived: false,
};
  comboTimer    = 0;
  bossTimer     = 0;
  bossActive    = false;
  bossRef       = null;
  shakeTimer    = 0; shakeMag = 0;
  vignetteTimer = 0;
  waveAnnounce  = null; lastAnnouncedWave = 0;
  shockwaves      = [];
  bloodSplatters  = [];
  scorchMarks     = [];
  lightningTimer  = 0;
  lightningFlash  = 0;
  nextLightning   = 15 + Math.random() * 20;
  unlockedWeapons = new Set(['basic']);
  characterXpBonus = stats.xpBonus;
  generateEnv();
  updateCamera();
  document.getElementById('comboDisplay').style.display = 'none';
  updateHUD();
  applyShopState();
}

function updateHUD() {
  refreshHUDDiarite();
  document.getElementById('lvlVal').textContent  = level;
  document.getElementById('killVal').textContent = kills;
  document.getElementById('waveVal').textContent = wave;
  document.getElementById('hpVal').textContent   = Math.ceil(hp);

  const m = Math.floor(gameTimer / 60);
  const s = Math.floor(gameTimer % 60);
  document.getElementById('timerVal').textContent = m + ':' + (s < 10 ? '0' : '') + s;

  const hpPct = Math.max(0, (hp / maxHp) * 100);
  const fill  = document.getElementById('healthFill');
  fill.style.width      = hpPct + '%';
  fill.style.background = hpPct > 50 ? 'var(--green)' : hpPct > 25 ? 'var(--orange)' : 'var(--red)';
  fill.style.boxShadow  = hpPct > 50
    ? '0 0 8px rgba(52,211,153,0.5)'
    : hpPct > 25 ? '0 0 8px rgba(251,146,60,0.5)'
    : '0 0 8px rgba(248,113,113,0.5)';

  document.getElementById('xpFill').style.width = (xp / xpNext * 100) + '%';
}

function spawnEnemy(forceType = null) {
  const margin = 120;
  const side = Math.floor(Math.random() * 4);
  let ex, ey;
  if (side === 0)      { ex = player.x - W/2 - margin + Math.random() * (W + margin*2); ey = player.y - H/2 - margin; }
  else if (side === 1) { ex = player.x + W/2 + margin; ey = player.y - H/2 - margin + Math.random() * (H + margin*2); }
  else if (side === 2) { ex = player.x - W/2 - margin + Math.random() * (W + margin*2); ey = player.y + H/2 + margin; }
  else                 { ex = player.x - W/2 - margin; ey = player.y - H/2 - margin + Math.random() * (H + margin*2); }

  ex = Math.max(30, Math.min(WORLD_W - 30, ex));
  ey = Math.max(30, Math.min(WORLD_H - 30, ey));

  const d = DIFF[difficulty];

  if (forceType === 'boss') {
    const boss = {
      id: nextEnemyId++,
      x: ex, y: ey, r: 28, speed: 0.8 * d.speedMult,
      hp: 500 * d.hpMult, maxHp: 500 * d.hpMult,
      color: '#ff4444', xpDrop: 40, dmg: 25 * d.dmgMult,
      type: 'boss', shieldHp: 0, shieldMax: 0
    };
    enemies.push(boss);
    bossRef = boss;
    addFloatingText(player.x, player.y - 60, '⚠ BOSS INCOMING!', '#ff4444');
    triggerShake(8, 0.5);
    bossActive = true;
    return;
  }
  if (!forceType && wave >= 2 && Math.random() < 0.1) {
    const shHp = 60 * d.hpMult;
    enemies.push({
      id: nextEnemyId++,
      x: ex, y: ey, r: 13, speed: 1.1 * d.speedMult,
      hp: 40 * d.hpMult, maxHp: 40 * d.hpMult,
      color: '#38bdf8', xpDrop: 8, dmg: 12 * d.dmgMult,
      type: 'shielded', shieldHp: shHp, shieldMax: shHp
    });
    return;
  }
  if (!forceType && wave >= 2 && Math.random() < 0.12) {
    enemies.push({
      id: nextEnemyId++,
      x: ex, y: ey, r: 14, speed: 1.2 * d.speedMult,
      hp: 45 * d.hpMult, maxHp: 45 * d.hpMult,
      color: '#a78bfa', xpDrop: 7, dmg: 10 * d.dmgMult,
      type: 'splitter', shieldHp: 0, shieldMax: 0
    });
    return;
  }
  const isElite = wave >= 3 && Math.random() < 0.08;
  const isFast  = Math.random() < 0.2;
  enemies.push({
    id: nextEnemyId++,
    x: ex, y: ey,
    r:     isElite ? 16 : isFast ? 8  : 11,
    speed: (isElite ? 1.0 : isFast ? 2.4 : 1.4) * (1 + wave * 0.05) * d.speedMult,
    hp:    (isElite ? 80  : isFast ? 20 : 30 + wave * 5) * d.hpMult,
    maxHp: (isElite ? 80  : isFast ? 20 : 30 + wave * 5) * d.hpMult,
    color: isElite ? '#f87171' : isFast ? '#fb923c' : '#e879f9',
    xpDrop: isElite ? 10 : isFast ? 3 : 5,
    dmg:   (isElite ? 20 : isFast ? 5 : 10) * d.dmgMult,
    type: 'standard', shieldHp: 0, shieldMax: 0,
  });
}

function spawnSplitterChildren(e) {
  const d = DIFF[difficulty];
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    enemies.push({
      id: nextEnemyId++,
      x: e.x + Math.cos(angle) * 12, y: e.y + Math.sin(angle) * 12,
      r: 7, speed: 2.0 * d.speedMult,
      hp: 15 * d.hpMult, maxHp: 15 * d.hpMult,
      color: '#c4b5fd', xpDrop: 3, dmg: 6 * d.dmgMult,
      type: 'standard', shieldHp: 0, shieldMax: 0,
    });
  }
}

function spawnPickup(x, y) {
  if (Math.random() < 0.15)
    pickups.push({ x, y, r: 7, type: 'hp', color: '#34d399', age: 0 });
}

function addParticles(x, y, color, n = 6) {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 1 + Math.random() * 3;
    particles.push({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, color, life: 1, maxLife: 0.4+Math.random()*0.5 });
  }
}

function addFloatingText(x, y, text, color = '#fff') {
  floatingTexts.push({ x, y, text, color, life: 1, vy: -1 });
}

let orbitBullets = [];
let rockets      = [];
let laserTimer   = 0;
const LASER_DURATION = 0.18;

function getNearestEnemy() {
  let nearDist = Infinity, nearEnemy = null, nearAngle = -Math.PI / 2;
  for (const e of enemies) {
    const dx = e.x - player.x, dy = e.y - player.y;
    const d  = Math.hypot(dx, dy);
    if (d < nearDist) { nearDist = d; nearAngle = Math.atan2(dy, dx); nearEnemy = e; }
  }
  return { nearAngle, nearEnemy, nearDist };
}

function shoot(overrideAngle = null) {
  playSound(sShoot);

  let aimAngle;
  if (overrideAngle !== null) {
    aimAngle = overrideAngle;
  } else {
    const { nearAngle } = getNearestEnemy();
    aimAngle = nearAngle;
  }

  if (weaponType === 'basic') {
    const spread = 0.15, count = abilities.multiShot, offset = (count - 1) / 2;
    for (let i = 0; i < count; i++)
      spawnBullet(aimAngle + (i - offset) * spread, 7);

  } else if (weaponType === 'spread') {
    for (const off of [-0.5, -0.25, 0, 0.25, 0.5])
      spawnBullet(aimAngle + off, 7);
    for (let m = 1; m < abilities.multiShot; m++)
      spawnBullet(aimAngle + (Math.random() - 0.5) * 1.2, 7);

  } else if (weaponType === 'sniper') {
    spawnBullet(aimAngle, 16, 45 * abilities.damage, true);
    for (let m = 1; m < abilities.multiShot; m++)
      spawnBullet(aimAngle + (Math.random() - 0.5) * 0.1, 16, 45 * abilities.damage, true);

  } else if (weaponType === 'laser') {
    laserTimer = LASER_DURATION;
    const cos = Math.cos(aimAngle), sin = Math.sin(aimAngle);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = e.x - player.x, dy = e.y - player.y;
      if (dx * cos + dy * sin < 0) continue;
      if (Math.abs(dx * sin - dy * cos) < e.r + 6 * abilities.bulletSize) {
        e.hp -= 35 * abilities.damage * dt * 60;
        addParticles(e.x, e.y, '#f43f5e', 2);
      }
    }
    enemies = enemies.filter(e => {
      if (e.hp <= 0) { killEnemy(e); return false; }
      return true;
    });
  } else if (weaponType === 'rocket') {
    const { nearEnemy } = getNearestEnemy();
    const target = fireMode === 'manual' ? null : nearEnemy;
    rockets.push({
      x: player.x, y: player.y, target,
      vx: Math.cos(aimAngle) * 3, vy: Math.sin(aimAngle) * 3,
      r: 6, dmg: 60 * abilities.damage,
      color: '#fb923c', exploded: false
    });
    for (let m = 1; m < abilities.multiShot; m++) {
      const off = (Math.random() - 0.5) * 0.6;
      rockets.push({
        x: player.x, y: player.y, target,
        vx: Math.cos(aimAngle + off) * 3, vy: Math.sin(aimAngle + off) * 3,
        r: 6, dmg: 60 * abilities.damage,
        color: '#fb923c', exploded: false
      });
    }
  }
}

function spawnBullet(angle, speed, dmg = 15 * abilities.damage, pierce = false) {
  projectiles.push({
    x: player.x, y: player.y,
    vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
    r: 5 * abilities.bulletSize, dmg, pierce,
    color: weaponType === 'sniper' ? '#fbbf24' : weaponType === 'plasma' ? '#c084fc' : '#93c5fd',
    trail: [],
  });
}

function updateRockets() {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rk = rockets[i];
    if (rk.target && rk.target.hp > 0) {
      const dx = rk.target.x-rk.x, dy = rk.target.y-rk.y;
      const d  = Math.hypot(dx,dy)||1;
      rk.vx += (dx/d)*0.18; rk.vy += (dy/d)*0.18;
      const spd = Math.hypot(rk.vx,rk.vy);
      if (spd>5){rk.vx=rk.vx/spd*5;rk.vy=rk.vy/spd*5;}
    }
    rk.x += rk.vx; rk.y += rk.vy;
    if (Math.hypot(rk.x - player.x, rk.y - player.y) > 1200) { rockets.splice(i,1); continue; }
    let exploded = false;
    for (let j = enemies.length-1; j>=0; j--) {
      const e = enemies[j];
      if (Math.hypot(rk.x-player.x,rk.y-player.y)>20 && Math.hypot(rk.x-e.x,rk.y-e.y)<e.r+rk.r) {
        for (const se of enemies) {
          const sd = Math.hypot(rk.x-se.x,rk.y-se.y);
          if (sd<60){se.hp-=rk.dmg*(1-sd/80);addParticles(se.x,se.y,'#fb923c',4);}
        }
        addParticles(rk.x,rk.y,'#fb923c',18);
        addFloatingText(rk.x,rk.y-14,'BOOM!','#fb923c');
        enemies=enemies.filter(e=>e.hp>0);
        rockets.splice(i,1); exploded=true; break;
      }
    }
    if (exploded){for(const e of [...enemies])if(e.hp<=0)killEnemy(e);enemies=enemies.filter(e=>e.hp>0);}
  }
}

function updateOrbit() {
  if (weaponType !== 'orbit' || orbitBullets.length === 0) return;
  const ORBIT_R = 50 + 10 * abilities.bulletSize;
  const ORB_DMG = 25 * abilities.damage;

  for (const o of orbitBullets) {
    o.angle += 1.8 * dt;
    const ox = player.x + Math.cos(o.angle) * ORBIT_R;
    const oy = player.y + Math.sin(o.angle) * ORBIT_R;
    o.x = ox;
    o.y = oy;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (Math.hypot(ox - e.x, oy - e.y) < e.r + 8) {
        const key = e.id;   // use unique enemy id
        if (!o.hitCooldown[key]) {
          e.hp -= ORB_DMG;
          addParticles(ox, oy, '#a78bfa', 5);
          o.hitCooldown[key] = 0.4;
          if (e.hp <= 0) {
            killEnemy(e);
            enemies.splice(j, 1);
          }
        }
      }
    }
  }

  // Decrease cooldowns
  for (const o of orbitBullets) {
    for (const id in o.hitCooldown) {
      o.hitCooldown[id] -= dt;
      if (o.hitCooldown[id] <= 0) {
        delete o.hitCooldown[id];
      }
    }
  }
}

// ==================== FIXED killEnemy ====================
function killEnemy(e) {
  if (!e || e._isDying) return;
  e._isDying = true;

  // Apply XP bonus from character (without modifying original enemy)
  let finalXp = e.xpDrop;
  if (currentCharacter === 'medic' && characterXpBonus > 1) {
    finalXp = Math.floor(e.xpDrop * characterXpBonus);
  }

  addParticles(e.x, e.y, e.color, 8);

  // Blood splatters
  const splatterCount = e.type === 'boss' ? 12 : e.type === 'elite' ? 7 : 5;
  for (let i = 0; i < splatterCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * (e.r * 2.5);
    bloodSplatters.push({
      x: e.x + Math.cos(angle) * dist,
      y: e.y + Math.sin(angle) * dist,
      r: (Math.random() * 5 + 2) * (e.type === 'boss' ? 2 : 1),
      alpha: 0.6 + Math.random() * 0.4,
      color: e.type === 'splitter' ? '#4a6a10' : e.type === 'shielded' ? '#164e63' : '#7f1d1d',
    });
  }

  // Scorch mark
  scorchMarks.push({
    x: e.x, y: e.y,
    r: e.type === 'boss' ? 55 : e.type === 'elite' ? 28 : 18,
    alpha: 0.7,
  });
  addFloatingText(e.x, e.y - 10, '+' + finalXp + ' xp', '#818cf8');
  spawnPickup(e.x, e.y);
  addShockwave(e.x, e.y, e.type === 'boss' ? 140 : 55, e.color);
  if (e.type === 'boss') triggerShake(10, 0.4);
  else triggerShake(2, 0.08);

  xp += finalXp;
  kills += 1;

  achievementStats.kills = kills;
if (e.type === 'boss') achievementStats.bossKills = (achievementStats.bossKills || 0) + 1;
if (combo > achievementStats.maxCombo) achievementStats.maxCombo = combo;
checkAchievements();

  const diariteAmt = DIARITE_REWARDS[e.type] || DIARITE_REWARDS.standard;
  awardDiarite(diariteAmt);

  if (e.type === 'splitter') spawnSplitterChildren(e);
  if (e.type === 'boss') bossActive = false;

  combo += 1;
  
  comboTimer = COMBO_WINDOW;
  if (combo >= 2) {
    const el = document.getElementById('comboDisplay');
    el.style.display = 'flex';
    document.getElementById('comboCount').textContent = 'x' + combo;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
    if (combo % 5 === 0) addFloatingText(player.x, player.y - 40, combo + ' COMBO!', '#fbbf24');
  }

  if (xp >= xpNext) {
    xp -= xpNext;
    xpNext = Math.floor(xpNext * 1.4);
    // Prevent NaN / infinite values
    if (isNaN(xpNext) || xpNext <= 0) xpNext = 20;
    if (xpNext > 9999) xpNext = 9999;
    level += 1;
    playSound(sLevel);
    showUpgrades();
  }
}

function applyUpgrade(id) {
  const up = UPGRADES.find(u=>u.id===id);
  if (up&&up.weaponUnlock){
    weaponType=up.weaponUnlock; unlockedWeapons.add(up.weaponUnlock);
    if(up.weaponUnlock==='orbit'&&orbitBullets.length===0){
      for(let i=0;i<4;i++)orbitBullets.push({angle:(i/4)*Math.PI*2,hitCooldown:{}});
    }
    addFloatingText(player.x,player.y-30,up.name+' EQUIPPED!','#fbbf24');
    return;
  }
  if(id==='speed')          abilities.speed*=1.2;
  else if(id==='damage')    abilities.damage*=1.5;
  else if(id==='fireRate')  abilities.fireRate*=1.3;
  else if(id==='multiShot') abilities.multiShot=Math.min(5,abilities.multiShot+1);
  else if(id==='bulletSize')abilities.bulletSize*=1.5;
  else if(id==='hpRegen')   abilities.hpRegen+=5;
  else if(id==='maxHp')     {maxHp+=30;hp=Math.min(hp+30,maxHp);}
}

// ========== FIXED showUpgrades (forces camera update & render) ==========
function showUpgrades() {
  state = 'upgrade';
  document.getElementById('upgradeLvlBadge').textContent = 'LVL '+level;
  const picks = randUpgrades();
  const container = document.getElementById('upgradeCards');
  container.innerHTML='';
  for (const up of picks){
    const card=document.createElement('div');
    card.className='upgrade-card';
    card.innerHTML=`<div class="upgrade-icon">${up.icon}</div><div class="upgrade-name">${up.name}</div><div class="upgrade-desc">${up.desc}</div>`;
card.onclick = () => {
  applyUpgrade(up.id);
  hideOverlay('upgradeOverlay');
  state = 'playing';
  lastTime = performance.now();
  // Make sure music isn't duplicated
  const bgm = document.getElementById('bgMusic');
  if (bgm && bgm.paused) bgm.play().catch(() => {});
  updateCamera();
  render();
  requestAnimationFrame(gameLoop);
};
    container.appendChild(card);
  }
  showOverlay('upgradeOverlay');
}

// ========== FIXED resumeGame (forces camera update & render) ==========
function resumeGame(){
  if(state!=='paused')return;
  const bgm = document.getElementById('bgMusic');
  if (bgm) bgm.volume = musicVol;
  hideOverlay('pauseOverlay');
  state='playing';
  lastTime=performance.now();
  // 🔧 FORCE CAMERA UPDATE AND RENDER – fixes map disappearance after resume
  updateCamera();
  render();
  requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (state!=='playing') return;
  if (mp.active) return;
  const bgm = document.getElementById('bgMusic');
  if (bgm) bgm.volume = musicVol * 0.3;
  state='paused';
  const m=Math.floor(gameTimer/60),s=Math.floor(gameTimer%60);
  document.getElementById('psTime').textContent  = m+':'+(s<10?'0':'')+s;
  document.getElementById('psWave').textContent  = wave;
  document.getElementById('psKills').textContent = kills;
  document.getElementById('psLevel').textContent = level;
  document.getElementById('psHp').textContent    = Math.ceil(hp)+' / '+maxHp;
  const ab=document.getElementById('pauseAbilities'); ab.innerHTML='';
  if(abilities.speed>1)     addTag(ab,'SPD ×'+abilities.speed.toFixed(1));
  if(abilities.damage>1)    addTag(ab,'DMG ×'+abilities.damage.toFixed(1));
  if(abilities.fireRate>1)  addTag(ab,'ROF ×'+abilities.fireRate.toFixed(1));
  if(abilities.multiShot>1) addTag(ab,'SHOT ×'+abilities.multiShot);
  if(abilities.bulletSize>1)addTag(ab,'SZ ×'+abilities.bulletSize.toFixed(1));
  if(abilities.hpRegen>0)   addTag(ab,'REGEN +'+abilities.hpRegen);
  showOverlay('pauseOverlay');
}

function addTag(container, label){
  const span=document.createElement('span');
  span.className='ability-tag'; span.textContent=label;
  container.appendChild(span);
}

function endGame(won){
  stopBgMusic();
  state='end';
  lastWave=wave; lastKills=kills;

  const prev = JSON.parse(localStorage.getItem('sdHighScore') || '{}');
  const newScore = {
    bestWave:  Math.max(wave,  prev.bestWave  || 0),
    bestKills: Math.max(kills, prev.bestKills || 0),
    bestLevel: Math.max(level, prev.bestLevel || 0),
  };
  localStorage.setItem('sdHighScore', JSON.stringify(newScore));

  document.getElementById('endIcon').textContent  = won?'🏆':'💀';
  document.getElementById('endTitle').textContent = won?'YOU SURVIVED':'YOU DIED';
  document.getElementById('endTitle').style.color = won?'var(--green)':'var(--red)';
  document.getElementById('endSub').textContent   = won?'Excellent. You withstood every wave.':'You fell in battle. Rise again.';
  document.getElementById('esWave').textContent   = wave;
  document.getElementById('esKills').textContent  = kills;
  document.getElementById('esLevel').textContent  = level;
  document.getElementById('mpEndScores').style.display = 'none';

  // Inside endGame(), after saving high score
setTimeout(() => {
  const name = prompt('Enter your name for the leaderboard (max 12 chars):');
  if (name && name.trim()) {
    submitScore(name.trim(), kills, wave, level);
  }
}, 500);
if (won) achievementStats.survived = true;
checkAchievements();
  showOverlay('endOverlay');
}

function showOverlay(id){ document.getElementById(id).classList.add('active'); }
function hideOverlay(id){ document.getElementById(id).classList.remove('active'); }

const mmCanvas = document.getElementById('minimapCanvas');
const mmCtx    = mmCanvas.getContext('2d');
const MM_W=mmCanvas.width, MM_H=mmCanvas.height;

function drawMinimap(){
  mmCtx.clearRect(0,0,MM_W,MM_H);
  const scaleX=MM_W/WORLD_W, scaleY=MM_H/WORLD_H;

  mmCtx.strokeStyle='rgba(96,165,250,0.15)';
  mmCtx.lineWidth=1;
  mmCtx.strokeRect(0,0,MM_W,MM_H);

  const vpX = camX * scaleX;
  const vpY = camY * scaleY;
  const vpW = W * scaleX;
  const vpH = H * scaleY;
  mmCtx.strokeStyle='rgba(96,165,250,0.3)';
  mmCtx.lineWidth=0.5;
  mmCtx.strokeRect(vpX, vpY, vpW, vpH);

  for(const e of enemies){
    const color=e.type==='boss'?'#ff4444':e.type==='shielded'?'#38bdf8':e.type==='splitter'?'#a78bfa':e.color;
    mmCtx.fillStyle=color; mmCtx.shadowColor=color; mmCtx.shadowBlur=e.type==='boss'?6:3;
    mmCtx.beginPath(); mmCtx.arc(e.x*scaleX,e.y*scaleY,e.type==='boss'?4:2,0,Math.PI*2); mmCtx.fill();
  }
  mmCtx.shadowBlur=0;
  if (mp.active){
    const COLORS=['#60a5fa','#34d399','#fbbf24','#f87171'];
    Object.values(mp.remotePlayers).forEach((p,i)=>{
      if(!p.alive)return;
      const col=p.color||COLORS[i]||'#60a5fa';
      mmCtx.fillStyle=col; mmCtx.shadowColor=col; mmCtx.shadowBlur=6;
      mmCtx.beginPath(); mmCtx.arc(p.x*scaleX,p.y*scaleY,3,0,Math.PI*2); mmCtx.fill();
    });
  } else if(player){
    mmCtx.fillStyle='#60a5fa'; mmCtx.shadowColor='#60a5fa'; mmCtx.shadowBlur=6;
    mmCtx.beginPath(); mmCtx.arc(player.x*scaleX,player.y*scaleY,3,0,Math.PI*2); mmCtx.fill();
  }
  mmCtx.shadowBlur=0;
}

function drawWorldBorder() {
  const borderLeft   = 0      - camX;
  const borderTop    = 0      - camY;
  const borderRight  = WORLD_W - camX;
  const borderBottom = WORLD_H - camY;
  const thickness    = 18;

  ctx.save();
  const edges = [
    { x: borderLeft,  y: 0,            w: thickness, h: H, visible: borderLeft < W && borderLeft > -thickness },
    { x: borderRight - thickness, y: 0, w: thickness, h: H, visible: borderRight > 0 && borderRight < W + thickness },
    { x: 0, y: borderTop,          w: W, h: thickness, visible: borderTop < H && borderTop > -thickness },
    { x: 0, y: borderBottom - thickness, w: W, h: thickness, visible: borderBottom > 0 && borderBottom < H + thickness },
  ];

  ctx.fillStyle = 'rgba(255,68,68,0.18)';
  ctx.shadowColor = '#ff4444';
  ctx.shadowBlur  = 12;
  for (const e of edges) {
    if (e.visible) ctx.fillRect(e.x, e.y, e.w, e.h);
  }

  ctx.strokeStyle = 'rgba(255,68,68,0.5)';
  ctx.lineWidth   = 2;
  if (borderLeft   >= 0 && borderLeft   <= W) { ctx.beginPath(); ctx.moveTo(borderLeft,   0); ctx.lineTo(borderLeft,   H); ctx.stroke(); }
  if (borderRight  >= 0 && borderRight  <= W) { ctx.beginPath(); ctx.moveTo(borderRight,  0); ctx.lineTo(borderRight,  H); ctx.stroke(); }
  if (borderTop    >= 0 && borderTop    <= H) { ctx.beginPath(); ctx.moveTo(0, borderTop);    ctx.lineTo(W, borderTop);    ctx.stroke(); }
  if (borderBottom >= 0 && borderBottom <= H) { ctx.beginPath(); ctx.moveTo(0, borderBottom); ctx.lineTo(W, borderBottom); ctx.stroke(); }

  ctx.restore();
}

// ========== MAIN GAME LOOP (fixed for mobile joystick) ==========
let gameLoopRunning = false;

function gameLoop(timestamp) {
  if (state !== 'playing') return;
  
  // Mobile joystick integration – directly override keys before movement
  if (isMobile() && joystick.active) {
    keys['a'] = joystick.dx < -0.2;
    keys['d'] = joystick.dx >  0.2;
    keys['w'] = joystick.dy < -0.2;
    keys['s'] = joystick.dy >  0.2;
  } else if (isMobile() && !joystick.active) {
    // If joystick is not active, clear movement keys to avoid stuck movement
    keys['a'] = false; keys['d'] = false; keys['w'] = false; keys['s'] = false;
  }

  dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  gameTimer -= dt;
  if (gameTimer <= 0) { endGame(true); return; }

  waveTimer += dt;
  const spawnInterval = Math.max(0.3, (1.5 - wave * 0.1) / DIFF[difficulty].spawnMult);
  if (waveTimer >= spawnInterval) {
    waveTimer = 0;
    const count = 1 + Math.floor(wave / 2);
    for (let i = 0; i < count; i++) spawnEnemy();
  }
  wave = Math.floor((120 - gameTimer) / 15) + 1;
  achievementStats.wave = wave;
achievementStats.level = level;
achievementStats.timeAlive = 120 - gameTimer;
achievementStats.weaponsUnlocked = unlockedWeapons.size;

  bossTimer += dt;
  if (bossTimer >= 60 && !bossActive) { bossTimer = 0; spawnEnemy('boss'); }

  if (combo > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      document.getElementById('comboDisplay').style.display = 'none';
    }
  }

  shootTimer += dt;
  const fireInterval = Math.max(0.08, 0.55 / abilities.fireRate);

if (fireMode === 'auto') {
    if (shootTimer >= fireInterval && enemies.length > 0) {
      shootTimer = 0;
      shootAnim = 0.12;
      if (weaponType === 'laser') shoot();
      else if (weaponType === 'orbit') { if (orbitBullets.length === 0) shoot(); }
      else shoot();
    }
  } else {
    // Manual fire mode
    const canFire = shootTimer >= fireInterval;
    if (weaponType === 'orbit') {
      if (orbitBullets.length === 0) {
        for (let i = 0; i < 4; i++)
          orbitBullets.push({ angle: (i / 4) * Math.PI * 2, hitCooldown: {} });
      }
    } else if (mouseDown && canFire) {
      shootTimer = 0;
      shootAnim = 0.12;
      const worldMouseX = mouseX + camX;
      const worldMouseY = mouseY + camY;
      const aimAngle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);
      if (weaponType === 'plasma') {
        spawnBullet(aimAngle, 5, 120 * abilities.damage, true);
        spawnBullet(aimAngle - 0.15, 5, 80 * abilities.damage, true);
        spawnBullet(aimAngle + 0.15, 5, 80 * abilities.damage, true);
      } else {
        shoot(aimAngle);
      }
    }
  }

  if (shootAnim > 0) shootAnim -= dt;
  if (rockets.length) updateRockets();
  if (orbitBullets.length) updateOrbit();

  // Player movement (world-clamped)
  let dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
  if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1;
  const mvLen = Math.hypot(dx, dy);
  if (mvLen > 0) { dx /= mvLen; dy /= mvLen; }
  player.x = Math.max(player.r, Math.min(WORLD_W - player.r, player.x + dx * player.speed * abilities.speed * 60 * dt));
  player.y = Math.max(player.r, Math.min(WORLD_H - player.r, player.y + dy * player.speed * abilities.speed * 60 * dt));

  updateCamera();

  if (abilities.hpRegen > 0) hp = Math.min(maxHp, hp + abilities.hpRegen * dt);

  // Cull projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.trail) { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 8) p.trail.shift(); }
    p.x += p.vx; p.y += p.vy;
    if (Math.hypot(p.x - player.x, p.y - player.y) > 1200) projectiles.splice(i, 1);
  }

  // Enemy movement and collision
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const edx = player.x - e.x, edy = player.y - e.y, ed = Math.hypot(edx, edy);
    if (ed > 0) { e.x += (edx / ed) * e.speed; e.y += (edy / ed) * e.speed; }
    if (ed < player.r + e.r + 2) {
      hp -= e.dmg * dt;
      addParticles(player.x, player.y, '#f87171', 2);
      triggerVignette();
      triggerShake(4, 0.12);
      if (hp <= 0) { endGame(false); return; }
    }
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const p = projectiles[j];
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r) {
        if (e.shieldHp > 0) {
          e.shieldHp -= p.dmg;
          addParticles(p.x, p.y, '#38bdf8', 3);
          if (!p.pierce) projectiles.splice(j, 1);
          continue;
        }
        e.hp -= p.dmg;
        e.hitFlash = 0.1;
        if (Math.random() < 0.3) playSound(sHit);
        addParticles(p.x, p.y, p.color, 4);
        if (!p.pierce) projectiles.splice(j, 1);
        if (e.hp <= 0) {
          killEnemy(e);
          enemies.splice(i, 1);
          if (state !== 'playing') return;
          break;
        }
      }
    }
  }

  // Pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.age += dt;
    if (pk.age > 8) { pickups.splice(i, 1); continue; }
    if (Math.hypot(pk.x - player.x, pk.y - player.y) < player.r + pk.r + 4) {
      const healed = Math.min(20, maxHp - hp);
      hp = Math.min(maxHp, hp + 20);
      if (healed > 0) addFloatingText(pk.x, pk.y - 10, '+' + Math.ceil(healed) + ' hp', '#34d399');
      pickups.splice(i, 1);
    }
  }

  // Particles & texts
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= dt / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.life -= dt * 1.5;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }

  // Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.r += 200 * dt;
    s.life -= dt * 2.5;
    if (s.life <= 0) shockwaves.splice(i, 1);
  }

  for (const e of enemies) if (e.hitFlash > 0) e.hitFlash -= dt;
  if (shakeTimer > 0) { shakeTimer -= dt; if (shakeTimer <= 0) { shakeTimer = 0; shakeMag = 0; } }

  // Lightning
  lightningTimer += dt;
  if (lightningTimer >= nextLightning) {
    lightningTimer = 0;
    nextLightning = 15 + Math.random() * 25;
    lightningFlash = 1;
    triggerShake(3, 0.2);
  }
  if (lightningFlash > 0) lightningFlash -= dt * 8;

  // Fade blood splatters and scorch marks
  for (let i = bloodSplatters.length - 1; i >= 0; i--) {
    bloodSplatters[i].alpha -= dt * 0.08;
    if (bloodSplatters[i].alpha <= 0) bloodSplatters.splice(i, 1);
  }
  for (let i = scorchMarks.length - 1; i >= 0; i--) {
    scorchMarks[i].alpha -= dt * 0.04;
    if (scorchMarks[i].alpha <= 0) scorchMarks.splice(i, 1);
  }
  if (vignetteTimer > 0) vignetteTimer -= dt;
  if (waveAnnounce) { waveAnnounce.life -= dt * 1.2; if (waveAnnounce.life <= 0) waveAnnounce = null; }
  if (wave > lastAnnouncedWave) triggerWaveAnnounce(wave);
  if (bossRef && bossRef.hp <= 0) bossRef = null;

  updateHUD();
  drawMinimap();
  render();
  requestAnimationFrame(gameLoop);
}

// ========== SINGLE-PLAYER RENDER ==========
let zombieWobbleTime = 0;

function render() {
  const sx = shakeTimer > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
  const sy = shakeTimer > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.clearRect(-sx - 2, -sy - 2, W + 4, H + 4);

  if (state === 'playing') {
    ctx.fillStyle = '#080c10';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.globalAlpha = 0.18;
  const startGX = Math.floor(camX / 80) * 80;
  const startGY = Math.floor(camY / 80) * 80;
  for (let gx = startGX; gx < camX + W + 80; gx += 80) {
    for (let gy = startGY; gy < camY + H + 80; gy += 80) {
      const v = Math.sin(gx * 0.07 + gy * 0.05) * 0.5 + 0.5;
      ctx.fillStyle = v > 0.6 ? '#0d1520' : '#060a0e';
      ctx.fillRect(gx - camX, gy - camY, 80, 80);
    }
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(96,165,250,0.03)';
  ctx.lineWidth = 0.5;
  const gridStartX = Math.floor(camX / 40) * 40;
  const gridStartY = Math.floor(camY / 40) * 40;
  for (let x = gridStartX; x <= camX + W; x += 40) {
    const screenX = x - camX;
    ctx.beginPath(); ctx.moveTo(screenX, 0); ctx.lineTo(screenX, H); ctx.stroke();
  }
  for (let y = gridStartY; y <= camY + H; y += 40) {
    const screenY = y - camY;
    ctx.beginPath(); ctx.moveTo(0, screenY); ctx.lineTo(W, screenY); ctx.stroke();
  }

  drawWorldBorder();

  for (const p of envProps) drawProp(p);

  // Scorch marks
  for (const sc of scorchMarks) {
    const sx = sc.x - camX, sy = sc.y - camY;
    if (sx < -sc.r || sx > W + sc.r || sy < -sc.r || sy > H + sc.r) continue;
    ctx.save();
    ctx.globalAlpha = sc.alpha * 0.6;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sc.r);
    sg.addColorStop(0, 'rgba(0,0,0,0.85)');
    sg.addColorStop(0.5, 'rgba(20,10,0,0.5)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, sc.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Blood splatters
  for (const bl of bloodSplatters) {
    const bx = bl.x - camX, by = bl.y - camY;
    if (bx < -bl.r || bx > W + bl.r || by < -bl.r || by > H + bl.r) continue;
    ctx.save();
    ctx.globalAlpha = bl.alpha * 0.75;
    ctx.fillStyle = bl.color;
    ctx.beginPath(); ctx.arc(bx, by, bl.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  for (const s of shockwaves) {
    const scx = s.x - camX, scy = s.y - camY;
    ctx.globalAlpha = Math.max(0, s.life * 0.5);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5 * s.life;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(scx, scy, s.r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  for (const pk of pickups) {
    const pkx = pk.x - camX, pky = pk.y - camY;
    if (pkx < -20 || pkx > W + 20 || pky < -20 || pky > H + 20) continue;
    ctx.globalAlpha = Math.max(0.3, 1 - pk.age / 8);
    ctx.fillStyle = pk.color;
    ctx.shadowColor = pk.color;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(pkx, pky, pk.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  for (const p of particles) {
    const px = p.x - camX, py = p.y - camY;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  zombieWobbleTime += dt * 4;
  for (const e of enemies) {
    const ex = e.x - camX, ey = e.y - camY;
    if (ex < -80 || ex > W + 80 || ey < -80 || ey > H + 80) continue;

    if (e.type === 'boss') {
      ctx.strokeStyle = 'rgba(255,68,68,0.25)';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(ex, ey, e.r + 12 + Math.sin(Date.now() / 200) * 5, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (e.shieldHp > 0) {
      const sPct = e.shieldHp / e.shieldMax;
      ctx.strokeStyle = `rgba(56,189,248,${0.3 + sPct * 0.5})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(ex, ey, e.r + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    let zType = 'standard';
    if (e.type === 'boss') zType = 'boss';
    else if (e.type === 'splitter') zType = 'splitter';
    else if (e.type === 'shielded') zType = 'shielded';
    else if (e.color === '#fb923c') zType = 'fast';
    else if (e.color === '#f87171') zType = 'elite';

    const sizeScale = e.r / 11;
    const wobble = zombieWobbleTime + e.x * 0.01;
    const flash = Math.max(0, e.hitFlash || 0);

    ctx.save();
    ctx.translate(ex, ey);
    drawZombie(sizeScale, wobble, zType, flash);
    ctx.restore();

    const barW = e.r * 2.2;
    const barX = ex - barW / 2;
    const barY = ey - e.r - 28;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    const hpPct = e.hp / e.maxHp;
    ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f97316' : '#ef4444';
    ctx.fillRect(barX, barY, barW * hpPct, 3);
    if (e.shieldMax > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX - 1, barY - 6, barW + 2, 5);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, barY - 5, barW * Math.max(0, e.shieldHp / e.shieldMax), 3);
    }
  }

  // Bullet trails
  for (const p of projectiles) {
    if (p.trail && p.trail.length > 1) {
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.5;
        const width = (i / p.trail.length) * p.r * 1.2;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = width;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 1].x - camX, p.trail[i - 1].y - camY);
        ctx.lineTo(p.trail[i].x - camX, p.trail[i].y - camY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
  }

  for (const p of projectiles) {
    const px = p.x - camX, py = p.y - camY;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const rk of rockets) {
    const rx = rk.x - camX, ry = rk.y - camY;
    const angle = Math.atan2(rk.vy, rk.vx);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle);
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fb923c';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fef3c7';
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(251,191,36,0.85)';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-20, -3); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  for (const o of orbitBullets) {
    const radius = 40;
    const ox = player.x + Math.cos(o.angle) * radius - camX;
    const oy = player.y + Math.sin(o.angle) * radius - camY;
    ctx.fillStyle = '#a78bfa';
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (laserTimer > 0 && weaponType === 'laser') {
    let laserAngle;
    if (fireMode === 'manual') {
      const worldMouseX = mouseX + camX;
      const worldMouseY = mouseY + camY;
      laserAngle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);
    } else {
      const { nearAngle } = getNearestEnemy();
      laserAngle = nearAngle;
    }
    const cos = Math.cos(laserAngle), sin = Math.sin(laserAngle);
    const blen = Math.max(W, H) * 1.5;
    const plx = player.x - camX, ply = player.y - camY;
    ctx.save();
    ctx.strokeStyle = 'rgba(244,63,94,0.25)';
    ctx.lineWidth = 18 * abilities.bulletSize;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.moveTo(plx, ply); ctx.lineTo(plx + cos * blen, ply + sin * blen); ctx.stroke();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 4 * abilities.bulletSize;
    ctx.shadowBlur = 15;
    ctx.globalAlpha = Math.min(1, laserTimer / LASER_DURATION);
    ctx.beginPath(); ctx.moveTo(plx, ply); ctx.lineTo(plx + cos * blen, ply + sin * blen); ctx.stroke();
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(plx, ply); ctx.lineTo(plx + cos * blen, ply + sin * blen); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

 const plx = player.x - camX, ply = player.y - camY;

  // Combo glow — grows and shifts color as combo increases
  const comboGlowSize = 55 + Math.min(combo * 4, 80);
  const comboIntensity = Math.min(combo / 15, 1);
  const comboColor = combo >= 10
    ? `rgba(251,191,36,${0.08 + comboIntensity * 0.18})`  // gold at high combo
    : combo >= 5
    ? `rgba(167,139,250,${0.08 + comboIntensity * 0.15})` // purple at mid combo
    : 'rgba(96,165,250,0.1)';                              // blue default
  const comboBorderColor = combo >= 10 ? '#fbbf24' : combo >= 5 ? '#a78bfa' : '#60a5fa';

  const grd = ctx.createRadialGradient(plx, ply, 2, plx, ply, comboGlowSize);
  grd.addColorStop(0, comboColor);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(plx, ply, comboGlowSize, 0, Math.PI * 2); ctx.fill();

  // Pulsing ring at high combos
  if (combo >= 5) {
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() * 0.004));
    ctx.save();
    ctx.globalAlpha = pulse * 0.5 * comboIntensity;
    ctx.strokeStyle = comboBorderColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = comboBorderColor;
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(plx, ply, 22 + combo * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.save();
  ctx.translate(plx, ply);
  drawSoldier(0);
  ctx.restore();

  ctx.font = '11px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  for (const ft of floatingTexts) {
    const ftx = ft.x - camX, fty = ft.y - camY;
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ftx, fty);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  ctx.restore(); // end shake transform

  // Screen-space overlays
  const vgn = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.82);
  vgn.addColorStop(0, 'rgba(0,0,0,0)');
  vgn.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vgn;
  ctx.fillRect(0, 0, W, H);

  // Lightning flash
  if (lightningFlash > 0) {
    const lf = Math.max(0, lightningFlash);
    ctx.save();
    ctx.globalAlpha = lf * 0.18;
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(0, 0, W, H);
    // Lightning bolt lines
    ctx.globalAlpha = lf * 0.6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#bae6fd';
    ctx.shadowBlur = 20;
    const boltX = Math.random() * W;
    ctx.beginPath();
    let by2 = 0;
    ctx.moveTo(boltX, by2);
    while (by2 < H * 0.7) {
      by2 += Math.random() * 60 + 20;
      ctx.lineTo(boltX + (Math.random() - 0.5) * 80, by2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  if (vignetteTimer > 0) {
    const intensity = Math.min(1, vignetteTimer / 0.45);
    const rvgn = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    rvgn.addColorStop(0, 'rgba(200,0,0,0)');
    rvgn.addColorStop(1, `rgba(200,0,0,${intensity * 0.55})`);
    ctx.fillStyle = rvgn;
    ctx.fillRect(0, 0, W, H);
  }

  if (bossRef && bossRef.hp > 0) {
    const bw = 320, bh = 10, bx = (W - bw) / 2, by = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#1a0808';
    ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, bossRef.hp / bossRef.maxHp);
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 10;
    ctx.fillRect(bx, by, bw * pct, bh);
    ctx.shadowBlur = 0;
    ctx.font = 'bold 9px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8888';
    ctx.fillText('⚠ BOSS — ' + Math.ceil(bossRef.hp) + ' HP', W / 2, by + bh + 14);
    ctx.textAlign = 'left';
  }

  if (waveAnnounce) {
    const a = Math.min(1, waveAnnounce.life * 3);
    const scale = 0.85 + 0.15 * (1 - waveAnnounce.life);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H / 2 - 80);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px "Orbitron",monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(waveAnnounce.text, 2, 2);
    ctx.fillStyle = '#60a5fa';
    ctx.shadowColor = '#60a5fa';
    ctx.shadowBlur = 30;
    ctx.fillText(waveAnnounce.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  if (fireMode === 'manual' && state === 'playing') {
    const cx = mouseX, cy = mouseY;
    const size = 12, gap = 4;
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.85;

    ctx.beginPath();
    ctx.moveTo(cx - size, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);  ctx.lineTo(cx + size, cy);
    ctx.moveTo(cx, cy - size); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);  ctx.lineTo(cx, cy + size);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();

    const plx = player.x - camX, ply = player.y - camY;
    ctx.strokeStyle = 'rgba(251,191,36,0.15)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(plx, ply); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ========== DRAW FUNCTIONS ==========

// YOUR ORIGINAL SOLDIER (KEPT EXACTLY AS IS)
function drawSoldierOriginal(flashAlpha = 0) {
  ctx.save();

  const isMoving = (keys['ArrowLeft'] || keys['a'] || keys['A'] ||
                    keys['ArrowRight'] || keys['d'] || keys['D'] ||
                    keys['ArrowUp'] || keys['w'] || keys['W'] ||
                    keys['ArrowDown'] || keys['s'] || keys['S']);

  const isShooting = shootAnim > 0;
  const shootStrength = isShooting ? shootAnim / 0.12 : 0;

  const walkCycle = isMoving ? lastTime * 0.006 : 0;
  const legSwing = isMoving ? Math.sin(walkCycle) * 5 : 0;
  const armSwing = isMoving ? Math.sin(walkCycle) * 4 : 0;
  const bodyBob = isMoving ? Math.abs(Math.sin(walkCycle)) * 1.5 : 0;
  const coatSwing = isMoving ? Math.sin(walkCycle * 0.5) * 2 : 0;

  const recoilX = isShooting ? -shootStrength * 2 : 0;
  ctx.translate(recoilX, bodyBob);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 12 - bodyBob * 0.5, 10, 4 - bodyBob * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Boots
  ctx.save();
  ctx.translate(-4, 0);
  ctx.rotate(legSwing * 0.04);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-4, 8 + legSwing * 0.3, 7, 5);
  ctx.fillStyle = 'rgba(96,165,250,0.8)';
  ctx.fillRect(-4, 8 + legSwing * 0.3, 7, 2);
  ctx.restore();

  ctx.save();
  ctx.translate(4, 0);
  ctx.rotate(-legSwing * 0.04);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-3, 8 - legSwing * 0.3, 7, 5);
  ctx.fillStyle = 'rgba(96,165,250,0.8)';
  ctx.fillRect(-3, 8 - legSwing * 0.3, 7, 2);
  ctx.restore();

  // Legs
  ctx.save();
  ctx.translate(-4, 0);
  ctx.rotate(legSwing * 0.06);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-3, -4, 6, 13);
  ctx.fillStyle = 'rgba(96,165,250,0.45)';
  ctx.fillRect(-1, -2, 2, 10);
  ctx.restore();

  ctx.save();
  ctx.translate(4, 0);
  ctx.rotate(-legSwing * 0.06);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-3, -4, 6, 13);
  ctx.fillStyle = 'rgba(96,165,250,0.45)';
  ctx.fillRect(-1, -2, 2, 10);
  ctx.restore();

  // Belt
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-9, -5, 18, 3);
  ctx.fillStyle = 'rgba(96,165,250,0.7)';
  ctx.fillRect(-2, -5, 4, 3);

  // Coat tails
  ctx.save();
  ctx.rotate(coatSwing * 0.03);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-10, -5, 8, 10);
  ctx.restore();
  ctx.save();
  ctx.rotate(-coatSwing * 0.03);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(2, -5, 8, 10);
  ctx.restore();

  // Longcoat body
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-10, -20, 20, 16);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(-10, -20); ctx.lineTo(-3, -20); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -20); ctx.lineTo(3, -20); ctx.lineTo(6, -5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(96,165,250,0.18)';
  ctx.fillRect(-2, -20, 4, 16);
  ctx.fillStyle = 'rgba(96,165,250,0.55)';
  ctx.fillRect(-9, -15, 6, 2);
  ctx.fillRect(3, -15, 6, 2);
  ctx.fillRect(-9, -10, 6, 1);
  ctx.fillRect(3, -10, 6, 1);

  // Left arm
  ctx.save();
  ctx.translate(-12, -12);
  ctx.rotate(-armSwing * 0.07);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-3, 0, 6, 16);
  ctx.fillStyle = 'rgba(96,165,250,0.75)';
  ctx.fillRect(-3, 13, 6, 2);
  ctx.restore();

  // Right arm + gun
  const gunRecoil = shootStrength * 3;
  const gunRaise = isShooting ? -shootStrength * 4 : 0;
  ctx.save();
  ctx.translate(12, -12);
  ctx.rotate(armSwing * 0.07 - shootStrength * 0.18);
  ctx.translate(-gunRecoil, gunRaise);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-3, 0, 6, 16);
  ctx.fillStyle = 'rgba(96,165,250,0.75)';
  ctx.fillRect(-3, 13, 6, 2);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(1, 4, 11, 5);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(9, 5, 9, 3);

  if (isShooting) {
    const flashSize = shootStrength * 10;
    const flashAlphaVal = shootStrength * 0.95;

    ctx.globalAlpha = flashAlphaVal * 0.5;
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(22, 6, flashSize * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = flashAlphaVal;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(22, 6, flashSize * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 6;
    ctx.globalAlpha = flashAlphaVal * 0.8;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const len = flashSize * 2;
      ctx.beginPath();
      ctx.moveTo(22 + Math.cos(angle) * 2, 6 + Math.sin(angle) * 2);
      ctx.lineTo(22 + Math.cos(angle) * len, 6 + Math.sin(angle) * len);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = shootStrength;
    ctx.fillStyle = '#fbbf24';
    const casingAge = 1 - shootStrength;
    ctx.fillRect(8 + casingAge * 6, 4 - casingAge * 5, 3, 2);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = 'rgba(96,165,250,0.95)';
    ctx.shadowColor = '#60a5fa';
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(18, 6, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(4, 9, 4, 5);
  ctx.restore(); // end right arm

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-6, -22, 12, 5);
  ctx.fillStyle = 'rgba(96,165,250,0.2)';
  ctx.fillRect(-6, -22, 12, 2);

  ctx.fillStyle = '#334155';
  ctx.beginPath(); ctx.roundRect(-7, -34, 14, 14, 3); ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-10, -28, 20, 3);
  ctx.fillRect(-7, -42, 14, 15);
  ctx.fillStyle = 'rgba(96,165,250,0.85)';
  ctx.fillRect(-7, -30, 14, 2);
  ctx.fillStyle = 'rgba(96,165,250,0.5)';
  ctx.beginPath(); ctx.arc(0, -37, 2, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(14,165,233,0.2)';
  ctx.beginPath(); ctx.roundRect(-7, -30, 14, 5, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(96,165,250,0.9)';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.roundRect(-7, -30, 14, 5, 2); ctx.stroke();

  const eyePulse = isShooting ? 1 : isMoving ? 1 : 0.6 + 0.4 * Math.sin(lastTime * 0.003);
  ctx.fillStyle = isShooting ? '#ffffff' : '#60a5fa';
  ctx.globalAlpha = eyePulse;
  ctx.shadowColor = '#60a5fa';
  ctx.shadowBlur = isShooting ? 14 : 8;
  ctx.beginPath(); ctx.arc(-3, -27, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -27, 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  if (flashAlpha > 0) {
    ctx.globalAlpha = Math.min(1, flashAlpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-15, -42, 46, 56);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawNinja(flashAlpha = 0) {
  ctx.save();
  const isMoving = (keys['ArrowLeft']||keys['a']||keys['A']||keys['ArrowRight']||keys['d']||keys['D']||keys['ArrowUp']||keys['w']||keys['W']||keys['ArrowDown']||keys['s']||keys['S']);
  const isShooting = shootAnim > 0;
  const shootStrength = isShooting ? shootAnim / 0.12 : 0;
  const walkCycle = isMoving ? lastTime * 0.008 : 0;
  const legSwing = isMoving ? Math.sin(walkCycle) * 6 : 0;
  const bodyBob = isMoving ? Math.abs(Math.sin(walkCycle)) * 1.2 : 0;
  ctx.translate(0, bodyBob);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 12, 9, 3, 0, 0, Math.PI*2); ctx.fill();

  // Legs - dark purple/black
  ctx.save(); ctx.translate(-3, 0); ctx.rotate(legSwing * 0.07);
  ctx.fillStyle = '#1a0a2e'; ctx.fillRect(-3, -4, 6, 14);
  ctx.fillStyle = '#0f0520'; ctx.fillRect(-3, 8, 6, 5); // boots
  ctx.restore();
  ctx.save(); ctx.translate(3, 0); ctx.rotate(-legSwing * 0.07);
  ctx.fillStyle = '#1a0a2e'; ctx.fillRect(-3, -4, 6, 14);
  ctx.fillStyle = '#0f0520'; ctx.fillRect(-3, 8, 6, 5);
  ctx.restore();

  // Body - dark with purple trim
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(-8, -20, 16, 17);
  ctx.fillStyle = '#6d28d9';
  ctx.fillRect(-8, -20, 16, 3); // shoulder stripe
  ctx.fillRect(-8, -10, 3, 7);  // left chest
  ctx.fillRect(5, -10, 3, 7);   // right chest

  // Scarf/wrap around neck - signature ninja look
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(-9, -22, 18, 4);
  ctx.fillStyle = '#5b21b6';
  ctx.fillRect(4, -22, 6, 8); // scarf tail

  // Arms
  const armSwing = isMoving ? Math.sin(walkCycle) * 4 : 0;
  ctx.save(); ctx.translate(-10, -14); ctx.rotate(-armSwing * 0.08);
  ctx.fillStyle = '#1a0a2e'; ctx.fillRect(-3, 0, 6, 14);
  ctx.restore();

  // Right arm + kunai
  ctx.save(); ctx.translate(10, -14); ctx.rotate(armSwing * 0.08 - shootStrength * 0.2);
  ctx.fillStyle = '#1a0a2e'; ctx.fillRect(-3, 0, 6, 14);
  // Kunai
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath(); ctx.moveTo(3, 4); ctx.lineTo(8, 12); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6d28d9';
  ctx.fillRect(1, 8, 3, 4); // handle wrap
  if (isShooting) {
    ctx.globalAlpha = shootStrength * 0.8;
    ctx.fillStyle = '#a78bfa';
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(8, 10, shootStrength * 8, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Head - with mask
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(-6, -36, 12, 15);
  // Mask (covers lower face)
  ctx.fillStyle = '#4c1d95';
  ctx.fillRect(-7, -30, 14, 8);
  // Head wrap
  ctx.fillStyle = '#0f0520';
  ctx.fillRect(-7, -38, 14, 10);
  ctx.fillStyle = '#6d28d9';
  ctx.fillRect(-7, -38, 14, 3);
  // Eyes - glowing
  const eyePulse = 0.7 + 0.3 * Math.sin(lastTime * 0.004);
  ctx.fillStyle = '#a78bfa';
  ctx.globalAlpha = eyePulse;
  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(-3, -31, 1.8, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -31, 1.8, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  if (flashAlpha > 0) {
    ctx.globalAlpha = Math.min(1, flashAlpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-12, -40, 30, 55);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawHeavy(flashAlpha = 0) {
  ctx.save();
  const isMoving = (keys['ArrowLeft']||keys['a']||keys['A']||keys['ArrowRight']||keys['d']||keys['D']||keys['ArrowUp']||keys['w']||keys['W']||keys['ArrowDown']||keys['s']||keys['S']);
  const isShooting = shootAnim > 0;
  const shootStrength = isShooting ? shootAnim / 0.12 : 0;
  const walkCycle = isMoving ? lastTime * 0.004 : 0; // slower walk
  const legSwing = isMoving ? Math.sin(walkCycle) * 4 : 0;
  const bodyBob = isMoving ? Math.abs(Math.sin(walkCycle)) * 2 : 0;
  ctx.translate(0, bodyBob);

  // Shadow - bigger
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 14, 16, 5, 0, 0, Math.PI*2); ctx.fill();

  // Legs - thick
  ctx.save(); ctx.translate(-5, 0); ctx.rotate(legSwing * 0.04);
  ctx.fillStyle = '#374151'; ctx.fillRect(-5, -4, 10, 16);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(-5, 10, 10, 6); // boots
  ctx.fillStyle = '#4b5563'; ctx.fillRect(-5, -4, 10, 4); // knee pad
  ctx.restore();
  ctx.save(); ctx.translate(5, 0); ctx.rotate(-legSwing * 0.04);
  ctx.fillStyle = '#374151'; ctx.fillRect(-5, -4, 10, 16);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(-5, 10, 10, 6);
  ctx.fillStyle = '#4b5563'; ctx.fillRect(-5, -4, 10, 4);
  ctx.restore();

  // Body - wide armor
  ctx.fillStyle = '#374151';
  ctx.fillRect(-14, -22, 28, 19);
  // Chest armor plates
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(-13, -21, 12, 8);
  ctx.fillRect(1, -21, 12, 8);
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(-13, -21, 12, 2);
  ctx.fillRect(1, -21, 12, 2);
  // Belt
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-14, -5, 28, 4);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(-3, -5, 6, 4); // belt buckle

  // Arms - massive
  const armSwing = isMoving ? Math.sin(walkCycle) * 3 : 0;
  ctx.save(); ctx.translate(-16, -15); ctx.rotate(-armSwing * 0.05);
  ctx.fillStyle = '#374151'; ctx.fillRect(-5, 0, 10, 18);
  ctx.fillStyle = '#4b5563'; ctx.fillRect(-5, 0, 10, 5); // shoulder pad
  ctx.restore();

  // Right arm + minigun
  ctx.save(); ctx.translate(16, -15); ctx.rotate(armSwing * 0.05 - shootStrength * 0.1);
  ctx.fillStyle = '#374151'; ctx.fillRect(-5, 0, 10, 18);
  ctx.fillStyle = '#4b5563'; ctx.fillRect(-5, 0, 10, 5);
  // Minigun barrel
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(3, 5, 16, 7);
  ctx.fillStyle = '#374151';
  ctx.fillRect(3, 5, 16, 3);
  ctx.fillRect(14, 3, 6, 11); // muzzle
  if (isShooting) {
    ctx.globalAlpha = shootStrength * 0.9;
    ctx.fillStyle = '#f97316';
    ctx.shadowColor = '#f97316'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(22, 8, shootStrength * 12, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Head - helmet
  ctx.fillStyle = '#374151';
  ctx.fillRect(-9, -36, 18, 16);
  // Visor
  ctx.fillStyle = '#f97316';
  ctx.fillRect(-8, -30, 16, 5);
  ctx.fillStyle = 'rgba(249,115,22,0.3)';
  ctx.fillRect(-8, -30, 16, 5);
  // Helmet top detail
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(-9, -36, 18, 5);
  ctx.fillRect(-11, -34, 4, 8); // ear pieces
  ctx.fillRect(7, -34, 4, 8);
  // Eyes behind visor
  const eyePulse = 0.8 + 0.2 * Math.sin(lastTime * 0.003);
  ctx.fillStyle = '#f97316';
  ctx.globalAlpha = eyePulse;
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(-3, -28, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -28, 2, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  if (flashAlpha > 0) {
    ctx.globalAlpha = Math.min(1, flashAlpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-18, -40, 50, 60);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawAssassin(flashAlpha = 0) {
  ctx.save();
  const isMoving = (keys['ArrowLeft']||keys['a']||keys['A']||keys['ArrowRight']||keys['d']||keys['D']||keys['ArrowUp']||keys['w']||keys['W']||keys['ArrowDown']||keys['s']||keys['S']);
  const isShooting = shootAnim > 0;
  const shootStrength = isShooting ? shootAnim / 0.12 : 0;
  const walkCycle = isMoving ? lastTime * 0.007 : 0;
  const legSwing = isMoving ? Math.sin(walkCycle) * 5 : 0;
  const bodyBob = isMoving ? Math.abs(Math.sin(walkCycle)) * 1.3 : 0;
  ctx.translate(0, bodyBob);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 12, 10, 3, 0, 0, Math.PI*2); ctx.fill();

  // Legs
  ctx.save(); ctx.translate(-4, 0); ctx.rotate(legSwing * 0.06);
  ctx.fillStyle = '#0f0f0f'; ctx.fillRect(-3, -4, 6, 14);
  ctx.fillStyle = '#dc2626'; ctx.fillRect(-3, -4, 6, 2); // red stripe
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-3, 8, 7, 6);
  ctx.restore();
  ctx.save(); ctx.translate(4, 0); ctx.rotate(-legSwing * 0.06);
  ctx.fillStyle = '#0f0f0f'; ctx.fillRect(-3, -4, 6, 14);
  ctx.fillStyle = '#dc2626'; ctx.fillRect(-3, -4, 6, 2);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-3, 8, 7, 6);
  ctx.restore();

  // Body - sleek coat
  ctx.fillStyle = '#111111';
  ctx.fillRect(-9, -21, 18, 18);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-9, -21, 3, 18); // red side panel
  ctx.fillRect(-9, -21, 18, 2); // collar
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-6, -19, 5, 8); // chest detail
  ctx.fillRect(1, -19, 5, 8);

  // Hood/cape effect
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.moveTo(-9, -21); ctx.lineTo(-14, -10); ctx.lineTo(-9, -5); ctx.closePath(); ctx.fill();

  const armSwing = isMoving ? Math.sin(walkCycle) * 4 : 0;
  ctx.save(); ctx.translate(-11, -14); ctx.rotate(-armSwing * 0.07);
  ctx.fillStyle = '#111111'; ctx.fillRect(-3, 0, 6, 15);
  ctx.restore();

  // Right arm + dual blades
  ctx.save(); ctx.translate(11, -14); ctx.rotate(armSwing * 0.07 - shootStrength * 0.25);
  ctx.fillStyle = '#111111'; ctx.fillRect(-3, 0, 6, 15);
  // Blade
  ctx.fillStyle = '#e2e8f0';
  ctx.shadowColor = '#dc2626'; ctx.shadowBlur = isShooting ? 14 : 4;
  ctx.beginPath(); ctx.moveTo(3, 2); ctx.lineTo(16, 8); ctx.lineTo(3, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(2, 6, 4, 3); // handle
  ctx.shadowBlur = 0;
  if (isShooting) {
    ctx.globalAlpha = shootStrength * 0.85;
    ctx.fillStyle = '#dc2626';
    ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(16, 8, shootStrength * 9, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Head with hood
  ctx.fillStyle = '#111111';
  ctx.fillRect(-7, -36, 14, 16);
  // Hood
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.moveTo(-8, -36); ctx.lineTo(8, -36); ctx.lineTo(10, -26); ctx.lineTo(-10, -26); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, -36); ctx.arc(0, -36, 8, Math.PI, 0); ctx.closePath(); ctx.fill();
  // Mask with red slash
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-7, -30, 14, 7);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-7, -27, 14, 2); // red mask stripe
  // Eyes
  const eyePulse = 0.7 + 0.3 * Math.sin(lastTime * 0.005);
  ctx.fillStyle = '#dc2626';
  ctx.globalAlpha = eyePulse;
  ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(-3, -29, 1.8, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -29, 1.8, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  if (flashAlpha > 0) {
    ctx.globalAlpha = Math.min(1, flashAlpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-14, -40, 36, 56);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawMedic(flashAlpha = 0) {
  ctx.save();
  const isMoving = (keys['ArrowLeft']||keys['a']||keys['A']||keys['ArrowRight']||keys['d']||keys['D']||keys['ArrowUp']||keys['w']||keys['W']||keys['ArrowDown']||keys['s']||keys['S']);
  const isShooting = shootAnim > 0;
  const shootStrength = isShooting ? shootAnim / 0.12 : 0;
  const walkCycle = isMoving ? lastTime * 0.005 : 0;
  const legSwing = isMoving ? Math.sin(walkCycle) * 4 : 0;
  const bodyBob = isMoving ? Math.abs(Math.sin(walkCycle)) * 1.5 : 0;
  ctx.translate(0, bodyBob);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 12, 11, 4, 0, 0, Math.PI*2); ctx.fill();

  // Healing aura
  if (abilities && abilities.hpRegen > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(lastTime * 0.004);
    ctx.globalAlpha = pulse * 0.15;
    ctx.fillStyle = '#34d399';
    ctx.shadowColor = '#34d399'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, -15, 30, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  // Legs
  ctx.save(); ctx.translate(-4, 0); ctx.rotate(legSwing * 0.05);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-3, -4, 6, 14);
  ctx.fillStyle = '#d1fae5'; ctx.fillRect(-3, -4, 6, 2);
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(-3, 8, 7, 6);
  ctx.restore();
  ctx.save(); ctx.translate(4, 0); ctx.rotate(-legSwing * 0.05);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-3, -4, 6, 14);
  ctx.fillStyle = '#d1fae5'; ctx.fillRect(-3, -4, 6, 2);
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(-3, 8, 7, 6);
  ctx.restore();

  // Body - white coat
  ctx.fillStyle = '#f0fdf4';
  ctx.fillRect(-10, -22, 20, 19);
  // Green cross on chest
  ctx.fillStyle = '#34d399';
  ctx.fillRect(-2, -19, 4, 10); // vertical
  ctx.fillRect(-6, -15, 12, 4); // horizontal
  // Coat details
  ctx.fillStyle = '#d1fae5';
  ctx.fillRect(-10, -22, 20, 3);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(-1, -22, 2, 19); // center line

  const armSwing = isMoving ? Math.sin(walkCycle) * 3 : 0;
  ctx.save(); ctx.translate(-12, -14); ctx.rotate(-armSwing * 0.06);
  ctx.fillStyle = '#f0fdf4'; ctx.fillRect(-3, 0, 6, 15);
  // Med kit on left arm
  ctx.fillStyle = '#34d399'; ctx.fillRect(-3, 10, 6, 5);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, 11, 2, 3); ctx.fillRect(-2, 12, 4, 1);
  ctx.restore();

  // Right arm + syringe
  ctx.save(); ctx.translate(12, -14); ctx.rotate(armSwing * 0.06 - shootStrength * 0.15);
  ctx.fillStyle = '#f0fdf4'; ctx.fillRect(-3, 0, 6, 15);
  // Syringe
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(2, 4, 5, 10);
  ctx.fillStyle = '#34d399';
  ctx.fillRect(3, 5, 3, 7); // liquid
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath(); ctx.moveTo(4, 14); ctx.lineTo(4.5, 18); ctx.lineTo(5, 14); ctx.closePath(); ctx.fill(); // needle
  if (isShooting) {
    ctx.globalAlpha = shootStrength * 0.9;
    ctx.fillStyle = '#34d399';
    ctx.shadowColor = '#34d399'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(7, 10, shootStrength * 9, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Head
  ctx.fillStyle = '#fef9c3'; // skin
  ctx.fillRect(-7, -36, 14, 15);
  // Medical cap
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-8, -38, 16, 6);
  ctx.fillStyle = '#34d399'; // cross on cap
  ctx.fillRect(-1, -38, 2, 6);
  ctx.fillRect(-4, -36, 8, 2);
  // Face
  ctx.fillStyle = '#d1fae5';
  ctx.fillRect(-6, -28, 12, 5); // mask
  // Eyes
  const eyePulse = 0.7 + 0.3 * Math.sin(lastTime * 0.003);
  ctx.fillStyle = '#34d399';
  ctx.globalAlpha = eyePulse;
  ctx.shadowColor = '#34d399'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(-3, -30, 1.8, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -30, 1.8, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  if (flashAlpha > 0) {
    ctx.globalAlpha = Math.min(1, flashAlpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-14, -42, 36, 58);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// NEW drawSoldier that calls character-specific drawings (but uses original as base)
function drawSoldier(flashAlpha = 0) {
  switch(currentCharacter) {
    case 'ninja':    drawNinja(flashAlpha);    break;
    case 'heavy':    drawHeavy(flashAlpha);    break;
    case 'assassin': drawAssassin(flashAlpha); break;
    case 'medic':    drawMedic(flashAlpha);    break;
    default:         drawSoldierOriginal(flashAlpha); break;
  }
}

function drawZombie(size, wobble, zombieType, flashAlpha = 0) {
  ctx.save();
  const s = size;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 10 * s, 8 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();

  const armSwing = Math.sin(wobble) * 0.4;

  if (zombieType === 'boss') {
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-8 * s, 4 * s, 6 * s, 12 * s);
    ctx.fillRect(2 * s, 4 * s, 6 * s, 12 * s);
    ctx.fillStyle = '#111';
    ctx.fillRect(-9 * s, 13 * s, 7 * s, 4 * s);
    ctx.fillRect(2 * s, 13 * s, 7 * s, 4 * s);

    ctx.fillStyle = '#1a2a0a';
    ctx.fillRect(-12 * s, -12 * s, 24 * s, 17 * s);
    ctx.fillStyle = '#0d1a05';
    ctx.fillRect(-12 * s, -5 * s, 24 * s, 3 * s);
    ctx.fillRect(-8 * s, -12 * s, 4 * s, 17 * s);

    ctx.save();
    ctx.rotate(armSwing);
    ctx.fillStyle = '#2a3a0a';
    ctx.fillRect(-22 * s, -10 * s, 10 * s, 6 * s);
    ctx.restore();
    ctx.save();
    ctx.rotate(-armSwing);
    ctx.fillStyle = '#2a3a0a';
    ctx.fillRect(12 * s, -10 * s, 10 * s, 6 * s);
    ctx.restore();
    ctx.fillStyle = '#3d5c1a';
    ctx.beginPath(); ctx.arc(-17 * s, -7 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(17 * s, -7 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5 * s;
    for (let c = -1; c <= 1; c++) {
      ctx.beginPath(); ctx.moveTo((-17 + c * 3) * s, -12 * s); ctx.lineTo((-17 + c * 3) * s, -15 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((17 + c * 3) * s, -12 * s); ctx.lineTo((17 + c * 3) * s, -15 * s); ctx.stroke();
    }

    ctx.fillStyle = '#3d5c1a';
    ctx.fillRect(-5 * s, -16 * s, 10 * s, 5 * s);
    ctx.fillStyle = '#4a7020';
    ctx.beginPath(); ctx.ellipse(0, -22 * s, 11 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath(); ctx.ellipse(-5 * s, -24 * s, 4 * s, 3 * s, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6 * s, -20 * s, 3 * s, 2 * s, 0.2, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 14 * s;
    ctx.beginPath(); ctx.ellipse(-4 * s, -23 * s, 3 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4 * s, -23 * s, 3 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#880000';
    ctx.beginPath(); ctx.arc(-4 * s, -23 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 * s, -23 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.moveTo(-5 * s, -18 * s); ctx.lineTo(5 * s, -18 * s); ctx.lineTo(3 * s, -15 * s); ctx.lineTo(-3 * s, -15 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(-4 * s, -17 * s, 8 * s, 1.5 * s);

    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath(); ctx.moveTo(-12 * s, -12 * s); ctx.lineTo(-14 * s, -18 * s); ctx.lineTo(-10 * s, -12 * s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12 * s, -12 * s); ctx.lineTo(14 * s, -18 * s); ctx.lineTo(10 * s, -12 * s); ctx.closePath(); ctx.fill();

  } else if (zombieType === 'fast') {
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-4 * s, 2 * s, 3 * s, 8 * s);
    ctx.fillRect(1 * s, 2 * s, 3 * s, 8 * s);
    ctx.fillStyle = '#1a0d05';
    ctx.fillRect(-5 * s, 8 * s, 4 * s, 3 * s);
    ctx.fillRect(1 * s, 7 * s, 4 * s, 3 * s);

    ctx.save();
    ctx.rotate(0.3);
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(-5 * s, -8 * s, 10 * s, 11 * s);
    ctx.restore();

    ctx.save();
    ctx.rotate(armSwing - 0.5);
    ctx.fillStyle = '#4a3a1a';
    ctx.fillRect(-14 * s, -6 * s, 7 * s, 3 * s);
    ctx.restore();
    ctx.save();
    ctx.rotate(-armSwing + 0.5);
    ctx.fillStyle = '#4a3a1a';
    ctx.fillRect(7 * s, -6 * s, 7 * s, 3 * s);
    ctx.restore();

    ctx.fillStyle = '#5a4520';
    ctx.beginPath(); ctx.ellipse(0, -12 * s, 5 * s, 6 * s, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6600';
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 8 * s;
    ctx.beginPath(); ctx.arc(-2 * s, -13 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2 * s, -13 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ddd';
    ctx.fillRect(-3 * s, -10 * s, 6 * s, 2 * s);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.5 * s;
    for (let t = -2; t <= 2; t++) { ctx.beginPath(); ctx.moveTo(t * s, -10 * s); ctx.lineTo(t * s, -8 * s); ctx.stroke(); }

  } else if (zombieType === 'elite') {
    ctx.fillStyle = '#1a2a0a';
    ctx.fillRect(-6 * s, 3 * s, 5 * s, 10 * s);
    ctx.fillRect(1 * s, 3 * s, 5 * s, 10 * s);
    ctx.fillStyle = '#111';
    ctx.fillRect(-7 * s, 11 * s, 6 * s, 4 * s);
    ctx.fillRect(1 * s, 11 * s, 6 * s, 4 * s);

    ctx.fillStyle = '#1a2a0a';
    ctx.fillRect(-8 * s, -10 * s, 16 * s, 14 * s);
    ctx.fillStyle = '#333';
    ctx.fillRect(-8 * s, -10 * s, 16 * s, 4 * s);
    ctx.fillRect(-7 * s, -3 * s, 6 * s, 6 * s);
    ctx.fillRect(1 * s, -3 * s, 6 * s, 6 * s);

    ctx.save(); ctx.rotate(armSwing * 0.5);
    ctx.fillStyle = '#2a3a0a';
    ctx.fillRect(-15 * s, -8 * s, 7 * s, 5 * s);
    ctx.fillStyle='#333'; ctx.fillRect(-15 * s, -8 * s, 7 * s, 3 * s);
    ctx.restore();
    ctx.save(); ctx.rotate(-armSwing * 0.5);
    ctx.fillStyle = '#2a3a0a';
    ctx.fillRect(8 * s, -8 * s, 7 * s, 5 * s);
    ctx.fillStyle='#333'; ctx.fillRect(8 * s, -8 * s, 7 * s, 3 * s);
    ctx.restore();

    ctx.fillStyle = '#5a4020';
    ctx.beginPath(); ctx.ellipse(0, -15 * s, 7 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(0, -17 * s, 8 * s, 6 * s, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-8 * s, -19 * s, 16 * s, 4 * s);
    ctx.fillStyle = 'rgba(100,200,255,0.2)';
    ctx.fillRect(-7 * s, -18 * s, 14 * s, 5 * s);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5 * s;
    ctx.beginPath(); ctx.moveTo(-3 * s, -18 * s); ctx.lineTo(2 * s, -13 * s); ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 10 * s;
    ctx.beginPath(); ctx.arc(-3 * s, -16 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3 * s, -16 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

  } else if (zombieType === 'splitter') {
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(-5 * s, 4 * s, 4 * s, 8 * s);
    ctx.fillRect(1 * s, 4 * s, 4 * s, 8 * s);

    ctx.fillStyle = '#4a6a10';
    ctx.beginPath(); ctx.ellipse(0, 0, 10 * s, 11 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8aaa20';
    const pustules = [[-6,-3],[5,-5],[-2,4],[7,2],[-7,5],[3,-8]];
    for (const [px, py] of pustules) {
      ctx.beginPath(); ctx.arc(px * s, py * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#aacc30';
    for (const [px, py] of pustules) {
      ctx.beginPath(); ctx.arc(px * s, py * s, 0.8 * s, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save(); ctx.rotate(armSwing);
    ctx.fillStyle = '#4a6a10';
    ctx.beginPath(); ctx.ellipse(-14 * s, -4 * s, 5 * s, 3 * s, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.rotate(-armSwing);
    ctx.fillStyle = '#4a6a10';
    ctx.beginPath(); ctx.ellipse(14 * s, -4 * s, 5 * s, 3 * s, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#5a7a18';
    ctx.beginPath(); ctx.ellipse(0, -13 * s, 6 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#aacc00';
    ctx.shadowColor = '#aacc00';
    ctx.shadowBlur = 8 * s;
    ctx.beginPath(); ctx.arc(-3 * s, -14 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3 * s, -14 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-3 * s, -14 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3 * s, -14 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(0, -10 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cc3300';
    ctx.beginPath(); ctx.arc(0, -10 * s, 2 * s, 0, Math.PI); ctx.fill();

  } else if (zombieType === 'shielded') {
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-5 * s, 3 * s, 4 * s, 9 * s);
    ctx.fillRect(1 * s, 3 * s, 4 * s, 9 * s);
    ctx.fillStyle = '#111';
    ctx.fillRect(-6 * s, 10 * s, 5 * s, 3 * s);
    ctx.fillRect(1 * s, 10 * s, 5 * s, 3 * s);

    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(-7 * s, -8 * s, 14 * s, 12 * s);

    ctx.fillStyle = '#2a3a4a';
    ctx.fillRect(-18 * s, -14 * s, 10 * s, 22 * s);
    ctx.strokeStyle = '#3a5a6a';
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(-18 * s, -14 * s, 10 * s, 22 * s);
    ctx.fillStyle = '#4a6a7a';
    for (const [rx, ry] of [[-16, -12], [-11, -12], [-16, 5], [-11, 5]]) {
      ctx.beginPath(); ctx.arc(rx * s, ry * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#1a2a3a';
    ctx.lineWidth = s;
    ctx.beginPath(); ctx.moveTo(-15 * s, -5 * s); ctx.lineTo(-12 * s, 0); ctx.stroke();

    ctx.save(); ctx.rotate(-armSwing * 0.5);
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(7 * s, -6 * s, 6 * s, 5 * s);
    ctx.restore();

    ctx.fillStyle = '#5a4520';
    ctx.beginPath(); ctx.ellipse(1 * s, -13 * s, 6 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 6 * s;
    ctx.beginPath(); ctx.arc(-2 * s, -15 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 * s, -15 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.moveTo(-3 * s, -10 * s); ctx.lineTo(5 * s, -10 * s); ctx.lineTo(3 * s, -8 * s); ctx.lineTo(-1 * s, -8 * s); ctx.closePath(); ctx.fill();

  } else {
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-5 * s, 2 * s, 4 * s, 9 * s);
    ctx.fillRect(1 * s, 3 * s, 4 * s, 9 * s);
    ctx.fillStyle = '#111';
    ctx.fillRect(-6 * s, 9 * s, 5 * s, 3 * s);
    ctx.fillRect(0 * s, 10 * s, 5 * s, 3 * s);

    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(-6 * s, -8 * s, 12 * s, 11 * s);
    ctx.strokeStyle = '#1a0d05';
    ctx.lineWidth = s;
    ctx.beginPath(); ctx.moveTo(-6 * s, 0); ctx.lineTo(-2 * s, -3 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2 * s, 1 * s); ctx.lineTo(6 * s, -1 * s); ctx.stroke();
    ctx.strokeStyle = '#e8e0c8';
    ctx.lineWidth = 0.8 * s;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath(); ctx.moveTo(4 * s, (-6 + r * 3) * s); ctx.lineTo(6 * s, (-5 + r * 3) * s); ctx.stroke();
    }

    ctx.save();
    ctx.rotate(armSwing - 0.3);
    ctx.fillStyle = '#4a3a1a';
    ctx.fillRect(-14 * s, -7 * s, 8 * s, 4 * s);
    ctx.fillStyle = '#5a4a2a';
    ctx.beginPath(); ctx.ellipse(-14 * s, -5 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = s;
    ctx.beginPath(); ctx.moveTo(-17 * s, -8 * s); ctx.lineTo(-18 * s, -11 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14 * s, -8 * s); ctx.lineTo(-14 * s, -11 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11 * s, -8 * s); ctx.lineTo(-10 * s, -11 * s); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-armSwing + 0.1);
    ctx.fillStyle = '#4a3a1a';
    ctx.fillRect(6 * s, -10 * s, 8 * s, 4 * s);
    ctx.fillStyle = '#5a4a2a';
    ctx.beginPath(); ctx.ellipse(14 * s, -8 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = s;
    ctx.beginPath(); ctx.moveTo(11 * s, -11 * s); ctx.lineTo(10 * s, -14 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14 * s, -11 * s); ctx.lineTo(14 * s, -14 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17 * s, -11 * s); ctx.lineTo(18 * s, -14 * s); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#5a4520';
    ctx.fillRect(-2 * s, -11 * s, 4 * s, 4 * s);

    ctx.fillStyle = '#6a5530';
    ctx.beginPath(); ctx.ellipse(0, -17 * s, 6 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath(); ctx.ellipse(3 * s, -20 * s, 3 * s, 2.5 * s, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1008';
    ctx.beginPath(); ctx.arc(-2 * s, -22 * s, 4 * s, Math.PI, 0); ctx.fill();

    ctx.fillStyle = '#ff3300';
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 8 * s;
    ctx.beginPath(); ctx.arc(-3 * s, -18 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3 * s, -18 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#660000';
    ctx.beginPath(); ctx.arc(-3 * s, -18 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3 * s, -18 * s, 1 * s, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(-3 * s, -13 * s); ctx.lineTo(3 * s, -13 * s);
    ctx.lineTo(2 * s, -10 * s); ctx.lineTo(-2 * s, -10 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(-1 * s, -13 * s, 2 * s, 4 * s);
  }

  if (flashAlpha > 0) {
    ctx.globalAlpha = Math.min(1, flashAlpha * 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-20 * s, -28 * s, 40 * s, 46 * s);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ========== START / REPLAY / MENU ==========
function startGame() {
  stopMenuMusic();
  if (lastWave !== null) {
    document.getElementById('msWave').textContent = lastWave;
    document.getElementById('msKills').textContent = lastKills;
    document.getElementById('menuStatsRow').style.display = 'flex';
  }
  if (mp.ws) { try { mp.ws.close(); } catch (e) {} }
  mpCleanup();
  document.getElementById('mpEndScores').style.display = 'none';

  hideOverlay('menuOverlay');
  hideOverlay('endOverlay');
  hideOverlay('pauseOverlay');
  hideOverlay('upgradeOverlay');
  hideOverlay('mpConnectOverlay');
  hideOverlay('mpLobbyOverlay');

  initGame();
  startBgMusic();
  state = 'playing';
  lastTime = performance.now();
  if (isMobile()) setFireMode('auto');
  requestAnimationFrame(gameLoop);
}

function startBgMusic() {
  const bgm = document.getElementById('bgMusic');
  if (!bgm) return;
  bgm.volume = musicVol;
  bgm.currentTime = 0;
  bgm.play().catch(() => {});
}

function startMenuMusic() {
  const mm = document.getElementById('menuMusic');
  if (!mm) return;
  mm.volume = musicVol;
  mm.currentTime = 0;
  mm.play().catch(() => {});
}

function stopMenuMusic() {
  const mm = document.getElementById('menuMusic');
  if (!mm) return;
  mm.pause();
  mm.currentTime = 0;
}

function stopBgMusic() {
  const bgm = document.getElementById('bgMusic');
  if (!bgm) return;
  bgm.pause();
  bgm.currentTime = 0;
}

function goToMenu() {
  state = 'idle';
  stopBgMusic();
  if (mp.ws) { try { mp.ws.close(); } catch (e) {} }
  mpCleanup();
  hideOverlay('endOverlay');
  hideOverlay('pauseOverlay');
  hideOverlay('mpConnectOverlay');
  hideOverlay('mpLobbyOverlay');
  document.getElementById('mpEndScores').style.display = 'none';
  if (lastWave !== null) {
    document.getElementById('msWave').textContent = lastWave;
    document.getElementById('msKills').textContent = lastKills;
    document.getElementById('menuStatsRow').style.display = 'flex';
  }
  showOverlay('menuOverlay');
  updateMenuRecords();
  startMenuMusic();
}

function updateMenuRecords() {
  const s = JSON.parse(localStorage.getItem('sdHighScore') || '{}');
  const el = document.getElementById('menuRecords');
  if (!el) return;
  el.style.display = 'flex';
  document.getElementById('recWave').textContent = s.bestWave || 0;
  document.getElementById('recKills').textContent = s.bestKills || 0;
  document.getElementById('recLevel').textContent = s.bestLevel || 0;

  const shop = JSON.parse(localStorage.getItem('sdShop') || '{}');
  const dEl = document.getElementById('menuDiariteVal');
  if (dEl) dEl.textContent = shop.diarite || 0;
}

const LB_URL = 'http://localhost:5000';

function fetchLeaderboard() {
  fetch(LB_URL + '/scores')
    .then(r => r.json())
    .then(scores => {
      const rows = document.getElementById('lbRows');
      if (!scores.length) {
        rows.innerHTML = '<div class="lb-loading">NO SCORES YET</div>';
        return;
      }
      rows.innerHTML = scores.map((s, i) => `
        <div class="lb-row">
          <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i+1)}</span>
          <span class="lb-name">${s.name}</span>
          <span class="lb-kills">${s.kills}k</span>
        </div>
      `).join('');
    })
    .catch(() => {
      document.getElementById('lbRows').innerHTML = 
        '<div class="lb-loading">OFFLINE</div>';
    });
}

function submitScore(name, kills, wave, level) {
  fetch(LB_URL + '/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kills, wave, level })
  }).then(() => fetchLeaderboard()).catch(() => {});
}

// ========== SETTINGS ==========
document.getElementById('musicVol').addEventListener('input', function () {
  musicVol = this.value / 100;
  document.getElementById('musicVolVal').textContent = this.value;
  const bgm = document.getElementById('bgMusic');
  if (bgm) bgm.volume = musicVol;
});
document.getElementById('sfxVol').addEventListener('input', function () {
  sfxVol = this.value / 100;
  document.getElementById('sfxVolVal').textContent = this.value;
  if (sShoot) sShoot.volume = sfxVol;
  if (sHit) sHit.volume = sfxVol;
});
document.querySelectorAll('.diff-btn[data-diff]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn[data-diff]').forEach(b => b.classList.remove('diff-btn--active'));
    btn.classList.add('diff-btn--active');
    difficulty = btn.dataset.diff;
  });
});

// ========== MULTIPLAYER UI ==========
document.getElementById('multiplayerBtn').onclick = () => {
  hideOverlay('menuOverlay');
  showOverlay('mpConnectOverlay');
  mpSetStatus('Enter the server IP shown in PowerShell', 'info');
  document.getElementById('mpConnectBtn').disabled = false;
};

document.getElementById('mpConnectBtn').onclick = mpConnect;

document.getElementById('mpIpInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') mpConnect();
});

document.getElementById('mpBackBtn').onclick = () => {
  if (mp.ws) { try { mp.ws.close(); } catch (e) {} }
  mpCleanup();
  hideOverlay('mpConnectOverlay');
  showOverlay('menuOverlay');
};

document.getElementById('mpLobbyBackBtn').onclick = () => {
  if (mp.ws) { try { mp.ws.close(); } catch (e) {} }
  mpCleanup();
  hideOverlay('mpLobbyOverlay');
  showOverlay('menuOverlay');
};

document.getElementById('mpStartBtn').onclick = () => {
  if (!mp.isHost) return;
  mpSend({ type: 'startGame', difficulty: mp.mpDiff });
};

document.querySelectorAll('[data-mdiff]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mdiff]').forEach(b => b.classList.remove('diff-btn--active'));
    btn.classList.add('diff-btn--active');
    mp.mpDiff = btn.dataset.mdiff;
    mpSend({ type: 'difficulty', difficulty: mp.mpDiff });
  });
});

// ========== MAIN UI BUTTONS ==========
document.getElementById('startBtn').onclick = startGame;
document.getElementById('replayBtn').onclick = () => {
  if (mp.ws && mp.ws.readyState === WebSocket.OPEN) {
    hideOverlay('endOverlay');
    showOverlay('mpLobbyOverlay');
    document.getElementById('mpEndScores').style.display = 'none';
    mp.active = false;
  } else {
    startGame();
  }
};
document.getElementById('menuBtn').onclick = goToMenu;
document.getElementById('resumeBtn').onclick = resumeGame;
document.getElementById('pauseBtn').onclick = pauseGame;
document.getElementById('quitBtn').onclick = () => {
  lastWave = wave;
  lastKills = kills;
  hideOverlay('pauseOverlay');
  goToMenu();
};

// ========== FIRE MODE ==========
function setFireMode(mode) {
  fireMode = mode;
  const btn = document.getElementById('fireModeBtn');
  if (mode === 'auto') {
    btn.textContent = '🎯 AUTO';
    btn.classList.remove('manual-mode');
    document.getElementById('gameContainer').classList.remove('manual-mode');
  } else {
    btn.textContent = '🖱 MANUAL';
    btn.classList.add('manual-mode');
    document.getElementById('gameContainer').classList.add('manual-mode');
  }
  document.querySelectorAll('[data-fire]').forEach(b => {
    b.classList.toggle('diff-btn--active', b.dataset.fire === mode);
  });
  if (state === 'playing' && player) {
    addFloatingText(player.x, player.y - 50,
      mode === 'auto' ? 'AUTO FIRE' : 'MANUAL FIRE', '#fbbf24');
  }
}

document.getElementById('fireModeBtn').onclick = () => {
  setFireMode(fireMode === 'auto' ? 'manual' : 'auto');
};

document.querySelectorAll('.diff-btn[data-fire]').forEach(btn => {
  btn.addEventListener('click', () => setFireMode(btn.dataset.fire));
});

// ========== MOUSE TRACKING ==========
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) mouseDown = true;
});
canvas.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
});
canvas.addEventListener('mouseleave', () => {
  mouseDown = false;
});

// ========== KEYBOARD ==========
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (e.key === 'f' || e.key === 'F') {
    if (state === 'playing' || state === 'paused') {
      setFireMode(fireMode === 'auto' ? 'manual' : 'auto');
    }
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// ========== MOBILE JOYSTICK ==========
function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    || window.innerWidth <= 768;
}

const joystick = {
  active: false,
  touchId: null,
  baseX: 0,
  baseY: 0,
  tipX: 0,
  tipY: 0,
  dx: 0,
  dy: 0,
  maxRadius: 55,
};

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!isMobile()) return;
  for (const touch of e.changedTouches) {
    if (touch.clientX < window.innerWidth * 0.6 && !joystick.active) {
      joystick.active = true;
      joystick.touchId = touch.identifier;
      joystick.baseX = touch.clientX;
      joystick.baseY = touch.clientY;
      joystick.tipX = touch.clientX;
      joystick.tipY = touch.clientY;
      joystick.dx = 0;
      joystick.dy = 0;
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!isMobile()) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystick.touchId) {
      const dx = touch.clientX - joystick.baseX;
      const dy = touch.clientY - joystick.baseY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, joystick.maxRadius);
      const angle = Math.atan2(dy, dx);
      joystick.tipX = joystick.baseX + Math.cos(angle) * clamped;
      joystick.tipY = joystick.baseY + Math.sin(angle) * clamped;
      joystick.dx = dx / joystick.maxRadius;
      joystick.dy = dy / joystick.maxRadius;
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!isMobile()) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystick.touchId) {
      joystick.active = false;
      joystick.touchId = null;
      joystick.dx = 0;
      joystick.dy = 0;
    }
  }
}, { passive: false });

function drawJoystick() {
  if (!isMobile() || state !== 'playing') return;
  if (!joystick.active) {
    const hintX = window.innerWidth * 0.18;
    const hintY = window.innerHeight * 0.78;
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hintX, hintY, joystick.maxRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const bx = (joystick.baseX - rect.left) * scaleX;
  const by = (joystick.baseY - rect.top) * scaleY;
  const tx = (joystick.tipX - rect.left) * scaleX;
  const ty = (joystick.tipY - rect.top) * scaleY;
  const maxR = joystick.maxRadius * scaleX;

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bx, by, maxR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(bx, by, maxR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#60a5fa';
  ctx.shadowColor = '#60a5fa';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(tx, ty, maxR * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Patch render to include joystick
const originalRender = render;
render = function() {
  originalRender();
  if (isMobile()) drawJoystick();
};

// ========== INTRO SCREEN ==========
(function setupIntro() {
  const intro = document.getElementById('introScreen');
  if (!intro) return;

  let dismissed = false;

  function dismissIntro() {
    if (dismissed) return;
    dismissed = true;
    intro.style.opacity = '0';
    setTimeout(() => {
      intro.remove();
      startMenuBg();
      updateMenuRecords();
      startMenuMusic();
    }, 1000);
  }

  // Auto dismiss after 5 seconds
  setTimeout(dismissIntro, 5000);

  // Dismiss on key press or click
  document.addEventListener('keydown', dismissIntro, { once: true });
  document.addEventListener('click', dismissIntro, { once: true });
  document.addEventListener('touchstart', dismissIntro, { once: true });
})();

startMenuBg();
updateMenuRecords();

// ══════════════════════════════════════════════════════════════
// MOBILE PATCH — paste this at the VERY END of game.js
// (after the last line: updateMenuRecords(); )
// ══════════════════════════════════════════════════════════════

// ── 1. Detect mobile properly (includes iPads in landscape) ──
function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    || window.innerWidth <= 900
    || ('ontouchstart' in window);
}

// ── 2. Better joystick that tracks canvas scale ──
// Override the old joystick object
Object.assign(joystick, {
  active: false,
  touchId: null,
  baseX: 0, baseY: 0,
  tipX: 0,  tipY: 0,
  dx: 0,    dy: 0,
  maxRadius: 70,
});

// Remove old touch listeners and re-add improved ones
// (We re-attach to the document so they work even if canvas is rescaled)
function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  // Scale from CSS pixels to canvas pixels
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top)  * scaleY,
    clientX, clientY,
  };
}

// Use the gameContainer so touches outside the canvas area are caught
const gc = document.getElementById('gameContainer');

gc.addEventListener('touchstart', function(e) {
  e.preventDefault();
  if (!isMobile()) return;
  if (state !== 'playing') return;

  for (const touch of e.changedTouches) {
    // Left 55% of screen = joystick zone
    if (touch.clientX < window.innerWidth * 0.55 && !joystick.active) {
      joystick.active  = true;
      joystick.touchId = touch.identifier;
      joystick.baseX   = touch.clientX;
      joystick.baseY   = touch.clientY;
      joystick.tipX    = touch.clientX;
      joystick.tipY    = touch.clientY;
      joystick.dx = 0;
      joystick.dy = 0;
    }
  }
}, { passive: false });

gc.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (!isMobile()) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystick.touchId) {
      const dx   = touch.clientX - joystick.baseX;
      const dy   = touch.clientY - joystick.baseY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, joystick.maxRadius);
      const angle = Math.atan2(dy, dx);
      joystick.tipX = joystick.baseX + Math.cos(angle) * clamped;
      joystick.tipY = joystick.baseY + Math.sin(angle) * clamped;
      joystick.dx   = Math.max(-1, Math.min(1, dx / joystick.maxRadius));
      joystick.dy   = Math.max(-1, Math.min(1, dy / joystick.maxRadius));
    }
  }
}, { passive: false });

gc.addEventListener('touchend', function(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystick.touchId) {
      joystick.active  = false;
      joystick.touchId = null;
      joystick.dx = 0;
      joystick.dy = 0;
      keys['a'] = false; keys['d'] = false;
      keys['w'] = false; keys['s'] = false;
    }
  }
}, { passive: false });

gc.addEventListener('touchcancel', function(e) {
  e.preventDefault();
  joystick.active  = false;
  joystick.touchId = null;
  joystick.dx = 0; joystick.dy = 0;
  keys['a'] = false; keys['d'] = false;
  keys['w'] = false; keys['s'] = false;
}, { passive: false });

// ── 3. Better joystick drawing (uses CSS pixel coords, mapped to canvas) ──
function drawJoystickMobile() {
  if (!isMobile() || state !== 'playing') return;

  const rect    = canvas.getBoundingClientRect();
  const scaleX  = canvas.width  / rect.width;
  const scaleY  = canvas.height / rect.height;
  const maxR    = joystick.maxRadius * scaleX;

  if (!joystick.active) {
    // Show faint hint circle at bottom-left
    const hintX = canvas.width  * 0.18;
    const hintY = canvas.height * 0.80;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(hintX, hintY, maxR * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle   = '#60a5fa';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  const bx = (joystick.baseX - rect.left) * scaleX;
  const by = (joystick.baseY - rect.top)  * scaleY;
  const tx = (joystick.tipX  - rect.left) * scaleX;
  const ty = (joystick.tipY  - rect.top)  * scaleY;

  ctx.save();

  // Outer ring
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(bx, by, maxR, 0, Math.PI * 2);
  ctx.stroke();

  // Fill
  ctx.globalAlpha = 0.07;
  ctx.fillStyle   = '#60a5fa';
  ctx.beginPath();
  ctx.arc(bx, by, maxR, 0, Math.PI * 2);
  ctx.fill();

  // Direction line
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  // Thumb
  ctx.globalAlpha = 0.65;
  ctx.fillStyle   = '#60a5fa';
  ctx.shadowColor = '#60a5fa';
  ctx.shadowBlur  = 16;
  ctx.beginPath();
  ctx.arc(tx, ty, maxR * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;

  ctx.restore();
}

// ── 4. Override the old drawJoystick (keep same name so render() calls it) ──
// The original drawJoystick is already patched above via the render override.
// Now override at the global level:
window.drawJoystick = drawJoystickMobile;

// ── 5. Force auto-fire on mobile (no manual aim) ──
const _origStartGame = window.startGame;
window.startGame = function() {
  _origStartGame();
  if (isMobile()) {
    setFireMode('auto');
  }
};

// ── 6. On mobile, always force auto-fire so touches don't need to aim ──
const _origGameLoop = window.gameLoop;
// Wrap movement to use joystick properly
// (The existing gameLoop already reads joystick.dx/dy via keys[], 
//  but we need to ensure the key mapping runs first)

// ── 7. Show/hide mobile controls based on game state ──
function updateMobileUI() {
  const mc = document.getElementById('mobileControls');
  if (!mc) return;
  if (isMobile()) {
    mc.style.display = (state === 'playing' || state === 'paused') ? 'block' : 'none';
  }
}

// Patch showOverlay / hideOverlay to update mobile UI
const _origShow = window.showOverlay;
const _origHide = window.hideOverlay;
window.showOverlay = function(id) {
  _origShow(id);
  updateMobileUI();
};
window.hideOverlay = function(id) {
  _origHide(id);
  updateMobileUI();
};

// ── 8. Fix iOS audio unlock (required on mobile browsers) ──
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const silentBuf = new AudioContext();
  const buf = silentBuf.createBuffer(1, 1, 22050);
  const src = silentBuf.createBufferSource();
  src.buffer = buf;
  src.connect(silentBuf.destination);
  src.start(0);
  // Also try to resume bgMusic context
  const bgm = document.getElementById('bgMusic');
  if (bgm) bgm.play().catch(() => {});
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('touchend',   unlockAudio, { once: true });

// ── 9. Prevent iOS rubber-band scrolling on the whole page ──
document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

console.log('[Mobile patch loaded] isMobile:', isMobile());

// Migrate old save data that's missing characters key
(function migrateSaveData() {
  try {
    const raw = localStorage.getItem('sdShop');
    if (raw) {
      const s = JSON.parse(raw);
      let dirty = false;
      if (!s.characters) { s.characters = { soldier: true }; dirty = true; }
      if (!s.characters.soldier) { s.characters.soldier = true; dirty = true; }
      if (!s.equippedCharacter) { s.equippedCharacter = 'soldier'; dirty = true; }
      if (dirty) localStorage.setItem('sdShop', JSON.stringify(s));
    }
  } catch(e) {}
})();

// Initialize character selector
// Always sync from shop state first, then localStorage as fallback
const _shopStateInit = loadShopState();
if (_shopStateInit.equippedCharacter && CHARACTERS[_shopStateInit.equippedCharacter]) {
  currentCharacter = _shopStateInit.equippedCharacter;
} else {
  const savedChar = localStorage.getItem('selectedCharacter');
  if (savedChar && CHARACTERS[savedChar]) {
    currentCharacter = savedChar;
  }
}
renderCharSelector();

function showToast(msg) {
  // Remove any existing toast
  const existing = document.getElementById('gameToast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'gameToast';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(8,14,26,0.97);
    border: 1px solid rgba(248,113,113,0.5);
    color: #f87171;
    font-family: 'Orbitron', monospace;
    font-size: 12px;
    letter-spacing: 2px;
    padding: 12px 24px;
    border-radius: 6px;
    z-index: 9999;
    pointer-events: none;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function showAchievementsPanel() {
  const existing = document.getElementById('achPanel');
  if (existing) { existing.remove(); return; }

  const unlocked = loadAchievements();
  const total = ACHIEVEMENTS.length;
  const done = Object.keys(unlocked).length;

  const el = document.createElement('div');
  el.id = 'achPanel';
  el.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    background:rgba(8,12,22,0.99); border:1px solid rgba(251,191,36,0.4);
    border-radius:12px; padding:24px; min-width:420px; max-width:92vw;
    max-height:80vh; overflow-y:auto; z-index:9999;
    font-family:'Share Tech Mono',monospace;
  `;

  const secretDone = isSecretWeaponUnlocked();

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-family:'Orbitron',monospace;font-size:14px;font-weight:800;color:#fbbf24;letter-spacing:3px;">ACHIEVEMENTS</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);">${done}/${total}</div>
      <button onclick="document.getElementById('achPanel').remove()" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);border-radius:4px;padding:4px 10px;cursor:pointer;font-family:'Share Tech Mono',monospace;">✕</button>
    </div>
    <div style="height:4px;background:rgba(255,255,255,0.07);border-radius:2px;margin-bottom:16px;">
      <div style="height:100%;width:${(done/total)*100}%;background:#fbbf24;border-radius:2px;transition:width 0.3s;"></div>
    </div>
    ${ACHIEVEMENTS.map(a => {
      const got = !!unlocked[a.id];
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;margin-bottom:6px;
        background:${got ? 'rgba(251,191,36,0.07)' : 'rgba(255,255,255,0.02)'};
        border:1px solid ${got ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'};border-radius:7px;
        opacity:${got ? '1' : '0.5'};">
        <span style="font-size:22px">${got ? a.icon : '🔒'}</span>
        <div style="flex:1">
          <div style="font-family:'Orbitron',monospace;font-size:10px;font-weight:700;color:${got ? '#fbbf24' : '#aaa'};letter-spacing:1px;">${a.name}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:2px;">${a.desc}</div>
        </div>
        <div style="font-family:'Orbitron',monospace;font-size:11px;font-weight:700;color:#a78bfa;">+${a.reward}◆</div>
        ${got ? '<span style="color:#34d399;font-size:16px">✓</span>' : ''}
      </div>`;
    }).join('')}
    <div style="margin-top:12px;padding:12px;border:1px solid ${secretDone ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'};border-radius:8px;
      background:${secretDone ? 'rgba(167,139,250,0.1)' : 'rgba(0,0,0,0.3)'};text-align:center;">
      <div style="font-size:24px;margin-bottom:6px;">${secretDone ? '🔮' : '❓'}</div>
      <div style="font-family:'Orbitron',monospace;font-size:11px;color:${secretDone ? '#a78bfa' : 'rgba(255,255,255,0.25)'};letter-spacing:2px;">
        ${secretDone ? 'PLASMA CANNON — UNLOCKED' : 'SECRET WEAPON — Complete all achievements'}
      </div>
    </div>
  `;

  document.body.appendChild(el);
}

// ========== MENU LIVELINESS – OUTSIDE THE GAME BOX ==========
(function setupLivelyMenu() {
  let active = false;
  let particleInterval = null;
  let countersIntervals = [];
  let particleContainer = null;
  let livePanel = null;

function clearMenuEnhancements() {
    if (particleContainer) particleContainer.remove();
    if (livePanel) livePanel.remove();
    // Remove community weapon
    const cw = document.querySelector('.community-weapon');
    if (cw) cw.remove();
    // Remove lobby bar
    const lb = document.querySelector('.lobby-bar');
    if (lb) lb.remove();
    // Remove chat feed
    const cf = document.querySelector('.live-chat-feed');
    if (cf) cf.remove();
    // Remove kps graph
    const kg = document.querySelector('.kps-graph');
    if (kg) kg.remove();
    // Remove mouse glow
    const mg = document.querySelector('.mouse-glow');
    if (mg) mg.remove();
    countersIntervals.forEach(clearInterval);
    countersIntervals = [];
    if (particleInterval) clearInterval(particleInterval);
    document.body.classList.remove('menu-active');
    active = false;
    particleContainer = null;
    livePanel = null;
  }

  function initMenuEnhancements() {
    if (active) return;
    const menu = document.getElementById('menuOverlay');
    if (!menu || !menu.classList.contains('active')) return;

    // ----- Rotating "Community Choice" weapon -----
const communityWeapons = [
  { icon: "🔫", name: "Basic Rifle",      votes: "10.2k" },
  { icon: "🌊", name: "Spread Shot",      votes: "8.7k"  },
  { icon: "🎯", name: "Sniper Rifle",     votes: "6.5k"  },
  { icon: "🚀", name: "Rocket Launcher",  votes: "12.1k" },
  { icon: "🔮", name: "Orbit Shield",     votes: "5.4k"  },
  { icon: "🔴", name: "Laser Beam",       votes: "9.3k"  },
  { icon: "⚡", name: "Swift Boots",      votes: "7.1k"  },
  { icon: "🔥", name: "Power Strike",     votes: "11.4k" },
  { icon: "💠", name: "Big Bullet",       votes: "4.8k"  },
  { icon: "💚", name: "Regeneration",     votes: "6.2k"  },
  { icon: "❤️",  name: "Fortify",          votes: "8.9k"  },
  { icon: "✨", name: "Multi-Shot",       votes: "13.1k" },
  { icon: "🌀", name: "Rapid Fire",       votes: "9.7k"  },
  { icon: "☠️",  name: "Plasma Cannon",   votes: "15.3k" },
  { icon: "🗡️", name: "Ninja Blades",    votes: "7.6k"  },
  { icon: "🛡️", name: "Heavy Armor",     votes: "5.9k"  },
  { icon: "💉", name: "Medic Syringe",    votes: "4.3k"  },
  { icon: "🔪", name: "Assassin Blades",  votes: "8.1k"  },
];

const weaponContainer = document.createElement('div');
weaponContainer.className = 'community-weapon';
weaponContainer.innerHTML = `
  <span class="community-label">COMMUNITY PICK</span>
  <span class="community-weapon-icon" id="communityIcon">🔫</span>
  <span id="communityName">Basic Rifle</span>
  <span id="communityVotes" style="color:#fbbf24;">10.2k votes</span>
`;
document.body.appendChild(weaponContainer);

let weaponIdx = 0;

function rotateCommunityWeapon() {
  weaponIdx = (weaponIdx + 1) % communityWeapons.length;
  const w = communityWeapons[weaponIdx];

  // Use querySelector on weaponContainer instead of getElementById
  const iconSpan = weaponContainer.querySelector('#communityIcon');
  const nameSpan = weaponContainer.querySelector('#communityName');
  const voteSpan = weaponContainer.querySelector('#communityVotes');
  if (!iconSpan || !nameSpan || !voteSpan) return;

  weaponContainer.style.transition = 'opacity 0.2s';
  weaponContainer.style.opacity = '0';
  setTimeout(() => {
    iconSpan.innerText = w.icon;
    nameSpan.innerText = w.name;
    voteSpan.innerText = w.votes + ' votes';
    weaponContainer.style.opacity = '1';
  }, 200);
}

// Shuffle the weapons array so order is random every time menu opens
communityWeapons.sort(() => Math.random() - 0.5);

// Rotate immediately once after 2 seconds
setTimeout(() => rotateCommunityWeapon(), 2000);

// Then rotate every 10 seconds
countersIntervals.push(setInterval(() => {
  if (!active) return;
  rotateCommunityWeapon();
}, 10000));

    // ----- Voice line popups -----
const voiceLines = [
  "⚠️ ENEMY WAVE INBOUND!",
  "💀 ELITE DETECTED!",
  "🎯 HEADSHOT! +50 XP",
  "🔥 10 KILL STREAK!",
  "🛡️ SHIELD ACTIVATED!",
  "🚀 ROCKET LAUNCHER AVAILABLE!",
  "💊 MEDKIT DROPPED!",
  "🏆 NEW HIGH SCORE!",
  "⚡ COMBO x15!",
  "🎖️ LEVEL UP!",
  "💎 DIARITE COLLECTED!",
  "👑 BOSS SPAWNING!",
  "🌀 ORBIT SHIELD READY!",
  "🔫 SNIPER RIFLE LOADED!"
];

function showVoiceLine() {
  const line = voiceLines[Math.floor(Math.random() * voiceLines.length)];
  const popup = document.createElement('div');
  popup.className = 'voice-popup';
  popup.innerText = line;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}

// Show a random voice line every 15–25 seconds
countersIntervals.push(setInterval(() => {
  if (!active) return;
  showVoiceLine();
}, Math.random() * 10000 + 15000));

  const graph = document.createElement('div');
graph.className = 'kps-graph';
graph.innerHTML = '<span style="margin-right:6px;">KPS</span>';
document.body.appendChild(graph);
let bars = [];
for (let i=0;i<10;i++) {
  let bar = document.createElement('div');
  bar.className = 'kps-bar';
  bar.style.height = '0px';
  graph.appendChild(bar);
  bars.push(bar);
}
setInterval(() => {
  let val = Math.random() * 40 + 5;
  bars.push(bars.shift());
  bars.forEach((b, idx) => {
    b.style.height = (Math.random() * 20 + 5) + 'px';
  });
}, 800);

    const fakeNames = ['Rogue', 'Vanguard', 'Phantom', 'Valkyrie', 'Titan', 'Wraith', 'Mirage'];
function notifyJoin() {
  const name = fakeNames[Math.floor(Math.random() * fakeNames.length)] + Math.floor(Math.random() * 100);
  const notif = document.createElement('div');
  notif.className = 'join-notify';
  notif.innerHTML = `⚡ ${name} joined the lobby`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}
countersIntervals.push(setInterval(() => {
  if (!active) return;
  notifyJoin();
}, 7000));

    function spawnCrystal() {
  const crystal = document.createElement('div');
  crystal.className = 'diarite-crystal';
  crystal.style.left = Math.random() * 100 + '%';
  crystal.style.bottom = '-20px';
  crystal.style.animationDuration = Math.random() * 5 + 5 + 's';
  crystal.style.animationDelay = Math.random() * 2 + 's';
  document.body.appendChild(crystal);
  setTimeout(() => crystal.remove(), 10000);
}
countersIntervals.push(setInterval(() => {
  if (!active) return;
  for (let i = 0; i < 2; i++) spawnCrystal();
}, 3000));

const lobbyBar = document.createElement('div');
lobbyBar.className = 'lobby-bar';
lobbyBar.innerHTML = `
  <div class="lobby-stat"><span class="dot"></span><span>IN LOBBY: <span id="lobbyCount">342</span></span></div>
  <div class="lobby-stat">🕒 AVG WAIT: <span id="lobbyWait">12</span>s</div>
  <div class="lobby-stat">⚔️ GAMES ACTIVE: <span id="lobbyGames">47</span></div>
`;
document.body.appendChild(lobbyBar);

let lobbyPlayers = 342;
let lobbyWait = 12;
let lobbyGames = 47;

// In lobby count
countersIntervals.push(setInterval(() => {
  if (!active) return;
  lobbyPlayers = 320 + Math.floor(Math.random() * 80);
  const span = lobbyBar.querySelector('#lobbyCount');
  if (span) span.innerText = lobbyPlayers;
}, 3000));

// Avg wait time
countersIntervals.push(setInterval(() => {
  if (!active) return;
  const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
  lobbyWait = Math.max(5, Math.min(30, lobbyWait + change));
  const span = lobbyBar.querySelector('#lobbyWait');
  if (span) {
    span.innerText = lobbyWait;
    span.style.color = lobbyWait > 20 ? '#f87171' : lobbyWait > 12 ? '#fbbf24' : '#34d399';
  }
}, 4000));

// Games active
countersIntervals.push(setInterval(() => {
  if (!active) return;
  const change = Math.floor(Math.random() * 7) - 3; // -3 to +3
  lobbyGames = Math.max(20, Math.min(120, lobbyGames + change));
  const span = lobbyBar.querySelector('#lobbyGames');
  if (span) span.innerText = lobbyGames;
}, 5000));

    const chatBox = document.createElement('div');
chatBox.className = 'live-chat-feed';
chatBox.innerHTML = '<div style="color:#60a5fa; margin-bottom:6px;">⚡ COMBAT FEED</div>';
document.body.appendChild(chatBox);

const messages = [
  '[Soldier] Killed 5 enemies in 10s!',
  '[Ninja] 🔥 15 kill streak!',
  '[Heavy] Tanked a boss hit!',
  '[Assassin] Backstabbed an Elite',
  '[Medic] Healed 200 HP for squad',
  '⚠ Wave 8 incoming!',
  '🏆 New high score: Wave 14'
];
let idx = 0;
const feedInterval = setInterval(() => {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.textContent = messages[idx % messages.length];
  chatBox.appendChild(msgDiv);
  idx++;
  setTimeout(() => msgDiv.style.opacity = '0', 4500);
  setTimeout(() => msgDiv.remove(), 5500);
  // keep only last 5 messages
  while (chatBox.children.length > 6) chatBox.removeChild(chatBox.children[1]);
}, 6000);
countersIntervals.push(feedInterval);

    const glow = document.createElement('div');
glow.className = 'mouse-glow';
document.body.appendChild(glow);
document.addEventListener('mousemove', (e) => {
  if (!active) return;
  glow.style.left = e.clientX + 'px';
  glow.style.top = e.clientY + 'px';
});

    active = true;
    document.body.classList.add('menu-active');

    // ---- 1. Floating particles container on body ----
    particleContainer = document.createElement('div');
    particleContainer.className = 'menu-particles';
    document.body.appendChild(particleContainer);

    function createParticle() {
      if (!particleContainer) return;
      const p = document.createElement('div');
      p.className = 'menu-particle';
      const size = Math.random() * 4 + 2;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      p.style.animationDuration = Math.random() * 3 + 2 + 's';
      p.style.animationDelay = Math.random() * 2 + 's';
      p.style.background = `rgba(96, 165, 250, ${Math.random() * 0.5 + 0.2})`;
      particleContainer.appendChild(p);
      setTimeout(() => p.remove(), 5000);
    }

    particleInterval = setInterval(() => {
      if (!active) return;
      for (let i = 0; i < 3; i++) createParticle();
    }, 400);

    // ---- 2. Live panel on body (bottom‑right) ----
    livePanel = document.createElement('div');
    livePanel.className = 'menu-live-panel';
    livePanel.innerHTML = `
      <div class="menu-live-stats">
        <div class="menu-live-stat"><span>🌍 GLOBAL KILLS</span><span id="menuGlobalKills">0</span></div>
        <div class="menu-live-stat"><span>⚡ ACTIVE OPERATIVES</span><span id="menuActiveOps">0</span></div>
        <div class="menu-live-stat"><span>🏆 BEST WAVE</span><span id="menuBestWave">0</span></div>
      </div>
      <div class="menu-spotlight">
        <div class="menu-spotlight-icon" id="menuSpotIcon">🔫</div>
        <div class="menu-spotlight-text">
          <span class="menu-spotlight-label">FEATURED WEAPON</span>
          <span class="menu-spotlight-value" id="menuSpotWeapon">Basic Rifle</span>
        </div>
      </div>
      <div class="menu-tip" id="menuTip">💡 Tip: Keep moving – standing still is death</div>
    `;
    document.body.appendChild(livePanel);

    // ---- 3. Fake counters (same as before) ----
    let globalKills = 18740;
    let activeOps = 1240;
    let bestWave = 12;

    countersIntervals.push(setInterval(() => {
      if (!active) return;
      globalKills += Math.floor(Math.random() * 23) + 5;
      const el = document.getElementById('menuGlobalKills');
      if (el) el.innerText = globalKills.toLocaleString();
    }, 1500));

    countersIntervals.push(setInterval(() => {
      if (!active) return;
      activeOps = 1100 + Math.floor(Math.random() * 700);
      const el = document.getElementById('menuActiveOps');
      if (el) el.innerText = activeOps.toLocaleString();
    }, 2000));

    countersIntervals.push(setInterval(() => {
      if (!active) return;
      bestWave += Math.random() < 0.3 ? 1 : 0;
      const el = document.getElementById('menuBestWave');
      if (el) el.innerText = bestWave;
    }, 4000));

    // Rotating weapon spotlight
    const weapons = [
      { icon: '🔫', name: 'Basic Rifle' },
      { icon: '🌊', name: 'Spread Shot' },
      { icon: '🎯', name: 'Sniper Rifle' },
      { icon: '🚀', name: 'Rocket Launcher' },
      { icon: '🔮', name: 'Orbit Shield' },
      { icon: '🔴', name: 'Laser Beam' }
    ];
    let wIdx = 0;
    countersIntervals.push(setInterval(() => {
      if (!active) return;
      wIdx = (wIdx + 1) % weapons.length;
      const iconSpan = document.getElementById('menuSpotIcon');
      const nameSpan = document.getElementById('menuSpotWeapon');
      if (iconSpan && nameSpan) {
        iconSpan.innerText = weapons[wIdx].icon;
        nameSpan.innerText = weapons[wIdx].name;
        iconSpan.style.transform = 'scale(1.2)';
        setTimeout(() => { if (iconSpan) iconSpan.style.transform = ''; }, 200);
      }
    }, 3200));

    const tips = [
      '💡 Kill Splitters first – they multiply!',
      '⚡ Level up before the boss wave (every ~60s)',
      '🎯 Multi‑Shot + Spread Shot = bullet hell',
      '🛡️ Orbit Shield lets you tank while moving',
      '❤️ HP pickups heal 20 HP – don’t waste them',
      '🔥 Keep the combo alive within 2.5 seconds'
    ];
    let tipIdx = 0;
    countersIntervals.push(setInterval(() => {
      if (!active) return;
      tipIdx = (tipIdx + 1) % tips.length;
      const tipEl = document.getElementById('menuTip');
      if (tipEl) tipEl.innerText = tips[tipIdx];
    }, 5000));
  }

  // Watch for menu active/inactive
  function checkMenu() {
    const menu = document.getElementById('menuOverlay');
    if (!menu) return;
    if (menu.classList.contains('active')) {
      initMenuEnhancements();
    } else {
      clearMenuEnhancements();
    }
  }

  const origShow = window.showOverlay;
  const origHide = window.hideOverlay;
  window.showOverlay = function(id) {
    origShow(id);
    if (id === 'menuOverlay') checkMenu();
  };
  window.hideOverlay = function(id) {
    origHide(id);
    if (id === 'menuOverlay') checkMenu();
  };

const origStartGame = window.startGame;
window.startGame = function() {
  clearMenuEnhancements();
  // Remove community weapon widget if it exists
  const cw = document.querySelector('.community-weapon');
  if (cw) cw.remove();
  origStartGame();
};

  checkMenu();
})();