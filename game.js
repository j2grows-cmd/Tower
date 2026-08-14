const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  coins: document.getElementById('coins'),
  wave: document.getElementById('wave'),
  enemies: document.getElementById('enemies'),
  bestWave: document.getElementById('best-wave'),
  hp: document.getElementById('tower-hp'),
  level: document.getElementById('tower-level'),
  healthFill: document.getElementById('tower-health-fill'),
  waveState: document.getElementById('wave-state'),
  progress: document.getElementById('wave-progress'),
  message: document.getElementById('combat-message')
};

const state = {
  coins: 0,
  wave: 1,
  bestWave: 0,
  defeated: 0,
  spawned: 0,
  tower: { damage: 10, speed: 1, range: 210, maxHealth: 100, health: 100, level: 1 },
  enemies: [],
  bullets: [],
  particles: [],
  texts: [],
  spawnTimer: 0,
  shotTimer: 0,
  waveDelay: 0,
  gameOver: false,
  lastTime: performance.now(),
  messageTimer: 0
};

const upgradeConfig = {
  damage: { base: 25, growth: 1.48, apply: () => { state.tower.damage += 2; } },
  speed: { base: 30, growth: 1.52, apply: () => { state.tower.speed += 0.1; } },
  range: { base: 35, growth: 1.5, apply: () => { state.tower.range += 15; } },
  health: { base: 40, growth: 1.55, apply: () => { state.tower.maxHealth += 20; state.tower.health += 20; } }
};

const upgradeLevels = { damage: 0, speed: 0, range: 0, health: 0 };

function costFor(type) {
  const c = upgradeConfig[type];
  return Math.floor(c.base * Math.pow(c.growth, upgradeLevels[type]));
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function towerPosition() {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function randomEnemy() {
  const p = towerPosition();
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.max(canvas.clientWidth, canvas.clientHeight) * 0.58 + 20;
  const hp = 24 + state.wave * 8;
  return {
    x: p.x + Math.cos(angle) * radius,
    y: p.y + Math.sin(angle) * radius,
    hp,
    maxHp: hp,
    speed: 25 + state.wave * 1.8 + Math.random() * 10,
    radius: 9 + Math.min(5, state.wave * .12),
    reward: 7 + Math.floor(state.wave * 1.5),
    hue: Math.random() < .18 ? 205 : 164,
    wobble: Math.random() * Math.PI * 2
  };
}

function waveSize() {
  return 4 + state.wave * 2;
}

function spawnEnemy() {
  if (state.spawned >= waveSize()) return;
  state.enemies.push(randomEnemy());
  state.spawned += 1;
}

function startNextWave() {
  state.wave += 1;
  state.bestWave = Math.max(state.bestWave, state.wave);
  state.defeated = 0;
  state.spawned = 0;
  state.spawnTimer = 0;
  state.waveDelay = 0;
  state.tower.health = Math.min(state.tower.maxHealth, state.tower.health + state.tower.maxHealth * .08);
  setMessage(`Wave ${state.wave} incoming`);
  burst(towerPosition().x, towerPosition().y, 18, '#7da7ff');
}

function setMessage(text, duration = 2) {
  ui.message.textContent = text;
  state.messageTimer = duration;
}

function acquireTarget() {
  const p = towerPosition();
  let target = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
    if (d <= state.tower.range && d < bestDistance) {
      bestDistance = d;
      target = enemy;
    }
  }
  return target;
}

function fire(target) {
  const p = towerPosition();
  state.bullets.push({ x: p.x, y: p.y, target, speed: 620, damage: state.tower.damage, life: 1.2 });
  burst(p.x, p.y, 3, '#69e0c0');
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  burst(enemy.x, enemy.y, 3, '#d8fff5');
  if (enemy.hp <= 0) {
    const reward = enemy.reward;
    state.coins += reward;
    state.defeated += 1;
    state.enemies = state.enemies.filter(e => e !== enemy);
    burst(enemy.x, enemy.y, 12, enemy.hue === 205 ? '#7da7ff' : '#69e0c0');
    floatingText(`+${reward}`, enemy.x, enemy.y - 16, '#f4c95d');
    setMessage(`Enemy destroyed  +${reward}`);
  }
}

function hitTower(enemy) {
  const damage = 7 + Math.floor(state.wave * 1.3);
  state.tower.health -= damage;
  burst(enemy.x, enemy.y, 12, '#ff6d7d');
  floatingText(`-${damage}`, towerPosition().x, towerPosition().y - 42, '#ff6d7d');
  setMessage('Tower under attack');
  if (state.tower.health <= 0) {
    state.tower.health = 0;
    state.gameOver = true;
    state.bestWave = Math.max(state.bestWave, state.wave);
    burst(towerPosition().x, towerPosition().y, 60, '#ff6d7d');
  }
}

function burst(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 20 + Math.random() * 100;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .25 + Math.random() * .45, max: .7, size: 1.5 + Math.random() * 3, color });
  }
}

