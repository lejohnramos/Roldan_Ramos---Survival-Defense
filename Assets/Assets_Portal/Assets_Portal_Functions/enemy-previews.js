// ── ENEMY PREVIEW CANVAS RENDERER ──
// This replicates the zombie drawing functions from your game.js

// Helper function to draw a zombie on a canvas
function drawZombieOnCanvas(ctx, width, height, zombieType, color, size = 1) {
  ctx.clearRect(0, 0, width, height);
  
  // Center the drawing
  ctx.save();
  ctx.translate(width / 2, height / 2);
  
  // Shadow on ground
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 10 * size, 8 * size, 3 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  
  const s = size;
  const wobble = 0;
  
  if (zombieType === 'boss') {
    // BOSS ZOMBIE
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
    
    ctx.fillStyle = '#2a3a0a';
    ctx.fillRect(-22 * s, -10 * s, 10 * s, 6 * s);
    ctx.fillRect(12 * s, -10 * s, 10 * s, 6 * s);
    
    ctx.fillStyle = '#3d5c1a';
    ctx.beginPath();
    ctx.arc(-17 * s, -7 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(17 * s, -7 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#3d5c1a';
    ctx.fillRect(-5 * s, -16 * s, 10 * s, 5 * s);
    ctx.fillStyle = '#4a7020';
    ctx.beginPath();
    ctx.ellipse(0, -22 * s, 11 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 14 * s;
    ctx.beginPath();
    ctx.ellipse(-4 * s, -23 * s, 3 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4 * s, -23 * s, 3 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
  } else if (zombieType === 'fast') {
    // FAST RUNNER
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-4 * s, 2 * s, 3 * s, 8 * s);
    ctx.fillRect(1 * s, 2 * s, 3 * s, 8 * s);
    
    ctx.rotate(0.3);
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(-5 * s, -8 * s, 10 * s, 11 * s);
    ctx.rotate(-0.3);
    
    ctx.fillStyle = '#4a3a1a';
    ctx.fillRect(-14 * s, -6 * s, 7 * s, 3 * s);
    ctx.fillRect(7 * s, -6 * s, 7 * s, 3 * s);
    
    ctx.fillStyle = '#5a4520';
    ctx.beginPath();
    ctx.ellipse(0, -12 * s, 5 * s, 6 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ff6600';
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 8 * s;
    ctx.beginPath();
    ctx.arc(-2 * s, -13 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2 * s, -13 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
  } else if (zombieType === 'elite') {
    // ELITE BRUTE
    ctx.fillStyle = '#1a2a0a';
    ctx.fillRect(-6 * s, 3 * s, 5 * s, 10 * s);
    ctx.fillRect(1 * s, 3 * s, 5 * s, 10 * s);
    
    ctx.fillStyle = '#1a2a0a';
    ctx.fillRect(-8 * s, -10 * s, 16 * s, 14 * s);
    ctx.fillStyle = '#333';
    ctx.fillRect(-8 * s, -10 * s, 16 * s, 4 * s);
    
    ctx.fillStyle = '#2a3a0a';
    ctx.fillRect(-15 * s, -8 * s, 7 * s, 5 * s);
    ctx.fillRect(8 * s, -8 * s, 7 * s, 5 * s);
    
    ctx.fillStyle = '#5a4020';
    ctx.beginPath();
    ctx.ellipse(0, -15 * s, 7 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(0, -17 * s, 8 * s, 6 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#f87171';
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 10 * s;
    ctx.beginPath();
    ctx.arc(-3 * s, -16 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3 * s, -16 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
  } else if (zombieType === 'splitter') {
    // SPLITTER - Bloated, pustule-covered
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(-5 * s, 4 * s, 4 * s, 8 * s);
    ctx.fillRect(1 * s, 4 * s, 4 * s, 8 * s);
    
    ctx.fillStyle = '#4a6a10';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#8aaa20';
    const pustules = [[-6, -3], [5, -5], [-2, 4], [7, 2], [-7, 5], [3, -8]];
    for (const [px, py] of pustules) {
      ctx.beginPath();
      ctx.arc(px * s, py * s, 2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.fillStyle = '#5a7a18';
    ctx.beginPath();
    ctx.ellipse(0, -13 * s, 6 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#aacc00';
    ctx.shadowColor = '#aacc00';
    ctx.shadowBlur = 8 * s;
    ctx.beginPath();
    ctx.arc(-3 * s, -14 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3 * s, -14 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
  } else if (zombieType === 'shielded') {
    // SHIELDED - Carries a shield
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-5 * s, 3 * s, 4 * s, 9 * s);
    ctx.fillRect(1 * s, 3 * s, 4 * s, 9 * s);
    
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(-7 * s, -8 * s, 14 * s, 12 * s);
    
    ctx.fillStyle = '#2a3a4a';
    ctx.fillRect(-18 * s, -14 * s, 10 * s, 22 * s);
    ctx.strokeStyle = '#3a5a6a';
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(-18 * s, -14 * s, 10 * s, 22 * s);
    
    ctx.fillStyle = '#5a4520';
    ctx.beginPath();
    ctx.ellipse(1 * s, -13 * s, 6 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 6 * s;
    ctx.beginPath();
    ctx.arc(-2 * s, -15 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4 * s, -15 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
  } else {
    // STANDARD ZOMBIE
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-5 * s, 2 * s, 4 * s, 9 * s);
    ctx.fillRect(1 * s, 3 * s, 4 * s, 9 * s);
    
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(-6 * s, -8 * s, 12 * s, 11 * s);
    
    ctx.fillStyle = '#4a3a1a';
    ctx.fillRect(-14 * s, -7 * s, 8 * s, 4 * s);
    ctx.fillRect(6 * s, -10 * s, 8 * s, 4 * s);
    
    ctx.fillStyle = '#5a4520';
    ctx.fillRect(-2 * s, -11 * s, 4 * s, 4 * s);
    
    ctx.fillStyle = '#6a5530';
    ctx.beginPath();
    ctx.ellipse(0, -17 * s, 6 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ff3300';
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 8 * s;
    ctx.beginPath();
    ctx.arc(-3 * s, -18 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3 * s, -18 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  
  ctx.restore();
}

// Enemy data matching your game
const enemiesData = [
  {
    name: 'STANDARD ZOMBIE',
    type: 'standard',
    badge: 'Common — Every Wave',
    badgeColor: '#e879f9',
    description: 'The backbone of every assault. Individually harmless, but they swarm relentlessly. As waves progress, their numbers multiply. <strong>Don\'t let them surround you.</strong>',
    stats: ['❤️ HP: 30 + (wave×5)', '⚡ SPD: ★★☆', '💀 DMG: 10', '⭐ XP: 5'],
    quote: '"The silent majority. Underestimate them and die."',
    color: '#e879f9',
    size: 1
  },
  {
    name: 'RUNNER',
    type: 'fast',
    badge: 'Fast — Wave 1+',
    badgeColor: '#fb923c',
    description: 'Small, fragile, and blindingly fast. Runners can close the gap before your bullets land. They\'re the reason you can\'t stand still. <strong>Prioritize them or get flanked.</strong>',
    stats: ['❤️ HP: 15-25', '⚡ SPD: ★★★ (250% speed)', '💀 DMG: 5', '⭐ XP: 3'],
    quote: '"Fast, fragile, fatal. Kill them first."',
    color: '#fb923c',
    size: 0.8
  },
  {
    name: 'ELITE BRUTE',
    type: 'elite',
    badge: 'Elite — Wave 3+',
    badgeColor: '#f87171',
    description: 'Heavily armored and devastating. Elites absorb massive damage and hit like a truck. They appear rarely, but when they do, they demand your full attention. <strong>Kite them while clearing the swarm.</strong>',
    stats: ['❤️ HP: 80+', '⚡ SPD: ★☆☆', '💀 DMG: 20', '⭐ XP: 10'],
    quote: '"A walking fortress. Respect the damage."',
    color: '#f87171',
    size: 1.2
  },
  {
    name: 'BOSS — APOCALYPSE',
    type: 'boss',
    badge: 'Boss — Every 60 seconds',
    badgeColor: '#ff4444',
    description: 'A massive juggernaut with 500+ HP. The screen shakes when it spawns. The boss signals an intense wave — focus all firepower while dodging its powerful attacks. <strong>Survive the boss to prove your worth.</strong>',
    stats: ['❤️ HP: 500+', '⚡ SPD: ★☆☆', '💀 DMG: 25', '⭐ XP: 40'],
    quote: '"⚠ BOSS INCOMING! This is the real test."',
    color: '#ff4444',
    size: 1.5
  },
  {
    name: 'SPLITTER',
    type: 'splitter',
    badge: 'Splitter — Wave 2+',
    badgeColor: '#a78bfa',
    description: 'Bloated with corrupted matter. When killed, it bursts into <strong>2 smaller enemies</strong> that continue the assault. Never let them multiply unchecked. <strong>Kill them in open space to manage the chaos.</strong>',
    stats: ['❤️ HP: 45', '⚡ SPD: ★★☆', '💀 DMG: 10', '⭐ XP: 7'],
    quote: '"Kill one, get two. A hydra among zombies."',
    color: '#a78bfa',
    size: 1
  },
  {
    name: 'SHIELDED',
    type: 'shielded',
    badge: 'Shielded — Wave 2+',
    badgeColor: '#38bdf8',
    description: 'Protected by a shimmering energy barrier. You must <strong>break the shield</strong> before dealing damage to its HP. Shields regenerate slowly if left alone. Focus fire to punch through.',
    stats: ['❤️ HP: 40', '🛡️ Shield: 60', '⚡ SPD: ★★☆', '💀 DMG: 12'],
    quote: '"Break the blue, then break the bones."',
    color: '#38bdf8',
    size: 1
  }
];

// Render all enemies with canvas previews
function renderEnemies() {
  const container = document.getElementById('enemiesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  enemiesData.forEach((enemy, index) => {
    const card = document.createElement('div');
    card.className = 'enemy-card';
    card.style.setProperty('--clr', enemy.color);
    
    // Create canvas for enemy preview
    const canvasId = `enemyCanvas_${index}`;
    const canvasSize = 100;
    
    card.innerHTML = `
      <div class="enemy-preview-container">
        <canvas id="${canvasId}" width="${canvasSize}" height="${canvasSize}" class="enemy-canvas-preview" style="width: ${canvasSize}px; height: ${canvasSize}px;"></canvas>
      </div>
      <div class="enemy-info">
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-type-badge" style="color:${enemy.badgeColor}">${enemy.badge}</div>
        <p>${enemy.description}</p>
        <div class="enemy-stats-row">
          ${enemy.stats.map(stat => `<div class="enemy-stat-pill">${stat}</div>`).join('')}
        </div>
        <div class="enemy-quote">${enemy.quote}</div>
      </div>
    `;
    
    container.appendChild(card);
    
    // Draw on canvas
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    drawZombieOnCanvas(ctx, canvasSize, canvasSize, enemy.type, enemy.color, enemy.size);
    
    // Add animation frame for idle animation
    let time = 0;
    function animateEnemy() {
      time += 0.05;
      const wobble = Math.sin(time) * 0.1;
      drawZombieOnCanvas(ctx, canvasSize, canvasSize, enemy.type, enemy.color, enemy.size);
      requestAnimationFrame(animateEnemy);
    }
    animateEnemy();
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', renderEnemies);