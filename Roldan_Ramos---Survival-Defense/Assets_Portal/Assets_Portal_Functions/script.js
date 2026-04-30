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