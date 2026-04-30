/* ──────────────────────────────────────────────────────────
   ORBITAL BARRAGE · server.js
   Authoritative LAN multiplayer game server
   Aligned with game.js world size, spawning, and logic.
   Usage:
     npm install ws
     node server.js
─────────────────────────────────────────────────────────── */

const WebSocket = require('ws');
const os        = require('os');

const PORT        = 8080;
const MAX_PLAYERS = 4;
const TICK_MS     = 1000 / 60;   // 60 Hz simulation
const SEND_MS     = 50;           // 20 Hz state broadcast

// ── World size — MATCHES game.js exactly ────────────────
const CANVAS_W = 1040;
const CANVAS_H = 800;
const WORLD_W  = CANVAS_W * 3;   // 3120
const WORLD_H  = CANVAS_H * 3;   // 2400

// ── Print LAN IP ─────────────────────────────────────────
const nets = os.networkInterfaces();
console.log('\n╔═══════════════════════════════════════════╗');
console.log('║    ORBITAL BARRAGE  ·  MULTIPLAYER SERVER ║');
console.log('╚═══════════════════════════════════════════╝');
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`  LAN IP  ► ${net.address}:${PORT}`);
    }
  }
}
console.log(`  Local   ► localhost:${PORT}`);
console.log(`  World   ► ${WORLD_W} × ${WORLD_H} px`);
console.log('\n  Players: open game.html → Multiplayer → enter IP above\n');

// ── Constants ────────────────────────────────────────────
const PLAYER_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171'];

const DIFF = {
  easy:   { speedMult: 0.75, hpMult: 0.7,  dmgMult: 0.6,  spawnMult: 0.7  },
  normal: { speedMult: 1.0,  hpMult: 1.0,  dmgMult: 1.0,  spawnMult: 1.0  },
  hard:   { speedMult: 1.3,  hpMult: 1.5,  dmgMult: 1.4,  spawnMult: 1.35 },
};

// Diarite reward per enemy type — matches game.js DIARITE_REWARDS
const DIARITE_REWARDS = {
  boss:     50,
  elite:    15,
  shielded: 12,
  splitter: 10,
  standard: 5,
};

const UPGRADES = [
  { id: 'speed',      icon: '⚡', name: 'SWIFT BOOTS',   desc: '+20% move speed'                   },
  { id: 'damage',     icon: '🔥', name: 'POWER STRIKE',  desc: '+50% bullet damage'                },
  { id: 'fireRate',   icon: '🌀', name: 'RAPID FIRE',    desc: '+30% fire rate'                    },
  { id: 'multiShot',  icon: '✨', name: 'MULTI-SHOT',    desc: '+1 extra projectile'               },
  { id: 'bulletSize', icon: '💠', name: 'BIG BULLET',    desc: '+50% bullet size'                  },
  { id: 'hpRegen',    icon: '💚', name: 'REGENERATION',  desc: '+5 HP/sec regen'                   },
  { id: 'maxHp',      icon: '❤️',  name: 'FORTIFY',       desc: '+30 max HP + heal'                 },
  { id: 'wSpread',    icon: '🌊', name: 'SPREAD SHOT',   desc: '5-way spread fire',                weaponUnlock: 'spread'  },
  { id: 'wSniper',    icon: '🎯', name: 'SNIPER',         desc: 'Piercing long-range shot ×3 dmg', weaponUnlock: 'sniper'  },
  { id: 'wLaser',     icon: '🔴', name: 'LASER BEAM',    desc: 'Continuous beam melts enemies',    weaponUnlock: 'laser'   },
  { id: 'wRocket',    icon: '🚀', name: 'ROCKET',         desc: 'Homing rockets that explode',      weaponUnlock: 'rocket'  },
  { id: 'wOrbit',     icon: '🔮', name: 'ORBIT SHIELD',  desc: '4 rotating orbs deal contact dmg', weaponUnlock: 'orbit'   },
];

// ── Game state ───────────────────────────────────────────
let gameState  = 'waiting';   // 'waiting' | 'playing' | 'end'
let difficulty = 'normal';
let players    = {};          // id → player object
let clients    = {};          // id → WebSocket
let hostId     = null;

let enemies       = [];
let projectiles   = [];
let pickups       = [];
let particles     = [];
let floatingTexts = [];

let wave       = 1;
let gameTimer  = 120;
let waveTimer  = 0;
let bossTimer  = 0;
let bossActive = false;

let idCounter = 0;
function genId() { return 'p' + (++idCounter); }

let DT       = TICK_MS / 1000;
let lastTick = Date.now();
let tickInt, sendInt;

// ── Player factory ───────────────────────────────────────
// Players spawn at center of the WORLD — same as game.js initGame()
function createPlayer(id, color, slotIndex) {
  // Spread spawn positions around world center
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  const positions = [
    { x: cx - 120, y: cy - 60 },
    { x: cx + 120, y: cy - 60 },
    { x: cx - 120, y: cy + 60 },
    { x: cx + 120, y: cy + 60 },
  ];
  const pos = positions[slotIndex % 4];
  return {
    id, color,
    x: pos.x, y: pos.y,
    r: 12, speed: 2.4,
    hp: 100, maxHp: 100,
    kills: 0, level: 1,
    xp: 0, xpNext: 20,
    abilities: { speed: 1, damage: 1, fireRate: 1, multiShot: 1, bulletSize: 1, hpRegen: 0 },
    weaponType: 'basic',
    unlockedWeapons: new Set(['basic']),
    shootTimer: 0,
    laserTimer: 0,
    laserAngle: 0,
    orbitBullets: [],
    rockets: [],
    upgrading: false,
    alive: true,
    dx: 0, dy: 0,
  };
}

// ── Utility ──────────────────────────────────────────────
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const id in clients) {
    if (clients[id].readyState === WebSocket.OPEN) clients[id].send(data);
  }
}

