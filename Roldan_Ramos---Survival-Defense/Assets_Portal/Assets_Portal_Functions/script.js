// ── Animated background canvas ──
const bgCanvas = document.getElementById('bgCanvas');
const bctx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
});

const bgParticles = [];
for (let i = 0; i < 80; i++) {
  bgParticles.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 2.5 + 0.5,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    alpha: Math.random() * 0.5 + 0.1,
    color: Math.random() < 0.6 ? '#818cf8' : (Math.random() < 0.5 ? '#4ade80' : '#a78bfa'),
  });
}

function animateBg() {
  bctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  for (const p of bgParticles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -50) p.x = bgCanvas.width + 50;
    if (p.x > bgCanvas.width + 50) p.x = -50;
    if (p.y < -50) p.y = bgCanvas.height + 50;
    if (p.y > bgCanvas.height + 50) p.y = -50;
    bctx.globalAlpha = p.alpha;
    bctx.fillStyle = p.color;
    bctx.shadowColor = p.color;
    bctx.shadowBlur = 8;
    bctx.beginPath();
    bctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.shadowBlur = 0;
  bctx.globalAlpha = 1;
  requestAnimationFrame(animateBg);
}
animateBg();

// ── Scroll reveal (enhanced with all new sections) ──
const reveals = document.querySelectorAll(
  '.feature-card, .upgrade-showcase-card, .enemy-card, .weapon-card, .tip-card, .section-title, .section-label, .section-desc, .hero-stats, .hero-badge'
);
reveals.forEach(el => el.classList.add('reveal'));

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 50);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

reveals.forEach(el => observer.observe(el));

// ── Upgrade card color tinting ──
document.querySelectorAll('.upgrade-showcase-card').forEach(card => {
  const color = card.dataset.color;
  if (color) {
    const statEl = card.querySelector('.usc-stat');
    if (statEl) statEl.style.color = color;
    card.style.setProperty('--clr', color);
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = color + '55';
      card.style.boxShadow = `0 0 30px ${color}22`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    });
  }
});

// ── Weapon card hover effect ──
document.querySelectorAll('.weapon-card').forEach(card => {
  const weapon = card.dataset.weapon;
  const colors = {
    basic: '#60a5fa',
    spread: '#eab308',
    sniper: '#a855f7',
    laser: '#ec4899',
    rocket: '#f97316',
    orbit: '#14b8a6'
  };
  const color = colors[weapon] || '#818cf8';
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = color + '66';
    card.style.boxShadow = `0 0 30px ${color}22`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = '';
    card.style.boxShadow = '';
  });
});

// ── Nav active state on scroll ──
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY + 100;
  sections.forEach(sec => {
    if (scrollY >= sec.offsetTop && scrollY < sec.offsetTop + sec.offsetHeight) {
      navLinks.forEach(a => a.style.color = '');
      const active = document.querySelector(`.nav-links a[href="#${sec.id}"]`);
      if (active) active.style.color = '#a5b4fc';
    }
  });
});

// ── Smooth scroll for anchor links ──
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    if (href.startsWith('#')) {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});

// ── Music toggle text sync ──
const musicToggle = document.getElementById('musicToggle');
if (musicToggle && localStorage.getItem('musicMuted') === 'true') {
  const music = document.getElementById('bgMusic');
  if (music) {
    music.muted = true;
    musicToggle.textContent = '🔇';
    musicToggle.classList.add('muted');
  }
}

// ── SHOP CARD CLICKS (open real shop) ──
function openShopPopup() {
  const shopWindow = window.open('Roldan_Ramos---Survival-Defense/Assets_Game/Game_Function/shop.html', 'DiariteShop', 'width=1100,height=720,resizable=yes');
  if (shopWindow) {
    shopWindow.addEventListener('load', () => {
      const s = JSON.parse(localStorage.getItem('sdShop') || '{}');
      shopWindow.postMessage({ type: 'shopInit', state: s }, '*');
    });
  }
}

document.querySelectorAll('.shop-item-card, .btn-open-shop').forEach(el => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openShopPopup();
  });
});

// Also refresh diarite display when localStorage changes
window.addEventListener('storage', (e) => {
  if (e.key === 'sdShop') {
    const diariteSpan = document.getElementById('portalDiariteAmount');
    if (diariteSpan) {
      try {
        const shopState = JSON.parse(e.newValue || '{}');
        diariteSpan.innerText = shopState.diarite || 0;
      } catch(err) {}
    }
  }
});

