// ── DAMAGE CALCULATOR WITH WORKING SOUND & TABLE ──

// Enemy health values
const enemyHealth = {
  'Standard Zombie': 30,
  'Runner': 20,
  'Elite Brute': 80,
  'Boss Apocalypse': 500,
  'Splitter': 45,
  'Shielded': 40
};

// Weapon base damage
const weaponBaseDamage = {
  'basic': 15,
  'spread': 15,
  'sniper': 45,
  'laser': 35,
  'rocket': 60,
  'orbit': 25
};

let currentWeapon = 'basic';
let currentDmgMulti = 1;
let currentMultiShot = 1;
let audioEnabled = false;
let audioCtx = null;

// ── SOUND SYSTEM ──
function enableAudio() {
  if (audioEnabled) return true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    audioEnabled = true;
    console.log('✅ Audio enabled!');
    playBeep();
    return true;
  } catch (e) {
    console.log('Audio error:', e);
    return false;
  }
}

function playBeep() {
  if (!audioEnabled || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    gainNode.gain.setValueAtTime(0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 0.15);
    const osc = audioCtx.createOscillator();
    osc.connect(gainNode);
    osc.frequency.value = 880;
    osc.type = 'sine';
    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {}
}

function playDoubleBeep() {
  if (!audioEnabled || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 0.2);
    const osc = audioCtx.createOscillator();
    osc.connect(gainNode);
    osc.frequency.value = 523.25;
    osc.type = 'triangle';
    osc.start(now);
    osc.stop(now + 0.1);
    const gainNode2 = audioCtx.createGain();
    gainNode2.connect(audioCtx.destination);
    gainNode2.gain.setValueAtTime(0.08, now + 0.1);
    gainNode2.gain.exponentialRampToValueAtTime(0.00001, now + 0.2);
    const osc2 = audioCtx.createOscillator();
    osc2.connect(gainNode2);
    osc2.frequency.value = 659.25;
    osc2.type = 'triangle';
    osc2.start(now + 0.1);
    osc2.stop(now + 0.2);
  } catch (e) {}
}

// ── DAMAGE CALCULATIONS ──
function calculateDamage(weapon, enemyType) {
  let baseDmg = weaponBaseDamage[weapon] || 15;
  let totalDmg = baseDmg * currentDmgMulti;
  let projectileCount = 1;
  
  if (weapon === 'spread') {
    projectileCount = 5;
  } else if (weapon !== 'laser' && weapon !== 'orbit') {
    projectileCount = currentMultiShot;
    totalDmg = (baseDmg * currentDmgMulti) * projectileCount;
  }
  
  let enemyHp = enemyHealth[enemyType];
  if (enemyType === 'Shielded') enemyHp = 100;
  
  const shotsToKill = Math.ceil(enemyHp / totalDmg);
  const exactShots = enemyHp / totalDmg;
  
  return {
    perShot: totalDmg,
    projectileCount: projectileCount,
    shotsToKill: shotsToKill,
    exactShots: exactShots,
    isOneShot: totalDmg >= enemyHp
  };
}

function calculateTTK(weapon, enemyType) {
  const fireRate = {
    'basic': 0.55,
    'spread': 0.55,
    'sniper': 0.55,
    'laser': 0.1,
    'rocket': 0.65,
    'orbit': 0.3
  };
  const dmg = calculateDamage(weapon, enemyType);
  const rate = fireRate[weapon] || 0.55;
  
  if (weapon === 'laser') {
    const dps = weaponBaseDamage['laser'] * currentDmgMulti;
    return (enemyHealth[enemyType] / dps).toFixed(1);
  }
  const timeToKill = (dmg.exactShots - 1) * rate;
  return timeToKill < 0 ? '0.0' : timeToKill.toFixed(1);
}

