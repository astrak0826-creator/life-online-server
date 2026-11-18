// ================= [오프스크린 2.5D 월드 바닥 질감 베이킹 (60x15: 기숙사 + 동쪽숲1 + 동쪽숲2)] =================
const worldBgCanvas = document.createElement('canvas');
const worldBgCtx = worldBgCanvas.getContext('2d');
let isWorldBgBaked = false;

const floatingCandles = Array.from({ length: 18 }, (_, i) => ({
  x: 70 + (i * 41) % 720,
  y: 35 + (i * 29) % 120,
  phase: i * 0.7,
  scale: 0.8 + (i % 3) * 0.2
}));

const emberParticles = Array.from({ length: 48 }, () => ({
  x: Math.random() * 2400,
  y: Math.random() * 600,
  vx: (Math.random() - 0.5) * 0.45,
  vy: -(Math.random() * 0.65 + 0.2),
  size: Math.random() * 2.4 + 0.9,
  alpha: Math.random() * 0.75 + 0.2
}));

// 렉 방지 오브젝트 풀 상한선(Cap)
const MAX_PROJECTILES = 90;
const MAX_MELEE_EFFECTS = 35;
const MAX_HIT_EFFECTS = 45;
const MAX_FLOATING_DAMAGES = 65;
const MAX_FOOTSTEP_DUSTS = 40;

function seededRand(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// 모바일 기기 및 강제 세로/가로 패드 전체화면 판별 & 줌 배율(userZoomScale) 반영 해상도 동기화
function isMobileViewport() {
  if (
    document.body &&
    (document.body.classList.contains('force-portrait-pad') ||
      document.body.classList.contains('force-landscape-pad'))
  ) {
    return true;
  }
  return window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 820px)').matches;
}

function syncCanvasViewportResolution() {
  if (!canvas) return;
  const zoom = (typeof window.userZoomScale === 'number' && window.userZoomScale > 0)
    ? window.userZoomScale
    : 1.0;

  if (!isMobileViewport()) {
    const targetW = Math.round(800 / zoom);
    const targetH = Math.round(600 / zoom);
    if (Math.abs(canvas.width - targetW) > 1 || Math.abs(canvas.height - targetH) > 1) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    return;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return;

  // 기본 520px를 기준으로 유저 줌 배율(0.6x ~ 1.6x)을 나눠 시야 범위를 자유롭게 확장/축소
  const baseLongSide = 520;
  const targetLongSide = Math.round(baseLongSide / zoom);
  let nextW, nextH;
  if (rect.width >= rect.height) {
    nextW = targetLongSide;
    nextH = Math.max(180, Math.round(targetLongSide * (rect.height / rect.width)));
  } else {
    nextH = targetLongSide;
    nextW = Math.max(200, Math.round(targetLongSide * (rect.width / rect.height)));
  }

  if (Math.abs(canvas.width - nextW) > 2 || Math.abs(canvas.height - nextH) > 2) {
    canvas.width = nextW;
    canvas.height = nextH;
  }
}

// 줌아웃 시 화면이 맵 크기보다 커져도 맵을 화면 정중앙에 깔끔하게 정렬해주는 카메라 계산 헬퍼
function computeCameraPos(focusPlayer) {
  const worldW = mapW * TILE_SIZE;
  const worldH = mapH * TILE_SIZE;
  let cx = 0;
  let cy = 0;

  if (worldW <= canvas.width) {
    cx = (worldW - canvas.width) / 2;
  } else if (focusPlayer) {
    const px = focusPlayer.renderX !== undefined ? focusPlayer.renderX : focusPlayer.x * TILE_SIZE;
    cx = Math.max(0, Math.min(worldW - canvas.width, px - canvas.width / 2 + 20));
  }

  if (worldH <= canvas.height) {
    cy = (worldH - canvas.height) / 2;
  } else if (focusPlayer) {
    const py = focusPlayer.renderY !== undefined ? focusPlayer.renderY : focusPlayer.y * TILE_SIZE;
    cy = Math.max(0, Math.min(worldH - canvas.height, py - canvas.height / 2 + 20));
  }

  return { camX: cx, camY: cy };
}

window.addEventListener('resize', syncCanvasViewportResolution);
window.addEventListener('orientationchange', () => setTimeout(syncCanvasViewportResolution, 120));

function bakeWorldBackground() {
  worldBgCanvas.width = mapW * TILE_SIZE;
  worldBgCanvas.height = mapH * TILE_SIZE;
  const bctx = worldBgCtx;
  const W = worldBgCanvas.width;
  const H = worldBgCanvas.height;

  // 1. 기숙사 홀 (X: 0 ~ 800) 고급 석조 질감
  const dormGrad = bctx.createLinearGradient(0, 0, 800, H);
  dormGrad.addColorStop(0, '#1e1620');
  dormGrad.addColorStop(0.5, '#261b28');
  dormGrad.addColorStop(1, '#1a131c');
  bctx.fillStyle = dormGrad;
  bctx.fillRect(0, 0, 800, H);

  for (let i = 0; i < 420; i++) {
    const rx = seededRand(i * 3 + 1) * 785;
    const ry = 76 + seededRand(i * 3 + 2) * (H - 84);
    const rw = 18 + seededRand(i * 3 + 3) * 26;
    const rh = 12 + seededRand(i * 3 + 4) * 18;
    bctx.fillStyle = i % 2 === 0 ? 'rgba(255, 235, 210, 0.025)' : 'rgba(0, 0, 0, 0.14)';
    bctx.beginPath();
    bctx.roundRect(rx, ry, rw, rh, 4);
    bctx.fill();
  }

  const wallGrad = bctx.createLinearGradient(0, 0, 0, 80);
  wallGrad.addColorStop(0, '#0f0a12');
  wallGrad.addColorStop(0.85, '#1d1422');
  wallGrad.addColorStop(1, '#09060b');
  bctx.fillStyle = wallGrad;
  bctx.fillRect(0, 0, 800, 78);
  bctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  bctx.fillRect(0, 78, 800, 14);

  const cpX = 4 * TILE_SIZE, cpY = 4 * TILE_SIZE;
  const cpW = 12 * TILE_SIZE, cpH = 9 * TILE_SIZE;
  bctx.save();
  bctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  bctx.beginPath();
  bctx.roundRect(cpX + 5, cpY + 6, cpW, cpH, 10);
  bctx.fill();

  const carpetGrad = bctx.createRadialGradient(cpX + cpW / 2, cpY + cpH / 2, 20, cpX + cpW / 2, cpY + cpH / 2, 300);
  carpetGrad.addColorStop(0, '#6b1224');
  carpetGrad.addColorStop(0.7, '#4c0d19');
  carpetGrad.addColorStop(1, '#360811');
  bctx.fillStyle = carpetGrad;
  bctx.beginPath();
  bctx.roundRect(cpX, cpY, cpW, cpH, 8);
  bctx.fill();

  bctx.strokeStyle = '#d97706';
  bctx.lineWidth = 3;
  bctx.strokeRect(cpX + 4, cpY + 4, cpW - 8, cpH - 8);
  bctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  bctx.lineWidth = 1;
  bctx.strokeRect(cpX + 10, cpY + 10, cpW - 20, cpH - 20);
  bctx.restore();

  // 2. 동쪽숲1 (X: 800 ~ 1600) 초원 잔디·흙길 질감
  const forestGrad = bctx.createLinearGradient(800, 0, 1600, H);
  forestGrad.addColorStop(0, '#2d4c1e');
  forestGrad.addColorStop(0.45, '#365824');
  forestGrad.addColorStop(1, '#253f18');
  bctx.fillStyle = forestGrad;
  bctx.fillRect(800, 0, 800, H);

  for (let i = 0; i < 340; i++) {
    const gx = 805 + seededRand(i * 7 + 10) * 790;
    const gy = seededRand(i * 7 + 11) * H;
    const gr = 22 + seededRand(i * 7 + 12) * 55;
    const gPatch = bctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
    if (i % 3 === 0) {
      gPatch.addColorStop(0, 'rgba(101, 163, 13, 0.22)');
      gPatch.addColorStop(1, 'rgba(101, 163, 13, 0)');
    } else if (i % 3 === 1) {
      gPatch.addColorStop(0, 'rgba(20, 40, 12, 0.24)');
      gPatch.addColorStop(1, 'rgba(20, 40, 12, 0)');
    } else {
      gPatch.addColorStop(0, 'rgba(132, 204, 22, 0.14)');
      gPatch.addColorStop(1, 'rgba(132, 204, 22, 0)');
    }
    bctx.fillStyle = gPatch;
    bctx.beginPath();
    bctx.arc(gx, gy, gr, 0, Math.PI * 2);
    bctx.fill();
  }

  // 3. 동쪽숲2 (X: 1600 ~ 2400) 보랏빛·청록빛 역병의 포자 숲 질감
  if (W > 1600) {
    const plagueGrad = bctx.createLinearGradient(1600, 0, W, H);
    plagueGrad.addColorStop(0, '#1e1b2e');
    plagueGrad.addColorStop(0.5, '#19282f');
    plagueGrad.addColorStop(1, '#141222');
    bctx.fillStyle = plagueGrad;
    bctx.fillRect(1600, 0, W - 1600, H);

    for (let i = 0; i < 340; i++) {
      const px = 1605 + seededRand(i * 13 + 5) * 790;
      const py = seededRand(i * 13 + 6) * H;
      const pr = 24 + seededRand(i * 13 + 7) * 58;
      const pPatch = bctx.createRadialGradient(px, py, 2, px, py, pr);
      if (i % 3 === 0) {
        pPatch.addColorStop(0, 'rgba(139, 92, 246, 0.20)');
        pPatch.addColorStop(1, 'rgba(139, 92, 246, 0)');
      } else if (i % 3 === 1) {
        pPatch.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
        pPatch.addColorStop(1, 'rgba(16, 185, 129, 0)');
      } else {
        pPatch.addColorStop(0, 'rgba(15, 23, 42, 0.35)');
        pPatch.addColorStop(1, 'rgba(15, 23, 42, 0)');
      }
      bctx.fillStyle = pPatch;
      bctx.beginPath();
      bctx.arc(px, py, pr, 0, Math.PI * 2);
      bctx.fill();
    }
  }

  // 사냥터 흙길 (동쪽숲1 ~ 동쪽숲2 관통)
  const dirtPoints = [
    { x: 800, y: 300, r: 68 }, { x: 870, y: 305, r: 62 }, { x: 950, y: 295, r: 58 },
    { x: 1030, y: 310, r: 64 }, { x: 1120, y: 300, r: 60 }, { x: 1210, y: 285, r: 56 },
    { x: 1300, y: 305, r: 62 }, { x: 1400, y: 315, r: 58 }, { x: 1500, y: 300, r: 60 },
    { x: 1600, y: 300, r: 68 }, { x: 1700, y: 295, r: 60 }, { x: 1810, y: 310, r: 62 },
    { x: 1920, y: 300, r: 58 }, { x: 2040, y: 290, r: 60 }, { x: 2160, y: 305, r: 56 }
  ];
  dirtPoints.forEach(dp => {
    const isZone2 = dp.x >= 1600;
    const dGrad = bctx.createRadialGradient(dp.x, dp.y, dp.r * 0.2, dp.x, dp.y, dp.r);
    dGrad.addColorStop(0, isZone2 ? 'rgba(76, 53, 92, 0.52)' : 'rgba(120, 82, 48, 0.55)');
    dGrad.addColorStop(0.65, isZone2 ? 'rgba(49, 36, 66, 0.30)' : 'rgba(102, 68, 38, 0.32)');
    dGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bctx.fillStyle = dGrad;
    bctx.beginPath();
    bctx.arc(dp.x, dp.y, dp.r, 0, Math.PI * 2);
    bctx.fill();
  });

  // 구역 경계선 음영 (X=800, X=1600)
  [800, 1600].forEach(bx => {
    const borderGrad = bctx.createLinearGradient(bx - 25, 0, bx + 35, 0);
    borderGrad.addColorStop(0, 'rgba(0,0,0,0)');
    borderGrad.addColorStop(0.5, 'rgba(10, 6, 14, 0.6)');
    borderGrad.addColorStop(1, 'rgba(0,0,0,0)');
    bctx.fillStyle = borderGrad;
    bctx.fillRect(bx - 25, 0, 60, H);
  });

  // 풀잎 및 포자 식물 디테일
  for (let i = 0; i < 750; i++) {
    const tx = 812 + seededRand(i * 11 + 1) * (W - 824);
    const ty = 14 + seededRand(i * 11 + 2) * (H - 28);
    const inZone2 = tx >= 1600;
    bctx.strokeStyle = inZone2
      ? (i % 2 === 0 ? 'rgba(167, 139, 250, 0.35)' : 'rgba(45, 212, 191, 0.35)')
      : (i % 2 === 0 ? 'rgba(163, 230, 53, 0.35)' : 'rgba(34, 84, 24, 0.45)');
    bctx.lineWidth = 1.3;
    bctx.beginPath();
    bctx.moveTo(tx, ty);
    bctx.lineTo(tx - 2, ty - 5);
    bctx.moveTo(tx, ty);
    bctx.lineTo(tx + 2.5, ty - 4.5);
    bctx.stroke();

    if (i % 18 === 0) {
      bctx.fillStyle = inZone2 ? (i % 36 === 0 ? '#34d399' : '#c084fc') : (i % 36 === 0 ? '#fef08a' : '#f9a8d4');
      bctx.beginPath();
      bctx.arc(tx, ty - 5, 1.8, 0, Math.PI * 2);
      bctx.fill();
    }
  }

  isWorldBgBaked = true;
}

// ================= [기운·달리기 & 6종 전 무기 자동 타게팅 + 50강 전용 스킬 시스템] =================
let isSpaceHeld = false;
let auraSpamTimer = null;

function handleSpaceAction(isHoldRepeat = false) {
  if (!socket || !players[myId]) return;
  const me = players[myId];

  if (!npcDialogModal.classList.contains('hidden')) {
    if (!isHoldRepeat) advanceNpcDialog();
    return;
  }

  if (!isHoldRepeat) {
    const nearNpc = DORM_NPCS.find(n => Math.hypot(me.x - n.x, me.y - n.y) <= 1.55);
    if (nearNpc) {
      openNpcDialog(nearNpc);
      return;
    }
  }

  trigger360AuraBurst(me, !isHoldRepeat);
  socket.emit('emitAura');
}

function startAuraHold(e) {
  if (e && e.cancelable) e.preventDefault();
  isSpaceHeld = true;
  if (auraSpamTimer) return;
  handleSpaceAction(false);
  auraSpamTimer = setInterval(() => {
    handleSpaceAction(true);
  }, 160);
}
function stopAuraHold() {
  isSpaceHeld = false;
  if (auraSpamTimer) {
    clearInterval(auraSpamTimer);
    auraSpamTimer = null;
  }
}

const mBtnAura = document.getElementById('mBtnAura');
const dBtnAura = document.getElementById('dBtnAura');
[mBtnAura, dBtnAura].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('touchstart', startAuraHold, { passive: false });
  btn.addEventListener('touchend', stopAuraHold);
  btn.addEventListener('touchcancel', stopAuraHold);
  btn.addEventListener('mousedown', startAuraHold);
  btn.addEventListener('mouseup', stopAuraHold);
  btn.addEventListener('mouseleave', stopAuraHold);
});

let lastAttackClientTime = 0;
let attackHoldTimer = null;
let localSwingToggle = 1;

// 사이클 기반 스킬 카운터 (대검 GG: 3타마다, 활 삼삼구샷: 4타마다)
let greatswordAttackCount = 0;
let bowAttackCount = 0;