function sendTo(playerId, msg) {
  const ws = clients[playerId];
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastLobby() {
  broadcast({
    type: 'lobby',
    count: Object.keys(players).length,
    hostId,
    players: Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, { id, color: p.color }])
    ),
  });
}

function addParticles(x, y, color, n = 6) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      color, life: 1,
      maxLife: 0.4 + Math.random() * 0.5,
    });
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400);
}

function addFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, life: 1, vy: -1 });
  if (floatingTexts.length > 30) floatingTexts.splice(0, floatingTexts.length - 30);
}

function spawnPickup(x, y) {
  if (Math.random() < 0.15) {
    pickups.push({ x, y, r: 7, type: 'hp', color: '#34d399', age: 0 });
  }
}

// ── Enemy helpers ────────────────────────────────────────
function getNearestPlayer(x, y) {
  let best = null, bestDist = Infinity;
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return { player: best, dist: bestDist };
}

function getNearestEnemyForPlayer(player) {
  let nearDist = Infinity, nearAngle = -Math.PI / 2, nearEnemy = null;
  for (const e of enemies) {
    const dx = e.x - player.x, dy = e.y - player.y;
    const d  = Math.hypot(dx, dy);
    if (d < nearDist) { nearDist = d; nearAngle = Math.atan2(dy, dx); nearEnemy = e; }
  }
  return { nearAngle, nearEnemy, nearDist };
}

// ── Upgrades ─────────────────────────────────────────────
function randUpgradesFor(player) {
  const pool = UPGRADES.filter(u => u.weaponUnlock ? !player.unlockedWeapons.has(u.weaponUnlock) : true);
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3)
    .map(u => ({ id: u.id, icon: u.icon, name: u.name, desc: u.desc }));
}

function applyUpgrade(player, upgradeId) {
  const up = UPGRADES.find(u => u.id === upgradeId);
  if (!up) return;
  if (up.weaponUnlock) {
    player.weaponType = up.weaponUnlock;
    player.unlockedWeapons.add(up.weaponUnlock);
    if (up.weaponUnlock === 'orbit' && player.orbitBullets.length === 0) {
      for (let i = 0; i < 4; i++)
        player.orbitBullets.push({ angle: (i / 4) * Math.PI * 2, hitCooldown: {}, x: 0, y: 0 });
    }
    return;
  }
  const a = player.abilities;
  if      (upgradeId === 'speed')      a.speed      *= 1.2;
  else if (upgradeId === 'damage')     a.damage     *= 1.5;
  else if (upgradeId === 'fireRate')   a.fireRate   *= 1.3;
  else if (upgradeId === 'multiShot')  a.multiShot   = Math.min(5, a.multiShot + 1);
  else if (upgradeId === 'bulletSize') a.bulletSize *= 1.5;
  else if (upgradeId === 'hpRegen')    a.hpRegen    += 5;
  else if (upgradeId === 'maxHp')      { player.maxHp += 30; player.hp = Math.min(player.hp + 30, player.maxHp); }
}