// ── UPDATE THE DAMAGE TABLE ──
function updateDamageTable() {
  const tableContainer = document.getElementById('damageTable');
  console.log('Looking for damageTable container:', tableContainer);
  
  if (!tableContainer) {
    console.error('damageTable container not found! Check if the HTML has this element.');
    return;
  }
  
  const enemies = Object.keys(enemyHealth);
  
  let html = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 12px 8px; font-family: monospace; color: #818cf8;">ENEMY</th>
          <th style="text-align: left; padding: 12px 8px; font-family: monospace; color: #818cf8;">HP</th>
          <th style="text-align: left; padding: 12px 8px; font-family: monospace; color: #818cf8;">DAMAGE</th>
          <th style="text-align: left; padding: 12px 8px; font-family: monospace; color: #818cf8;">SHOTS</th>
          <th style="text-align: left; padding: 12px 8px; font-family: monospace; color: #818cf8;">TTK</th>
          <th style="text-align: left; padding: 12px 8px; font-family: monospace; color: #818cf8;">STATUS</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  const enemyColors = {
    'Standard Zombie': '#e879f9',
    'Runner': '#fb923c',
    'Elite Brute': '#f87171',
    'Boss Apocalypse': '#ff4444',
    'Splitter': '#a78bfa',
    'Shielded': '#38bdf8'
  };
  
  for (const enemy of enemies) {
    const dmg = calculateDamage(currentWeapon, enemy);
    const ttk = calculateTTK(currentWeapon, enemy);
    const color = enemyColors[enemy] || '#818cf8';
    
    let status = '';
    if (dmg.isOneShot) status = '<span style="color:#fbbf24">💀 ONE SHOT!</span>';
    else if (dmg.shotsToKill <= 2) status = '<span style="color:#4ade80">⚡ QUICK KILL</span>';
    else if (dmg.shotsToKill <= 5) status = '<span style="color:#a78bfa">🎯 EFFICIENT</span>';
    else status = '<span style="color:#f87171">⚠️ INEFFICIENT</span>';
    
    const displayDamage = dmg.perShot >= 1000 ? Math.floor(dmg.perShot) : Math.floor(dmg.perShot);
    
    html += `
      <tr class="damage-row" data-enemy="${enemy}" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 12px 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: ${color}; display: inline-block; box-shadow: 0 0 8px ${color};"></span>
            <span style="font-family: monospace;">${enemy}</span>
          </div>
        </td>
        <td style="padding: 12px 8px; font-family: monospace;">${enemyHealth[enemy]}${enemy === 'Shielded' ? ' +60 shield' : ''}</td>
        <td style="padding: 12px 8px; font-family: monospace; color: #fbbf24; font-weight: bold;">${displayDamage}${dmg.projectileCount > 1 ? ` ×${dmg.projectileCount}` : ''}</td>
        <td style="padding: 12px 8px; font-family: monospace; color: #818cf8;">${dmg.shotsToKill}</td>
        <td style="padding: 12px 8px; font-family: monospace;">${ttk}s</td>
        <td style="padding: 12px 8px;">${status}</td>
      </tr>
    `;
  }
  
  html += `
      </tbody>
    </table>
  `;
  
  tableContainer.innerHTML = html;
  console.log('Damage table updated!');
  
  // Add hover effects to rows
  document.querySelectorAll('.damage-row').forEach(row => {
    row.addEventListener('mouseenter', () => {
      if (audioEnabled) playBeep();
      row.style.backgroundColor = 'rgba(129, 140, 248, 0.05)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.backgroundColor = '';
    });
  });
}

function updateDPSStats() {
  const dmg = calculateDamage(currentWeapon, 'Standard Zombie');
  
  const ttkStandard = document.getElementById('ttkStandard');
  const ttkElite = document.getElementById('ttkElite');
  const ttkBoss = document.getElementById('ttkBoss');
  const shotsStandard = document.getElementById('shotsStandard');
  
  if (ttkStandard) ttkStandard.textContent = `${calculateTTK(currentWeapon, 'Standard Zombie')}s`;
  if (ttkElite) ttkElite.textContent = `${calculateTTK(currentWeapon, 'Elite Brute')}s`;
  if (ttkBoss) ttkBoss.textContent = `${calculateTTK(currentWeapon, 'Boss Apocalypse')}s`;
  if (shotsStandard) shotsStandard.textContent = dmg.shotsToKill;
}