function dirToAngle(dir) {
  if (dir === 'up') return -Math.PI / 2;
  if (dir === 'left') return Math.PI;
  if (dir === 'right') return 0;
  return Math.PI / 2;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function getMonsterWorldCenter(m) {
  const mSize = m.size || 1;
  const halfPx = (mSize * TILE_SIZE) / 2;
  const rx = m.renderX !== undefined ? m.renderX : m.x * TILE_SIZE;
  const ry = m.renderY !== undefined ? m.renderY : m.y * TILE_SIZE;
  return { cx: rx + halfPx, cy: ry + halfPx, radius: mSize === 2 ? 38 : 18 };
}

// 6종 각 무기의 실제 공격 사거리(px) 반환 헬퍼
function getWeaponAutoTargetRangePx(weaponType, weaponLv = 0) {
  const lv = Math.min(30, Math.max(0, weaponLv || 0));
  if (weaponType === 'wand') return 7.5 * TILE_SIZE;      // 300px (7.5타일)
  if (weaponType === 'greatsword') return 122 + lv * 1.4; // 122px ~ 164px
  if (weaponType === 'hammer') return 104 + lv * 1.2;     // 104px ~ 140px
  if (weaponType === 'bow') return 9.0 * TILE_SIZE;       // 360px (9.0타일)
  if (weaponType === 'daggers') return 84 + lv * 0.9;     // 84px ~ 111px
  if (weaponType === 'chakram') return 6.5 * TILE_SIZE;   // 260px (6.5타일)
  return 7.5 * TILE_SIZE;
}

// 6종 전 무기 공용: 해당 무기의 공격 범위 내에 있는 가장 가까운 몬스터 자동 타게팅 헬퍼
function findNearestMonsterAngle(originX, originY, maxRangePx, fallbackAngle) {
  let nearestAngle = fallbackAngle;
  let minEffDist = Infinity;

  Object.values(monsters).forEach(m => {
    if (!m.alive) return;
    const mc = getMonsterWorldCenter(m);
    const centerDist = Math.hypot(mc.cx - originX, mc.cy - originY);
    const effDist = Math.max(0, centerDist - mc.radius);
    if (effDist <= maxRangePx && effDist < minEffDist) {
      minEffDist = effDist;
      nearestAngle = Math.atan2(mc.cy - originY, mc.cx - originX);
    }
  });

  return nearestAngle;
}

// 캐릭터 머리 위 스킬 외침 대사 즉시 표시 헬퍼
function setPlayerSkillShout(p, text) {
  if (!p || !text) return;
  p.chatText = text;
  if (p.localShoutTimer) clearTimeout(p.localShoutTimer);
  p.localShoutTimer = setTimeout(() => {
    if (p.chatText === text) p.chatText = '';
  }, 2200);
}

function tryFireMagicProjectile() {
  if (!socket || !players[myId]) return;
  const me = players[myId];
  const eqWeapon = (myCharacter && myCharacter.equippedWeapon) ? myCharacter.equippedWeapon : 'wand';
  const wSpec = WEAPON_SPECS[eqWeapon] || WEAPON_SPECS.wand;

  const now = Date.now();
  if (now - lastAttackClientTime < wSpec.cooldownMs) return;
  lastAttackClientTime = now;

  localSwingToggle *= -1;
  const originX = (me.renderX !== undefined ? me.renderX : me.x * TILE_SIZE) + 20;
  const originY = (me.renderY !== undefined ? me.renderY : me.y * TILE_SIZE) + 20;

  const weaponLv = getEquippedWeaponLevel(myCharacter);
  const combatPower = getTotalCombatPower(myCharacter);
  const skillOpen = hasWeaponSkillUnlockedClient(myCharacter, eqWeapon);

  let skillType = null;
  let shoutText = '';

  // +50강 전용 스킬 발동 판정
  if (skillOpen) {
    if (eqWeapon === 'wand') {
      if (Math.random() < 0.25) {
        skillType = 'oneplusone';
        const shouts = ['1+1=귀요미!!', '1+1=2!!', '1+1=창문!!'];
        shoutText = shouts[Math.floor(Math.random() * shouts.length)];
      }
    } else if (eqWeapon === 'greatsword') {
      greatswordAttackCount = (greatswordAttackCount + 1) % 3;
      if (greatswordAttackCount === 0) {
        skillType = 'gg';
        shoutText = '줴줴이야!!';
      }
    } else if (eqWeapon === 'hammer') {
      if (Math.random() < 0.20) {
        skillType = 'blackhole';
        shoutText = '일루왕♡';
      }
    } else if (eqWeapon === 'bow') {
      bowAttackCount = (bowAttackCount + 1) % 4;
      if (bowAttackCount === 0) {
        skillType = 'samsamgu';
        shoutText = 'Eat kimchi, stay healthy!';
      }
    } else if (eqWeapon === 'daggers') {
      if (Math.random() < 0.05) {
        skillType = 'savage';
        shoutText = 'Savege Blow!!';
      }
    } else if (eqWeapon === 'chakram') {
      if (Math.random() < 0.13) {
        skillType = 'cardinal';
        shoutText = '퉁퉁퉁퉁 싸 방향 후르-!!';
      }
    }
  }

  // [전 무기(6종) 공격 범위 내 자동 타게팅]
  let autoRangePx = getWeaponAutoTargetRangePx(eqWeapon, weaponLv);
  if (skillType === 'blackhole' && eqWeapon === 'hammer') {
    autoRangePx = Math.max(autoRangePx, 4.5 * TILE_SIZE);
  } else if (skillType === 'gg' && eqWeapon === 'greatsword') {
    autoRangePx += 14;
  } else if (skillType === 'savage' && eqWeapon === 'daggers') {
    autoRangePx += 42;
  }

  let angle = typeof me.angle === 'number' ? me.angle : dirToAngle(me.dir);
  angle = findNearestMonsterAngle(originX, originY, autoRangePx, angle);
  me.angle = angle;
  me.dir = angleToCardinalDir(angle);

  spawnWeaponAttack({
    ownerId: myId,
    ownerName: myNickname,
    x: me.x,
    y: me.y,
    dir: me.dir,
    angle: angle,
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    weaponType: eqWeapon,
    weaponLv: weaponLv,
    swingSide: localSwingToggle,
    attackPower: combatPower,
    skillType: skillType,
    shoutText: shoutText
  });

  socket.emit('fireProjectile', {
    x: me.x,
    y: me.y,
    dir: me.dir,
    angle: angle,
    swingSide: localSwingToggle,
    skillType: skillType,
    shoutText: shoutText
  });

  // 지팡이 [1+1] 발동 시: 0.12초 뒤에 사거리 내 적을 다시 자동 조준하여 추가 유도 마법구 1발 발사!
  if (skillType === 'oneplusone') {
    setTimeout(() => {
      if (!socket || !players[myId]) return;
      const curMe = players[myId];
      const curOx = (curMe.renderX !== undefined ? curMe.renderX : curMe.x * TILE_SIZE) + 20;
      const curOy = (curMe.renderY !== undefined ? curMe.renderY : curMe.y * TILE_SIZE) + 20;
      const fallbackAng = typeof curMe.angle === 'number' ? curMe.angle : angle;
      const curAng = findNearestMonsterAngle(curOx, curOy, getWeaponAutoTargetRangePx('wand', weaponLv), fallbackAng);
      curMe.angle = curAng;
      curMe.dir = angleToCardinalDir(curAng);

      spawnWeaponAttack({
        ownerId: myId,
        ownerName: myNickname,
        x: curMe.x,
        y: curMe.y,
        dir: curMe.dir,
        angle: curAng,
        vx: Math.cos(curAng),
        vy: Math.sin(curAng),
        weaponType: 'wand',
        weaponLv: weaponLv,
        swingSide: -localSwingToggle,
        attackPower: combatPower,
        isExtraWandShot: true
      });
      socket.emit('fireProjectile', {
        x: curMe.x,
        y: curMe.y,
        dir: curMe.dir,
        angle: curAng,
        swingSide: -localSwingToggle,
        isExtraWandShot: true
      });
    }, 120);
  }
}

function startAttackHold(e) {
  if (e && e.cancelable) e.preventDefault();
  tryFireMagicProjectile();
  if (attackHoldTimer) return;
  attackHoldTimer = setInterval(() => {
    tryFireMagicProjectile();
  }, 55);
}

function stopAttackHold() {
  if (attackHoldTimer) {
    clearInterval(attackHoldTimer);
    attackHoldTimer = null;
  }
}

const dBtnAttack = document.getElementById('dBtnAttack');
const mBtnAttack = document.getElementById('mBtnAttack');
[dBtnAttack, mBtnAttack].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('touchstart', startAttackHold, { passive: false });
  btn.addEventListener('touchend', stopAttackHold);
  btn.addEventListener('touchcancel', stopAttackHold);
  btn.addEventListener('mousedown', startAttackHold);
  btn.addEventListener('mouseup', stopAttackHold);
  btn.addEventListener('mouseleave', stopAttackHold);
});

function pushProjectileCapped(proj) {
  if (projectiles.length >= MAX_PROJECTILES) projectiles.shift();
  projectiles.push(proj);
}

function pushMeleeEffectCapped(eff) {
  if (meleeEffects.length >= MAX_MELEE_EFFECTS) meleeEffects.shift();
  meleeEffects.push(eff);
}

// 차크람 타원 곡선 투사체 생성 헬퍼
function createChakramProjectile(ownerId, originX, originY, launchAngle, weaponLv, isSkillHit = false) {
  const maxDistPx = 6.5 * TILE_SIZE; // 사거리 6.5타일 (260px)
  return {
    weaponType: 'chakram',
    ownerId: ownerId,
    x: originX + Math.cos(launchAngle) * 14,
    y: originY + Math.sin(launchAngle) * 14,
    startX: originX,
    startY: originY,
    angle: launchAngle,
    spinAngle: 0,
    maxDistPx: maxDistPx,
    minorRadiusPx: 38, // 우아한 타원 곡선 폭
    flightDuration: 470,
    hitRadius: 34,
    returning: false,
    outHitIds: {},
    returnHitIds: {},
    skillHit: isSkillHit,
    weaponLv: weaponLv,
    wandLv: weaponLv,
    trail: [],
    born: Date.now()
  };
}

// 활 화살 생성 헬퍼 (단일 평타 및 삼삼구샷 연사 공용)
function createBowArrowProjectile(ownerId, originX, originY, arrowAngle, weaponLv, sharedVolleyHitMap = null, isSkillHit = false) {
  const speed = 13.8 + Math.min(4.2, weaponLv * 0.14);
  const vx = Math.cos(arrowAngle);
  const vy = Math.sin(arrowAngle);
  return {
    weaponType: 'bow',
    ownerId: ownerId,
    x: originX + vx * 16,
    y: originY + vy * 16,
    startX: originX,
    startY: originY,
    vx: vx * speed,
    vy: vy * speed,
    speed: speed,
    angle: arrowAngle,
    maxDistPx: 9.0 * TILE_SIZE, // 사거리 9.0타일 (360px)
    hitRadius: 30,
    pierce: true,
    hitMonsterIds: sharedVolleyHitMap || {},
    skillHit: isSkillHit,
    weaponLv: weaponLv,
    wandLv: weaponLv,
    trail: [],
    born: Date.now()
  };
}