// ── Enemy spawning — MATCHES game.js spawnEnemy() ────────
// Enemies spawn from edges of each player's visible area,
// not from fixed canvas edges, to match the scrolling world.
function spawnEnemy(forceType = null) {
  const d = DIFF[difficulty];

  // Pick a random alive player to spawn near (so enemies are always relevant)
  const alivePlayers = Object.values(players).filter(p => p.alive);
  if (alivePlayers.length === 0) return;
  const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

  // Spawn from edges of that player's visible area + margin — mirrors game.js exactly
  const margin = 120;
  const side   = Math.floor(Math.random() * 4);
  let ex, ey;
  if      (side === 0) { ex = target.x - CANVAS_W/2 - margin + Math.random() * (CANVAS_W + margin*2); ey = target.y - CANVAS_H/2 - margin; }
  else if (side === 1) { ex = target.x + CANVAS_W/2 + margin; ey = target.y - CANVAS_H/2 - margin + Math.random() * (CANVAS_H + margin*2); }
  else if (side === 2) { ex = target.x - CANVAS_W/2 - margin + Math.random() * (CANVAS_W + margin*2); ey = target.y + CANVAS_H/2 + margin; }
  else                 { ex = target.x - CANVAS_W/2 - margin; ey = target.y - CANVAS_H/2 - margin + Math.random() * (CANVAS_H + margin*2); }

  // Clamp to world bounds — matches game.js
  ex = Math.max(30, Math.min(WORLD_W - 30, ex));
  ey = Math.max(30, Math.min(WORLD_H - 30, ey));

  if (forceType === 'boss') {
    enemies.push({
      x: ex, y: ey, r: 28, speed: 0.8 * d.speedMult,
      hp: 500 * d.hpMult, maxHp: 500 * d.hpMult,
      color: '#ff4444', xpDrop: 40, dmg: 25 * d.dmgMult,
      type: 'boss', shieldHp: 0, shieldMax: 0,
    });
    bossActive = true;
    addFloatingText(target.x, target.y - 60, '⚠ BOSS INCOMING!', '#ff4444');
    return;
  }

  if (!forceType && wave >= 2 && Math.random() < 0.1) {
    const shHp = 60 * d.hpMult;
    enemies.push({
      x: ex, y: ey, r: 13, speed: 1.1 * d.speedMult,
      hp: 40 * d.hpMult, maxHp: 40 * d.hpMult,
      color: '#38bdf8', xpDrop: 8, dmg: 12 * d.dmgMult,
      type: 'shielded', shieldHp: shHp, shieldMax: shHp,
    });
    return;
  }

  if (!forceType && wave >= 2 && Math.random() < 0.12) {
    enemies.push({
      x: ex, y: ey, r: 14, speed: 1.2 * d.speedMult,
      hp: 45 * d.hpMult, maxHp: 45 * d.hpMult,
      color: '#a78bfa', xpDrop: 7, dmg: 10 * d.dmgMult,
      type: 'splitter', shieldHp: 0, shieldMax: 0,
    });
    return;
  }

  const isElite = wave >= 3 && Math.random() < 0.08;
  const isFast  = Math.random() < 0.2;
  enemies.push({
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
    const ang = Math.random() * Math.PI * 2;
    enemies.push({
      x: e.x + Math.cos(ang) * 12, y: e.y + Math.sin(ang) * 12,
      r: 7, speed: 2.0 * d.speedMult,
      hp: 15 * d.hpMult, maxHp: 15 * d.hpMult,
      color: '#c4b5fd', xpDrop: 3, dmg: 6 * d.dmgMult,
      type: 'standard', shieldHp: 0, shieldMax: 0,
    });
  }
}

// ── Kill handler — adds diarite reward like game.js ──────
function killEnemy(e, killerId) {
  addParticles(e.x, e.y, e.color, 8);
  addFloatingText(e.x, e.y - 10, '+' + e.xpDrop + ' xp', '#818cf8');
  spawnPickup(e.x, e.y);

  if (e.type === 'splitter') spawnSplitterChildren(e);
  if (e.type === 'boss')     bossActive = false;

  // Diarite reward — notify the killing player's client
  const diariteAmt = DIARITE_REWARDS[e.type] || DIARITE_REWARDS.standard;
  if (killerId && clients[killerId]) {
    sendTo(killerId, { type: 'awardDiarite', amount: diariteAmt });
  }

  // XP to killer; if none, split across all alive players
  const alivePlayers = Object.values(players).filter(p => p.alive);
  if (killerId && players[killerId]) {
    const p = players[killerId];
    p.kills++;
    p.xp += e.xpDrop;
    checkLevelUp(p);
  } else if (alivePlayers.length > 0) {
    const share = Math.ceil(e.xpDrop / alivePlayers.length);
    for (const p of alivePlayers) {
      p.xp += share;
      checkLevelUp(p);
    }
  }
}

function checkLevelUp(player) {
  while (player.xp >= player.xpNext) {
    player.xp    -= player.xpNext;
    player.xpNext = Math.floor(player.xpNext * 1.4);
    player.level++;
    player.upgrading = true;
    sendTo(player.id, {
      type: 'upgrade',
      options: randUpgradesFor(player),
      level: player.level,
    });
  }
}

// ── Shooting — mirrors game.js shoot() exactly ───────────
function playerShoot(player) {
  if (!enemies.length) return;
  const { nearAngle, nearEnemy } = getNearestEnemyForPlayer(player);
  const a = player.abilities;

  if (player.weaponType === 'basic') {
    const count  = a.multiShot;
    const spread = 0.15;
    const offset = (count - 1) / 2;
    for (let i = 0; i < count; i++)
      spawnBullet(player, nearAngle + (i - offset) * spread, 7);

  } else if (player.weaponType === 'spread') {
    for (const off of [-0.5, -0.25, 0, 0.25, 0.5])
      spawnBullet(player, nearAngle + off, 7);
    for (let m = 1; m < a.multiShot; m++)
      spawnBullet(player, nearAngle + (Math.random() - 0.5) * 1.2, 7);

  } else if (player.weaponType === 'sniper') {
    spawnBullet(player, nearAngle, 16, 45 * a.damage, true);
    for (let m = 1; m < a.multiShot; m++)
      spawnBullet(player, nearAngle + (Math.random() - 0.5) * 0.1, 16, 45 * a.damage, true);

  } else if (player.weaponType === 'laser') {
    player.laserTimer = 0.18;
    player.laserAngle = nearAngle;
    const cos = Math.cos(nearAngle), sin = Math.sin(nearAngle);
    const dying = [];
    for (const e of enemies) {
      const dx = e.x - player.x, dy = e.y - player.y;
      if (dx * cos + dy * sin < 0) continue;
      if (Math.abs(dx * sin - dy * cos) < e.r + 6 * a.bulletSize) {
        e.hp -= 35 * a.damage * DT * 60;
        addParticles(e.x, e.y, '#f43f5e', 2);
        if (e.hp <= 0) dying.push(e);
      }
    }
    for (const e of dying) killEnemy(e, player.id);
    enemies = enemies.filter(e => e.hp > 0);

  } else if (player.weaponType === 'rocket') {
    if (nearEnemy) {
      player.rockets.push({
        x: player.x, y: player.y, target: nearEnemy,
        vx: Math.cos(nearAngle) * 3, vy: Math.sin(nearAngle) * 3,
        r: 6, dmg: 60 * a.damage, color: '#fb923c',
      });
    }
    for (let m = 1; m < a.multiShot; m++) {
      const off = (Math.random() - 0.5) * 0.6;
      player.rockets.push({
        x: player.x, y: player.y, target: nearEnemy,
        vx: Math.cos(nearAngle + off) * 3, vy: Math.sin(nearAngle + off) * 3,
        r: 6, dmg: 60 * a.damage, color: '#fb923c',
      });
    }

  } else if (player.weaponType === 'orbit') {
    if (player.orbitBullets.length === 0) {
      for (let i = 0; i < 4; i++)
        player.orbitBullets.push({ angle: (i / 4) * Math.PI * 2, hitCooldown: {}, x: 0, y: 0 });
    }
  }
}

function spawnBullet(player, angle, speed, dmg, pierce = false) {
  const a = player.abilities;
  projectiles.push({
    x: player.x, y: player.y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r:   5 * a.bulletSize,
    dmg: dmg !== undefined ? dmg : 15 * a.damage,
    pierce,
    color:   player.weaponType === 'sniper' ? '#fbbf24' : player.color,
    ownerId: player.id,
  });
}

// ── Rockets — mirrors game.js updateRockets() ────────────
// Culls by distance from player (1200px) matching game.js
function updateRockets(player) {
  for (let i = player.rockets.length - 1; i >= 0; i--) {
    const rk = player.rockets[i];

    // Homing
    if (rk.target && rk.target.hp > 0) {
      const dx = rk.target.x - rk.x, dy = rk.target.y - rk.y;
      const d  = Math.hypot(dx, dy) || 1;
      rk.vx += (dx / d) * 0.18; rk.vy += (dy / d) * 0.18;
      const spd = Math.hypot(rk.vx, rk.vy);
      if (spd > 5) { rk.vx = rk.vx / spd * 5; rk.vy = rk.vy / spd * 5; }
    }
    rk.x += rk.vx; rk.y += rk.vy;

    // Cull by distance from player — matches game.js (not canvas edges)
    if (Math.hypot(rk.x - player.x, rk.y - player.y) > 1200) {
      player.rockets.splice(i, 1); continue;
    }

    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (Math.hypot(rk.x - player.x, rk.y - player.y) > 20 &&
          Math.hypot(rk.x - e.x, rk.y - e.y) < e.r + rk.r) {
        // Splash damage in 60px radius
        for (const se of enemies) {
          const sd = Math.hypot(rk.x - se.x, rk.y - se.y);
          if (sd < 60) { se.hp -= rk.dmg * (1 - sd / 80); addParticles(se.x, se.y, '#fb923c', 4); }
        }
        addParticles(rk.x, rk.y, '#fb923c', 18);
        addFloatingText(rk.x, rk.y - 14, 'BOOM!', '#fb923c');
        const dying = enemies.filter(e => e.hp <= 0);
        for (const de of dying) killEnemy(de, player.id);
        enemies = enemies.filter(e => e.hp > 0);
        player.rockets.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) break;
  }
}

// ── Orbit — mirrors game.js updateOrbit() ────────────────
// Uses same ORBIT_R formula: 50 + 10 * bulletSize
function updateOrbit(player) {
  if (!player.orbitBullets.length) return;
  const ORBIT_R = 50 + 10 * player.abilities.bulletSize;
  const ORB_DMG = 25  * player.abilities.damage;

  for (const o of player.orbitBullets) {
    o.angle += 1.8 * DT;
    o.x = player.x + Math.cos(o.angle) * ORBIT_R;
    o.y = player.y + Math.sin(o.angle) * ORBIT_R;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (!o.hitCooldown[j] && Math.hypot(o.x - e.x, o.y - e.y) < e.r + 8) {
        e.hp -= ORB_DMG;
        addParticles(o.x, o.y, '#a78bfa', 5);
        o.hitCooldown[j] = 0.4;
        if (e.hp <= 0) { killEnemy(e, player.id); enemies.splice(j, 1); }
      }
    }
    for (const k in o.hitCooldown) {
      o.hitCooldown[k] -= DT;
      if (o.hitCooldown[k] <= 0) delete o.hitCooldown[k];
    }
  }
}