// ========== GAMEPLAY PREVIEW CANVAS ANIMATION ==========
const previewCanvas = document.getElementById('previewCanvas');
if (previewCanvas) {
  const pCtx = previewCanvas.getContext('2d');
  let pWidth = previewCanvas.clientWidth;
  let pHeight = previewCanvas.clientHeight;
  
  function resizePreview() {
    pWidth = previewCanvas.clientWidth;
    pHeight = previewCanvas.clientHeight;
    previewCanvas.width = pWidth;
    previewCanvas.height = pHeight;
  }
  window.addEventListener('resize', resizePreview);
  resizePreview();

  // simple game-like scene
  let px = pWidth/2, py = pHeight/2;
  let angle = 0;
  let enemies = [];
  let bullets = [];
  let frame = 0;
  
  function resetPreview() {
    px = pWidth/2;
    py = pHeight/2;
    angle = 0;
    enemies = [];
    bullets = [];
    frame = 0;
    for(let i=0; i<6; i++) {
      enemies.push({
        x: Math.random() * pWidth,
        y: Math.random() * pHeight,
        r: 8,
        hp: 1,
        color: `hsl(${200 + Math.random()*60}, 70%, 55%)`
      });
    }
  }
  
  function updatePreview() {
    if(!previewCanvas.isConnected) return;
    frame++;
    // move player in a circle
    px = pWidth/2 + Math.sin(frame * 0.02) * (pWidth*0.25);
    py = pHeight/2 + Math.cos(frame * 0.015) * (pHeight*0.2);
    
    // enemies chase player
    for(let e of enemies) {
      let dx = px - e.x, dy = py - e.y, d = Math.hypot(dx,dy);
      if(d > 0.01) {
        e.x += (dx/d) * 1.5;
        e.y += (dy/d) * 1.5;
      }
      // wrap around edges
      if(e.x < -20) e.x = pWidth+20;
      if(e.x > pWidth+20) e.x = -20;
      if(e.y < -20) e.y = pHeight+20;
      if(e.y > pHeight+20) e.y = -20;
    }
    
    // auto-shoot at nearest enemy
    let nearest = null;
    let nearestDist = Infinity;
    for(let e of enemies) {
      let d = Math.hypot(px - e.x, py - e.y);
      if(d < nearestDist) { nearestDist = d; nearest = e; }
    }
    if(nearest && frame % 8 === 0) {
      let angle = Math.atan2(nearest.y - py, nearest.x - px);
      bullets.push({
        x: px, y: py, vx: Math.cos(angle)*6, vy: Math.sin(angle)*6,
        life: 60, r: 4
      });
    }
    
    // update bullets & collisions
    for(let i=bullets.length-1; i>=0; i--) {
      let b = bullets[i];
      b.x += b.vx; b.y += b.vy;
      b.life--;
      if(b.life <=0 || b.x<-50 || b.x>pWidth+50 || b.y<-50 || b.y>pHeight+50) {
        bullets.splice(i,1);
        continue;
      }
      for(let j=enemies.length-1; j>=0; j--) {
        let e = enemies[j];
        if(Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
          enemies.splice(j,1);
          bullets.splice(i,1);
          break;
        }
      }
    }
    
    // respawn enemies
    if(enemies.length < 4 && Math.random() < 0.02) {
      enemies.push({
        x: Math.random() * pWidth,
        y: Math.random() * pHeight,
        r: 8,
        color: `hsl(${200 + Math.random()*60}, 70%, 55%)`
      });
    }
    
    // DRAW
    pCtx.clearRect(0, 0, pWidth, pHeight);
    // grid background
    pCtx.strokeStyle = 'rgba(129,140,248,0.1)';
    pCtx.lineWidth = 0.5;
    for(let i=0; i<pWidth; i+=40) {
      pCtx.beginPath(); pCtx.moveTo(i,0); pCtx.lineTo(i,pHeight); pCtx.stroke();
      pCtx.beginPath(); pCtx.moveTo(0,i%pHeight); pCtx.lineTo(pWidth,i%pHeight); pCtx.stroke();
    }
    // enemies
    for(let e of enemies) {
      pCtx.shadowColor = e.color;
      pCtx.shadowBlur = 12;
      pCtx.fillStyle = e.color;
      pCtx.beginPath(); pCtx.arc(e.x, e.y, e.r, 0, Math.PI*2); pCtx.fill();
      pCtx.fillStyle = 'white';
      pCtx.beginPath(); pCtx.arc(e.x-2, e.y-2, 2, 0, Math.PI*2); pCtx.fill();
    }
    // bullets
    for(let b of bullets) {
      pCtx.fillStyle = '#fbbf24';
      pCtx.shadowBlur = 8;
      pCtx.beginPath(); pCtx.arc(b.x, b.y, 4, 0, Math.PI*2); pCtx.fill();
    }
    // player
    pCtx.shadowBlur = 16;
    pCtx.fillStyle = '#60a5fa';
    pCtx.beginPath(); pCtx.arc(px, py, 14, 0, Math.PI*2); pCtx.fill();
    pCtx.fillStyle = 'white';
    pCtx.beginPath(); pCtx.arc(px-3, py-3, 3, 0, Math.PI*2); pCtx.fill();
    pCtx.fillStyle = '#0f172a';
    pCtx.beginPath(); pCtx.rect(px-8, py-12, 16, 8); pCtx.fill();
    
    pCtx.shadowBlur = 0;
    // UI text
    pCtx.font = '10px "Share Tech Mono", monospace';
    pCtx.fillStyle = 'rgba(255,255,255,0.5)';
    pCtx.fillText('● AUTO-TARGETING ACTIVE', 12, 20);
    pCtx.fillText('ENEMIES: ' + enemies.length, 12, 36);
    
    requestAnimationFrame(updatePreview);
  }
  
  resetPreview();
  updatePreview();
  
  // refresh button
  const refreshBtn = document.getElementById('refreshPreviewBtn');
  if(refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      resetPreview();
    });
  }
}