// 6종 무기 평타 & +50강 전용 스킬 생성 및 캐릭터 모션 트리거
function spawnWeaponAttack(data) {
  const weaponType = data.weaponType || 'wand';
  const weaponLv = data.weaponLv !== undefined ? data.weaponLv : (data.wandLv || 0);
  const skillType = data.skillType || null;
  const owner = players[data.ownerId];
  const isMale = !owner || !owner.character || owner.character.gender !== 'female';

  if (owner) {
    owner.attackAnimTime = Date.now();
    owner.attackWeaponType = weaponType;
    owner.attackSkillType = skillType;
    owner.attackAngle = typeof data.angle === 'number' ? data.angle : dirToAngle(data.dir);
    owner.attackSwingSide = data.swingSide || 1;
    if (data.shoutText) {
      setPlayerSkillShout(owner, data.shoutText);
    }
  }

  if (data.ownerId === myId) {
    SoundFX.weaponAttack(weaponType, weaponLv, isMale, Boolean(skillType));
  }

  let vx = typeof data.vx === 'number' ? data.vx : 0;
  let vy = typeof data.vy === 'number' ? data.vy : 0;
  if (vx === 0 && vy === 0) {
    const ang = typeof data.angle === 'number' ? data.angle : dirToAngle(data.dir);
    vx = Math.cos(ang);
    vy = Math.sin(ang);
  } else {
    const mag = Math.hypot(vx, vy) || 1;
    vx /= mag;
    vy /= mag;
  }
  const baseAngle = Math.atan2(vy, vx);
  const originX = data.x * TILE_SIZE + 20;
  const originY = data.y * TILE_SIZE + 20;

  // 1. 대검 (전방 150도 초대형 반달 검기 & +50강 스킬 'GG' 2바퀴 회전 베기)
  if (weaponType === 'greatsword') {
    const reachPx = 122 + weaponLv * 1.4;

    if (skillType === 'gg') {
      pushMeleeEffectCapped({
        type: 'greatsword_gg',
        ownerId: data.ownerId,
        x: originX,
        y: originY,
        angle: baseAngle,
        reach: reachPx + 14,
        weaponLv: weaponLv,
        born: Date.now(),
        duration: 480
      });

      const triggerSpinHit = () => {
        const curOwner = players[data.ownerId];
        const cx = curOwner && curOwner.renderX !== undefined ? curOwner.renderX + 20 : originX;
        const cy = curOwner && curOwner.renderY !== undefined ? curOwner.renderY + 20 : originY;
        let hitAny = false;
        Object.values(monsters).forEach(m => {
          if (!m.alive) return;
          const mc = getMonsterWorldCenter(m);
          if (Math.hypot(mc.cx - cx, mc.cy - cy) <= reachPx + 14 + mc.radius) {
            hitAny = true;
            spawnHitExplosion(mc.cx, mc.cy, weaponLv, true);
            if (data.ownerId === myId) {
              socket.emit('hitMonster', { monsterId: m.id, skillHit: true });
            }
          }
        });
        if (hitAny && data.ownerId === myId) screenShakeMag = Math.min(9, 4.5 + weaponLv * 0.12);
      };

      triggerSpinHit();
      setTimeout(triggerSpinHit, 220);
      return;
    }

    const halfArc = (75 * Math.PI) / 180;
    pushMeleeEffectCapped({
      type: 'greatsword',
      ownerId: data.ownerId,
      x: originX,
      y: originY,
      angle: baseAngle,
      reach: reachPx,
      halfArc: halfArc,
      weaponLv: weaponLv,
      swingSide: data.swingSide || 1,
      born: Date.now(),
      duration: 280
    });

    if (data.ownerId === myId) {
      let hitAny = false;
      Object.values(monsters).forEach(m => {
        if (!m.alive) return;
        const mc = getMonsterWorldCenter(m);
        const dist = Math.hypot(mc.cx - originX, mc.cy - originY);
        if (dist <= reachPx + mc.radius) {
          const mAng = Math.atan2(mc.cy - originY, mc.cx - originX);
          if (Math.abs(angleDiff(mAng, baseAngle)) <= halfArc + 0.22) {
            hitAny = true;
            spawnHitExplosion(mc.cx, mc.cy, weaponLv, true);
            socket.emit('hitMonster', { monsterId: m.id });
          }
        }
      });
      if (hitAny) screenShakeMag = Math.min(8, 3.5 + weaponLv * 0.12);
    }
    return;
  }

  // 2. 망치 (전방 118도 내려찍기 & +50강 스킬 '블랙홀' 반경 4.5타일 흡입)
  if (weaponType === 'hammer') {
    const reachPx = 104 + weaponLv * 1.2;
    const halfArc = (59 * Math.PI) / 180;

    if (skillType === 'blackhole') {
      const bhX = originX + Math.cos(baseAngle) * (1.2 * TILE_SIZE);
      const bhY = originY + Math.sin(baseAngle) * (1.2 * TILE_SIZE);
      pushMeleeEffectCapped({
        type: 'blackhole',
        ownerId: data.ownerId,
        x: bhX,
        y: bhY,
        pullRadius: 4.5 * TILE_SIZE,
        weaponLv: weaponLv,
        born: Date.now(),
        duration: 520
      });
    }

    pushMeleeEffectCapped({
      type: 'hammer',
      ownerId: data.ownerId,
      x: originX,
      y: originY,
      angle: baseAngle,
      reach: reachPx,
      halfArc: halfArc,
      weaponLv: weaponLv,
      swingSide: data.swingSide || 1,
      born: Date.now(),
      duration: 240
    });

    if (data.ownerId === myId) {
      const pullRadiusPx = 4.5 * TILE_SIZE;
      let hitAny = false;
      Object.values(monsters).forEach(m => {
        if (!m.alive) return;
        const mc = getMonsterWorldCenter(m);
        const dist = Math.hypot(mc.cx - originX, mc.cy - originY);
        const inFan = dist <= reachPx + mc.radius && Math.abs(angleDiff(Math.atan2(mc.cy - originY, mc.cx - originX), baseAngle)) <= halfArc + 0.22;
        const inBlackhole = (skillType === 'blackhole' && !m.pullImmune && dist <= pullRadiusPx + mc.radius);

        if (inFan || inBlackhole) {
          hitAny = true;
          spawnHitExplosion(mc.cx, mc.cy, weaponLv, true);
          socket.emit('hitMonster', { monsterId: m.id, skillHit: skillType === 'blackhole' });
        }
      });
      if (hitAny) screenShakeMag = Math.min(8, 3.2 + weaponLv * 0.11);
    }
    return;
  }

  // 3. 쌍수 (초근접 0.2초 초고속 찌르기 & +50강 스킬 '새비지 블로우' 단일 0.8배 x 6연타)
  if (weaponType === 'daggers') {
    const reachPx = 84 + weaponLv * 0.9;
    const halfArc = (48 * Math.PI) / 180;

    if (skillType === 'savage') {
      let targetMon = null;
      let bestDist = reachPx + 42;
      Object.values(monsters).forEach(m => {
        if (!m.alive) return;
        const mc = getMonsterWorldCenter(m);
        const d = Math.hypot(mc.cx - originX, mc.cy - originY);
        if (d <= bestDist + mc.radius) {
          bestDist = d - mc.radius;
          targetMon = m;
        }
      });

      const targetCenter = targetMon ? getMonsterWorldCenter(targetMon) : {
        cx: originX + Math.cos(baseAngle) * 52,
        cy: originY + Math.sin(baseAngle) * 52
      };

      pushMeleeEffectCapped({
        type: 'daggers_savage',
        ownerId: data.ownerId,
        x: targetCenter.cx,
        y: targetCenter.cy,
        angle: baseAngle,
        reach: reachPx,
        weaponLv: weaponLv,
        born: Date.now(),
        duration: 380
      });

      for (let hitIdx = 0; hitIdx < 6; hitIdx++) {
        setTimeout(() => {
          if (data.ownerId === myId && hitIdx > 0) {
            SoundFX.weaponAttack('daggers', weaponLv, false, true);
          }
          if (targetMon && targetMon.alive) {
            const mcNow = getMonsterWorldCenter(targetMon);
            spawnHitExplosion(mcNow.cx + (Math.random() - 0.5) * 18, mcNow.cy + (Math.random() - 0.5) * 18, weaponLv, hitIdx === 5);
            if (data.ownerId === myId) {
              socket.emit('hitMonster', { monsterId: targetMon.id, skillHit: true });
            }
          }
        }, hitIdx * 52);
      }
      return;
    }

    pushMeleeEffectCapped({
      type: 'daggers',
      ownerId: data.ownerId,
      x: originX,
      y: originY,
      angle: baseAngle,
      reach: reachPx,
      halfArc: halfArc,
      weaponLv: weaponLv,
      swingSide: data.swingSide || 1,
      born: Date.now(),
      duration: 150
    });

    if (data.ownerId === myId) {
      Object.values(monsters).forEach(m => {
        if (!m.alive) return;
        const mc = getMonsterWorldCenter(m);
        const dist = Math.hypot(mc.cx - originX, mc.cy - originY);
        if (dist <= reachPx + mc.radius) {
          const mAng = Math.atan2(mc.cy - originY, mc.cx - originX);
          if (Math.abs(angleDiff(mAng, baseAngle)) <= halfArc + 0.25) {
            spawnHitExplosion(mc.cx, mc.cy, weaponLv, true);
            socket.emit('hitMonster', { monsterId: m.id });
          }
        }
      });
    }
    return;
  }

  // 4. 활 (9타일 자동 타게팅 일직선 관통 & +50강 스킬 '삼삼구샷' 60도 3갈래 x 3연사)
  if (weaponType === 'bow') {
    if (skillType === 'samsamgu') {
      const spreadAngles = [-Math.PI / 6, 0, Math.PI / 6];
      for (let volley = 0; volley < 3; volley++) {
        setTimeout(() => {
          const curOwner = players[data.ownerId];
          const ox = curOwner && curOwner.renderX !== undefined ? curOwner.renderX + 20 : originX;
          const oy = curOwner && curOwner.renderY !== undefined ? curOwner.renderY + 20 : originY;
          if (data.ownerId === myId && volley > 0) {
            SoundFX.weaponAttack('bow', weaponLv, false, true);
          }
          const sharedVolleyHitMap = {};
          spreadAngles.forEach(offset => {
            pushProjectileCapped(
              createBowArrowProjectile(data.ownerId, ox, oy, baseAngle + offset, weaponLv, sharedVolleyHitMap, true)
            );
          });
        }, volley * 110);
      }
      return;
    }

    pushProjectileCapped(createBowArrowProjectile(data.ownerId, originX, originY, baseAngle, weaponLv, null, false));
    return;
  }

  // 5. 차크람 (6.5타일 타원 곡선 왕복 2연타 & +50강 스킬 '동서남북' 십자 4방향 동시 투척)
  if (weaponType === 'chakram') {
    if (skillType === 'cardinal') {
      const fourDirs = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
      fourDirs.forEach(offset => {
        pushProjectileCapped(createChakramProjectile(data.ownerId, originX, originY, baseAngle + offset, weaponLv, true));
      });
      return;
    }

    pushProjectileCapped(createChakramProjectile(data.ownerId, originX, originY, baseAngle, weaponLv, false));
    return;
  }

  // 6. 지팡이 (사거리 7.5타일 자동 타게팅 + 유도 마법구 + 착탄 주변 50% 폭발)
  const speed = 7.8 + Math.min(3.8, weaponLv * 0.12);
  pushProjectileCapped({
    weaponType: 'wand',
    ownerId: data.ownerId,
    x: originX + vx * 15,
    y: originY + vy * 15,
    startX: originX,
    startY: originY,
    vx: vx * speed,
    vy: vy * speed,
    speed: speed,
    angle: baseAngle,
    maxDistPx: 7.5 * TILE_SIZE,
    hitRadius: 36,
    homing: true,
    skillHit: Boolean(data.isExtraWandShot),
    weaponLv: weaponLv,
    wandLv: weaponLv,
    trail: [],
    born: Date.now()
  });
}

function spawnHitExplosion(x, y, wandLv, hitTarget = false) {
  SoundFX.magicHit(wandLv);
  if (hitTarget) {
    screenShakeMag = Math.min(7, 2.5 + wandLv * 0.12);
  }
  const hue = (200 + wandLv * 14) % 360;
  const sparkCount = Math.min(20, 8 + Math.floor(wandLv * 0.5));
  const sparks = [];
  for (let i = 0; i < sparkCount; i++) {
    const angle = (Math.PI * 2 / sparkCount) * i + (Math.random() - 0.5) * 0.35;
    const spd = (2.4 + Math.random() * 2.8) * (1 + wandLv * 0.03);
    sparks.push({
      angle,
      spd,
      size: 2.0 + (i % 3) + wandLv * 0.06,
      color: i % 2 === 0 ? `hsl(${hue}, 100%, 72%)` : '#fef08a'
    });
  }

  if (hitEffects.length >= MAX_HIT_EFFECTS) hitEffects.shift();
  hitEffects.push({
    x,
    y,
    wandLv,
    hue,
    maxRadius: 22 + wandLv * 1.4,
    ringCount: 1 + Math.min(3, Math.floor(wandLv / 8)),
    sparks,
    born: Date.now(),
    duration: 330 + wandLv * 4
  });
}

function pushFloatingDamage(fd) {
  if (floatingDamages.length >= MAX_FLOATING_DAMAGES) floatingDamages.shift();
  floatingDamages.push(fd);
}

// ================= [소켓 연결 및 동기화] =================
function connectSocketGame(token, nickname) {
  authModal.classList.add('hidden');
  myNickname = nickname;
  hudNick.textContent = `[${nickname}]`;
  syncCanvasViewportResolution();

  socket = io({ auth: { token } });

  socket.on('connect_error', () => {
    alert('인증이 만료되었습니다. 다시 로그인해주세요.');
    localStorage.removeItem('azaekaban_token');
    location.reload();
  });

  socket.on('init', (data) => {
    myId = data.myId;
    mapW = data.mapWidth;
    mapH = data.mapHeight;
    obstacles = data.obstacles || [];
    bakeWorldBackground();
    syncCanvasViewportResolution();

    players = {};
    monsters = {};

    Object.values(data.players).forEach(p => {
      players[p.id] = {
        ...p,
        angle: typeof p.angle === 'number' ? p.angle : dirToAngle(p.dir),
        renderX: p.x * TILE_SIZE,
        renderY: p.y * TILE_SIZE,
        lastRenderMoveTime: 0
      };
    });

    Object.values(data.monsters || {}).forEach(m => {
      monsters[m.id] = {
        ...m,
        renderX: m.x * TILE_SIZE,
        renderY: m.y * TILE_SIZE
      };
    });

    if (players[myId]) {
      myCharacter = players[myId].character || myCharacter;
      myChances = players[myId].enhanceTokens;
      myLastRefill = players[myId].lastTokenRefill;
      updateAttackButtonLabel();
      updateHUD();
      if (window.BGMManager) {
        window.BGMManager.updateZoneByX(players[myId].x);
      }
    }
  });

  socket.on('playerJoined', (p) => {
    players[p.id] = {
      ...p,
      angle: typeof p.angle === 'number' ? p.angle : dirToAngle(p.dir),
      renderX: p.x * TILE_SIZE,
      renderY: p.y * TILE_SIZE,
      lastRenderMoveTime: 0
    };
    updateHUD();
  });

  socket.on('playerMoved', (data) => {
    const p = players[data.id];
    if (!p) return;

    if (data.id === myId) {
      if (data.reconcile || Math.hypot(data.x - p.x, data.y - p.y) > 2.5) {
        p.x = data.x;
        p.y = data.y;
        p.renderX = data.x * TILE_SIZE;
        p.renderY = data.y * TILE_SIZE;
        if (window.BGMManager) window.BGMManager.updateZoneByX(p.x);
      }
      return;
    }

    p.x = data.x;
    p.y = data.y;
    p.dir = data.dir || p.dir;
    if (typeof data.angle === 'number') p.angle = data.angle;
    p.sprint = Boolean(data.sprint);
    p.lastRenderMoveTime = Date.now();
  });

  socket.on('monsterMoved', (data) => {
    if (monsters[data.id]) {
      monsters[data.id].x = data.x;
      monsters[data.id].y = data.y;
      monsters[data.id].dir = data.dir;
    }
  });

  // 망치 50강 스킬 '블랙홀' 발동 시 몬스터들이 중심점으로 빠르게 빨려 들어가는 동기화
  socket.on('monstersPulled', (data) => {
    if (!data || !Array.isArray(data.pulled)) return;
    data.pulled.forEach(item => {
      const m = monsters[item.id];
      if (m && m.alive) {
        m.x = item.x;
        m.y = item.y;
        m.pullBoostUntil = Date.now() + 450;
      }
    });
  });

  socket.on('projectileFired', (data) => {
    if (data.ownerId === myId) return;
    spawnWeaponAttack(data);
  });

  socket.on('monsterDamaged', (data) => {
    const m = monsters[data.id];
    if (m) {
      m.hp = data.hp;
      m.hitFlashTime = Date.now();
    }
    const mc = m ? getMonsterWorldCenter(m) : { cx: data.x * TILE_SIZE + 20, cy: data.y * TILE_SIZE + 10 };
    pushFloatingDamage({
      x: mc.cx + (Math.random() - 0.5) * 16,
      y: mc.cy - 10,
      text: `💥 -${data.damage}`,
      color: '#f43f5e',
      born: Date.now()
    });
  });

  socket.on('monsterKilled', (data) => {
    const m = monsters[data.id];
    const mc = m ? getMonsterWorldCenter(m) : { cx: data.x * TILE_SIZE + 20, cy: data.y * TILE_SIZE + 10 };
    if (m) {
      m.alive = false;
      m.hp = 0;
    }
    pushFloatingDamage({
      x: mc.cx,
      y: mc.cy - 10,
      text: `💥 -${data.damage} (처치!)`,
      color: '#facc15',
      born: Date.now()
    });

    if (data.rewarded && data.attackerId === myId) {
      myChances = data.tokens;
      myLastRefill = data.lastRefill;
      updateHUD();
      const cnt = data.rewardCount || 1;
      pushFloatingDamage({
        x: mc.cx,
        y: mc.cy - 28,
        text: `✨ 기회 +${cnt} 획득!`,
        color: '#4ade80',
        born: Date.now()
      });
    }
  });

  socket.on('monsterRespawned', (m) => {
    monsters[m.id] = {
      ...m,
      renderX: m.x * TILE_SIZE,
      renderY: m.y * TILE_SIZE
    };
  });

  socket.on('playerStatUpdated', (data) => {
    if (players[data.id]) {
      players[data.id].character = data.character;
      if (data.id === myId) {
        myCharacter = data.character;
        updateAttackButtonLabel();
        updateHUD();
        renderEnhanceUI();
      }
    }
  });

  socket.on('playerAura', (data) => {
    if (data && data.id !== myId && players[data.id]) {
      trigger360AuraBurst(players[data.id], false);
    }
  });

  socket.on('playerChat', (data) => {
    if (players[data.id]) players[data.id].chatText = data.message;
    SoundFX.chat();
    addChatLog(data.name, data.message);
  });

  socket.on('playerChatClear', (data) => {
    if (players[data.id]) players[data.id].chatText = '';
  });

  socket.on('playerLeft', (id) => {
    if (players[id]) {
      delete players[id];
      updateHUD();
    }
  });
}

function addChatLog(author, message) {
  const isNearBottom = (chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight) < 32;
  const line = document.createElement('div');
  line.className = 'chat-msg';
  line.innerHTML = `<span class="chat-author">[${author}]</span>${message}`;
  chatLog.appendChild(line);

  while (chatLog.children.length > 150) {
    chatLog.removeChild(chatLog.children[0]);
  }
  if (isNearBottom) {
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  if (typeof window.wakeUpChatLog === 'function') {
    window.wakeUpChatLog();
  }
}

// ================= [PC 마우스 휠 & 모바일 두 손가락 핀치 줌인/줌아웃 & 캔버스 클릭 판정] =================
let pinchStartDist = null;
let pinchStartZoom = 1.0;
let lastPinchGestureTime = 0;

if (canvas) {
  // 1. PC 마우스 휠 줌인·줌아웃
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (typeof window.adjustUserZoom === 'function') {
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      window.adjustUserZoom(delta);
    }
  }, { passive: false });

  // 2. 모바일 두 손가락 핀치(Pinch) 줌인·줌아웃
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartZoom = window.userZoomScale || 1.0;
      lastPinchGestureTime = Date.now();
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist && pinchStartDist > 12) {
      if (e.cancelable) e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const curDist = Math.hypot(dx, dy);
      const ratio = curDist / pinchStartDist;
      if (typeof window.setUserZoom === 'function') {
        window.setUserZoom(pinchStartZoom * ratio);
      }
      lastPinchGestureTime = Date.now();
    }
  }, { passive: false });

  const endPinchGesture = (e) => {
    if (!e.touches || e.touches.length < 2) {
      pinchStartDist = null;
    }
  };
  canvas.addEventListener('touchend', endPinchGesture);
  canvas.addEventListener('touchcancel', endPinchGesture);

  // 3. 캔버스 클릭으로 플레이어 스펙창 또는 4인 NPC 대화창 열기 (모든 줌 배율 완벽 동기화)
  canvas.addEventListener('click', (e) => {
    if (Date.now() - lastPinchGestureTime < 260) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const myPl = players[myId];
    const { camX, camY } = computeCameraPos(myPl);

    const worldClickX = clickX + camX;
    const worldClickY = clickY + camY;

    const clickedNpc = DORM_NPCS.find(n => {
      const nx = n.x * TILE_SIZE + 20;
      const ny = n.y * TILE_SIZE + 20;
      return Math.hypot(worldClickX - nx, worldClickY - ny) <= 28;
    });

    if (clickedNpc) {
      openNpcDialog(clickedNpc);
      return;
    }

    const clickedPlayer = Object.values(players).find(p => {
      const px = (p.renderX !== undefined ? p.renderX : p.x * TILE_SIZE) + 20;
      const py = (p.renderY !== undefined ? p.renderY : p.y * TILE_SIZE) + 20;
      return Math.hypot(worldClickX - px, worldClickY - py) <= 24;
    });

    if (clickedPlayer) {
      openInfoModal(clickedPlayer);
    }
  });
}