// ── Game tick ─────────────────────────────────────────────
function gameTick() {
  const now = Date.now();
  DT        = Math.min((now - lastTick) / 1000, 0.05);
  lastTick  = now;

  if (gameState !== 'playing') return;

  // ── Timer & wave — mirrors game.js gameLoop() ──────────
  gameTimer -= DT;
  if (gameTimer <= 0) { endGame(true); return; }

  waveTimer += DT;
  const spawnInterval = Math.max(0.3, (1.5 - wave * 0.1) / DIFF[difficulty].spawnMult);
  if (waveTimer >= spawnInterval) {
    waveTimer = 0;
    const count = 1 + Math.floor(wave / 2);
    for (let i = 0; i < count; i++) spawnEnemy();
  }
  wave = Math.floor((120 - gameTimer) / 15) + 1;

  // Boss every 60 s
  bossTimer += DT;
  if (bossTimer >= 60 && !bossActive) { bossTimer = 0; spawnEnemy('boss'); }

  // ── Per-player update ──────────────────────────────────
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    // Movement — clamped to WORLD bounds (not canvas)
    const mvLen = Math.hypot(p.dx, p.dy);
    if (mvLen > 0) {
      p.x = Math.max(p.r, Math.min(WORLD_W - p.r, p.x + (p.dx / mvLen) * p.speed * p.abilities.speed * 60 * DT));
      p.y = Math.max(p.r, Math.min(WORLD_H - p.r, p.y + (p.dy / mvLen) * p.speed * p.abilities.speed * 60 * DT));
    }

    // HP regen
    if (p.abilities.hpRegen > 0) p.hp = Math.min(p.maxHp, p.hp + p.abilities.hpRegen * DT);

    if (p.upgrading) continue; // don't shoot during upgrade selection

    // Auto-fire — same interval formula as game.js
    p.shootTimer += DT;
    const fireInterval = Math.max(0.08, 0.55 / p.abilities.fireRate);
    if (p.shootTimer >= fireInterval && enemies.length > 0) {
      p.shootTimer = 0;
      if (p.weaponType !== 'orbit' || p.orbitBullets.length === 0) playerShoot(p);
    }

    if (p.laserTimer > 0) p.laserTimer -= DT;
    if (p.rockets.length)      updateRockets(p);
    if (p.orbitBullets.length) updateOrbit(p);
  }

  // ── Projectiles — cull by world bounds ────────────────
  // game.js culls by distance from player (1200px); we cull by world edges
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx; p.y += p.vy;
    if (p.x < -20 || p.x > WORLD_W + 20 || p.y < -20 || p.y > WORLD_H + 20)
      projectiles.splice(i, 1);
  }

  // ── Enemies: move + hit players + hit bullets ──────────
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    const { player: tgt } = getNearestPlayer(e.x, e.y);
    if (tgt) {
      const edx = tgt.x - e.x, edy = tgt.y - e.y;
      const ed  = Math.hypot(edx, edy);
      if (ed > 0) { e.x += (edx / ed) * e.speed; e.y += (edy / ed) * e.speed; }

      // Enemy touches player
      if (ed < tgt.r + e.r + 2) {
        tgt.hp -= e.dmg * DT;
        addParticles(tgt.x, tgt.y, '#f87171', 2);
        if (tgt.hp <= 0) {
          tgt.hp    = 0;
          tgt.alive = false;
          sendTo(tgt.id, { type: 'playerDied' });
          if (!Object.values(players).some(p => p.alive)) { endGame(false); return; }
        }
      }
    }

    // Bullets hit enemy
    let killed = false;
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const proj = projectiles[j];
      if (Math.hypot(proj.x - e.x, proj.y - e.y) < e.r + proj.r) {
        if (e.shieldHp > 0) {
          e.shieldHp -= proj.dmg;
          addParticles(proj.x, proj.y, '#38bdf8', 3);
          if (!proj.pierce) projectiles.splice(j, 1);
          continue;
        }
        e.hp -= proj.dmg;
        addParticles(proj.x, proj.y, proj.color, 4);
        if (!proj.pierce) projectiles.splice(j, 1);
        if (e.hp <= 0) {
          killEnemy(e, proj.ownerId);
          enemies.splice(i, 1);
          killed = true;
          break;
        }
      }
    }
    if (killed) continue;
  }

  // ── Pickups ────────────────────────────────────────────
  for (let i = pickups.length - 1; i >= 0; i--) {
    pickups[i].age += DT;
    if (pickups[i].age > 8) { pickups.splice(i, 1); continue; }
    for (const id in players) {
      const p = players[id];
      if (!p.alive) continue;
      if (Math.hypot(pickups[i].x - p.x, pickups[i].y - p.y) < p.r + pickups[i].r + 4) {
        const healed = Math.min(20, p.maxHp - p.hp);
        p.hp = Math.min(p.maxHp, p.hp + 20);
        if (healed > 0) addFloatingText(pickups[i].x, pickups[i].y - 10, '+' + Math.ceil(healed) + ' hp', '#34d399');
        pickups.splice(i, 1);
        break;
      }
    }
  }

  // ── Particles ──────────────────────────────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= DT / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ── Floating texts ─────────────────────────────────────
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].y    += floatingTexts[i].vy;
    floatingTexts[i].life -= DT * 1.5;
    if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
  }
}