function floatingText(text, x, y, color) {
  state.texts.push({ text, x, y, color, life: .8 });
}

function update(dt) {
  if (state.gameOver) return;

  if (state.messageTimer > 0) state.messageTimer -= dt;

  const total = waveSize();
  if (state.spawned < total) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(.24, .7 - state.wave * .012);
    }
  } else if (state.enemies.length === 0) {
    state.waveDelay += dt;
    if (state.waveDelay > 1.5) startNextWave();
  }

  state.shotTimer -= dt;
  if (state.shotTimer <= 0) {
    const target = acquireTarget();
    if (target) {
      fire(target);
      state.shotTimer = 1 / state.tower.speed;
    } else {
      state.shotTimer = .05;
    }
  }

  const p = towerPosition();
  for (const enemy of [...state.enemies]) {
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    enemy.wobble += dt * 3;
    if (distance <= 40) {
      hitTower(enemy);
      state.enemies = state.enemies.filter(e => e !== enemy);
      continue;
    }
    enemy.x += (dx / distance) * enemy.speed * dt;
    enemy.y += (dy / distance) * enemy.speed * dt;
  }

  for (const bullet of [...state.bullets]) {
    bullet.life -= dt;
    if (!state.enemies.includes(bullet.target)) {
      state.bullets = state.bullets.filter(b => b !== bullet);
      continue;
    }
    const dx = bullet.target.x - bullet.x;
    const dy = bullet.target.y - bullet.y;
    const d = Math.hypot(dx, dy);
    if (d < 10 || bullet.life <= 0) {
      if (bullet.life > 0) damageEnemy(bullet.target, bullet.damage);
      state.bullets = state.bullets.filter(b => b !== bullet);
    } else {
      bullet.x += (dx / d) * bullet.speed * dt;
      bullet.y += (dy / d) * bullet.speed * dt;
    }
  }

  for (const particle of [...state.particles]) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= .97;
    particle.vy *= .97;
    if (particle.life <= 0) state.particles = state.particles.filter(p => p !== particle);
  }
  for (const text of [...state.texts]) {
    text.life -= dt;
    text.y -= 24 * dt;
    if (text.life <= 0) state.texts = state.texts.filter(t => t !== text);
  }
}