// ================= [360도 자유 이동 + 슬라이딩 충돌 + 모바일 조이스틱] =================
const keysHeld = { up: false, down: false, left: false, right: false };
const joyVector = { vx: 0, vy: 0, active: false };
let lastMoveNetworkSync = 0;
let lastStepSoundTime = 0;
let wasMovingLastFrame = false;

function isFloatPosBlockedClient(fx, fy) {
  if (fx < 0.2 || fx > mapW - 1.2 || fy < 0.8 || fy > mapH - 1.2) return true;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (Math.abs(fx - obs.x) < 0.68 && Math.abs(fy - obs.y) < 0.68) {
      return true;
    }
  }
  return false;
}

function angleToCardinalDir(angle) {
  const deg = (angle * 180 / Math.PI + 360) % 360;
  if (deg >= 45 && deg < 135) return 'down';
  if (deg >= 135 && deg < 225) return 'left';
  if (deg >= 225 && deg < 315) return 'up';
  return 'right';
}

function updateLocalPlayerMovement(dt, now) {
  if (!socket || !myId || !players[myId]) return;
  if (!authModal.classList.contains('hidden')) return;
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;

  let vx = 0, vy = 0;
  if (joyVector.active) {
    vx = joyVector.vx;
    vy = joyVector.vy;
  } else {
    if (keysHeld.up) vy -= 1;
    if (keysHeld.down) vy += 1;
    if (keysHeld.left) vx -= 1;
    if (keysHeld.right) vx += 1;
    const mag = Math.hypot(vx, vy);
    if (mag > 0) {
      vx /= mag;
      vy /= mag;
    }
  }

  const me = players[myId];
  const isMoving = Math.hypot(vx, vy) > 0.05;

  if (!isMoving) {
    if (wasMovingLastFrame) {
      wasMovingLastFrame = false;
      socket.emit('move', { x: me.x, y: me.y, dir: me.dir, angle: me.angle, sprint: false });
    }
    return;
  }

  wasMovingLastFrame = true;
  me.angle = Math.atan2(vy, vx);
  me.dir = angleToCardinalDir(me.angle);
  me.sprint = isSpaceHeld;

  const tilesPerSec = isSpaceHeld ? 8.9 : 4.9;
  const stepTiles = tilesPerSec * (dt / 1000);
  const dx = vx * stepTiles;
  const dy = vy * stepTiles;

  if (!isFloatPosBlockedClient(me.x + dx, me.y)) {
    me.x += dx;
  }
  if (!isFloatPosBlockedClient(me.x, me.y + dy)) {
    me.y += dy;
  }

  me.x = Math.max(0.2, Math.min(mapW - 1.2, me.x));
  me.y = Math.max(0.8, Math.min(mapH - 1.2, me.y));
  me.renderX = me.x * TILE_SIZE;
  me.renderY = me.y * TILE_SIZE;
  me.lastRenderMoveTime = now;

  // 캐릭터가 로비(X < 20) ↔ 동쪽숲1·2(X >= 20) 경계를 넘을 때 배경음악 자동 전환
  if (window.BGMManager) {
    window.BGMManager.updateZoneByX(me.x);
  }

  const stepAudioInterval = isSpaceHeld ? 160 : 250;
  if (now - lastStepSoundTime >= stepAudioInterval) {
    lastStepSoundTime = now;
    SoundFX.step(isSpaceHeld);
    if (footstepDusts.length >= MAX_FOOTSTEP_DUSTS) footstepDusts.shift();
    footstepDusts.push({
      x: me.renderX + 20 + (Math.random() - 0.5) * 8,
      y: me.renderY + 35,
      r: isSpaceHeld ? 4.5 : 3.2,
      born: now
    });
  }

  if (now - lastMoveNetworkSync >= 50) {
    lastMoveNetworkSync = now;
    socket.emit('move', {
      x: Number(me.x.toFixed(3)),
      y: Number(me.y.toFixed(3)),
      dir: me.dir,
      angle: Number(me.angle.toFixed(3)),
      sprint: isSpaceHeld
    });
  }
}

window.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

  if (isTyping) {
    if (e.key === 'Enter') {
      if (activeEl === chatInput) {
        sendChatMessage();
        chatInput.blur();
      } else if (typeof mobileChatInput !== 'undefined' && activeEl === mobileChatInput) {
        if (typeof window.submitMobileChatOverlay === 'function') window.submitMobileChatOverlay();
      } else if (!authModal.classList.contains('hidden')) {
        if (!loginFormSection.classList.contains('hidden')) authSubmitBtn.click();
        else if (!registerFormSection.classList.contains('hidden')) regSubmitBtn.click();
      }
    } else if (e.key === 'Escape' && typeof mobileChatInput !== 'undefined' && activeEl === mobileChatInput) {
      if (typeof window.closeMobileChatOverlay === 'function') window.closeMobileChatOverlay();
    }
    return;
  }

  if (!authModal.classList.contains('hidden')) return;

  if (e.key === 'Enter' || e.key === '/') {
    if (e.key === 'Enter' && !npcDialogModal.classList.contains('hidden')) {
      e.preventDefault();
      advanceNpcDialog();
      return;
    }
    e.preventDefault();
    chatInput.focus();
    return;
  }

  if (e.key === 'Escape') {
    closeInfoModal();
    closeRankModal();
    closeOnlineModal();
    closeEnhance();
    if (typeof closeFullscreenModal === 'function') closeFullscreenModal();
    if (typeof window.closeMobileChatOverlay === 'function') window.closeMobileChatOverlay();
    npcDialogModal.classList.add('hidden');
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    startAuraHold();
    return;
  }

  if (e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') {
    e.preventDefault();
    startAttackHold();
    return;
  }

  if (e.key === 's' || e.key === 'S' || e.key === 'ㄴ') {
    e.preventDefault();
    if (infoModal.classList.contains('hidden')) openInfoModal(null);
    else closeInfoModal();
    return;
  }

  if (e.key === 'c' || e.key === 'C' || e.key === 'ㅊ') {
    e.preventDefault();
    if (enhanceModal.classList.contains('hidden')) openEnhance();
    else executeEnhance();
    return;
  }

  if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') {
    e.preventDefault();
    if (rankModal.classList.contains('hidden')) openRankModal();
    else closeRankModal();
    return;
  }

  if (e.key === 'ArrowUp') { e.preventDefault(); keysHeld.up = true; }
  else if (e.key === 'ArrowDown') { e.preventDefault(); keysHeld.down = true; }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); keysHeld.left = true; }
  else if (e.key === 'ArrowRight') { e.preventDefault(); keysHeld.right = true; }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') stopAuraHold();
  if (e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') stopAttackHold();
  if (e.key === 'ArrowUp') keysHeld.up = false;
  else if (e.key === 'ArrowDown') keysHeld.down = false;
  else if (e.key === 'ArrowLeft') keysHeld.left = false;
  else if (e.key === 'ArrowRight') keysHeld.right = false;
});

const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickStick = document.getElementById('joystickStick');
let joystickTouchId = null;
let isJoystickMouseDown = false;

function updateJoystickByPoint(clientX, clientY) {
  if (!joystickBase || !joystickStick) return;
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const dist = Math.hypot(dx, dy);
  const maxRadius = Math.max(26, Math.round(rect.width * 0.31));
  const deadzone = 5;

  let clampedX = dx;
  let clampedY = dy;
  if (dist > maxRadius) {
    clampedX = (dx / dist) * maxRadius;
    clampedY = (dy / dist) * maxRadius;
  }
  joystickStick.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

  if (dist >= deadzone) {
    joyVector.vx = dx / dist;
    joyVector.vy = dy / dist;
    joyVector.active = true;
  } else {
    joyVector.vx = 0;
    joyVector.vy = 0;
    joyVector.active = false;
  }
}

function resetJoystick() {
  joystickTouchId = null;
  isJoystickMouseDown = false;
  joyVector.vx = 0;
  joyVector.vy = 0;
  joyVector.active = false;
  if (joystickStick) {
    joystickStick.classList.remove('active');
    joystickStick.style.transform = 'translate(0px, 0px)';
  }
}

if (joystickZone) {
  joystickZone.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault();
    if (joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickStick.classList.add('active');
    updateJoystickByPoint(touch.clientX, touch.clientY);
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        updateJoystickByPoint(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        break;
      }
    }
  }, { passive: false });

  const handleJoystickTouchEnd = (e) => {
    if (joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        resetJoystick();
        break;
      }
    }
  };
  joystickZone.addEventListener('touchend', handleJoystickTouchEnd);
  joystickZone.addEventListener('touchcancel', handleJoystickTouchEnd);

  joystickZone.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isJoystickMouseDown = true;
    joystickStick.classList.add('active');
    updateJoystickByPoint(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!isJoystickMouseDown) return;
    updateJoystickByPoint(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (isJoystickMouseDown) resetJoystick();
  });
}

window.addEventListener('blur', () => {
  keysHeld.up = keysHeld.down = keysHeld.left = keysHeld.right = false;
  resetJoystick();
  stopAuraHold();
  stopAttackHold();
  stopEnhanceHold();
});

function sendChatMessage() {
  if (!socket) return;
  const msg = chatInput.value.trim();
  if (msg) {
    socket.emit('sendChat', msg);
    chatInput.value = '';
  }
}
sendBtn.addEventListener('click', sendChatMessage);

// ================= [2.5D 지형, 대사부 포함 4인 NPC, 몬스터 6종, 김치워리어 & 고추걸 렌더러] =================

function drawAngledShadow(cx, baseY, rx = 13, ry = 5.5, skewX = 7, skewY = -4) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(cx + skewX * 0.45, baseY + skewY * 0.35, rx * 1.12, ry * 1.1, -0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, rx * 0.85, ry * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBronzeDeerCrest(cx, cy, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.strokeStyle = '#d97706';
  ctx.fillStyle = 'rgba(69, 10, 10, 0.88)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 / 6) * i;
    const x = Math.cos(a) * 18;
    const y = Math.sin(a) * 18;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#fbbf24';
  ctx.fillStyle = '#f59e0b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(-6, -1);
  ctx.lineTo(0, -6);
  ctx.lineTo(6, -1);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-3, -4); ctx.lineTo(-10, -13); ctx.lineTo(-13, -9);
  ctx.moveTo(-7, -9); ctx.lineTo(-5, -15);
  ctx.moveTo(3, -4); ctx.lineTo(10, -13); ctx.lineTo(13, -9);
  ctx.moveTo(7, -9); ctx.lineTo(5, -15);
  ctx.stroke();

  ctx.restore();
}