// ── State broadcast ───────────────────────────────────────
function broadcastState() {
  if (gameState !== 'playing') return;
  broadcast({
    type: 'state',
    gameTimer,
    wave,
    enemies: enemies.map(e => ({
      x: e.x, y: e.y, r: e.r, color: e.color, type: e.type,
      hp: e.hp, maxHp: e.maxHp, shieldHp: e.shieldHp, shieldMax: e.shieldMax,
    })),
    projectiles: projectiles.map(p => ({ x: p.x, y: p.y, r: p.r, color: p.color })),
    pickups:     pickups.map(pk => ({ x: pk.x, y: pk.y, r: pk.r, color: pk.color, age: pk.age })),
    particles:   particles.slice(-150).map(p => ({ x: p.x, y: p.y, color: p.color, life: p.life })),
    floatingTexts: floatingTexts.map(ft => ({
      x: ft.x, y: ft.y, text: ft.text, color: ft.color, life: ft.life,
    })),
    players: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, {
      id,
      x: p.x, y: p.y, r: p.r, color: p.color,
      hp: p.hp, maxHp: p.maxHp, alive: p.alive,
      kills: p.kills, level: p.level, xp: p.xp, xpNext: p.xpNext,
      weaponType: p.weaponType,
      laserTimer: p.laserTimer, laserAngle: p.laserAngle,
      orbitBullets: p.orbitBullets.map(o => ({ x: o.x, y: o.y, angle: o.angle })),
      rockets:      p.rockets.map(rk => ({ x: rk.x, y: rk.y, vx: rk.vx, vy: rk.vy })),
    }])),
  });
}

// ── Game lifecycle ────────────────────────────────────────
function startGame() {
  enemies = []; projectiles = []; pickups = []; particles = []; floatingTexts = [];
  wave = 1; gameTimer = 120; waveTimer = 0; bossTimer = 0; bossActive = false;

  // Reset all players to world-center spawn positions
  let slot = 0;
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  const spawnPositions = [
    { x: cx - 120, y: cy - 60 },
    { x: cx + 120, y: cy - 60 },
    { x: cx - 120, y: cy + 60 },
    { x: cx + 120, y: cy + 60 },
  ];

  for (const id in players) {
    const p   = players[id];
    const pos = spawnPositions[slot++ % 4];
    p.x = pos.x; p.y = pos.y;
    p.hp = 100; p.maxHp = 100;
    p.kills = 0; p.level = 1;
    p.xp = 0; p.xpNext = 20;
    p.alive = true; p.upgrading = false;
    p.abilities = { speed: 1, damage: 1, fireRate: 1, multiShot: 1, bulletSize: 1, hpRegen: 0 };
    p.weaponType = 'basic'; p.unlockedWeapons = new Set(['basic']);
    p.shootTimer = 0; p.laserTimer = 0; p.laserAngle = 0;
    p.orbitBullets = []; p.rockets = [];
    p.dx = 0; p.dy = 0;
  }

  gameState = 'playing';
  lastTick  = Date.now();

  clearInterval(tickInt);
  clearInterval(sendInt);
  tickInt = setInterval(gameTick,       TICK_MS);
  sendInt = setInterval(broadcastState, SEND_MS);

  broadcast({ type: 'gameStarted', difficulty });
  console.log(`[${new Date().toLocaleTimeString()}] Game started — ${Object.keys(players).length} player(s), difficulty: ${difficulty}, world: ${WORLD_W}×${WORLD_H}`);
}