function drawBackground(w, h) {
  ctx.fillStyle = '#09111f';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(88,116,150,.12)';
  ctx.lineWidth = 1;
  const gap = 36;
  for (let x = 0; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function drawRange(p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, state.tower.range, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(105,224,192,.025)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(105,224,192,.10)';
  ctx.setLineDash([4, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTower(p) {
  ctx.save();
  ctx.shadowColor = 'rgba(105,224,192,.25)';
  ctx.shadowBlur = 28;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#12283a';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#172f42';
  ctx.fill();
  ctx.strokeStyle = '#69e0c0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#69e0c0';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x + 22, p.y); ctx.lineTo(p.x, p.y + 7); ctx.closePath();
  ctx.fillStyle = '#d9fff5';
  ctx.fill();
}

function drawEnemy(enemy) {
  const wobble = Math.sin(enemy.wobble) * 1.2;
  ctx.save();
  ctx.translate(enemy.x, enemy.y + wobble);
  ctx.shadowColor = enemy.hue === 205 ? 'rgba(125,167,255,.25)' : 'rgba(105,224,192,.2)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
  ctx.fillStyle = enemy.hue === 205 ? '#31548f' : '#2c7568';
  ctx.fill();
  ctx.strokeStyle = enemy.hue === 205 ? '#7da7ff' : '#69e0c0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  const barW = enemy.radius * 2.4;
  ctx.fillStyle = '#202a39';
  ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 7, barW, 3);
  ctx.fillStyle = '#ff7180';
  ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 7, barW * Math.max(0, enemy.hp / enemy.maxHp), 3);
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  drawBackground(w, h);
  const p = towerPosition();
  drawRange(p);

  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#d9fff5';
    ctx.shadowColor = '#69e0c0';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const enemy of state.enemies) drawEnemy(enemy);
  drawTower(p);

  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
  for (const text of state.texts) {
    ctx.globalAlpha = Math.max(0, text.life / .8);
    ctx.fillStyle = text.color;
    ctx.font = '800 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(text.text, text.x, text.y);
  }
  ctx.globalAlpha = 1;

  if (state.gameOver) drawGameOver(w, h);
}

function drawGameOver(w, h) {
  ctx.fillStyle = 'rgba(5,9,16,.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff7b88';
  ctx.font = '900 28px system-ui';
  ctx.fillText('TOWER FALLEN', w / 2, h / 2 - 20);
  ctx.fillStyle = '#b5c1d1';
  ctx.font = '600 12px system-ui';
  ctx.fillText(`Wave ${state.wave} reached  •  ${state.coins} coins earned`, w / 2, h / 2 + 10);
  ctx.fillStyle = '#69e0c0';
  ctx.font = '800 11px system-ui';
  ctx.fillText('PRESS RESTART TO TRY AGAIN', w / 2, h / 2 + 40);
}

function updateUI() {
  ui.coins.textContent = Math.floor(state.coins);
  ui.wave.textContent = state.wave;
  ui.enemies.textContent = state.enemies.length;
  ui.bestWave.textContent = state.bestWave;
  ui.hp.textContent = `${Math.ceil(state.tower.health)} / ${state.tower.maxHealth}`;
  ui.level.textContent = `LV ${state.tower.level}`;
  ui.healthFill.style.width = `${Math.max(0, state.tower.health / state.tower.maxHealth * 100)}%`;
  ui.waveState.textContent = state.gameOver ? 'GAME OVER' : `WAVE ${state.wave}`;
  ui.progress.textContent = state.enemies.length || state.spawned < waveSize()
    ? `${state.defeated} / ${waveSize()} defeated`
    : 'Wave cleared';

  const values = {
    damage: `${state.tower.damage} → ${state.tower.damage + 2}`,
    speed: `${state.tower.speed.toFixed(1)} /s → ${(state.tower.speed + .1).toFixed(1)} /s`,
    range: `${state.tower.range} → ${state.tower.range + 15}`,
    health: `${state.tower.maxHealth} → ${state.tower.maxHealth + 20}`
  };
  for (const type of Object.keys(upgradeConfig)) {
    document.getElementById(`${type}-value`).textContent = values[type];
    document.getElementById(`${type}-cost`).textContent = costFor(type);
    const button = document.querySelector(`[data-upgrade="${type}"]`);
    button.disabled = state.gameOver || state.coins < costFor(type);
  }
}

function buyUpgrade(type) {
  if (state.gameOver) return;
  const cost = costFor(type);
  if (state.coins < cost) return;
  state.coins -= cost;
  upgradeConfig[type].apply();
  upgradeLevels[type] += 1;
  state.tower.level += 1;
  setMessage(`${type[0].toUpperCase() + type.slice(1)} upgraded`);
  burst(towerPosition().x, towerPosition().y, 10, '#69e0c0');
  updateUI();
}

document.querySelectorAll('.upgrade').forEach(button => {
  button.addEventListener('click', () => buyUpgrade(button.dataset.upgrade));
});

document.getElementById('reset').addEventListener('click', () => {
  state.coins = 0;
  state.wave = 1;
  state.bestWave = 0;
  state.defeated = 0;
  state.spawned = 0;
  state.enemies = [];
  state.bullets = [];
  state.particles = [];
  state.texts = [];
  state.spawnTimer = 0;
  state.shotTimer = 0;
  state.waveDelay = 0;
  state.gameOver = false;
  state.tower = { damage: 10, speed: 1, range: 210, maxHealth: 100, health: 100, level: 1 };
  Object.keys(upgradeLevels).forEach(k => { upgradeLevels[k] = 0; });
  setMessage('Systems online');
  updateUI();
});

function loop(now) {
  const dt = Math.min(.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  update(dt);
  draw();
  updateUI();
  requestAnimationFrame(loop);
}

updateUI();
requestAnimationFrame(loop);