// ========== ENGAGEMENT OVERLAY ==========
(function addLivelyFeatures() {
  // ---- Live stats panel (injected) ----
  const panel = document.createElement('div');
  panel.className = 'live-panel';
  panel.innerHTML = `
    <div class="live-threat">
      <span class="threat-label">🌍 GLOBAL THREAT LEVEL</span>
      <div class="threat-bar"><div class="threat-fill" id="threatFill" style="width:0%"></div></div>
      <span class="threat-percent" id="threatPercent">0%</span>
    </div>
    <div class="live-stats">
      <div class="live-stat"><span>🔥 GLOBAL KILLS</span><span id="globalKills">0</span></div>
      <div class="live-stat"><span>⚡ ACTIVE OPERATIVES</span><span id="activeOps">1.2k</span></div>
      <div class="live-stat"><span>💀 CURRENT WAVE</span><span id="liveWave">∞</span></div>
    </div>
    <div class="live-spotlight" id="liveSpotlight">
      <div class="spotlight-icon">🔫</div>
      <div class="spotlight-text">
        <span class="spotlight-label">FEATURED WEAPON</span>
        <span class="spotlight-value" id="spotlightWeapon">Basic Rifle</span>
      </div>
    </div>
    <div class="live-tip" id="liveTip">💡 Tip: Keep moving – standing still is death</div>
  `;
  document.body.appendChild(panel);

  // ---- Threat meter animation (simulated) ----
  let threat = 0;
  setInterval(() => {
    threat = (threat + Math.random() * 8) % 100;
    const fill = document.getElementById('threatFill');
    const percent = document.getElementById('threatPercent');
    if (fill && percent) {
      fill.style.width = threat + '%';
      percent.innerText = Math.floor(threat) + '%';
      fill.style.background = threat > 70 ? '#f87171' : threat > 30 ? '#fb923c' : '#4ade80';
    }
  }, 1800);

  // ---- Global kills counter (fake but addictive) ----
  let kills = 12740;
  setInterval(() => {
    kills += Math.floor(Math.random() * 23) + 5;
    const killsEl = document.getElementById('globalKills');
    if (killsEl) killsEl.innerText = kills.toLocaleString();
  }, 1100);

  // ---- Rotating weapon spotlight ----
  const weapons = [
    { icon: '🔫', name: 'Basic Rifle' },
    { icon: '🌊', name: 'Spread Shot' },
    { icon: '🎯', name: 'Sniper Rifle' },
    { icon: '🚀', name: 'Rocket Launcher' },
    { icon: '🔮', name: 'Orbit Shield' },
    { icon: '🔴', name: 'Laser Beam' }
  ];
  let wIdx = 0;
  setInterval(() => {
    wIdx = (wIdx + 1) % weapons.length;
    const iconEl = document.querySelector('.spotlight-icon');
    const nameEl = document.getElementById('spotlightWeapon');
    if (iconEl && nameEl) {
      iconEl.innerText = weapons[wIdx].icon;
      nameEl.innerText = weapons[wIdx].name;
      // add a tiny bounce
      iconEl.style.transform = 'scale(1.2)';
      setTimeout(() => { if(iconEl) iconEl.style.transform = ''; }, 200);
    }
  }, 3200);

  // ---- Rotating tips ----
  const tips = [
    '💡 Kill Splitters first – they multiply!',
    '⚡ Level up before the boss wave (every ~60s)',
    '🎯 Multi‑Shot + Spread Shot = bullet hell',
    '🛡️ Orbit Shield lets you tank while moving',
    '❤️ HP pickups heal 20 HP – don’t waste them',
    '🔥 Keep the combo alive within 2.5 seconds'
  ];
  let tipIdx = 0;
  setInterval(() => {
    tipIdx = (tipIdx + 1) % tips.length;
    const tipEl = document.getElementById('liveTip');
    if (tipEl) tipEl.innerText = tips[tipIdx];
  }, 5000);

  // ---- Mouse trail particles ----
  let mouseX = 0, mouseY = 0;
  let particles = [];
  function createTrailParticle(x, y) {
    particles.push({
      x, y, life: 1, vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5 - 1,
      size: Math.random() * 5 + 2,
      color: `hsl(${Math.random() * 60 + 200}, 70%, 65%)`
    });
  }
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    for (let i = 0; i < 2; i++) createTrailParticle(mouseX, mouseY);
  });
  function drawTrail() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // we don't want to clear the main bg – we'll composite over it
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 0.03;
      p.x += p.vx;
      p.y += p.vy;
      if (p.life <= 0) {
        particles.splice(i,1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life * 0.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(drawTrail);
  }
  drawTrail();

  // ---- Click ripple effect (for any card or button) ----
  document.body.addEventListener('click', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 800);
  });

  // ---- Add "crit" flash when hovering upgrade/weapon cards ----
  const cards = document.querySelectorAll('.upgrade-showcase-card, .weapon-card, .enemy-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.classList.add('card-flash');
      setTimeout(() => card.classList.remove('card-flash'), 200);
      // also increment fake global kills on hover (addictive)
      const killsEl = document.getElementById('globalKills');
      if (killsEl) {
        let current = parseInt(killsEl.innerText.replace(/,/g,''));
        if (!isNaN(current)) killsEl.innerText = (current + 1).toLocaleString();
      }
    });
  });

  // ---- Pulsing "PLAY NOW" button ----
  const playBtn = document.querySelector('.btn-primary, .nav-cta, .hero-actions .btn-primary');
  if (playBtn) {
    setInterval(() => {
      playBtn.classList.add('pulse-glow');
      setTimeout(() => playBtn.classList.remove('pulse-glow'), 800);
    }, 3000);
  }
})();