function endGame(won) {
  clearInterval(tickInt);
  clearInterval(sendInt);
  gameState = 'waiting';

  broadcast({
    type: 'gameEnd',
    won,
    wave,
    players: Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, {
        id,
        kills: p.kills,
        level: p.level,
        alive: p.alive,
      }])
    ),
  });
  console.log(`[${new Date().toLocaleTimeString()}] Game ended — ${won ? 'SURVIVED' : 'DEFEATED'} on wave ${wave}`);
}

// ── WebSocket server ──────────────────────────────────────
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws) => {
  // Reject if full or game already running
  if (Object.keys(players).length >= MAX_PLAYERS) {
    ws.send(JSON.stringify({ type: 'error', msg: `Server full (max ${MAX_PLAYERS} players)` }));
    ws.close(); return;
  }
  if (gameState === 'playing') {
    ws.send(JSON.stringify({ type: 'error', msg: 'A game is already in progress. Wait for it to end.' }));
    ws.close(); return;
  }

  const id      = genId();
  const slotIdx = Object.keys(players).length;
  const isHost  = slotIdx === 0;
  if (isHost) hostId = id;

  const color   = PLAYER_COLORS[slotIdx % PLAYER_COLORS.length];
  players[id]   = createPlayer(id, color, slotIdx);
  clients[id]   = ws;
  ws.playerId   = id;

  ws.send(JSON.stringify({ type: 'init', id, color, isHost, playerCount: slotIdx + 1 }));
  broadcastLobby();
  console.log(`[${new Date().toLocaleTimeString()}] Player ${id} connected (${slotIdx + 1}/${MAX_PLAYERS})`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const p   = players[id];

      if (msg.type === 'input') {
        if (p && p.alive) {
          // Sanitize input: clamp to [-1, 1]
          p.dx = Math.max(-1, Math.min(1, msg.dx || 0));
          p.dy = Math.max(-1, Math.min(1, msg.dy || 0));
        }

      } else if (msg.type === 'startGame' && id === hostId && gameState === 'waiting') {
        difficulty = msg.difficulty || 'normal';
        startGame();

      } else if (msg.type === 'difficulty' && id === hostId) {
        difficulty = msg.difficulty || 'normal';

      } else if (msg.type === 'upgrade' && p && p.upgrading) {
        applyUpgrade(p, msg.upgradeId);
        p.upgrading = false;
        sendTo(id, { type: 'upgradeApplied' });
      }
    } catch (err) { /* ignore malformed messages */ }
  });

  ws.on('close', () => {
    delete players[id];
    delete clients[id];

    // Reassign host if the host left
    if (id === hostId) {
      const remaining = Object.keys(players);
      if (remaining.length > 0) {
        hostId = remaining[0];
        sendTo(hostId, { type: 'youAreHost' });
      } else {
        hostId = null;
        if (gameState === 'playing') endGame(false);
      }
    }

    broadcastLobby();
    console.log(`[${new Date().toLocaleTimeString()}] Player ${id} disconnected (${Object.keys(players).length} remaining)`);
  });

  ws.on('error', () => {});
});

wss.on('listening', () => {
  console.log(`  WebSocket server listening on port ${PORT}\n`);
});

function startMpGame() {
  mp.active = true;
  hideOverlay('mpLobbyOverlay'); hideOverlay('mpConnectOverlay');
  hideOverlay('menuOverlay');    hideOverlay('endOverlay');
  hideOverlay('pauseOverlay');   hideOverlay('upgradeOverlay');

  enemies = []; projectiles = []; pickups = []; particles = []; floatingTexts = [];
  kills = 0; wave = 1; level = 1;
  xp = 0; xpNext = 20; hp = 100; maxHp = 100; gameTimer = 120;
  abilities = { speed:1, damage:1, fireRate:1, multiShot:1, bulletSize:1, hpRegen:0 };
  weaponType = 'basic'; orbitBullets = []; rockets = []; laserTimer = 0;
  combo = 0; comboTimer = 0; unlockedWeapons = new Set(['basic']);

  // ← NEW: visual-effect globals (mirrors initGame)
  shakeTimer = 0; shakeMag = 0; vignetteTimer = 0;
  waveAnnounce = null; lastAnnouncedWave = 0;
  shockwaves = []; zombieWobbleTime = 0;
  bossActive = false; bossRef = null;
  generateEnv(); // ← NEW: trees, ruins, rocks

  document.getElementById('comboDisplay').style.display = 'none';
  state = 'playing'; lastTime = performance.now();
  document.getElementById('mpScoreboard').style.display = 'block';
  updateCamera(); updateHUD();
  requestAnimationFrame(mpRenderLoop);
  startMpInputLoop();
}

function mpRenderLoop(timestamp) {
  if (!mp.active) return;
  if (state !== 'playing' && state !== 'upgrade') return;
  if (state !== 'playing') { requestAnimationFrame(mpRenderLoop); return; }

  dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (combo > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) { combo = 0; document.getElementById('comboDisplay').style.display = 'none'; }
  }

  // ← NEW: tick visual-effect timers that were previously only in gameLoop
  if (shakeTimer > 0) { shakeTimer -= dt; if (shakeTimer <= 0) { shakeTimer = 0; shakeMag = 0; } }
  if (vignetteTimer > 0) vignetteTimer -= dt;
  if (waveAnnounce)    { waveAnnounce.life -= dt * 1.2; if (waveAnnounce.life <= 0) waveAnnounce = null; }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.r += 200 * dt; s.life -= dt * 2.5;
    if (s.life <= 0) shockwaves.splice(i, 1);
  }

  if (shootAnim > 0) shootAnim -= dt;
  updateCamera(); drawMinimap(); renderMP();
  requestAnimationFrame(mpRenderLoop);
}