function drawObstacle25D(obs, time) {
  const px = obs.x * TILE_SIZE;
  const py = obs.y * TILE_SIZE;
  const cx = px + 20;
  const cy = py + 20;

  ctx.save();
  if (obs.type === 'forest_tree' || obs.type === 'plague_tree') {
    const isPlague = obs.type === 'plague_tree';
    drawAngledShadow(cx + 3, py + 36, 20, 8, 12, -5);

    const trunkGrad = ctx.createLinearGradient(cx - 8, py + 12, cx + 8, py + 37);
    trunkGrad.addColorStop(0, isPlague ? '#4c1d95' : '#78350f');
    trunkGrad.addColorStop(0.5, isPlague ? '#311042' : '#5c280b');
    trunkGrad.addColorStop(1, '#1e0924');
    ctx.fillStyle = trunkGrad;
    ctx.strokeStyle = '#0f0514';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 6, py + 12);
    ctx.lineTo(cx - 10, py + 36);
    ctx.lineTo(cx + 10, py + 36);
    ctx.lineTo(cx + 6, py + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const sway = Math.sin(time * 0.002 + obs.x) * 1.2;
    const layers = isPlague
      ? [
          { ox: 0 + sway, oy: -4, r: 21, col: '#3b0764' },
          { ox: -10 + sway, oy: 2, r: 15, col: '#4c1d95' },
          { ox: 11 + sway, oy: 3, r: 15, col: '#115e59' },
          { ox: -4 + sway, oy: -9, r: 16, col: '#6d28d9' },
          { ox: 5 + sway, oy: -12, r: 12, col: '#14b8a6' },
          { ox: -2 + sway, oy: -15, r: 7, col: '#a78bfa' }
        ]
      : [
          { ox: 0 + sway, oy: -4, r: 21, col: '#14532d' },
          { ox: -10 + sway, oy: 2, r: 15, col: '#166534' },
          { ox: 11 + sway, oy: 3, r: 15, col: '#15803d' },
          { ox: -4 + sway, oy: -9, r: 16, col: '#22c55e' },
          { ox: 5 + sway, oy: -12, r: 12, col: '#4ade80' },
          { ox: -2 + sway, oy: -15, r: 7, col: '#86efac' }
        ];
    layers.forEach((lf, idx) => {
      ctx.fillStyle = lf.col;
      ctx.beginPath();
      ctx.arc(cx + lf.ox, cy + lf.oy, lf.r, 0, Math.PI * 2);
      ctx.fill();
      if (idx < 3) {
        ctx.strokeStyle = isPlague ? '#1e0536' : '#052e16';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  } else if (obs.type === 'crystal_rock' || obs.type === 'toxic_rock') {
    const isToxic = obs.type === 'toxic_rock';
    drawAngledShadow(cx + 2, py + 35, 17, 6.5, 9, -4);

    ctx.fillStyle = isToxic ? '#1e1b4b' : '#334155';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 34);
    ctx.lineTo(px + 9, py + 16);
    ctx.lineTo(px + 22, py + 12);
    ctx.lineTo(px + 35, py + 20);
    ctx.lineTo(px + 34, py + 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const pulse = 0.75 + Math.sin(time * 0.005 + obs.x) * 0.25;
    ctx.shadowColor = isToxic ? '#10b981' : '#38bdf8';
    ctx.shadowBlur = 10 * pulse;
    ctx.fillStyle = isToxic ? '#10b981' : '#38bdf8';
    ctx.strokeStyle = isToxic ? '#a7f3d0' : '#bae6fd';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 2, py + 24);
    ctx.lineTo(cx - 6, py + 6);
    ctx.lineTo(cx + 1, py + 2);
    ctx.lineTo(cx + 5, py + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isToxic ? '#c084fc' : '#7dd3fc';
    ctx.beginPath();
    ctx.moveTo(cx + 4, py + 26);
    ctx.lineTo(cx + 8, py + 10);
    ctx.lineTo(cx + 13, py + 14);
    ctx.lineTo(cx + 9, py + 27);
    ctx.closePath();
    ctx.fill();
  } else if (obs.type === 'gate_pillar' || obs.type === 'pillar') {
    drawAngledShadow(cx + 2, py + 36, 15, 6, 10, -4);
    const pGrad = ctx.createLinearGradient(px + 8, py, px + 32, py);
    pGrad.addColorStop(0, '#475569');
    pGrad.addColorStop(0.4, '#64748b');
    pGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = pGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(px + 8, py - 6, 24, 42, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d97706';
    ctx.fillRect(px + 6, py - 8, 28, 5);
    ctx.fillRect(px + 6, py + 32, 28, 5);
  } else {
    drawAngledShadow(cx, py + 36, 15, 5, 6, -3);
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(px + 5, py + 8, 30, 26, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 8, py + 11, 24, 8);
  }
  ctx.restore();
}

function drawWizardNPC(npc, time) {
  const rx = npc.x * TILE_SIZE;
  const ry = npc.y * TILE_SIZE;
  const cx = rx + 20;
  const breathe = Math.sin(time * 0.003 + npc.x) * 1;

  ctx.save();
  drawAngledShadow(cx, ry + 36, 14, 5.5, 7, -4);

  const bodyY = ry + 15 + breathe;
  const headY = ry + 8 + breathe;

  if (npc.id === 'npc_master') {
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx - 5, ry + 35, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 5, ry + 35, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#16a34a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 10, bodyY);
    ctx.lineTo(cx - 13, bodyY + 19);
    ctx.lineTo(cx + 13, bodyY + 19);
    ctx.lineTo(cx + 10, bodyY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 10, bodyY + 1);
    ctx.lineTo(cx - 17, bodyY + 9);
    ctx.lineTo(cx - 14, bodyY + 14);
    ctx.lineTo(cx - 9, bodyY + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 10, bodyY + 9, 20, 3.5);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, bodyY + 9);
    ctx.lineTo(cx + 3.5, bodyY + 9);
    ctx.lineTo(cx, bodyY + 13.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f5cba7';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, headY + 2, 8.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const hairGrad = ctx.createLinearGradient(cx, headY - 9, cx, bodyY + 15);
    hairGrad.addColorStop(0, '#f8fafc');
    hairGrad.addColorStop(0.45, '#bbf7d0');
    hairGrad.addColorStop(1, '#22c55e');
    ctx.fillStyle = hairGrad;
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.moveTo(cx, headY - 8);
    ctx.quadraticCurveTo(cx - 11, headY - 7, cx - 12, headY + 4);
    ctx.quadraticCurveTo(cx - 14, headY + 14, cx - 9, bodyY + 15);
    ctx.quadraticCurveTo(cx - 5, bodyY + 12, cx - 6, headY + 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, headY - 8);
    ctx.quadraticCurveTo(cx + 11, headY - 7, cx + 12, headY + 4);
    ctx.quadraticCurveTo(cx + 14, headY + 14, cx + 9, bodyY + 15);
    ctx.quadraticCurveTo(cx + 5, bodyY + 12, cx + 6, headY + 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 5, headY - 5);
    ctx.lineTo(cx, headY - 2);
    ctx.lineTo(cx + 5, headY - 5);
    ctx.lineTo(cx + 3, headY + 0.5);
    ctx.lineTo(cx, headY + 2);
    ctx.lineTo(cx - 3, headY + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#090507';
    ctx.beginPath();
    ctx.arc(cx - 3.2, headY + 2.5, 1.5, 0, Math.PI * 2);
    ctx.arc(cx + 3.2, headY + 2.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx - 6.5, headY + 0.5); ctx.lineTo(cx - 1.5, headY + 1.2);
    ctx.moveTo(cx + 6.5, headY + 0.5); ctx.lineTo(cx + 1.5, headY + 1.2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, headY + 4.5);
    ctx.quadraticCurveTo(cx - 7, headY + 5, cx - 6, headY + 13);
    ctx.lineTo(cx, bodyY + 12);
    ctx.lineTo(cx + 6, headY + 13);
    ctx.quadraticCurveTo(cx + 7, headY + 5, cx, headY + 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const staffX = cx - 15;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(staffX, bodyY + 19);
    ctx.lineTo(staffX - 1, bodyY + 2);
    ctx.stroke();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(staffX - 1, bodyY + 2);
    ctx.lineTo(staffX - 2, headY - 17);
    ctx.moveTo(staffX - 1, bodyY - 2);
    ctx.quadraticCurveTo(staffX - 9, headY - 6, staffX - 11, headY + 1);
    ctx.stroke();

  } else if (npc.id === 'npc_helicopter') {
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - 8.5, bodyY, 17, 20, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 1, bodyY + 3, 2, 12);

    ctx.fillStyle = '#fde6d2';
    ctx.beginPath();
    ctx.arc(cx, headY + 2, 7.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(cx, headY - 1, 8.8, Math.PI, 0);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#090507';
    ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx - 3.3, headY + 2.5, 2.8, 0, Math.PI * 2);
    ctx.arc(cx + 3.3, headY + 2.5, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx + 12, bodyY + 14);
    ctx.lineTo(cx + 16, bodyY - 12);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx + 16, bodyY - 14, 3.5, 0, Math.PI * 2);
    ctx.fill();

  } else if (npc.id === 'npc_nong') {
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 9, bodyY);
    ctx.lineTo(cx - 13, bodyY + 20);
    ctx.lineTo(cx + 13, bodyY + 20);
    ctx.lineTo(cx + 9, bodyY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde6d2';
    ctx.beginPath();
    ctx.arc(cx, headY + 2, 7.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(cx, headY - 1.5, 8.8, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(cx - 8, bodyY - 1, 16, 4);

    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 12, bodyY + 16);
    ctx.lineTo(cx - 16, bodyY - 10);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx - 16, bodyY - 12, 3.8, 0, Math.PI * 2);
    ctx.fill();

  } else if (npc.id === 'npc_haerin') {
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - 8, bodyY, 16, 13, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#881337';
    ctx.beginPath();
    ctx.moveTo(cx - 11, bodyY + 10);
    ctx.lineTo(cx, bodyY + 21);
    ctx.lineTo(cx + 11, bodyY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde6d2';
    ctx.beginPath();
    ctx.arc(cx, headY + 2, 7.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(cx, headY - 1.5, 9, Math.PI, 0);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 12, bodyY + 16);
    ctx.lineTo(cx + 12, bodyY - 14);
    ctx.stroke();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx + 12, bodyY - 16, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.font = 'bold 11px "DungGeunMo"';
  ctx.textAlign = 'center';
  ctx.fillStyle = npc.id === 'npc_master' ? '#4ade80' : '#facc15';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(`[NPC] ${npc.name}`, cx, ry - 9);
  ctx.fillText(`[NPC] ${npc.name}`, cx, ry - 9);

  ctx.restore();
}

function drawMonster(m, time) {
  if (!m.alive) return;
  const rx = m.renderX !== undefined ? m.renderX : m.x * TILE_SIZE;
  const ry = m.renderY !== undefined ? m.renderY : m.y * TILE_SIZE;
  const mSize = m.size || 1;
  const spanPx = mSize * TILE_SIZE;
  const cx = rx + spanPx / 2;
  const cy = ry + spanPx / 2;
  const isHitFlash = m.hitFlashTime && (time - m.hitFlashTime < 120);

  ctx.save();
  drawAngledShadow(cx, ry + spanPx - 4, 12 * mSize, 4.5 * mSize, 6 * mSize, -3 * mSize);

  if (m.type === 'mandrake') {
    const bounce = Math.sin(time * 0.008 + rx) * 1.5;
    const bodyGrad = ctx.createRadialGradient(cx - 3, cy + 2 + bounce, 2, cx, cy + 5 + bounce, 11);
    bodyGrad.addColorStop(0, isHitFlash ? '#ffffff' : '#d97706');
    bodyGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#1c0a02';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy + 5 + bounce, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#090507';
    ctx.beginPath();
    ctx.arc(cx - 3.2, cy + 4 + bounce, 1.4, 0, Math.PI * 2);
    ctx.arc(cx + 3.2, cy + 4 + bounce, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy - 7 + bounce, 6, 3.2, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + 5, cy - 7 + bounce, 6, 3.2, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

  } else if (m.type === 'slime') {
    const squash = Math.sin(time * 0.009) * 2.2;
    const sGrad = ctx.createRadialGradient(cx - 4, cy + 2 + squash, 2, cx, cy + 6 + squash, 15);
    sGrad.addColorStop(0, isHitFlash ? '#ffffff' : '#c084fc');
    sGrad.addColorStop(0.6, '#7e22ce');
    sGrad.addColorStop(1, '#3b0764');
    ctx.fillStyle = sGrad;
    ctx.strokeStyle = '#1e0536';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6 + squash, 14.5, 10.5 - squash * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy + 1 + squash, 3.8, 1.8, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 5 + squash, 1.8, 0, Math.PI * 2);
    ctx.arc(cx + 4, cy + 5 + squash, 1.8, 0, Math.PI * 2);
    ctx.fill();

  } else if (m.type === 'wolf') {
    const prowl = Math.sin(time * 0.012) * 1.5;
    ctx.fillStyle = isHitFlash ? '#ffffff' : '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 11);
    ctx.lineTo(cx - 10, cy - 3 + prowl);
    ctx.lineTo(cx - 6, cy - 10 + prowl);
    ctx.lineTo(cx - 2, cy - 4 + prowl);
    ctx.lineTo(cx + 2, cy - 4 + prowl);
    ctx.lineTo(cx + 6, cy - 10 + prowl);
    ctx.lineTo(cx + 10, cy - 3 + prowl);
    ctx.lineTo(cx + 14, cy + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 1 + prowl, 1.8, 0, Math.PI * 2);
    ctx.arc(cx + 4, cy + 1 + prowl, 1.8, 0, Math.PI * 2);
    ctx.fill();

  } else if (m.type === 'cold_virus') {
    const floatY = Math.sin(time * 0.007 + rx) * 3;
    const vCenterY = cy + floatY;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i + time * 0.002;
      const sx = cx + Math.cos(a) * 15;
      const sy = vCenterY + Math.sin(a) * 15;
      ctx.beginPath();
      ctx.moveTo(cx, vCenterY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    const vGrad = ctx.createRadialGradient(cx - 3, vCenterY - 3, 2, cx, vCenterY, 12);
    vGrad.addColorStop(0, isHitFlash ? '#ffffff' : '#67e8f9');
    vGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = vGrad;
    ctx.strokeStyle = '#082f49';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, vCenterY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(cx - 3.5, vCenterY, 1.8, 0, Math.PI * 2);
    ctx.arc(cx + 3.5, vCenterY, 1.8, 0, Math.PI * 2);
    ctx.fill();

  } else if (m.type === 'cavity_germs') {
    const hop = Math.abs(Math.sin(time * 0.011 + rx)) * -4.5;
    const gY = cy + 3 + hop;

    ctx.fillStyle = isHitFlash ? '#ffffff' : '#6b21a8';
    ctx.strokeStyle = '#1e0536';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 12, gY + 9);
    ctx.quadraticCurveTo(cx - 14, gY - 8, cx - 7, gY - 12);
    ctx.lineTo(cx - 3, gY - 7);
    ctx.lineTo(cx + 3, gY - 7);
    ctx.lineTo(cx + 7, gY - 12);
    ctx.quadraticCurveTo(cx + 14, gY - 8, cx + 12, gY + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(cx - 4, gY - 2, 2, 0, Math.PI * 2);
    ctx.arc(cx + 4, gY - 2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 6, gY + 3);
    ctx.lineTo(cx - 3.5, gY + 7);
    ctx.lineTo(cx - 1, gY + 3);
    ctx.lineTo(cx + 1.5, gY + 7);
    ctx.lineTo(cx + 4, gY + 3);
    ctx.closePath();
    ctx.fill();

  } else if (m.type === 'flu_behemoth') {
    const stomp = Math.sin(time * 0.008) * 3;
    const bY = cy + stomp;

    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, bY, 34 + Math.sin(time * 0.01) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 4;
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 / 10) * i - time * 0.0015;
      const sx = cx + Math.cos(a) * 33;
      const sy = bY + Math.sin(a) * 30;
      ctx.beginPath();
      ctx.moveTo(cx, bY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const bGrad = ctx.createRadialGradient(cx - 8, bY - 8, 4, cx, bY, 28);
    bGrad.addColorStop(0, isHitFlash ? '#ffffff' : '#dc2626');
    bGrad.addColorStop(0.6, '#7f1d1d');
    bGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = bGrad;
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, bY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx - 9, bY - 5, 4, 0, Math.PI * 2);
    ctx.arc(cx + 9, bY - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#090507';
    ctx.beginPath();
    ctx.arc(cx, bY + 9, 10, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    for (let t = -7; t <= 7; t += 4.5) {
      ctx.beginPath();
      ctx.moveTo(cx + t - 2, bY + 9);
      ctx.lineTo(cx + t, bY + 15);
      ctx.lineTo(cx + t + 2, bY + 9);
      ctx.fill();
    }
  }

  const barW = mSize === 2 ? 64 : 34;
  const barH = mSize === 2 ? 6 : 4.5;
  const bx = cx - barW / 2;
  const by = ry + 1;
  const hpRatio = Math.max(0, m.hp / m.maxHp);

  if (mSize === 2) {
    ctx.font = 'bold 11px "DungGeunMo"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fca5a5';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(`[BOSS] ${m.name}`, cx, by - 4);
    ctx.fillText(`[BOSS] ${m.name}`, cx, by - 4);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = mSize === 2 ? '#f43f5e' : '#ef4444';
  ctx.fillRect(bx, by, barW * hpRatio, barH);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, barW, barH);

  ctx.restore();
}

// 장착 무기 6종 외형 & 공격 휘두르기 모션 렌더러
function drawEquippedWeapon25D(handX, handY, rightSideSign, weaponType, weaponLv, time, attackProg = 0, attackAngle = 0, swingSide = 1, skillType = null) {
  const lv = Math.min(30, Math.max(0, weaponLv || 0));
  const hue = (200 + lv * 12) % 360;

  ctx.save();
  ctx.translate(handX, handY);

  if (lv >= 5) {
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
    ctx.shadowBlur = Math.min(16, lv * 0.55);
  }

  if (attackProg > 0) {
    if (skillType === 'gg' && weaponType === 'greatsword') {
      ctx.rotate((1 - attackProg) * Math.PI * 4);
    } else {
      const swingRot = (weaponType === 'greatsword' || weaponType === 'hammer')
        ? Math.sin(attackProg * Math.PI) * 1.45 * swingSide
        : (weaponType === 'daggers' ? Math.sin(attackProg * Math.PI) * 0.85 * swingSide : Math.sin(attackProg * Math.PI) * 0.5);
      ctx.rotate(swingRot);
    }
  }

  if (weaponType === 'greatsword') {
    const bladeLen = 19 + lv * 0.55;
    const bladeW = 4.2 + lv * 0.08;
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-1.5, 0, 3, 5);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-5.5, -2, 11, 2.5);

    const bGrad = ctx.createLinearGradient(0, -2, 0, -bladeLen);
    bGrad.addColorStop(0, lv >= 10 ? `hsl(${hue}, 90%, 60%)` : '#94a3b8');
    bGrad.addColorStop(1, lv >= 20 ? '#fef08a' : '#f8fafc');
    ctx.fillStyle = bGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-bladeW, -2);
    ctx.lineTo(-bladeW * 0.8, -bladeLen + 5);
    ctx.lineTo(0, -bladeLen);
    ctx.lineTo(bladeW * 0.8, -bladeLen + 5);
    ctx.lineTo(bladeW, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

  } else if (weaponType === 'hammer') {
    const handleLen = 14 + lv * 0.35;
    const headW = 12 + lv * 0.28;
    const headH = 7.5 + lv * 0.16;

    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-1.6, -handleLen, 3.2, handleLen + 4);
    ctx.strokeRect(-1.6, -handleLen, 3.2, handleLen + 4);

    const hGrad = ctx.createLinearGradient(-headW / 2, -handleLen - headH, headW / 2, -handleLen);
    hGrad.addColorStop(0, lv >= 10 ? `hsl(${hue}, 90%, 62%)` : '#64748b');
    hGrad.addColorStop(0.5, '#cbd5e1');
    hGrad.addColorStop(1, '#334155');
    ctx.fillStyle = hGrad;
    ctx.strokeStyle = lv >= 15 ? '#facc15' : '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-headW / 2, -handleLen - headH / 2, headW, headH, 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-2, -handleLen - headH / 2, 4, headH);

  } else if (weaponType === 'daggers') {
    const dLen = 11 + lv * 0.3;
    ctx.fillStyle = lv >= 10 ? `hsl(${hue}, 95%, 65%)` : '#e2e8f0';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2.2, 0);
    ctx.lineTo(0, -dLen);
    ctx.lineTo(2.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-3.5, 0, 7, 2);

  } else if (weaponType === 'bow') {
    const bowR = 11 + lv * 0.25;
    ctx.strokeStyle = lv >= 10 ? `hsl(${hue}, 95%, 65%)` : '#d97706';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(rightSideSign * 2, -3, bowR, -Math.PI * 0.45, Math.PI * 0.45, rightSideSign < 0);
    ctx.stroke();

    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(rightSideSign * 2, -3 - bowR * 0.95);
    ctx.lineTo(rightSideSign * (attackProg > 0 ? -3 : 1), -3);
    ctx.lineTo(rightSideSign * 2, -3 + bowR * 0.95);
    ctx.stroke();

  } else if (weaponType === 'chakram') {
    const cRad = 6.5 + lv * 0.18;
    ctx.rotate(time * 0.008);
    ctx.strokeStyle = lv >= 10 ? `hsl(${hue}, 100%, 68%)` : '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, -4, cRad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-cRad, -4); ctx.lineTo(cRad, -4);
    ctx.moveTo(0, -4 - cRad); ctx.lineTo(0, -4 + cRad);
    ctx.stroke();

  } else {
    const shaftLen = 9 + lv * 0.68;
    const tipX = rightSideSign * (4 + lv * 0.22);
    const tipY = -shaftLen;

    ctx.strokeStyle = lv === 0 ? '#78350f' : (lv < 10 ? `hsl(${30 + lv * 10}, 75%, 52%)` : `hsl(${hue}, 90%, 65%)`);
    ctx.lineWidth = 1.6 + lv * 0.08;
    ctx.beginPath();
    ctx.moveTo(-rightSideSign * 1.5, 5);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    if (lv >= 1) {
      const orbRadius = 1.9 + lv * 0.16;
      ctx.fillStyle = lv >= 20 ? '#fef08a' : `hsl(${hue}, 100%, 70%)`;
      ctx.beginPath();
      ctx.arc(tipX, tipY, orbRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lv >= 2) {
      const rad = 4.5 + lv * 0.32;
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(tipX, tipY, rad, rad * 0.45, time * 0.005, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ================= [남자: 김치워리어 / 여자: 고추걸 2.5D 히어로 렌더러] =================
function drawEvolvedStudent(rx, ry, p, time) {
  const cx = rx + 20;
  const c = p.character || {};
  const isFemale = c.gender === 'female';

  const rArmLv = getEffectiveLevel('education', c);
  const rLegLv = getEffectiveLevel('appearance', c);
  const lArmLv = getEffectiveLevel('wealth', c);
  const headLv = getEffectiveLevel('iq', c);
  const torsoLv = getEffectiveLevel('stamina', c);
  const lLegLv = getEffectiveLevel('personality', c);
  const eqWeapon = c.equippedWeapon || 'wand';
  const weaponLv = getEquippedWeaponLevel(c);

  const rArmTier = getPartEffectTier(rArmLv);
  const rLegTier = getPartEffectTier(rLegLv);
  const lArmTier = getPartEffectTier(lArmLv);
  const headTier = getPartEffectTier(headLv);
  const torsoTier = getPartEffectTier(torsoLv);
  const lLegTier = getPartEffectTier(lLegLv);

  const isMoving = (time - (p.lastRenderMoveTime || 0)) < 110;
  const swingSpeed = p.sprint ? 0.036 : 0.022;
  const swing = isMoving ? Math.sin(time * swingSpeed) * 4.5 : 0;

  const atkElapsed = time - (p.attackAnimTime || 0);
  const atkDuration = p.attackSkillType === 'gg' ? 480 : (eqWeapon === 'daggers' ? 175 : 290);
  const isAttacking = atkElapsed >= 0 && atkElapsed < atkDuration;
  const atkProg = isAttacking ? (1 - atkElapsed / atkDuration) : 0;
  const atkLungeX = isAttacking ? Math.cos(p.attackAngle || 0) * 4.5 * Math.sin(atkProg * Math.PI) : 0;
  const atkLungeY = isAttacking ? Math.sin(p.attackAngle || 0) * 3.5 * Math.sin(atkProg * Math.PI) : 0;

  const breathe = Math.sin(time * 0.004 + rx * 0.1) * 1;
  const bodyX = cx + atkLungeX;
  const bodyY = ry + 15 + breathe * 0.6 + atkLungeY;
  const headY = ry + 7.5 + breathe + atkLungeY * 0.8;

  const rightSideSign = (p.dir === 'up') ? 1 : -1;
  const leftSideSign = -rightSideSign;

  const charRightLegCenterX = bodyX + rightSideSign * 4;
  const charLeftLegCenterX  = bodyX + leftSideSign * 4;
  const charRightArmCenterX = bodyX + rightSideSign * 9.5;
  const charLeftArmCenterX  = bodyX + leftSideSign * 9.5;

  ctx.save();
  drawAngledShadow(bodyX, ry + 36, 13.5, 5, 7, -4);

  if (!isFemale && isAttacking) {
    ctx.save();
    ctx.strokeStyle = `rgba(163, 230, 53, ${atkProg * 0.75})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(bodyX, bodyY + 4, 16 + (1 - atkProg) * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (torsoTier > 0) {
    const wingPairs = Math.min(7, 1 + Math.floor(torsoTier / 14));
    const wingSpan = 20 + Math.min(48, torsoTier * 0.45) + Math.sin(time * 0.008) * 3;
    const hue = (200 + torsoTier * 15) % 360;

    ctx.save();
    ctx.translate(bodyX, ry + 20 + breathe);
    ctx.strokeStyle = `hsl(${hue}, 95%, 65%)`;
    ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.28)`;
    ctx.lineWidth = 1.8;

    for (let w = 0; w < wingPairs; w++) {
      const spread = (w - (wingPairs - 1) / 2) * 0.28;
      const subSpan = wingSpan * (1 - w * 0.08);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(side * subSpan, -15 + spread * 24);
        ctx.lineTo(side * subSpan * 0.72, -2 + spread * 24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const rLegY = ry + 27 - swing * 0.6 + (isAttacking && !isFemale ? -2.5 * atkProg : 0);
  const lLegY = ry + 27 + swing * 0.6;
  const suitMainColor = isFemale ? '#dc2626' : '#16a34a';

  ctx.fillStyle = suitMainColor;
  ctx.strokeStyle = '#090507';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(charRightLegCenterX - 2.7, rLegY, 5.4, 4.5, 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = rLegLv >= 15 ? '#fbbf24' : '#090507';
  ctx.beginPath();
  ctx.roundRect(charRightLegCenterX - 2.8, rLegY + 3.8, 5.6, 5.2, 2);
  ctx.fill();
  ctx.stroke();

  if (rLegTier > 0) {
    const flameCount = Math.min(12, 2 + Math.floor(rLegTier / 8));
    const flameHeight = 8 + Math.min(26, rLegTier * 0.25);
    const hue = (15 + rLegTier * 11) % 360;
    ctx.fillStyle = `hsl(${hue}, 95%, 60%)`;
    for (let f = 0; f < flameCount; f++) {
      const phase = (time * 0.035 + f * 3.7) % flameHeight;
      const fx = charRightLegCenterX + Math.sin(time * 0.01 + f) * (3 + rLegTier * 0.05);
      ctx.fillRect(fx - 1.2, rLegY + 7 - phase, 2.4, 3.8);
    }
  }

  ctx.fillStyle = suitMainColor;
  ctx.strokeStyle = '#090507';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(charLeftLegCenterX - 2.7, lLegY, 5.4, 4.5, 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = lLegLv >= 15 ? '#c084fc' : '#090507';
  ctx.beginPath();
  ctx.roundRect(charLeftLegCenterX - 2.8, lLegY + 3.8, 5.6, 5.2, 2);
  ctx.fill();
  ctx.stroke();

  if (lLegTier > 0) {
    const waveRings = Math.min(6, 1 + Math.floor(lLegTier / 18));
    const maxW = 7 + Math.min(22, lLegTier * 0.22);
    const hue = (270 + lLegTier * 13) % 360;
    ctx.strokeStyle = `hsl(${hue}, 90%, 68%)`;
    ctx.lineWidth = 1.5;
    for (let w = 0; w < waveRings; w++) {
      const pulse = ((time * 0.004 + w / waveRings) % 1);
      ctx.beginPath();
      ctx.ellipse(charLeftLegCenterX, lLegY + 7, maxW * pulse, 2.8 * pulse + 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.fillStyle = suitMainColor;
  ctx.strokeStyle = torsoLv >= 15 ? '#facc15' : '#090507';
  ctx.lineWidth = torsoLv >= 15 ? 1.8 : 1.4;
  ctx.beginPath();
  ctx.moveTo(bodyX - 8.2, bodyY);
  ctx.lineTo(bodyX - 9.8, bodyY + 14.5);
  ctx.lineTo(bodyX + 9.8, bodyY + 14.5);
  ctx.lineTo(bodyX + 8.2, bodyY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isFemale) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bodyX - 4, bodyY);
    ctx.lineTo(bodyX, bodyY + 4.5);
    ctx.lineTo(bodyX + 4, bodyY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(bodyX - 4.5, bodyY + 3.5);
    ctx.lineTo(bodyX, bodyY + 9.2);
    ctx.lineTo(bodyX + 4.5, bodyY + 3.5);
    ctx.lineTo(bodyX, bodyY + 6.0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bodyX - 9, bodyY + 10.5, 18, 3);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(bodyX - 2.5, bodyY + 10.5);
    ctx.lineTo(bodyX + 2.5, bodyY + 10.5);
    ctx.lineTo(bodyX, bodyY + 13.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bodyX - 5.2, bodyY + 2);
    ctx.lineTo(bodyX, bodyY + 8.8);
    ctx.lineTo(bodyX + 5.2, bodyY + 2);
    ctx.lineTo(bodyX + 2.5, bodyY + 1.5);
    ctx.lineTo(bodyX, bodyY + 5.2);
    ctx.lineTo(bodyX - 2.5, bodyY + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const rArmAttackOffset = isAttacking ? -5.5 * Math.sin(atkProg * Math.PI) : 0;
  const lArmAttackOffset = isAttacking && (eqWeapon === 'daggers' || eqWeapon === 'bow' || !isFemale) ? -4.5 * Math.sin(atkProg * Math.PI) : 0;
  const rArmY = bodyY + 1 + swing * 0.4 + rArmAttackOffset;
  const lArmY = bodyY + 1 - swing * 0.4 + lArmAttackOffset;

  ctx.fillStyle = suitMainColor;
  ctx.strokeStyle = '#090507';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(charRightArmCenterX - 2.3, rArmY, 4.6, 6, 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = rArmLv >= 10 ? '#38bdf8' : '#090507';
  ctx.beginPath();
  ctx.roundRect(charRightArmCenterX - 2.4, rArmY + 5, 4.8, 6, 2);
  ctx.fill();
  ctx.stroke();

  if (rArmTier > 0) {
    const hue = (195 + rArmTier * 17) % 360;
    const auraR = 5 + Math.min(12, rArmTier * 0.14);
    ctx.strokeStyle = `hsl(${hue}, 95%, 62%)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(charRightArmCenterX, rArmY + 5.5, auraR, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawEquippedWeapon25D(
    charRightArmCenterX,
    rArmY + 6,
    rightSideSign,
    eqWeapon,
    weaponLv,
    time,
    atkProg,
    p.attackAngle || 0,
    p.attackSwingSide || 1,
    p.attackSkillType || null
  );

  ctx.fillStyle = suitMainColor;
  ctx.strokeStyle = '#090507';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(charLeftArmCenterX - 2.3, lArmY, 4.6, 6, 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = lArmLv >= 10 ? '#fef08a' : '#090507';
  ctx.beginPath();
  ctx.roundRect(charLeftArmCenterX - 2.4, lArmY + 5, 4.8, 6, 2);
  ctx.fill();
  ctx.stroke();

  if (eqWeapon === 'daggers') {
    drawEquippedWeapon25D(
      charLeftArmCenterX,
      lArmY + 6,
      leftSideSign,
      'daggers',
      weaponLv,
      time,
      atkProg,
      p.attackAngle || 0,
      -(p.attackSwingSide || 1),
      p.attackSkillType || null
    );
  }

  if (lArmTier > 0) {
    const shieldLayers = Math.min(6, 1 + Math.floor(lArmTier / 16));
    const baseRad = 8 + Math.min(18, lArmTier * 0.18);
    const hue = (45 + lArmTier * 9) % 360;

    ctx.save();
    ctx.translate(charLeftArmCenterX + leftSideSign * 2, lArmY + 5);
    for (let s = 0; s < shieldLayers; s++) {
      ctx.save();
      ctx.rotate(time * 0.005 * (s % 2 === 0 ? 1 : -1) + s * 0.5);
      ctx.strokeStyle = s === 0 ? '#facc15' : `hsl(${hue}, 95%, 65%)`;
      ctx.lineWidth = 1.4;
      const r = baseRad + s * 3;
      ctx.strokeRect(-r / 2, -r / 2, r, r);
      ctx.restore();
    }
    ctx.restore();
  }

  if (isFemale) {
    const hairDarkBrown = '#2e1a12';
    const ribbonSway = isMoving ? Math.sin(time * 0.025) * 2.2 : Math.sin(time * 0.004) * 0.8;

    for (const side of [-1, 1]) {
      const bunX = bodyX + side * 9.5;
      const bunY = headY - 6.5;

      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bunX, bunY + 2);
      ctx.quadraticCurveTo(bunX + side * 8, bunY + 2 + ribbonSway, bunX + side * 10, bunY + 6 + ribbonSway);
      ctx.quadraticCurveTo(bunX + side * 5, bunY + 6, bunX, bunY + 3);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bunX, bunY + 3);
      ctx.quadraticCurveTo(bunX + side * 6, bunY + 8 + ribbonSway, bunX + side * 5, bunY + 12 + ribbonSway);
      ctx.quadraticCurveTo(bunX + side * 1, bunY + 9, bunX, bunY + 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = hairDarkBrown;
      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bunX, bunY, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bunX - side * 3, bunY + 2.5);
      ctx.lineTo(bunX + side * 2.5, bunY - 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#fde0c4';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bodyX, headY + 1.8, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (p.dir === 'up') {
      ctx.fillStyle = hairDarkBrown;
      ctx.beginPath();
      ctx.arc(bodyX, headY + 1.5, 8.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const eyeOff = p.dir === 'left' ? -1.8 : (p.dir === 'right' ? 1.8 : 0);

      ctx.fillStyle = '#090507';
      ctx.beginPath();
      ctx.arc(bodyX - 3.5 + eyeOff, headY + 1.2, 2.3, 0, Math.PI * 2);
      ctx.arc(bodyX + 3.5 + eyeOff, headY + 1.2, 2.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bodyX - 6.2 + eyeOff, headY - 0.5); ctx.lineTo(bodyX - 2.0 + eyeOff, headY - 0.8);
      ctx.moveTo(bodyX + 6.2 + eyeOff, headY - 0.5); ctx.lineTo(bodyX + 2.0 + eyeOff, headY - 0.8);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bodyX - 4.0 + eyeOff, headY + 0.6, 0.85, 0, Math.PI * 2);
      ctx.arc(bodyX + 3.0 + eyeOff, headY + 0.6, 0.85, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
      ctx.beginPath();
      ctx.ellipse(bodyX - 5.5 + eyeOff * 0.5, headY + 3.3, 1.9, 1.1, 0, 0, Math.PI * 2);
      ctx.ellipse(bodyX + 5.5 + eyeOff * 0.5, headY + 3.3, 1.9, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bodyX - 8.2, headY + 2.8);
      ctx.quadraticCurveTo(bodyX, headY + 1.0, bodyX + 8.2, headY + 2.8);
      ctx.arc(bodyX, headY + 1.8, 8.5, 0.12, Math.PI - 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = hairDarkBrown;
      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bodyX, headY + 0.8, 8.9, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(bodyX + 8.2, headY - 0.8);
      ctx.lineTo(bodyX + 4.5, headY - 1.2);
      ctx.lineTo(bodyX + 3.5, headY - 3.2);
      ctx.lineTo(bodyX + 1.5, headY - 1.0);
      ctx.lineTo(bodyX - 2.0, headY - 1.0);
      ctx.lineTo(bodyX - 3.2, headY - 3.2);
      ctx.lineTo(bodyX - 4.5, headY - 1.2);
      ctx.lineTo(bodyX - 8.2, headY - 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

  } else {
    const leafSway = isMoving ? Math.sin(time * 0.025) * 1.5 : 0;
    const leafSpecs = [
      { ox: -6.5, h: 11, w: 4.2, rot: -0.32 },
      { ox: -3.2, h: 13.5, w: 4.6, rot: -0.14 },
      { ox: 0,    h: 15, w: 5.0, rot: 0 },
      { ox: 3.2,  h: 13.5, w: 4.6, rot: 0.14 },
      { ox: 6.5,  h: 11, w: 4.2, rot: 0.32 }
    ];
    leafSpecs.forEach(lf => {
      ctx.save();
      ctx.translate(bodyX + lf.ox, headY - 5);
      ctx.rotate(lf.rot + leafSway * 0.04);
      const lGrad = ctx.createLinearGradient(0, 2, 0, -lf.h);
      lGrad.addColorStop(0, '#dcfce7');
      lGrad.addColorStop(0.45, '#4ade80');
      lGrad.addColorStop(1, '#15803d');
      ctx.fillStyle = lGrad;
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-lf.w * 0.65, 2);
      ctx.quadraticCurveTo(-lf.w * 1.1, -lf.h * 0.6, -lf.w * 0.4, -lf.h);
      ctx.quadraticCurveTo(0, -lf.h * 1.12, lf.w * 0.4, -lf.h);
      ctx.quadraticCurveTo(lf.w * 1.1, -lf.h * 0.6, lf.w * 0.65, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.fillStyle = '#f5cba7';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bodyX, headY + 1.8, 8.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#15803d';
    ctx.strokeStyle = '#090507';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(bodyX - 8.8, headY - 6.2, 17.6, 4.8, 1.5);
    ctx.fill();
    ctx.stroke();

    if (p.dir !== 'up') {
      const eyeOff = p.dir === 'left' ? -1.8 : (p.dir === 'right' ? 1.8 : 0);

      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(bodyX - 4.2 + eyeOff * 0.4, headY - 6.5);
      ctx.lineTo(bodyX + eyeOff * 0.4, headY - 3.5);
      ctx.lineTo(bodyX + 4.2 + eyeOff * 0.4, headY - 6.5);
      ctx.lineTo(bodyX + 2.5 + eyeOff * 0.4, headY - 1.2);
      ctx.lineTo(bodyX + eyeOff * 0.4, headY + 0.5);
      ctx.lineTo(bodyX - 2.5 + eyeOff * 0.4, headY - 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = (headTier > 0 || isAttacking) ? '#ef4444' : '#090507';
      ctx.beginPath();
      ctx.arc(bodyX - 3.4 + eyeOff, headY + 1.5, 1.6, 0, Math.PI * 2);
      ctx.arc(bodyX + 3.4 + eyeOff, headY + 1.5, 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(bodyX - 6.4 + eyeOff, headY - 0.8);
      ctx.lineTo(bodyX - 1.4 + eyeOff, headY + 0.5);
      ctx.moveTo(bodyX + 6.4 + eyeOff, headY - 0.8);
      ctx.lineTo(bodyX + 1.4 + eyeOff, headY + 0.5);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#090507';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bodyX - 8.1, headY + 2.8);
      ctx.lineTo(bodyX, headY + 0.6);
      ctx.lineTo(bodyX + 8.1, headY + 2.8);
      ctx.arc(bodyX, headY + 1.8, 8.4, 0.12, Math.PI - 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  if (headTier > 0) {
    const haloRings = Math.min(6, 1 + Math.floor(headTier / 16));
    const baseHaloW = 9 + Math.min(18, headTier * 0.18);
    const hue = (50 + headTier * 19) % 360;

    for (let h = 0; h < haloRings; h++) {
      ctx.strokeStyle = h === 0 ? '#fef08a' : `hsl(${(hue + h * 40) % 360}, 95%, 65%)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        bodyX,
        headY - 17 - h * 2.8,
        baseHaloW - h * 1.2,
        2.8,
        Math.sin(time * 0.004 + h) * 0.18,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawSpeechBubble(cx, cy, text) {
  ctx.font = '12px "DungGeunMo"';
  const textWidth = ctx.measureText(text).width;
  const bw = Math.max(textWidth + 14, 34);
  const bh = 22;
  const bx = cx - bw / 2;
  const by = cy - bh;

  ctx.save();
  ctx.fillStyle = 'rgba(12, 8, 12, 0.92)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fef08a';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, by + 15);
  ctx.restore();
}

// ================= [메인 게임 렌더링 루프 (60FPS & 뷰포트 컬링 최적화)] =================
function drawGame() {
  syncCanvasViewportResolution();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const time = Date.now();
  const dt = Math.min(50, Math.max(1, time - lastRenderFrameTime));
  lastRenderFrameTime = time;

  if (!isWorldBgBaked) bakeWorldBackground();

  // 1. 내 캐릭터 즉시 예측 이동
  updateLocalPlayerMovement(dt, time);

  // 2. 타 플레이어 부드러운 보간
  Object.values(players).forEach(p => {
    if (p.id === myId) return;
    const targetX = p.x * TILE_SIZE;
    const targetY = p.y * TILE_SIZE;
    if (p.renderX === undefined) p.renderX = targetX;
    if (p.renderY === undefined) p.renderY = targetY;

    const remX = targetX - p.renderX;
    const remY = targetY - p.renderY;
    const remDist = Math.hypot(remX, remY);

    if (remDist > TILE_SIZE * 4) {
      p.renderX = targetX;
      p.renderY = targetY;
    } else if (remDist > 0.1) {
      const interpSpeed = (p.sprint ? 9.5 : 5.4) * TILE_SIZE * (dt / 1000);
      const step = Math.min(remDist, Math.max(interpSpeed, remDist * 0.22));
      p.renderX += (remX / remDist) * step;
      p.renderY += (remY / remDist) * step;
      p.lastRenderMoveTime = time;
    }
  });

  // 3. 몬스터 부드러운 보간 (블랙홀 흡입 중일 때는 고속 흡입 보간 적용!)
  Object.values(monsters).forEach(m => {
    const targetX = m.x * TILE_SIZE;
    const targetY = m.y * TILE_SIZE;
    if (m.renderX === undefined) m.renderX = targetX;
    if (m.renderY === undefined) m.renderY = targetY;

    const remX = targetX - m.renderX;
    const remY = targetY - m.renderY;
    const remDist = Math.hypot(remX, remY);
    const isPulling = m.pullBoostUntil && time < m.pullBoostUntil;

    if (remDist > TILE_SIZE * 5) {
      m.renderX = targetX;
      m.renderY = targetY;
    } else if (remDist > 0.1) {
      const speedMult = isPulling ? 14.0 : 2.6;
      const mStep = Math.min(remDist, (TILE_SIZE * speedMult) * (dt / 1000));
      m.renderX += (remX / remDist) * mStep;
      m.renderY += (remY / remDist) * mStep;
    }
  });

  const me = players[myId];
  let { camX, camY } = computeCameraPos(me);

  if (screenShakeMag > 0.1) {
    camX += (Math.random() - 0.5) * screenShakeMag;
    camY += (Math.random() - 0.5) * screenShakeMag;
    screenShakeMag *= 0.82;
  } else {
    screenShakeMag = 0;
  }

  // 뷰포트 컬링(Frustum Culling) 경계값: 화면 밖 오브젝트 렌더링 생략으로 렉 완벽 방지
  const cullLeft = camX - 90;
  const cullRight = camX + canvas.width + 90;
  const cullTop = camY - 90;
  const cullBottom = camY + canvas.height + 90;
  const isInView = (wx, wy) => wx >= cullLeft && wx <= cullRight && wy >= cullTop && wy <= cullBottom;

  ctx.save();
  ctx.translate(-camX, -camY);

  // 배경 출력
  ctx.drawImage(worldBgCanvas, 0, 0);

  // 구역 안내 바닥 표식
  ctx.save();
  ctx.font = 'bold 12px "DungGeunMo"';
  ctx.textAlign = 'center';
  if (isInView(855, 298)) {
    ctx.fillStyle = 'rgba(254, 240, 138, 0.55)';
    ctx.fillText('▶ 동쪽숲1 (마법의 숲)', 855, 298);
  }
  if (mapW >= 60 && isInView(1668, 298)) {
    ctx.fillStyle = 'rgba(192, 132, 252, 0.72)';
    ctx.fillText('▶ 동쪽숲2 (질병·역병의 숲)', 1668, 298);
  }
  ctx.restore();

  // 기숙사 내부 연출은 카메라가 기숙사 근처일 때만 렌더링
  if (camX < 850) {
    ctx.save();
    ctx.translate(400, 320);
    ctx.rotate(time * 0.00045);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.38)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 116, 0, Math.PI * 2);
    ctx.arc(0, 0, 92, 0, Math.PI * 2);
    ctx.stroke();

    for (let t = 0; t < 2; t++) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (t * Math.PI) + (Math.PI * 2 / 3) * i;
        const vx = Math.cos(a) * 92;
        const vy = Math.sin(a) * 92;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    drawBronzeDeerCrest(400, 320, 1.3);

    const fpX = 9 * TILE_SIZE;
    const fpY = 1 * TILE_SIZE;
    const fireGlow = ctx.createRadialGradient(fpX + 40, fpY + 28, 6, fpX + 40, fpY + 28, 145);
    fireGlow.addColorStop(0, 'rgba(239, 68, 68, 0.48)');
    fireGlow.addColorStop(0.5, 'rgba(245, 158, 11, 0.2)');
    fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(fpX + 40, fpY + 28, 145, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#271c22';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.fillRect(fpX - 6, fpY - 12, 92, 52);
    ctx.strokeRect(fpX - 6, fpY - 12, 92, 52);

    ctx.fillStyle = '#090406';
    ctx.fillRect(fpX + 6, fpY + 4, 68, 34);
    for (let i = 0; i < 5; i++) {
      const fh = 14 + Math.sin(time * 0.015 + i * 1.3) * 8;
      ctx.fillStyle = i % 2 === 0 ? '#dc2626' : '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(fpX + 12 + i * 12, fpY + 38);
      ctx.lineTo(fpX + 18 + i * 12, fpY + 38 - fh);
      ctx.lineTo(fpX + 24 + i * 12, fpY + 38);
      ctx.closePath();
      ctx.fill();
    }
    drawBronzeDeerCrest(fpX + 40, fpY - 16, 0.9);

    [2 * TILE_SIZE, 16 * TILE_SIZE].forEach(wx => {
      ctx.fillStyle = '#1e1b4b';
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.fillRect(wx + 6, 8, 68, 64);
      ctx.strokeRect(wx + 6, 8, 68, 64);

      ctx.beginPath();
      ctx.moveTo(wx + 40, 8); ctx.lineTo(wx + 40, 72);
      ctx.moveTo(wx + 6, 40); ctx.lineTo(wx + 74, 40);
      ctx.stroke();
    });
  }

  // 발걸음 먼지
  footstepDusts = footstepDusts.filter(d => {
    const el = time - d.born;
    if (el > 320) return false;
    if (!isInView(d.x, d.y)) return true;
    const prog = el / 320;
    ctx.save();
    ctx.fillStyle = `rgba(214, 198, 175, ${(1 - prog) * 0.42})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y - prog * 4, d.r * (1 + prog * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return true;
  });

  // 2.5D 깊이 정렬(Y-Sorting) + 뷰포트 컬링
  const renderQueue = [];

  obstacles.forEach(obs => {
    if (obs.type && (obs.type.startsWith('npc_') || obs.type === 'fireplace' || obs.type === 'window')) return;
    if (DORM_NPCS.some(n => n.x === obs.x && n.y === obs.y)) return;
    const ox = obs.x * TILE_SIZE + 20;
    const oy = obs.y * TILE_SIZE + 20;
    if (!isInView(ox, oy)) return;
    renderQueue.push({
      sortY: obs.y * TILE_SIZE + 34,
      draw: () => drawObstacle25D(obs, time)
    });
  });

  DORM_NPCS.forEach(npc => {
    const nx = npc.x * TILE_SIZE + 20;
    const ny = npc.y * TILE_SIZE + 20;
    if (!isInView(nx, ny)) return;
    renderQueue.push({
      sortY: npc.y * TILE_SIZE + 36,
      draw: () => drawWizardNPC(npc, time)
    });
  });

  Object.values(monsters).forEach(m => {
    if (!m.alive) return;
    const mx = m.renderX !== undefined ? m.renderX : m.x * TILE_SIZE;
    const my = m.renderY !== undefined ? m.renderY : m.y * TILE_SIZE;
    if (!isInView(mx + 20, my + 20)) return;
    const mSize = m.size || 1;
    renderQueue.push({
      sortY: my + mSize * TILE_SIZE - 4,
      draw: () => drawMonster(m, time)
    });
  });

  Object.values(players).forEach(p => {
    const rx = p.renderX !== undefined ? p.renderX : p.x * TILE_SIZE;
    const ry = p.renderY !== undefined ? p.renderY : p.y * TILE_SIZE;
    if (!isInView(rx + 20, ry + 20)) return;
    renderQueue.push({
      sortY: ry + 36,
      draw: () => {
        const c = p.character || {};
        drawEvolvedStudent(rx, ry, p, time);

        const mainTitle = getSelectedOverheadTitle(c);
        const combatPower = getTotalCombatPower(c);

        ctx.font = 'bold 11px "DungGeunMo"';
        ctx.textAlign = 'center';
        ctx.fillStyle = combatPower >= 100 ? '#f43f5e' : '#f59e0b';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(mainTitle, rx + 20, ry - 25);
        ctx.fillText(mainTitle, rx + 20, ry - 25);

        ctx.font = '12px "DungGeunMo"';
        ctx.textAlign = 'center';
        ctx.fillStyle = (p.id === myId) ? '#38bdf8' : '#f8fafc';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(p.name, rx + 20, ry - 12);
        ctx.fillText(p.name, rx + 20, ry - 12);

        if (p.chatText) {
          drawSpeechBubble(rx + 20, ry - 36, p.chatText);
        }
      }
    });
  });

  renderQueue.sort((a, b) => a.sortY - b.sortY);
  renderQueue.forEach(item => item.draw());

  // 근접 무기 & 50강 스킬 이펙트 렌더링 (대검, GG, 망치, 블랙홀, 쌍수, 새비지 블로우)
  meleeEffects = meleeEffects.filter(meff => {
    const elapsed = time - meff.born;
    if (elapsed > meff.duration) return false;
    const prog = elapsed / meff.duration;
    const alpha = 1 - prog;
    const owner = players[meff.ownerId];
    const ox = (meff.type === 'blackhole' || meff.type === 'daggers_savage')
      ? meff.x
      : (owner && owner.renderX !== undefined ? owner.renderX + 20 : meff.x);
    const oy = (meff.type === 'blackhole' || meff.type === 'daggers_savage')
      ? meff.y
      : (owner && owner.renderY !== undefined ? owner.renderY + 20 : meff.y);
    if (!isInView(ox, oy)) return true;

    const hue = (200 + meff.weaponLv * 14) % 360;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(ox, oy);
    ctx.globalAlpha = alpha;

    if (meff.type === 'greatsword') {
      const curR = meff.reach * (0.65 + prog * 0.35);
      ctx.strokeStyle = meff.weaponLv >= 10 ? `hsl(${hue}, 100%, 68%)` : '#facc15';
      ctx.fillStyle = meff.weaponLv >= 10 ? `hsla(${hue}, 100%, 55%, 0.28)` : 'rgba(250, 204, 21, 0.25)';
      ctx.lineWidth = 7 * alpha;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, curR, meff.angle - meff.halfArc, meff.angle + meff.halfArc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, curR * 0.92, meff.angle - meff.halfArc * 0.85, meff.angle + meff.halfArc * 0.85);
      ctx.stroke();

    } else if (meff.type === 'greatsword_gg') {
      const spinAngle = prog * Math.PI * 4;
      const curR = meff.reach;
      ctx.rotate(spinAngle);
      ctx.strokeStyle = '#facc15';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.26)';
      ctx.lineWidth = 8 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, curR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, curR * 0.72, 0, Math.PI * 1.4);
      ctx.stroke();

    } else if (meff.type === 'hammer') {
      const curR = meff.reach * (0.7 + prog * 0.3);
      ctx.strokeStyle = meff.weaponLv >= 10 ? `hsl(${hue}, 100%, 66%)` : '#fb923c';
      ctx.fillStyle = 'rgba(251, 146, 60, 0.28)';
      ctx.lineWidth = 6 * alpha;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, curR, meff.angle - meff.halfArc, meff.angle + meff.halfArc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

    } else if (meff.type === 'blackhole') {
      const outerR = meff.pullRadius * (1 - prog * 0.72);
      ctx.strokeStyle = '#a855f7';
      ctx.fillStyle = 'rgba(88, 28, 135, 0.34)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(16, outerR), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-prog * Math.PI * 3);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      for (let arm = 0; arm < 4; arm++) {
        const a0 = (Math.PI / 2) * arm;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(12, outerR * 0.65), a0, a0 + 0.9);
        ctx.stroke();
      }

      ctx.fillStyle = '#090507';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();

    } else if (meff.type === 'daggers') {
      const slashAng = meff.angle + (meff.swingSide || 1) * 0.18;
      const len = meff.reach * (0.5 + prog * 0.5);
      ctx.strokeStyle = meff.weaponLv >= 10 ? `hsl(${hue}, 100%, 72%)` : '#38bdf8';
      ctx.lineWidth = 4.5 * alpha;
      ctx.beginPath();
      ctx.moveTo(Math.cos(slashAng) * 10, Math.sin(slashAng) * 10);
      ctx.lineTo(Math.cos(slashAng) * len, Math.sin(slashAng) * len);
      ctx.stroke();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.5 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, len * 0.85, meff.angle - 0.5, meff.angle + 0.5);
      ctx.stroke();

    } else if (meff.type === 'daggers_savage') {
      const slashIdx = Math.floor(prog * 6);
      const slashAngles = [-0.9, 0.85, -0.35, 1.25, 0.1, -1.3];
      for (let i = 0; i <= Math.min(5, slashIdx); i++) {
        const ang = slashAngles[i];
        ctx.strokeStyle = i % 2 === 0 ? '#f43f5e' : '#fef08a';
        ctx.lineWidth = 4.2 * alpha;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * -42, Math.sin(ang) * -42);
        ctx.lineTo(Math.cos(ang) * 42, Math.sin(ang) * 42);
        ctx.stroke();
      }
    }

    ctx.restore();
    return true;
  });

  // 투사체 무기(지팡이 유도 폭발 / 활 무제한 관통 / 차크람 타원 왕복 2타) 이동 및 판정
  projectiles = projectiles.filter(proj => {
    proj.trail.push({ x: proj.x, y: proj.y });
    const maxTrail = 5 + Math.floor(proj.weaponLv * 0.25);
    if (proj.trail.length > maxTrail) proj.trail.shift();

    // 1. [차크람] 타원 곡선(Elliptical Curve) 부메랑 왕복 궤도
    if (proj.weaponType === 'chakram') {
      proj.spinAngle = (proj.spinAngle || 0) + 0.38;
      const elapsed = time - proj.born;
      const halfDur = (proj.flightDuration || 470) * 0.5;
      const owner = players[proj.ownerId];
      const ox = owner && owner.renderX !== undefined ? owner.renderX + 20 : proj.startX;
      const oy = owner && owner.renderY !== undefined ? owner.renderY + 20 : proj.startY;
      const cosA = Math.cos(proj.angle);
      const sinA = Math.sin(proj.angle);
      const perpX = -sinA;
      const perpY = cosA;
      const apexX = proj.startX + cosA * proj.maxDistPx;
      const apexY = proj.startY + sinA * proj.maxDistPx;

      if (elapsed <= halfDur) {
        proj.returning = false;
        const u = elapsed / halfDur;
        const forward = Math.sin(u * (Math.PI / 2)) * proj.maxDistPx;
        const side = Math.sin(u * Math.PI) * (proj.minorRadiusPx || 38);
        proj.x = proj.startX + cosA * forward + perpX * side;
        proj.y = proj.startY + sinA * forward + perpY * side;
      } else if (elapsed <= halfDur * 2) {
        proj.returning = true;
        const u = (elapsed - halfDur) / halfDur;
        const easeU = Math.sin(u * (Math.PI / 2));
        const side = -Math.sin(u * Math.PI) * (proj.minorRadiusPx || 38);
        proj.x = apexX + (ox - apexX) * easeU + perpX * side;
        proj.y = apexY + (oy - apexY) * easeU + perpY * side;
      } else {
        return false;
      }
    } else {
      // 2. [지팡이] 전방 부채꼴 몬스터 유도 보정(소프트 호밍)
      if (proj.homing) {
        let bestTarget = null;
        let bestDist = 210;
        Object.values(monsters).forEach(m => {
          if (!m.alive) return;
          const mc = getMonsterWorldCenter(m);
          const d = Math.hypot(mc.cx - proj.x, mc.cy - proj.y);
          if (d < bestDist) {
            const toAng = Math.atan2(mc.cy - proj.y, mc.cx - proj.x);
            if (Math.abs(angleDiff(toAng, proj.angle)) < 0.78) {
              bestDist = d;
              bestTarget = mc;
            }
          }
        });
        if (bestTarget) {
          const targetAng = Math.atan2(bestTarget.cy - proj.y, bestTarget.cx - proj.x);
          const diff = angleDiff(targetAng, proj.angle);
          proj.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.052);
          proj.vx = Math.cos(proj.angle) * proj.speed;
          proj.vy = Math.sin(proj.angle) * proj.speed;
        }
      }

      proj.x += proj.vx;
      proj.y += proj.vy;

      if (proj.x < 8 || proj.x > mapW * TILE_SIZE - 8 || proj.y < 8 || proj.y > mapH * TILE_SIZE - 8) {
        spawnHitExplosion(proj.x, proj.y, proj.weaponLv, false);
        return false;
      }

      const distFromStart = Math.hypot(proj.x - proj.startX, proj.y - proj.startY);
      if (distFromStart > (proj.maxDistPx || 300)) {
        return false;
      }
    }

    // 몬스터 충돌 판정 (2x2 대형 몬스터 반경 자동 반영)
    for (const m of Object.values(monsters)) {
      if (!m.alive) continue;
      const mc = getMonsterWorldCenter(m);
      const hitLimit = (proj.hitRadius || 30) + (m.size === 2 ? 22 : 0);

      if (Math.hypot(proj.x - mc.cx, proj.y - mc.cy) <= hitLimit) {
        if (proj.weaponType === 'bow') {
          if (!proj.hitMonsterIds[m.id]) {
            proj.hitMonsterIds[m.id] = true;
            spawnHitExplosion(proj.x, proj.y, proj.weaponLv, true);
            if (proj.ownerId === myId) {
              socket.emit('hitMonster', { monsterId: m.id, skillHit: Boolean(proj.skillHit) });
            }
          }
        } else if (proj.weaponType === 'chakram') {
          const hitMap = proj.returning ? proj.returnHitIds : proj.outHitIds;
          if (!hitMap[m.id]) {
            hitMap[m.id] = true;
            spawnHitExplosion(proj.x, proj.y, proj.weaponLv, true);
            if (proj.ownerId === myId) {
              socket.emit('hitMonster', { monsterId: m.id, skillHit: Boolean(proj.skillHit) });
            }
          }
        } else {
          spawnHitExplosion(proj.x, proj.y, proj.weaponLv, true);
          if (proj.ownerId === myId) {
            socket.emit('hitMonster', { monsterId: m.id, skillHit: Boolean(proj.skillHit) });
            Object.values(monsters).forEach(other => {
              if (!other.alive || other.id === m.id) return;
              const oc = getMonsterWorldCenter(other);
              if (Math.hypot(oc.cx - proj.x, oc.cy - proj.y) <= 68 + oc.radius) {
                socket.emit('hitMonster', { monsterId: other.id, isSplash: true });
              }
            });
          }
          return false;
        }
      }
    }

    // 지팡이 마법구 장애물 충돌
    if (proj.weaponType === 'wand') {
      const tileX = Math.floor(proj.x / TILE_SIZE);
      const tileY = Math.floor(proj.y / TILE_SIZE);
      if (obstacles.some(obs => obs.x === tileX && obs.y === tileY)) {
        spawnHitExplosion(proj.x, proj.y, proj.weaponLv, false);
        return false;
      }
    }

    if (!isInView(proj.x, proj.y)) return true;

    // 투사체 그래픽 렌더링
    const lv = proj.weaponLv;
    const hue = (200 + lv * 14) % 360;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (proj.weaponType === 'bow') {
      ctx.translate(proj.x, proj.y);
      ctx.rotate(proj.angle);
      ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = proj.skillHit ? '#f43f5e' : '#fef08a';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();

      ctx.fillStyle = proj.skillHit ? '#facc15' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(8, -5.5);
      ctx.lineTo(8, 5.5);
      ctx.closePath();
      ctx.fill();
    } else if (proj.weaponType === 'chakram') {
      ctx.translate(proj.x, proj.y);
      ctx.rotate(proj.spinAngle || 0);
      const cR = 13 + lv * 0.25;
      ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = proj.skillHit ? '#facc15' : (lv >= 10 ? `hsl(${hue}, 100%, 70%)` : '#38bdf8');
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, cR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      for (let b = 0; b < 4; b++) {
        const ba = (Math.PI / 2) * b;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ba) * (cR + 4), Math.sin(ba) * (cR + 4));
        ctx.stroke();
      }
    } else {
      const coreR = 6.2 + lv * 0.35;
      for (let i = 0; i < proj.trail.length; i++) {
        const pt = proj.trail[i];
        const ratio = (i + 1) / proj.trail.length;
        ctx.fillStyle = `hsla(${hue}, 100%, 65%, ${ratio * 0.65})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, coreR * ratio * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.translate(proj.x, proj.y);
      ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
      ctx.shadowBlur = 12 + lv * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsl(${hue}, 100%, 68%)`;
      ctx.lineWidth = 2.2 + lv * 0.06;
      ctx.beginPath();
      ctx.arc(0, 0, coreR + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
    return true;
  });

  // 피격 폭발 이펙트
  hitEffects = hitEffects.filter(eff => {
    const elapsed = time - eff.born;
    if (elapsed > eff.duration) return false;
    if (!isInView(eff.x, eff.y)) return true;
    const prog = elapsed / eff.duration;
    const alpha = 1 - prog;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(eff.x, eff.y);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = `hsl(${eff.hue}, 100%, 65%)`;
    ctx.shadowBlur = 12 * alpha;

    for (let r = 0; r < eff.ringCount; r++) {
      const rad = eff.maxRadius * prog * (1 - r * 0.22);
      ctx.strokeStyle = r % 2 === 0 ? `hsl(${eff.hue}, 100%, 70%)` : '#fef08a';
      ctx.lineWidth = (3.0 - r * 0.4) * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, rad), 0, Math.PI * 2);
      ctx.stroke();
    }

    eff.sparks.forEach(sp => {
      const dist = sp.spd * prog * 12;
      const sx = Math.cos(sp.angle) * dist;
      const sy = Math.sin(sp.angle) * dist;
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sx, sy, sp.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
    return true;
  });

  // 데미지 플로팅 텍스트
  floatingDamages = floatingDamages.filter(fd => {
    const elapsed = time - fd.born;
    if (elapsed > 720) return false;
    if (!isInView(fd.x, fd.y)) return true;
    const prog = elapsed / 720;
    ctx.save();
    ctx.font = 'bold 13px "DungGeunMo"';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1 - prog;
    ctx.fillStyle = fd.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(fd.text, fd.x, fd.y - prog * 24);
    ctx.fillText(fd.text, fd.x, fd.y - prog * 24);
    ctx.restore();
    return true;
  });

  // 기운 발산 이펙트
  burstEffects = burstEffects.filter(eff => {
    const elapsed = time - eff.born;
    if (elapsed > eff.duration) return false;
    if (!isInView(eff.cx, eff.cy)) return true;

    const progress = elapsed / eff.duration;
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(eff.cx, eff.cy);
    ctx.shadowColor = eff.palette.glow;
    ctx.shadowBlur = (14 + Math.min(22, eff.tier * 0.12)) * alpha;

    for (let rIdx = 0; rIdx < eff.ringCount; rIdx++) {
      const rScale = 1 - rIdx * (0.65 / eff.ringCount);
      const r = eff.maxRadius * progress * rScale;

      ctx.beginPath();
      if (rIdx % 2 === 0) {
        for (let i = 0; i < eff.polySides; i++) {
          const a = (Math.PI * 2 / eff.polySides) * i + progress * (1.5 + rIdx * 0.4);
          const hx = Math.cos(a) * r;
          const hy = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
      } else {
        ctx.arc(0, 0, r, 0, Math.PI * 2);
      }
      ctx.strokeStyle = rIdx % 2 === 0 ? eff.palette.primary : eff.palette.ring;
      ctx.lineWidth = (3.5 - rIdx * 0.25) * alpha;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }

    eff.particles.forEach(pt => {
      ctx.fillStyle = pt.color;
      ctx.strokeStyle = pt.color;
      ctx.globalAlpha = alpha;

      const curAngle = pt.angle + progress * (eff.tier * 0.012);
      const dist = pt.speed * progress * 10;
      const px = Math.cos(curAngle) * dist;
      const py = Math.sin(curAngle) * dist;
      const size = pt.size * (1 - progress * 0.35);

      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
    return true;
  });

  // 배경 촛불 & 구역별 반딧불이/포자 입자 (뷰포트 컬링 적용)
  if (camX < 820) {
    floatingCandles.forEach(cd => {
      if (!isInView(cd.x, cd.y)) return;
      const hoverY = cd.y + Math.sin(time * 0.003 + cd.phase) * 5;
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(cd.x - 1.5, hoverY, 3, 9 * cd.scale);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cd.x, hoverY - 2.5, 2.2 * cd.scale, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  emberParticles.forEach(em => {
    em.x += em.vx;
    em.y += em.vy;
    if (em.y < 0) { em.y = worldBgCanvas.height; em.x = Math.random() * (mapW * TILE_SIZE); }
    if (em.x < 0) em.x = mapW * TILE_SIZE;
    if (em.x > mapW * TILE_SIZE) em.x = 0;
    if (!isInView(em.x, em.y)) return;

    ctx.fillStyle = em.x > 1600 ? '#c084fc' : (em.x > 800 ? '#a3e635' : '#f59e0b');
    ctx.globalAlpha = em.alpha;
    ctx.beginPath();
    ctx.arc(em.x, em.y, em.size * 0.7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
  requestAnimationFrame(drawGame);
}

window.addEventListener('DOMContentLoaded', () => {
  syncCanvasViewportResolution();
  const token = localStorage.getItem('azaekaban_token');
  const nick = localStorage.getItem('azaekaban_nickname');
  if (token && nick) connectSocketGame(token, nick);
});

requestAnimationFrame(drawGame);