// Typing animation for "HORDE"
function typeHeroText() {
  const target = document.getElementById('typingTarget');
  if (!target) return;
  const fullText = 'HORDE';
  let i = 0;
  target.innerText = '';
  function type() {
    if (i < fullText.length) {
      target.innerText += fullText.charAt(i);
      i++;
      setTimeout(type, 120);
    } else {
      // remove cursor after typing once (optional)
      target.style.borderRight = 'none';
    }
  }
  type();
}
typeHeroText();

// Toast notification system
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span>${type === 'tip' ? '💡' : type === 'event' ? '⚡' : '🔔'}</span>
      <span style="flex:1">${message}</span>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// Rotating toast messages
const toastMessages = [
  { text: '💡 Tip: Keep moving – standing still is death', type: 'tip' },
  { text: '⚡ Multi-Shot + Spread Shot = bullet hell', type: 'tip' },
  { text: '🔥 Combo resets after 2.5 seconds – stay aggressive!', type: 'tip' },
  { text: '🎯 Sniper rifle pierces through multiple enemies', type: 'tip' },
  { text: '🛡️ Orbit Shield deals contact damage', type: 'tip' },
  { text: '💀 Boss spawns every ~60 seconds – prepare!', type: 'tip' },
  { text: '✨ Diarite can be spent in the Shop for permanent upgrades', type: 'event' },
  { text: '👥 47 players are fighting right now', type: 'event' },
  { text: '🏆 New record: Wave 27 achieved by a Ninja', type: 'event' },
];
let toastIndex = 0;
setInterval(() => {
  const msg = toastMessages[toastIndex % toastMessages.length];
  showToast(msg.text, msg.type);
  toastIndex++;
}, 14000); // every 14 seconds