function renderMP() {
  // Screen shake
  const sx = shakeTimer > 0 ? (Math.random()-0.5)*shakeMag*2 : 0;
  const sy = shakeTimer > 0 ? (Math.random()-0.5)*shakeMag*2 : 0;
  ctx.save(); ctx.translate(sx, sy);
  ctx.clearRect(-sx-2, -sy-2, W+4, H+4);

  // Background
  ctx.fillStyle = '#080c10'; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha = 0.18;
  const startGX = Math.floor(camX/80)*80, startGY = Math.floor(camY/80)*80;
  for (let gx=startGX; gx<camX+W+80; gx+=80)
    for (let gy=startGY; gy<camY+H+80; gy+=80) {
      const v = Math.sin(gx*0.07+gy*0.05)*0.5+0.5;
      ctx.fillStyle = v>0.6?'#0d1520':'#060a0e';
      ctx.fillRect(gx-camX, gy-camY, 80, 80);
    }
  ctx.globalAlpha = 1;
  ctx.strokeStyle='rgba(96,165,250,0.03)'; ctx.lineWidth=0.5;
  const gsx=Math.floor(camX/40)*40, gsy=Math.floor(camY/40)*40;
  for (let x=gsx; x<=camX+W; x+=40) { ctx.beginPath(); ctx.moveTo(x-camX,0); ctx.lineTo(x-camX,H); ctx.stroke(); }
  for (let y=gsy; y<=camY+H; y+=40) { ctx.beginPath(); ctx.moveTo(0,y-camY); ctx.lineTo(W,y-camY); ctx.stroke(); }

  drawWorldBorder();
  if (typeof envProps!=='undefined' && envProps.length) for (const p of envProps) drawProp(p);

  // Shockwaves
  for (const s of shockwaves) {
    ctx.globalAlpha=Math.max(0,s.life*0.5); ctx.strokeStyle=s.color;
    ctx.lineWidth=2.5*s.life; ctx.shadowColor=s.color; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(s.x-camX,s.y-camY,s.r,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
  }

  // Pickups
  for (const pk of pickups) {
    const pkx=pk.x-camX, pky=pk.y-camY;
    if (pkx<-20||pkx>W+20||pky<-20||pky>H+20) continue;
    ctx.globalAlpha=Math.max(0.3,1-(pk.age||0)/8);
    ctx.fillStyle=pk.color; ctx.shadowColor=pk.color; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(pkx,pky,pk.r,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x-camX,p.y-camY,3,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // Enemies — zombie sprites
  zombieWobbleTime += (dt||0.016)*4;
  for (const e of enemies) {
    const ex=e.x-camX, ey=e.y-camY;
    if (ex<-80||ex>W+80||ey<-80||ey>H+80) continue;

    if (e.type==='boss') {
      ctx.strokeStyle='rgba(255,68,68,0.25)'; ctx.lineWidth=3;
      ctx.shadowColor='#ff4444'; ctx.shadowBlur=30;
      ctx.beginPath(); ctx.arc(ex,ey,e.r+12+Math.sin(Date.now()/200)*5,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0;
    }
    if (e.shieldHp>0) {
      const sPct=e.shieldHp/e.shieldMax;
      ctx.strokeStyle=`rgba(56,189,248,${0.3+sPct*0.5})`; ctx.lineWidth=3;
      ctx.shadowColor='#38bdf8'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(ex,ey,e.r+10,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0;
    }

    let zType='standard';
    if      (e.type==='boss')     zType='boss';
    else if (e.type==='splitter') zType='splitter';
    else if (e.type==='shielded') zType='shielded';
    else if (e.color==='#fb923c') zType='fast';
    else if (e.color==='#f87171') zType='elite';

    ctx.save(); ctx.translate(ex,ey);
    drawZombie(e.r/11, zombieWobbleTime+e.x*0.01, zType, 0);
    ctx.restore();

    const barW=e.r*2.2, barX=ex-barW/2, barY=ey-e.r-28;
    const hpPct=e.hp/e.maxHp;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(barX-1,barY-1,barW+2,5);
    ctx.fillStyle=hpPct>0.5?'#22c55e':hpPct>0.25?'#f97316':'#ef4444';
    ctx.fillRect(barX,barY,barW*hpPct,3);
    if (e.shieldMax>0) {
      ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(barX-1,barY-6,barW+2,5);
      ctx.fillStyle='#38bdf8'; ctx.fillRect(barX,barY-5,barW*Math.max(0,e.shieldHp/e.shieldMax),3);
    }
  }

  // Projectiles
  for (const p of projectiles) {
    const px=p.x-camX, py=p.y-camY;
    if (px<-20||px>W+20||py<-20||py>H+20) continue;
    ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(px,py,p.r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }

  // Rockets (local player's)
  for (const rk of rockets) {
    const angle=Math.atan2(rk.vy,rk.vx);
    ctx.save(); ctx.translate(rk.x-camX,rk.y-camY); ctx.rotate(angle);
    ctx.shadowColor='#fb923c'; ctx.shadowBlur=20; ctx.fillStyle='#fb923c';
    ctx.beginPath(); ctx.ellipse(0,0,9,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fef3c7'; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(6,-4); ctx.lineTo(6,4); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(251,191,36,0.85)'; ctx.shadowColor='#fbbf24'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(-20,-3); ctx.lineTo(-20,3); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.shadowBlur=0;
  }

  // Players — character sprites
  const COLORS=['#60a5fa','#34d399','#fbbf24','#f87171'];
  Object.values(mp.remotePlayers).forEach((p,i) => {
    if (!p.alive) return;
    const col=p.color||COLORS[i]||'#60a5fa', isMe=p.id===mp.myId;
    const scX=(p.x||0)-camX, scY=(p.y||0)-camY;

    // Orbit bullets
    if (p.orbitBullets?.length) for (const o of p.orbitBullets) {
      ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.arc(o.x-camX,o.y-camY,5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    }

    // Remote rockets
    if (p.rockets?.length) for (const rk of p.rockets) {
      const angle=Math.atan2(rk.vy,rk.vx);
      ctx.save(); ctx.translate(rk.x-camX,rk.y-camY); ctx.rotate(angle);
      ctx.shadowColor='#fb923c'; ctx.shadowBlur=20; ctx.fillStyle='#fb923c';
      ctx.beginPath(); ctx.ellipse(0,0,9,4,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fef3c7'; ctx.shadowBlur=0;
      ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(6,-4); ctx.lineTo(6,4); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(251,191,36,0.85)'; ctx.shadowColor='#fbbf24'; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(-20,-3); ctx.lineTo(-20,3); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.shadowBlur=0;
    }

    // Laser
    if (p.laserTimer>0 && p.weaponType==='laser') {
      const ang=isMe?laserAngleMP:(p.laserAngle||0);
      const cos=Math.cos(ang), sin=Math.sin(ang), blen=Math.max(W,H)*1.5;
      ctx.save();
      ctx.strokeStyle='rgba(244,63,94,0.25)'; ctx.lineWidth=18;
      ctx.shadowColor='#f43f5e'; ctx.shadowBlur=30;
      ctx.beginPath(); ctx.moveTo(scX,scY); ctx.lineTo(scX+cos*blen,scY+sin*blen); ctx.stroke();
      ctx.strokeStyle='#f43f5e'; ctx.lineWidth=4; ctx.shadowBlur=15;
      ctx.beginPath(); ctx.moveTo(scX,scY); ctx.lineTo(scX+cos*blen,scY+sin*blen); ctx.stroke();
      ctx.restore(); ctx.shadowBlur=0;
    }

    // Glow aura
    const grd=ctx.createRadialGradient(scX,scY,2,scX,scY,55);
    grd.addColorStop(0,`rgba(${hexToRgb(col)},0.12)`); grd.addColorStop(1,`rgba(${hexToRgb(col)},0)`);
    ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(scX,scY,55,0,Math.PI*2); ctx.fill();

    // Character sprite: local player gets chosen character; remotes get tinted soldier
    ctx.save(); ctx.translate(scX,scY);
    if (isMe) {
      drawSoldier(0);
    } else {
      ctx.filter=`hue-rotate(${_mpHueOffset(col)}deg) saturate(1.3)`;
      drawSoldierOriginal(0);
      ctx.filter='none';
    }
    ctx.restore();

    // Name tag
    ctx.font='9px "Share Tech Mono",monospace'; ctx.textAlign='center';
    ctx.fillStyle=col; ctx.globalAlpha=0.8;
    ctx.fillText(isMe?'YOU':('P'+(i+1)), scX, scY-(p.r||12)-6);
    ctx.globalAlpha=1;
  });
  ctx.textAlign='left';

  // Floating texts
  ctx.font='11px "Share Tech Mono",monospace'; ctx.textAlign='center';
  for (const ft of floatingTexts) {
    ctx.globalAlpha=Math.max(0,ft.life); ctx.fillStyle=ft.color;
    ctx.fillText(ft.text, ft.x-camX, ft.y-camY);
  }
  ctx.globalAlpha=1; ctx.textAlign='left';
  ctx.restore(); // end shake

  // ── Screen-space overlays ────────────────────────────────

  // Ambient vignette
  const vgn=ctx.createRadialGradient(W/2,H/2,H*0.28,W/2,H/2,H*0.82);
  vgn.addColorStop(0,'rgba(0,0,0,0)'); vgn.addColorStop(1,'rgba(0,0,0,0.72)');
  ctx.fillStyle=vgn; ctx.fillRect(0,0,W,H);

  // Damage vignette
  if (vignetteTimer>0) {
    const intensity=Math.min(1,vignetteTimer/0.45);
    const rvgn=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.75);
    rvgn.addColorStop(0,'rgba(200,0,0,0)');
    rvgn.addColorStop(1,`rgba(200,0,0,${intensity*0.55})`);
    ctx.fillStyle=rvgn; ctx.fillRect(0,0,W,H);
  }

  // Boss HP bar
  if (bossRef && bossRef.hp>0) {
    const bw=320,bh=10,bx=(W-bw)/2,by=16;
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(bx-2,by-2,bw+4,bh+4);
    ctx.fillStyle='#1a0808'; ctx.fillRect(bx,by,bw,bh);
    const pct=Math.max(0,bossRef.hp/bossRef.maxHp);
    ctx.fillStyle='#ff4444'; ctx.shadowColor='#ff4444'; ctx.shadowBlur=10;
    ctx.fillRect(bx,by,bw*pct,bh); ctx.shadowBlur=0;
    ctx.font='bold 9px "Share Tech Mono",monospace'; ctx.textAlign='center';
    ctx.fillStyle='#ff8888';
    ctx.fillText('⚠ BOSS — '+Math.ceil(bossRef.hp)+' HP', W/2, by+bh+14);
    ctx.textAlign='left';
  }

  // Wave announce banner
  if (waveAnnounce) {
    const a=Math.min(1,waveAnnounce.life*3), scale=0.85+0.15*(1-waveAnnounce.life);
    ctx.save(); ctx.globalAlpha=a; ctx.translate(W/2,H/2-80); ctx.scale(scale,scale);
    ctx.textAlign='center'; ctx.font='bold 38px "Orbitron",monospace';
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillText(waveAnnounce.text,2,2);
    ctx.fillStyle='#60a5fa'; ctx.shadowColor='#60a5fa'; ctx.shadowBlur=30;
    ctx.fillText(waveAnnounce.text,0,0); ctx.shadowBlur=0;
    ctx.restore(); ctx.globalAlpha=1; ctx.textAlign='left';
  }
}

// Helper: hue-rotate offset so remote soldiers tint to each slot colour.
// Blue (#60a5fa ≈ 213°) is the soldier's natural baseline — 0° shift.
function _mpHueOffset(hex) {
  return ({ '#60a5fa':0, '#34d399':150, '#fbbf24':210, '#f87171':350 })[hex] ?? 0;
}