function updateAllStats() {
  updateDamageTable();
  updateDPSStats();
  if (audioEnabled) playBeep();
}

// ── INITIALIZATION ──
function initWeaponSelector() {
  const weapons = document.querySelectorAll('.damage-weapon');
  console.log('Found weapons:', weapons.length);
  
  weapons.forEach(weapon => {
    weapon.addEventListener('click', () => {
      if (audioEnabled) playDoubleBeep();
      weapons.forEach(w => w.classList.remove('active'));
      weapon.classList.add('active');
      currentWeapon = weapon.dataset.weapon;
      updateAllStats();
    });
    weapon.addEventListener('mouseenter', () => {
      if (audioEnabled) playBeep();
    });
  });
  
  const defaultWeapon = document.querySelector('.damage-weapon[data-weapon="basic"]');
  if (defaultWeapon) defaultWeapon.classList.add('active');
}

function initSliders() {
  const dmgSlider = document.getElementById('dmgMulti');
  const multiSlider = document.getElementById('multiShot');
  const dmgVal = document.getElementById('dmgMultiVal');
  const multiVal = document.getElementById('multiShotVal');
  
  if (dmgSlider) {
    dmgSlider.addEventListener('input', (e) => {
      currentDmgMulti = parseFloat(e.target.value);
      if (dmgVal) dmgVal.textContent = `×${currentDmgMulti.toFixed(1)}`;
      updateAllStats();
      if (audioEnabled) playBeep();
    });
  }
  
  if (multiSlider) {
    multiSlider.addEventListener('input', (e) => {
      currentMultiShot = parseInt(e.target.value);
      if (multiVal) multiVal.textContent = currentMultiShot;
      updateAllStats();
      if (audioEnabled) playBeep();
    });
  }
}

function addGlobalHoverSounds() {
  const elements = document.querySelectorAll('.enemy-card, .upgrade-showcase-card, .weapon-card, .tip-card, .btn-primary, .btn-ghost, .nav-links a, .music-toggle, .feature-card, .damage-weapon');
  elements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (audioEnabled) playBeep();
    });
  });
}

// ── START EVERYTHING ──
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing damage calculator...');
  
  // Small delay to ensure everything is ready
  setTimeout(() => {
    initWeaponSelector();
    initSliders();
    updateAllStats();
    addGlobalHoverSounds();
  }, 100);
  
  // Enable audio on first click
  const enableOnFirstClick = () => {
    enableAudio();
    setTimeout(() => { if (audioEnabled) playDoubleBeep(); }, 100);
    document.removeEventListener('click', enableOnFirstClick);
    document.removeEventListener('touchstart', enableOnFirstClick);
    console.log('🎵 Audio unlocked!');
  };
  
  document.addEventListener('click', enableOnFirstClick);
  document.addEventListener('touchstart', enableOnFirstClick);
});

console.log('Damage calculator script loaded!');

// ── TOUCH FRIENDLY FOR MOBILE ──
function enableTouchEvents() {
  // Make all interactive elements respond to touch
  const touchElements = document.querySelectorAll('.damage-weapon, .enemy-card, .weapon-card, .tip-card, .upgrade-showcase-card');
  
  touchElements.forEach(el => {
    el.addEventListener('touchstart', (e) => {
      // Add active state feedback
      el.classList.add('touch-active');
      setTimeout(() => el.classList.remove('touch-active'), 150);
    });
  });
}

// Add this to your DOMContentLoaded event
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(enableTouchEvents, 200);
});