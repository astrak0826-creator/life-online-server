// ================= [Zero-Lag 뷰포트 & 해상도 동기화] =================
let viewLogicalW = 800;
let viewLogicalH = 600;
let cameraX = 0;
let cameraY = 0;

function syncCanvasViewportResolution() {
  const area = document.querySelector('.canvas-area');
  if (!area || !canvas) return;
  const rect = area.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const zoom = window.userZoomScale || 1.0;
  const isFullLayout =
    document.body.classList.contains('is-touch-device') ||
    document.body.classList.contains('pc-fullscreen');

  if (isFullLayout) {
    viewLogicalW = Math.max(360, Math.round(rect.width / zoom));
    viewLogicalH = Math.max(260, Math.round(rect.height / zoom));
  } else {
    viewLogicalW = Math.round(800 / zoom);
    viewLogicalH = Math.round(600 / zoom);
  }

  if (canvas.width !== viewLogicalW || canvas.height !== viewLogicalH) {
    canvas.width = viewLogicalW;
    canvas.height = viewLogicalH;
  }
  ctx.imageSmoothingEnabled = false;
}
window.syncCanvasViewportResolution = syncCanvasViewportResolution;
window.addEventListener('resize', syncCanvasViewportResolution);
syncCanvasViewportResolution();

// ================= [동쪽숲 타일셋(#FF0000 자동 투명화) & 오프스크린 100×15 월드 베이킹] =================
let worldBgCanvas = null;
let forestTilesClean = null;
let forestTilesLoaded = false;

function loadForestTileset() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const off = document.createElement('canvas');
      off.width = img.naturalWidth || img.width;
      off.height = img.naturalHeight || img.height;
      const octx = off.getContext('2d');
      octx.drawImage(img, 0, 0);

      const imgData = octx.getImageData(0, 0, off.width, off.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 195 && g < 55 && b < 55) {
          d[i + 3] = 0;
        }
      }
      octx.putImageData(imgData, 0, 0);
      forestTilesClean = off;
      forestTilesLoaded = true;
      bakeWorldBackground();
    } catch (e) {
      forestTilesLoaded = false;
    }
  };
  img.onerror = () => { forestTilesLoaded = false; };
  img.src = '/forest_tiles.png';
}
loadForestTileset();

function hash2D(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function bakeWorldBackground() {
  const totalW = mapW * TILE_SIZE;
  const totalH = mapH * TILE_SIZE;
  if (!worldBgCanvas) worldBgCanvas = document.createElement('canvas');
  worldBgCanvas.width = totalW;
  worldBgCanvas.height = totalH;
  const bctx = worldBgCanvas.getContext('2d');
  bctx.imageSmoothingEnabled = false;

  for (let tx = 0; tx < mapW; tx++) {
    for (let ty = 0; ty < mapH; ty++) {
      const px = tx * TILE_SIZE;
      const py = ty * TILE_SIZE;
      const h = hash2D(tx, ty);

      if (tx < 20) {
        const isWall = ty === 0 || tx === 0;
        if (isWall) {
          bctx.fillStyle = '#24151c';
          bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          bctx.fillStyle = '#331d26';
          bctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 8);
        } else {
          const isCarpet = tx >= 7 && tx <= 12 && ty >= 3 && ty <= 11;
          if (isCarpet) {
            bctx.fillStyle = (tx === 7 || tx === 12 || ty === 3 || ty === 11) ? '#92400e' : '#7f1d1d';
            bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            bctx.fillStyle = 'rgba(254, 240, 138, 0.08)';
            bctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          } else {
            bctx.fillStyle = ((tx + ty) % 2 === 0) ? '#261a20' : '#21161c';
            bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            bctx.strokeStyle = 'rgba(255,255,255,0.03)';
            bctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
        }
      } else if (tx < 40) {
        const ratio = (tx - 20) / 20;
        const isPath = ty >= 5 && ty <= 9;
        if (isPath) {
          bctx.fillStyle = h > 0.5 ? '#5c4738' : '#523e30';
          bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          if (h > 0.72) {
            bctx.fillStyle = '#735a47';
            bctx.fillRect(px + 8, py + 12, 8, 5);
          }
        } else {
          bctx.fillStyle = ratio < 0.35
            ? ((tx + ty) % 2 === 0 ? '#2b3428' : '#262f24')
            : ((tx + ty) % 2 === 0 ? '#22472b' : '#1e3e26');
          bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          if (h > 0.65) {
            bctx.fillStyle = '#346e3c';
            bctx.fillRect(px + 10, py + 14, 4, 6);
            bctx.fillRect(px + 15, py + 16, 4, 5);
          }
          if (h > 0.88 && ty > 1 && ty < 13) {
            bctx.fillStyle = h > 0.94 ? '#f472b6' : '#fef08a';
            bctx.fillRect(px + 18, py + 18, 4, 4);
          }
        }
      } else if (tx < 60) {
        bctx.fillStyle = ((tx + ty) % 2 === 0) ? '#15803d' : '#166534';
        bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        if (h > 0.55) {
          bctx.fillStyle = '#22c55e';
          bctx.fillRect(px + Math.floor(h * 22) + 4, py + 10, 4, 4);
          bctx.fillRect(px + 8, py + Math.floor(h * 20) + 12, 3, 5);
        }
        if (h > 0.86) {
          bctx.fillStyle = h > 0.93 ? '#38bdf8' : '#f472b6';
          bctx.fillRect(px + 16, py + 22, 5, 5);
        }
      } else if (tx < 80) {
        bctx.fillStyle = ((tx + ty) % 2 === 0) ? '#172b24' : '#13241e';
        bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        if (h > 0.58) {
          bctx.fillStyle = '#1f4034';
          bctx.fillRect(px + 6, py + 12, 6, 4);
          bctx.fillRect(px + 22, py + 24, 5, 5);
        }
        if (h > 0.87) {
          bctx.fillStyle = h > 0.93 ? '#a855f7' : '#84cc16';
          bctx.fillRect(px + 14, py + 18, 4, 4);
        }
      } else {
        bctx.fillStyle = ((tx + ty) % 2 === 0) ? '#0f172a' : '#0b1222';
        bctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        if (h > 0.62) {
          bctx.fillStyle = '#1e293b';
          bctx.fillRect(px + 5, py + 5, 12, 8);
        }
        if (h > 0.88) {
          bctx.fillStyle = h > 0.94 ? '#10b981' : '#38bdf8';
          bctx.fillRect(px + 17, py + 17, 4, 4);
        }
      }
    }
  }

  const gateConfigs = [
    { x: 20, label: '▶ 동쪽 숲 오솔길', color: '#4ade80' },
    { x: 40, label: '▶ 동쪽숲 1 (사냥터)', color: '#fef08a' },
    { x: 60, label: '▶ 동쪽숲 2 (역병)', color: '#c084fc' },
    { x: 80, label: '▶ 동쪽숲 3 (심연·BOSS)', color: '#f87171' }
  ];
  gateConfigs.forEach(g => {
    const gx = g.x * TILE_SIZE;
    bctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    bctx.fillRect(gx, 4 * TILE_SIZE, TILE_SIZE, 7 * TILE_SIZE);
    bctx.font = 'bold 11px "DungGeunMo"';
    bctx.textAlign = 'center';
    bctx.fillStyle = g.color;
    bctx.fillText(g.label, gx + 20, 4 * TILE_SIZE - 8);
  });

  const bossCx = 92 * TILE_SIZE;
  const bossCy = 7 * TILE_SIZE;
  bctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
  bctx.lineWidth = 3;
  bctx.beginPath();
  bctx.arc(bossCx, bossCy, 115, 0, Math.PI * 2);
  bctx.stroke();
  bctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
  bctx.lineWidth = 2;
  bctx.beginPath();
  bctx.arc(bossCx, bossCy, 78, 0, Math.PI * 2);
  bctx.stroke();
}
bakeWorldBackground();

// ================= [커스텀 캐릭터 아바타 이미지 캐시] =================
const avatarImageCache = new Map();

function getCachedAvatarImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (avatarImageCache.has(dataUrl)) {
    const entry = avatarImageCache.get(dataUrl);
    return entry.ready ? entry.img : null;
  }
  if (avatarImageCache.size > 120) avatarImageCache.clear();
  const img = new Image();
  const entry = { img, ready: false };
  avatarImageCache.set(dataUrl, entry);
  img.onload = () => { entry.ready = true; };
  img.onerror = () => { entry.ready = false; };
  img.src = dataUrl;
  return null;
}

// ================= [채팅 로그 출력 & 상태 알림 팝업] =================
function appendChatMessage(author, text, isSystem = false) {
  if (!chatLog) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  if (isSystem) {
    div.style.borderLeftColor = '#38bdf8';
    div.style.color = '#bae6fd';
    div.textContent = text;
  } else {
    div.innerHTML = `<span class="chat-author">${author}:</span>${text.replace(/</g, '<')}`;
  }
  chatLog.appendChild(div);
  while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop = chatLog.scrollHeight;
  if (typeof wakeUpChatLog === 'function') wakeUpChatLog();
}

function spawnSkillPopup(worldX, worldY, text, color = '#fef08a', tier = 50) {
  if (!text) return;
  if (skillPopups.length > 25) skillPopups.shift();
  skillPopups.push({
    x: worldX,
    y: worldY,
    text,
    color,
    tier,
    born: Date.now(),
    duration: tier >= 100 ? 1900 : 1500
  });
}

// ================= [소켓 연결 및 서버 이벤트 바인딩] =================
function initPlayerRenderFields(p) {
  if (!p) return;
  if (p.renderX === undefined) p.renderX = p.x * TILE_SIZE;
  if (p.renderY === undefined) p.renderY = p.y * TILE_SIZE;
  if (p.attackAnimUntil === undefined) p.attackAnimUntil = 0;
  if (p.lungeOffsetX === undefined) p.lungeOffsetX = 0;
  if (p.lungeOffsetY === undefined) p.lungeOffsetY = 0;
  if (p.walkPhase === undefined) p.walkPhase = 0;
  if (p.taijiActiveUntil === undefined) p.taijiActiveUntil = 0;
  if (p.taijiOuterUntil === undefined) p.taijiOuterUntil = 0;
  if (p.afterimages === undefined) p.afterimages = [];
}

function initMonsterRenderFields(m) {
  if (!m) return;
  if (m.renderX === undefined) m.renderX = m.x * TILE_SIZE;
  if (m.renderY === undefined) m.renderY = m.y * TILE_SIZE;
  if (m.hitFlashUntil === undefined) m.hitFlashUntil = 0;
  if (m.frozenUntil === undefined) m.frozenUntil = 0;
}

function connectSocketGame(token, nickname) {
  if (socket) {
    try { socket.disconnect(); } catch (e) {}
  }

  myNickname = nickname || '모험가';
  hudNick.textContent = `[${myNickname}]`;

  socket = io({
    auth: { token },
    transports: ['websocket', 'polling']
  });

  socket.on('connect_error', (err) => {
    authMsg.textContent = `접속 실패: ${err.message}`;
    localStorage.removeItem('azaekaban_token');
    authModal.classList.remove('hidden');
  });

  socket.on('init', (data) => {
    authModal.classList.add('hidden');
    myId = data.myId;
    mapW = data.mapWidth || 100;
    mapH = data.mapHeight || 15;
    obstacles = data.obstacles || [];
    players = data.players || {};
    monsters = data.monsters || {};
    if (data.billboard) billboardData = data.billboard;

    Object.values(players).forEach(initPlayerRenderFields);
    Object.values(monsters).forEach(initMonsterRenderFields);

    const me = players[myId];
    if (me) {
      myCharacter = me.character || myCharacter;
      myChances = typeof me.enhanceTokens === 'number' ? me.enhanceTokens : MAX_CHANCES;
      myLastRefill = me.lastTokenRefill || Date.now();
      myDebuffUntil = me.debuffUntil || 0;
      cameraX = me.renderX - viewLogicalW / 2;
      cameraY = me.renderY - viewLogicalH / 2;
      BGMManager.updateZoneByX(me.x);
    }

    bakeWorldBackground();
    updateAttackButtonLabel();
    updateHUD();
    syncCanvasViewportResolution();
    appendChatMessage('', '🌟 인생온라인에 입장했습니다! 로비의 [대장간]에서 무기를 세팅하고 동쪽 사냥터로 나가보세요.', true);
  });

  socket.on('playerJoined', (p) => {
    initPlayerRenderFields(p);
    players[p.id] = p;
    updateHUD();
  });

  socket.on('playerLeft', (id) => {
    delete players[id];
    updateHUD();
  });

  socket.on('playerMoved', (data) => {
    const p = players[data.id];
    if (!p) return;
    if (data.id === myId) {
      if (data.reconcile) {
        p.x = data.x;
        p.y = data.y;
        p.renderX = data.x * TILE_SIZE;
        p.renderY = data.y * TILE_SIZE;
      }
      return;
    }
    p.x = data.x;
    p.y = data.y;
    p.dir = data.dir || p.dir;
    p.angle = typeof data.angle === 'number' ? data.angle : p.angle;
    p.sprint = Boolean(data.sprint);
  });

  socket.on('playerStatUpdated', (data) => {
    const p = players[data.id];
    if (!p) return;
    p.character = data.character;
    if (data.id === myId) {
      myCharacter = data.character;
      updateAttackButtonLabel();
      if (!enhanceModal.classList.contains('hidden')) renderEnhanceUI();
      if (
        !npcDialogModal.classList.contains('hidden') &&
        activeNpc &&
        activeNpc.id === 'npc_blacksmith' &&
        typeof renderBlacksmithPanel === 'function'
      ) {
        renderBlacksmithPanel();
      }
    }
  });

  socket.on('playerChat', (data) => {
    const p = players[data.id];
    if (p) p.chatText = data.message;
    appendChatMessage(data.name, data.message, false);
    if (data.id !== myId) SoundFX.chat();
  });

  socket.on('playerChatClear', (data) => {
    if (players[data.id]) players[data.id].chatText = '';
  });

  socket.on('playerAura', (data) => {
    if (players[data.id]) trigger360AuraBurst(players[data.id], false);
  });

  socket.on('billboardUpdated', (pub) => {
    billboardData = pub;
    if (!billboardModal.classList.contains('hidden')) renderBillboardModalContent();
  });

  socket.on('monstersMovedBatch', (list) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const m = monsters[item.id];
      if (!m) continue;
      m.x = item.x;
      m.y = item.y;
      m.dir = item.dir || m.dir;
    }
  });

  // 지팡이 50강: 반경 4타일 밀쳐내기 충격파 & 좌표 동기화
  socket.on('monstersKnockedBack', (data) => {
    if (!data) return;
    if (Array.isArray(data.pushed)) {
      data.pushed.forEach(item => {
        const m = monsters[item.id];
        if (m) { m.x = item.x; m.y = item.y; }
      });
    }
    hitEffects.push({
      x: data.cx * TILE_SIZE + 20,
      y: data.cy * TILE_SIZE + 20,
      radius: (data.radius || 4.0) * TILE_SIZE,
      color: '#38bdf8',
      born: Date.now(),
      duration: 340
    });
  });

  // 뇌전구 2타: 하늘에서 내리꽂히는 번개 이펙트
  socket.on('lightningStrike', (data) => {
    if (!data) return;
    const mSize = data.size || 1;
    lightningEffects.push({
      x: (data.x + (mSize - 1) * 0.5) * TILE_SIZE + 20,
      y: (data.y + (mSize - 1) * 0.5) * TILE_SIZE + 20,
      born: Date.now(),
      duration: 280
    });
    SoundFX.tone(680, 'sawtooth', 0.14, 0.1, 140);
  });

  socket.on('monstersPulled', (data) => {
    if (!data || !Array.isArray(data.pulled)) return;
    data.pulled.forEach(item => {
      const m = monsters[item.id];
      if (m) { m.x = item.x; m.y = item.y; }
    });
    hitEffects.push({
      x: data.cx * TILE_SIZE + 20,
      y: data.cy * TILE_SIZE + 20,
      radius: 135,
      color: '#a855f7',
      born: Date.now(),
      duration: 360
    });
  });

  socket.on('monsterDamaged', (data) => {
    const m = monsters[data.id];
    if (!m) return;
    m.hp = data.hp;
    m.maxHp = data.maxHp;
    m.hitFlashUntil = Date.now() + 120;
    if (typeof data.frozenUntil === 'number') {
      m.frozenUntil = data.frozenUntil;
    }

    const mSize = m.size || 1;
    const cx = (m.renderX !== undefined ? m.renderX : m.x * TILE_SIZE) + (mSize * TILE_SIZE) / 2;
    const cy = (m.renderY !== undefined ? m.renderY : m.y * TILE_SIZE) + (data.hitType === 'lightning_bolt' ? -6 : 10);

    if (floatingDamages.length > 35) floatingDamages.shift();
    const dmgPrefix = data.hitType === 'lightning_bolt' ? '⚡-' : '-';
    const dmgColor = data.isDebuffed
      ? '#94a3b8'
      : (data.hitType === 'lightning_bolt'
        ? '#facc15'
        : (data.hitType === 'ice'
          ? '#7dd3fc'
          : (data.attackerId === myId ? '#fef08a' : '#cbd5e1')));

    floatingDamages.push({
      x: cx + (Math.random() - 0.5) * 18,
      y: cy,
      text: data.isDebuffed ? `${data.damage} (약화)` : `${dmgPrefix}${data.damage}`,
      color: dmgColor,
      born: Date.now(),
      duration: 700
    });

    if (data.attackerId === myId) {
      SoundFX.magicHit(getEquippedWeaponLevel(myCharacter));
    }
  });

  socket.on('monsterKilled', (data) => {
    const m = monsters[data.id];
    if (m) {
      m.alive = false;
      m.hp = 0;
      m.frozenUntil = 0;
    }

    const cx = (m ? (m.renderX || m.x * TILE_SIZE) : data.x * TILE_SIZE) + 20;
    const cy = (m ? (m.renderY || m.y * TILE_SIZE) : data.y * TILE_SIZE) + 20;
    hitEffects.push({ x: cx, y: cy, radius: data.isBoss ? 110 : 48, color: data.isBoss ? '#facc15' : '#fb7185', born: Date.now(), duration: 420 });

    if (data.attackerId === myId) {
      SoundFX.magicHit(getEquippedWeaponLevel(myCharacter) + 4);
      screenShakeMag = Math.max(screenShakeMag, data.isBoss ? 9 : 4);
      if (data.rewarded) {
        myChances = data.tokens;
        myLastRefill = data.lastRefill;
        updateHUD();
        floatingDamages.push({
          x: cx,
          y: cy - 18,
          text: `+${data.rewardCount || 1} 기회!`,
          color: '#38bdf8',
          born: Date.now(),
          duration: 1100
        });
      }
    }
  });

  socket.on('monsterRespawned', (m) => {
    initMonsterRenderFields(m);
    m.frozenUntil = 0;
    m.renderX = m.x * TILE_SIZE;
    m.renderY = m.y * TILE_SIZE;
    monsters[m.id] = m;
  });

  socket.on('projectileFired', (data) => {
    if (typeof handleRemoteProjectileEvent === 'function') {
      handleRemoteProjectileEvent(data);
    }
  });

  socket.on('bossTelegraph', (data) => {
    bossTelegraphs.push({
      id: data.id,
      x: data.x * TILE_SIZE + 20,
      y: data.y * TILE_SIZE + 20,
      radiusPx: data.radius * TILE_SIZE,
      label: data.label || '위험!',
      born: Date.now(),
      duration: data.duration || 1400
    });
  });

  socket.on('bossAttackResolve', (data) => {
    bossTelegraphs = bossTelegraphs.filter(t => t.id !== data.id);
    hitEffects.push({
      x: data.x * TILE_SIZE + 20,
      y: data.y * TILE_SIZE + 20,
      radius: data.radius * TILE_SIZE,
      color: '#dc2626',
      born: Date.now(),
      duration: 420
    });
    if (Array.isArray(data.hitPlayerIds) && data.hitPlayerIds.includes(myId)) {
      screenShakeMag = 10;
      SoundFX.bossHit();
    }
  });

  socket.on('playerDebuffed', (data) => {
    if (data.id === myId) {
      myDebuffUntil = data.debuffUntil || (Date.now() + 10000);
      appendChatMessage('', data.message, true);
      const me = players[myId];
      if (me) {
        spawnSkillPopup(me.renderX + 20, me.renderY - 12, '🩸 데미지 -95% (10초)', '#f87171', 100);
      }
    }
  });

  socket.on('statDecayNotice', (data) => {
    if (data.character) {
      myCharacter = data.character;
      if (players[myId]) players[myId].character = data.character;
      updateAttackButtonLabel();
    }
    if (data.message) appendChatMessage('', data.message, true);
  });

  socket.on('systemNotice', (data) => {
    if (data && data.message) appendChatMessage('', data.message, true);
  });
}
window.connectSocketGame = connectSocketGame;

// 자동 로그인 복구
(function tryAutoLogin() {
  const savedToken = localStorage.getItem('azaekaban_token');
  const savedNick = localStorage.getItem('azaekaban_nickname');
  if (savedToken && savedNick) {
    connectSocketGame(savedToken, savedNick);
  }
})();

// ================= [입력 컨트롤: 키보드 / PC 버튼 / 모바일 조이스틱 / 캔버스 클릭 & 줌] =================
const keysPressed = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let isSprintHeld = false;
let isAttackHeld = false;
let joyVector = { x: 0, y: 0, active: false };

function isAnyBlockingModalOpen() {
  return [
    authModal, infoModal, settingsModal, billboardModal, enhanceModal,
    enhanceConfirmModal, rankModal, onlineModal, npcDialogModal, fullscreenModal
  ].some(el => el && !el.classList.contains('hidden'));
}

function sendDesktopChat() {
  const msg = chatInput.value.trim();
  if (msg && socket) socket.emit('sendChat', msg);
  chatInput.value = '';
  chatInput.blur();
}
sendBtn?.addEventListener('click', sendDesktopChat);

// SPACE 상호작용: 로비 전광판 / 로비 4인 NPC (2x2 대장간 포함) / 기운 발산
function triggerSpaceInteractOrAura() {
  const me = players[myId];
  if (!me || !socket) return;

  // 1) 로비 중앙 전광판 근접 체크
  if (me.x >= 7.6 && me.x <= 11.4 && me.y >= 1.0 && me.y <= 3.0) {
    openBillboardModal();
    return;
  }

  // 2) 로비 4인 NPC 근접 체크 (2x2 대형 NPC 대장간 반경 반영)
  for (let i = 0; i < DORM_NPCS.length; i++) {
    const npc = DORM_NPCS[i];
    const sz = npc.size || 1;
    const npcCx = npc.x + (sz - 1) * 0.5;
    const npcCy = npc.y + (sz - 1) * 0.5;
    const interactDist = sz === 2 ? 2.4 : 1.75;
    if (Math.hypot(me.x - npcCx, me.y - npcCy) <= interactDist) {
      openNpcDialog(npc);
      return;
    }
  }

  // 3) 그 외 기운 발산
  trigger360AuraBurst(me, true);
  socket.emit('emitAura');
}

// 키보드 이벤트 (Enter/슬래시 채팅, ESC 닫기->설정, X 무기변경, S/C/R/A/Space)
window.addEventListener('keydown', (e) => {
  if (!authModal.classList.contains('hidden')) {
    if (e.key === 'Enter' && !loginFormSection.classList.contains('hidden')) {
      authSubmitBtn.click();
    }
    return;
  }

  if (isEnhanceConfirmOpen()) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAnyOpenModal();
    } else if (['Enter', ' ', 'c', 'C'].includes(e.key)) {
      e.preventDefault();
    }
    return;
  }

  if (document.activeElement === chatInput) {
    if (e.key === 'Enter') { e.preventDefault(); sendDesktopChat(); }
    else if (e.key === 'Escape') { e.preventDefault(); chatInput.blur(); }
    return;
  }
  if (document.activeElement === mobileChatInput) {
    if (e.key === 'Enter') { e.preventDefault(); submitMobileChatOverlay(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMobileChatOverlay(); }
    return;
  }

  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') { e.preventDefault(); closeAnyOpenModal(); }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    const closedAny = closeAnyOpenModal();
    if (!closedAny) openSettingsModal();
    return;
  }

  if (!npcDialogModal.classList.contains('hidden')) {
    if ((e.key === ' ' || e.key === 'Enter') && activeNpc && activeNpc.id !== 'npc_blacksmith' && activeNpc.id !== 'npc_haerin') {
      e.preventDefault();
      advanceNpcDialog();
    }
    return;
  }

  if (!enhanceModal.classList.contains('hidden')) {
    if ((e.key === 'c' || e.key === 'C') && !e.repeat) {
      e.preventDefault();
      executeEnhance();
    }
    return;
  }

  if (isAnyBlockingModalOpen()) return;

  if (e.key === 'Enter' || e.key === '/') {
    e.preventDefault();
    openChatInputSmart();
    return;
  }

  if (e.key in keysPressed) {
    e.preventDefault();
    keysPressed[e.key] = true;
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    if (!isSprintHeld) {
      isSprintHeld = true;
      triggerSpaceInteractOrAura();
    }
    return;
  }

  const lower = e.key.toLowerCase();
  if (lower === 'a') {
    e.preventDefault();
    isAttackHeld = true;
    if (!e.repeat) performWeaponAttack();
  } else if (lower === 'x') {
    e.preventDefault();
    if (!e.repeat && typeof swapMyWeapon === 'function') swapMyWeapon();
  } else if (lower === 's') {
    e.preventDefault();
    openInfoModal(null);
  } else if (lower === 'c') {
    e.preventDefault();
    openEnhance();
  } else if (lower === 'r') {
    e.preventDefault();
    openRankModal();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key in keysPressed) keysPressed[e.key] = false;
  if (e.key === ' ') isSprintHeld = false;
  if (e.key.toLowerCase() === 'a') isAttackHeld = false;
});

window.addEventListener('blur', () => {
  Object.keys(keysPressed).forEach(k => keysPressed[k] = false);
  isSprintHeld = false;
  isAttackHeld = false;
});

function bindHoldButton(el, onDown, onUp) {
  if (!el) return;
  el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(); });
  el.addEventListener('mouseup', onUp);
  el.addEventListener('mouseleave', onUp);
  el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); }, { passive: false });
  el.addEventListener('touchcancel', onUp);
}

bindHoldButton(
  document.getElementById('dBtnAttack'),
  () => { isAttackHeld = true; performWeaponAttack(); },
  () => { isAttackHeld = false; }
);
bindHoldButton(
  document.getElementById('mBtnAttack'),
  () => { isAttackHeld = true; performWeaponAttack(); },
  () => { isAttackHeld = false; }
);
bindHoldButton(
  document.getElementById('dBtnAura'),
  () => { isSprintHeld = true; triggerSpaceInteractOrAura(); },
  () => { isSprintHeld = false; }
);
bindHoldButton(
  document.getElementById('mBtnAura'),
  () => { isSprintHeld = true; triggerSpaceInteractOrAura(); },
  () => { isSprintHeld = false; }
);

// 모바일 가상 조이스틱 제어
(function setupMobileJoystick() {
  const zone = document.getElementById('joystickZone');
  const stick = document.getElementById('joystickStick');
  if (!zone || !stick) return;

  let activeTouchId = null;
  let originX = 0, originY = 0;
  const maxDist = 34;

  function updateStick(clientX, clientY) {
    const dx = clientX - originX;
    const dy = clientY - originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxDist, dist);
    const ang = Math.atan2(dy, dx);
    const ox = Math.cos(ang) * clamped;
    const oy = Math.sin(ang) * clamped;
    stick.style.transform = `translate(${ox}px, ${oy}px)`;
    if (dist > 6) {
      joyVector.x = ox / maxDist;
      joyVector.y = oy / maxDist;
      joyVector.active = true;
    } else {
      joyVector.x = 0;
      joyVector.y = 0;
      joyVector.active = false;
    }
  }

  function resetStick() {
    activeTouchId = null;
    joyVector.x = 0;
    joyVector.y = 0;
    joyVector.active = false;
    stick.classList.remove('active');
    stick.style.transform = 'translate(0px, 0px)';
  }

  zone.addEventListener('touchstart', (e) => {
    if (activeTouchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    activeTouchId = t.identifier;
    const rect = zone.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    stick.classList.add('active');
    updateStick(t.clientX, t.clientY);
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    if (activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeTouchId) {
        e.preventDefault();
        updateStick(t.clientX, t.clientY);
        break;
      }
    }
  }, { passive: false });

  zone.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) { resetStick(); break; }
    }
  });
  zone.addEventListener('touchcancel', resetStick);
})();

// 캔버스 클릭 (전광판 / 2x2 대장간 포함 NPC / 커스텀 크기 유저) & 휠·핀치 줌
canvas.addEventListener('click', (e) => {
  if (!socket || isAnyBlockingModalOpen()) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const worldPxX = (e.clientX - rect.left) * scaleX + cameraX;
  const worldPxY = (e.clientY - rect.top) * scaleY + cameraY;
  const tileX = worldPxX / TILE_SIZE;
  const tileY = worldPxY / TILE_SIZE;

  // 1) 로비 중앙 전광판 클릭
  if (tileX >= 7.2 && tileX <= 12.8 && tileY >= 0.1 && tileY <= 2.3) {
    openBillboardModal();
    return;
  }

  // 2) 로비 4인 NPC 클릭 (2x2 대장간 포함)
  for (let i = 0; i < DORM_NPCS.length; i++) {
    const npc = DORM_NPCS[i];
    const sz = npc.size || 1;
    if (tileX >= npc.x - 0.2 && tileX <= npc.x + sz + 0.2 && tileY >= npc.y - 0.3 && tileY <= npc.y + sz + 0.2) {
      openNpcDialog(npc);
      return;
    }
  }

  // 3) 다른 유저 클릭 시 스펙 정보 창 열기 (1~3x1~3 캐릭터 크기 반영)
  for (const sid in players) {
    const p = players[sid];
    const c = p.character || {};
    const aw = Math.min(3, Math.max(1, c.avatarWidth || 1));
    const ah = Math.min(3, Math.max(1, c.avatarHeight || 1));
    const wPx = aw * TILE_SIZE;
    const hPx = ah * TILE_SIZE;
    const cx = (p.renderX || p.x * TILE_SIZE) + 20;
    const feetY = (p.renderY || p.y * TILE_SIZE) + 36;
    if (
      worldPxX >= cx - wPx / 2 - 4 &&
      worldPxX <= cx + wPx / 2 + 4 &&
      worldPxY >= feetY - hPx - 4 &&
      worldPxY <= feetY + 4
    ) {
      openInfoModal(p);
      return;
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  if (isAnyBlockingModalOpen()) return;
  e.preventDefault();
  window.adjustUserZoom(e.deltaY < 0 ? 0.1 : -0.1);
}, { passive: false });

let lastPinchDist = 0;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && lastPinchDist > 0) {
    e.preventDefault();
    const curDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const diff = curDist - lastPinchDist;
    if (Math.abs(diff) > 18) {
      window.adjustUserZoom(diff > 0 ? 0.05 : -0.05);
      lastPinchDist = curDist;
    }
  }
}, { passive: false });

// ================= [충돌 검사 & 무기 6종 전투 엔진 (지팡이 3속성 리워크 · 스킬 외침 제거)] =================
function isClientPosBlocked(fx, fy) {
  if (fx < 0.2 || fx > mapW - 1.2 || fy < 0.8 || fy > mapH - 1.2) return true;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (Math.abs(fx - obs.x) < 0.68 && Math.abs(fy - obs.y) < 0.68) return true;
  }
  return false;
}

function findNearestAliveMonster(px, py, maxRangeTiles = 9.0) {
  let best = null;
  let bestDist = maxRangeTiles;
  for (const mid in monsters) {
    const m = monsters[mid];
    if (!m.alive) continue;
    const mSize = m.size || 1;
    const cx = m.x + (mSize - 1) * 0.5;
    const cy = m.y + (mSize - 1) * 0.5;
    const d = Math.hypot(cx - px, cy - py);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

const WAND_ELEMENTS = ['fire', 'ice', 'lightning'];
function pickRandomWandElement() {
  return WAND_ELEMENTS[Math.floor(Math.random() * WAND_ELEMENTS.length)];
}

let lastLocalAttackTime = 0;
let swingSideToggle = 1;
let greatswordHitCounter = 0;
let bowHitCounter = 0;
let lastTaijiTickTime = 0;
let taijiHoldStartTime = 0;
let lastTaijiOuterTrigger = 0;
let taijiOrbitAngle = 0;

function performWeaponAttack() {
  const me = players[myId];
  if (!me || !socket || isAnyBlockingModalOpen()) return;

  const c = myCharacter || {};
  const wType = (c.equippedWeapon && WEAPON_SPECS[c.equippedWeapon]) ? c.equippedWeapon : 'wand';
  const wSpec = WEAPON_SPECS[wType];
  const now = Date.now();

  if (wType === 'taijiorb') return;

  if (now - lastLocalAttackTime < wSpec.cooldownMs) return;
  lastLocalAttackTime = now;

  const wLv = getEquippedWeaponLevel(c);
  const isMale = (c.gender || 'male') === 'male';
  const has50 = hasWeaponSkill50Client(c, wType);
  const has100 = hasWeaponSkill100Client(c, wType);

  const targetM = findNearestAliveMonster(me.x, me.y, wType === 'bow' ? 12.5 : (wType === 'wand' ? 8.5 : 5.5));
  let angle = typeof me.angle === 'number' ? me.angle : Math.PI / 2;
  if (targetM) {
    const mSize = targetM.size || 1;
    const tx = targetM.x + (mSize - 1) * 0.5;
    const ty = targetM.y + (mSize - 1) * 0.5;
    angle = Math.atan2(ty - me.y, tx - me.x);
    me.angle = angle;
    if (Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle))) {
      me.dir = Math.cos(angle) >= 0 ? 'right' : 'left';
    } else {
      me.dir = Math.sin(angle) >= 0 ? 'down' : 'up';
    }
  }

  swingSideToggle *= -1;
  me.attackAnimUntil = now + 220;
  me.lungeOffsetX = Math.cos(angle) * 7;
  me.lungeOffsetY = Math.sin(angle) * 7;

  let skillType = null;
  let skillTier = 0;
  let wandElement = null;
  let triggerWandKnockback = false;

  if (wType === 'wand') {
    // 1발째 랜덤 속성 발사 (화염 / 빙결 / 뇌전)
    wandElement = pickRandomWandElement();
    spawnLocalProjectile(me, angle, 'wand', wLv, has100 ? 100 : 0, null, 1, false, wandElement);

    // 50강 스킬 (IQ 150+): 100강 여부와 무관하게 20% 확률로 반경 4타일 밀쳐내기 (데미지 없음)
    if (has50 && Math.random() < 0.20) {
      triggerWandKnockback = true;
    }

    // 100강 평타 강화 (IQ 200+): 순간이동 없음, 3속성 중 랜덤 2발째 연속 발사 (공속 0.5초 유지)
    if (has100) {
      setTimeout(() => {
        const curMe = players[myId];
        if (!curMe || !socket) return;
        const elem2 = pickRandomWandElement();
        const t2 = findNearestAliveMonster(curMe.x, curMe.y, 8.5);
        let ang2 = angle;
        if (t2) {
          const ms = t2.size || 1;
          ang2 = Math.atan2(t2.y + (ms - 1) * 0.5 - curMe.y, t2.x + (ms - 1) * 0.5 - curMe.x);
        }
        spawnLocalProjectile(curMe, ang2, 'wand', wLv, 100, null, 1, true, elem2);
        SoundFX.weaponAttack('wand', wLv, false, false);
        socket.emit('fireProjectile', {
          x: curMe.x,
          y: curMe.y,
          dir: curMe.dir,
          angle: ang2,
          element: elem2,
          isExtraWandShot: true
        });
      }, 115);
    }
  } else if (wType === 'greatsword') {
    greatswordHitCounter++;
    if (has100) {
      skillType = 'overlord_dash';
      skillTier = 100;
      for (let s = 0; s < 3; s++) {
        me.afterimages.push({ x: me.renderX, y: me.renderY, born: now + s * 25, color: '#ef4444' });
        const nx = me.x + Math.cos(angle) * 0.7;
        const ny = me.y + Math.sin(angle) * 0.7;
        if (!isClientPosBlocked(nx, ny)) { me.x = nx; me.y = ny; }
      }
      me.renderX = me.x * TILE_SIZE;
      me.renderY = me.y * TILE_SIZE;
      executeMeleeConeAttack(me, angle, 3.6, Math.PI * 1.4, 'greatsword', wLv, 100, skillType);
    } else if (has50 && greatswordHitCounter % 3 === 0) {
      skillType = 'spin_slash';
      skillTier = 50;
      executeMeleeConeAttack(me, angle, 3.1, Math.PI * 2, 'greatsword', wLv, 50, skillType);
      setTimeout(() => executeMeleeConeAttack(me, angle + Math.PI, 3.1, Math.PI * 2, 'greatsword', wLv, 50, skillType), 180);
    } else {
      executeMeleeConeAttack(me, angle, 2.8, (150 * Math.PI) / 180, 'greatsword', wLv, 0, null);
    }
  } else if (wType === 'hammer') {
    if (has100) {
      skillType = 'meteor_slam';
      skillTier = 100;
      if (targetM) {
        const mSize = targetM.size || 1;
        const tx = targetM.x + (mSize - 1) * 0.5 - Math.cos(angle) * 0.9;
        const ty = targetM.y + (mSize - 1) * 0.5 - Math.sin(angle) * 0.9;
        if (!isClientPosBlocked(tx, ty)) {
          me.afterimages.push({ x: me.renderX, y: me.renderY, born: now, color: '#f59e0b' });
          me.x = tx; me.y = ty;
          me.renderX = tx * TILE_SIZE; me.renderY = ty * TILE_SIZE;
        }
      }
      executeMeleeConeAttack(me, angle, 3.8, Math.PI * 2, 'hammer', wLv, 100, skillType);
    } else if (has50 && Math.random() < 0.35) {
      skillType = 'blackhole';
      skillTier = 50;
      executeMeleeConeAttack(me, angle, 3.4, Math.PI * 2, 'hammer', wLv, 50, skillType);
    } else {
      executeMeleeConeAttack(me, angle, 2.5, (118 * Math.PI) / 180, 'hammer', wLv, 0, null);
    }
  } else if (wType === 'bow') {
    bowHitCounter++;
    if (has100) {
      skillType = 'acrobatic_shot';
      skillTier = 100;
      const sideAng = angle + (swingSideToggle > 0 ? Math.PI / 2 : -Math.PI / 2);
      const nx = me.x + Math.cos(sideAng) * 0.9;
      const ny = me.y + Math.sin(sideAng) * 0.9;
      if (!isClientPosBlocked(nx, ny)) {
        me.afterimages.push({ x: me.renderX, y: me.renderY, born: now, color: '#38bdf8' });
        me.x = nx; me.y = ny;
        me.renderX = nx * TILE_SIZE; me.renderY = ny * TILE_SIZE;
      }
      [-0.12, 0, 0.12].forEach(off => spawnLocalProjectile(me, angle + off, 'bow', wLv, 100, skillType, 1));
    } else if (has50 && bowHitCounter % 4 === 0) {
      skillType = 'samsamgu';
      skillTier = 50;
      [0, 110, 220].forEach(delay => {
        setTimeout(() => {
          [-0.22, 0, 0.22].forEach(off => spawnLocalProjectile(me, angle + off, 'bow', wLv, 50, skillType, 1));
        }, delay);
      });
    } else {
      spawnLocalProjectile(me, angle, 'bow', wLv, 0, null, 1);
    }
  } else if (wType === 'daggers') {
    if (has100) {
      skillType = 'phantom_blink';
      skillTier = 100;
      if (targetM) {
        const mSize = targetM.size || 1;
        const tcx = targetM.x + (mSize - 1) * 0.5;
        const tcy = targetM.y + (mSize - 1) * 0.5;
        const randAng = Math.random() * Math.PI * 2;
        const nx = tcx + Math.cos(randAng) * (mSize === 2 ? 1.35 : 0.95);
        const ny = tcy + Math.sin(randAng) * (mSize === 2 ? 1.35 : 0.95);
        if (!isClientPosBlocked(nx, ny)) {
          me.afterimages.push({ x: me.renderX, y: me.renderY, born: now, color: '#22d3ee' });
          me.x = nx; me.y = ny;
          me.renderX = nx * TILE_SIZE; me.renderY = ny * TILE_SIZE;
          angle = Math.atan2(tcy - me.y, tcx - me.x);
          me.angle = angle;
        }
      }
      executeDaggerStrike(me, angle, targetM, wLv, 100, skillType, 3);
    } else if (has50 && Math.random() < 0.24) {
      skillType = 'savage_blow';
      skillTier = 50;
      executeDaggerStrike(me, angle, targetM, wLv, 50, skillType, 6);
    } else {
      executeDaggerStrike(me, angle, targetM, wLv, 0, null, 1);
    }
  }

  SoundFX.weaponAttack(wType, wLv, isMale, Boolean(skillType || triggerWandKnockback));
  screenShakeMag = Math.max(screenShakeMag, (skillTier >= 100 && wType !== 'wand') ? 4.5 : (triggerWandKnockback ? 3.0 : 1.5));

  socket.emit('fireProjectile', {
    x: me.x,
    y: me.y,
    dir: me.dir,
    angle: angle,
    element: wandElement,
    triggerKnockback: triggerWandKnockback,
    swingSide: swingSideToggle,
    skillType: skillType,
    skillTier: skillTier
  });
}

function spawnLocalProjectile(owner, angle, weaponType, weaponLv, skillTier, skillType, isMine = 1, isExtra = false, element = null) {
  const speed = weaponType === 'bow' ? 14.5 : 8.5;
  const maxRangePx = (weaponType === 'bow' ? 12.2 : 7.8) * TILE_SIZE;
  projectiles.push({
    ownerId: owner.id,
    isMine: Boolean(isMine),
    weaponType,
    weaponLv,
    skillTier,
    skillType,
    element: weaponType === 'wand' ? (element || 'fire') : null,
    x: owner.renderX + 20 + Math.cos(angle) * 14,
    y: owner.renderY + 20 + Math.sin(angle) * 14,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    traveled: 0,
    maxRangePx,
    pierce: weaponType === 'bow',
    hitSet: new Set(),
    born: Date.now()
  });
}

function executeMeleeConeAttack(owner, angle, rangeTiles, arcRad, weaponType, weaponLv, skillTier, skillType) {
  meleeEffects.push({
    x: owner.renderX + 20,
    y: owner.renderY + 20,
    angle,
    rangePx: rangeTiles * TILE_SIZE,
    arcRad,
    weaponType,
    skillTier,
    swingSide: swingSideToggle,
    born: Date.now(),
    duration: skillTier >= 100 ? 300 : 220
  });

  if (owner.id !== myId) return;

  const halfArc = arcRad / 2;
  for (const mid in monsters) {
    const m = monsters[mid];
    if (!m.alive) continue;
    const mSize = m.size || 1;
    const mCx = m.x + (mSize - 1) * 0.5;
    const mCy = m.y + (mSize - 1) * 0.5;
    const dist = Math.hypot(mCx - owner.x, mCy - owner.y);
    if (dist > rangeTiles + (mSize === 2 ? 0.85 : 0.45)) continue;

    if (arcRad < Math.PI * 1.95) {
      let diff = Math.atan2(mCy - owner.y, mCx - owner.x) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > halfArc) continue;
    }

    socket.emit('hitMonster', {
      monsterId: m.id,
      skillHit: skillTier >= 50,
      skillTier: skillTier
    });
  }
}

function executeDaggerStrike(owner, angle, targetM, weaponLv, skillTier, skillType, hitCount = 1) {
  for (let i = 0; i < hitCount; i++) {
    setTimeout(() => {
      if (!players[owner.id]) return;
      const curOwner = players[owner.id];
      const offAng = angle + (i % 2 === 0 ? 0.25 : -0.25);
      meleeEffects.push({
        x: curOwner.renderX + 20,
        y: curOwner.renderY + 20,
        angle: offAng,
        rangePx: (skillTier >= 100 ? 2.4 : 1.9) * TILE_SIZE,
        arcRad: 1.0,
        weaponType: 'daggers',
        skillTier,
        swingSide: i % 2 === 0 ? 1 : -1,
        born: Date.now(),
        duration: 140
      });

      if (owner.id !== myId) return;
      const target = (targetM && targetM.alive) ? targetM : findNearestAliveMonster(curOwner.x, curOwner.y, 2.6);
      if (target && target.alive) {
        const mSize = target.size || 1;
        const dist = Math.hypot(target.x + (mSize - 1) * 0.5 - curOwner.x, target.y + (mSize - 1) * 0.5 - curOwner.y);
        if (dist <= 2.6 + (mSize === 2 ? 0.7 : 0)) {
          socket.emit('hitMonster', {
            monsterId: target.id,
            skillHit: skillTier >= 50,
            skillTier: skillTier
          });
        }
      }
    }, i * 55);
  }
}

// ================= [태극구: A 홀드 360° 회전 타격 (스킬 외침 제거)] =================
function updateTaijiOrbLogic(now, dtSec) {
  const me = players[myId];
  if (!me || !socket) return;

  const c = myCharacter || {};
  const isTaiji = (c.equippedWeapon === 'taijiorb');

  if (!isTaiji || !isAttackHeld || isAnyBlockingModalOpen()) {
    taijiHoldStartTime = 0;
    return;
  }

  const has50 = hasWeaponSkill50Client(c, 'taijiorb');
  const has100 = hasWeaponSkill100Client(c, 'taijiorb');
  if (taijiHoldStartTime === 0) taijiHoldStartTime = now;

  const rotSpeed = has100 ? 5.6 : 3.4;
  taijiOrbitAngle = (taijiOrbitAngle + rotSpeed * dtSec) % (Math.PI * 2);
  me.taijiActiveUntil = now + 180;

  if (has100 && Math.random() < 0.25) {
    me.afterimages.push({ x: me.renderX, y: me.renderY, born: now, color: '#38bdf8' });
  }

  if (has50 && (now - taijiHoldStartTime >= 2800) && (now - lastTaijiOuterTrigger >= 5000)) {
    lastTaijiOuterTrigger = now;
    me.taijiOuterUntil = now + 2000;
    SoundFX.weaponAttack('taijiorb', getEquippedWeaponLevel(c), true, true);
    socket.emit('fireProjectile', {
      x: me.x, y: me.y, dir: me.dir, angle: taijiOrbitAngle,
      skillType: 'yinyang_outer', skillTier: 50
    });
  }

  if (now - lastTaijiTickTime < 500) return;
  lastTaijiTickTime = now;

  const outerActive = me.taijiOuterUntil > now;
  const hitAny = [];

  for (const mid in monsters) {
    const m = monsters[mid];
    if (!m.alive) continue;
    const mSize = m.size || 1;
    const mCx = m.x + (mSize - 1) * 0.5;
    const mCy = m.y + (mSize - 1) * 0.5;
    const dist = Math.hypot(mCx - me.x, mCy - me.y);

    if (dist <= 3.35 + (mSize === 2 ? 0.65 : 0)) {
      const hits = has100 ? 2 : 1;
      for (let h = 0; h < hits; h++) {
        socket.emit('hitMonster', {
          monsterId: m.id,
          skillHit: has100,
          skillTier: has100 ? 100 : 0
        });
      }
      hitAny.push(m.id);
    } else if (outerActive && dist <= 4.95 + (mSize === 2 ? 0.65 : 0)) {
      socket.emit('hitMonster', {
        monsterId: m.id,
        skillHit: true,
        skillTier: 50
      });
      hitAny.push(m.id);
    }
  }

  if (hitAny.length > 0) {
    SoundFX.weaponAttack('taijiorb', getEquippedWeaponLevel(c), false, has100 || outerActive);
  }
  socket.emit('fireProjectile', {
    x: me.x, y: me.y, dir: me.dir, angle: taijiOrbitAngle,
    skillType: has100 ? 'wuwei_step' : null,
    skillTier: has100 ? 100 : 0
  });
}

// ================= [원격 플레이어 공격 & 이펙트 동기화 (스킬 외침 제거 · 지팡이 3속성 색상 동기화)] =================
function handleRemoteProjectileEvent(data) {
  if (!data || data.ownerId === myId) return;
  const owner = players[data.ownerId];
  const now = Date.now();
  const wType = data.weaponType || 'wand';
  const angle = typeof data.angle === 'number' ? data.angle : Math.PI / 2;
  const skillTier = data.skillTier || 0;

  if (owner) {
    owner.x = typeof data.x === 'number' ? data.x : owner.x;
    owner.y = typeof data.y === 'number' ? data.y : owner.y;
    owner.dir = data.dir || owner.dir;
    owner.angle = angle;
    owner.attackAnimUntil = now + 220;
    owner.lungeOffsetX = Math.cos(angle) * 6;
    owner.lungeOffsetY = Math.sin(angle) * 6;

    if (wType === 'taijiorb') {
      owner.taijiActiveUntil = now + 620;
      if (data.skillType === 'yinyang_outer') {
        owner.taijiOuterUntil = now + 2000;
      }
      return;
    }

    if (wType === 'wand' || wType === 'bow') {
      spawnLocalProjectile(owner, angle, wType, data.weaponLv || 0, skillTier, data.skillType, 0, false, data.element || null);
    } else if (wType === 'greatsword' || wType === 'hammer') {
      const range = wType === 'greatsword' ? (skillTier >= 100 ? 3.6 : 2.9) : (skillTier >= 100 ? 3.8 : 2.6);
      const arc = (skillTier >= 50) ? Math.PI * 2 : (wType === 'greatsword' ? 2.6 : 2.06);
      meleeEffects.push({
        x: owner.renderX + 20,
        y: owner.renderY + 20,
        angle,
        rangePx: range * TILE_SIZE,
        arcRad: arc,
        weaponType: wType,
        skillTier,
        swingSide: data.swingSide || 1,
        born: now,
        duration: 220
      });
    } else if (wType === 'daggers') {
      meleeEffects.push({
        x: owner.renderX + 20,
        y: owner.renderY + 20,
        angle,
        rangePx: 2.0 * TILE_SIZE,
        arcRad: 1.0,
        weaponType: 'daggers',
        skillTier,
        swingSide: data.swingSide || 1,
        born: now,
        duration: 150
      });
    }
  }
}

// ================= [60FPS 고정 틱 물리 · 선판정 이동 · 보간 루프] =================
let lastMoveEmitTime = 0;
let lastFootstepSoundTime = 0;
let wasMovingLocally = false;

function stepGameSimulation(dtSec, now) {
  const me = players[myId];

  // 1) 로컬 플레이어 선판정(Client-Side Prediction) 자유 이동
  if (me && socket && !isAnyBlockingModalOpen()) {
    let vx = 0, vy = 0;
    if (keysPressed.ArrowLeft) vx -= 1;
    if (keysPressed.ArrowRight) vx += 1;
    if (keysPressed.ArrowUp) vy -= 1;
    if (keysPressed.ArrowDown) vy += 1;

    if (vx === 0 && vy === 0 && joyVector.active) {
      vx = joyVector.x;
      vy = joyVector.y;
    }

    const mag = Math.hypot(vx, vy);
    const isTaiji100Moving = (
      myCharacter?.equippedWeapon === 'taijiorb' &&
      isAttackHeld &&
      hasWeaponSkill100Client(myCharacter, 'taijiorb')
    );

    if (mag > 0.05) {
      const nxDir = vx / mag;
      const nyDir = vy / mag;
      let speedTiles = isSprintHeld ? 7.6 : 4.9;
      if (isTaiji100Moving) speedTiles *= 1.28;

      const stepX = nxDir * speedTiles * dtSec;
      const stepY = nyDir * speedTiles * dtSec;

      if (!isClientPosBlocked(me.x + stepX, me.y)) me.x += stepX;
      if (!isClientPosBlocked(me.x, me.y + stepY)) me.y += stepY;

      me.x = Math.max(0.2, Math.min(mapW - 1.2, me.x));
      me.y = Math.max(0.8, Math.min(mapH - 1.2, me.y));
      me.renderX = me.x * TILE_SIZE;
      me.renderY = me.y * TILE_SIZE;
      me.sprint = isSprintHeld || isTaiji100Moving;
      me.angle = Math.atan2(nyDir, nxDir);
      me.walkPhase = (me.walkPhase || 0) + dtSec * (me.sprint ? 16 : 11);

      if (Math.abs(nxDir) >= Math.abs(nyDir)) {
        me.dir = nxDir >= 0 ? 'right' : 'left';
      } else {
        me.dir = nyDir >= 0 ? 'down' : 'up';
      }

      if (now - lastFootstepSoundTime > (me.sprint ? 175 : 270)) {
        lastFootstepSoundTime = now;
        SoundFX.step(me.sprint);
        if (footstepDusts.length < 28) {
          footstepDusts.push({
            x: me.renderX + 20 + (Math.random() - 0.5) * 10,
            y: me.renderY + 34,
            born: now,
            duration: 320,
            color: me.sprint ? 'rgba(254, 240, 138, 0.5)' : 'rgba(203, 213, 225, 0.35)'
          });
        }
      }

      BGMManager.updateZoneByX(me.x);
      wasMovingLocally = true;

      if (now - lastMoveEmitTime >= 65) {
        lastMoveEmitTime = now;
        socket.emit('move', {
          x: Number(me.x.toFixed(2)),
          y: Number(me.y.toFixed(2)),
          dir: me.dir,
          angle: Number(me.angle.toFixed(2)),
          sprint: me.sprint
        });
      }
    } else if (wasMovingLocally) {
      wasMovingLocally = false;
      me.sprint = false;
      lastMoveEmitTime = now;
      socket.emit('move', {
        x: Number(me.x.toFixed(2)),
        y: Number(me.y.toFixed(2)),
        dir: me.dir,
        angle: Number((me.angle || 0).toFixed(2)),
        sprint: false
      });
    }

    if (isAttackHeld) {
      if (myCharacter?.equippedWeapon === 'taijiorb') {
        updateTaijiOrbLogic(now, dtSec);
      } else {
        performWeaponAttack();
      }
    } else if (myCharacter?.equippedWeapon === 'taijiorb') {
      updateTaijiOrbLogic(now, dtSec);
    }
  }

  // 2) 타 플레이어 부드러운 보간 & 잔상/반동 감쇠
  const lerpPlayer = Math.min(1, dtSec * 12);
  for (const sid in players) {
    const p = players[sid];
    initPlayerRenderFields(p);
    if (sid !== myId) {
      const targetPxX = p.x * TILE_SIZE;
      const targetPxY = p.y * TILE_SIZE;
      const dist = Math.hypot(targetPxX - p.renderX, targetPxY - p.renderY);
      if (dist > 220) {
        p.renderX = targetPxX;
        p.renderY = targetPxY;
      } else {
        p.renderX += (targetPxX - p.renderX) * lerpPlayer;
        p.renderY += (targetPxY - p.renderY) * lerpPlayer;
      }
      if (dist > 2) p.walkPhase += dtSec * (p.sprint ? 15 : 10);
    }
    p.lungeOffsetX *= 0.78;
    p.lungeOffsetY *= 0.78;
    if (p.afterimages.length > 0) {
      p.afterimages = p.afterimages.filter(a => now - a.born < 260);
    }
  }

  // 3) 몬스터 스냅샷 보간
  const lerpMon = Math.min(1, dtSec * 8.5);
  for (const mid in monsters) {
    const m = monsters[mid];
    if (!m.alive) continue;
    initMonsterRenderFields(m);
    const tx = m.x * TILE_SIZE;
    const ty = m.y * TILE_SIZE;
    const d = Math.hypot(tx - m.renderX, ty - m.renderY);
    if (d > 200) {
      m.renderX = tx;
      m.renderY = ty;
    } else {
      m.renderX += (tx - m.renderX) * lerpMon;
      m.renderY += (ty - m.renderY) * lerpMon;
    }
  }

  // 4) 투사체 물리 이동 & 몬스터 충돌 판정 (지팡이 3속성 유도 / 활 관통)
  const stepScale = dtSec * 60;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];

    // 지팡이(wand) 기존 유도 메커니즘 유지
    if (pr.weaponType === 'wand' && pr.traveled < pr.maxRangePx * 0.85) {
      const nearest = findNearestAliveMonster(pr.x / TILE_SIZE, pr.y / TILE_SIZE, 5.5);
      if (nearest) {
        const mSize = nearest.size || 1;
        const tcx = (nearest.renderX || nearest.x * TILE_SIZE) + (mSize * TILE_SIZE) / 2;
        const tcy = (nearest.renderY || nearest.y * TILE_SIZE) + (mSize * TILE_SIZE) / 2;
        const spd = Math.hypot(pr.vx, pr.vy) || 8.5;
        const desiredAng = Math.atan2(tcy - pr.y, tcx - pr.x);
        const curAng = Math.atan2(pr.vy, pr.vx);
        let diff = desiredAng - curAng;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const nextAng = curAng + Math.max(-0.14, Math.min(0.14, diff));
        pr.vx = Math.cos(nextAng) * spd;
        pr.vy = Math.sin(nextAng) * spd;
        pr.angle = nextAng;
      }
    }

    const dx = pr.vx * stepScale;
    const dy = pr.vy * stepScale;
    pr.x += dx;
    pr.y += dy;
    pr.traveled += Math.hypot(dx, dy);

    let exploded = false;
    for (const mid in monsters) {
      const m = monsters[mid];
      if (!m.alive || pr.hitSet.has(mid)) continue;
      const mSize = m.size || 1;
      const mCx = (m.renderX || m.x * TILE_SIZE) + (mSize * TILE_SIZE) / 2;
      const mCy = (m.renderY || m.y * TILE_SIZE) + (mSize * TILE_SIZE) / 2;
      const hitRad = (mSize === 2 ? 38 : 22) + (pr.weaponType === 'bow' && pr.skillTier >= 100 ? 10 : 0);

      if (Math.hypot(pr.x - mCx, pr.y - mCy) <= hitRad) {
        pr.hitSet.add(mid);
        const elem = pr.element || 'fire';

        if (pr.isMine && socket) {
          socket.emit('hitMonster', {
            monsterId: m.id,
            element: pr.weaponType === 'wand' ? elem : null,
            skillHit: pr.skillTier >= 50,
            skillTier: pr.skillTier
          });

          // 지팡이 화염구(스플래시 60%) & 빙결구(스플래시 10%+빙결)만 스플래시 적용 (뇌전구는 단일+번개)
          if (pr.weaponType === 'wand' && (elem === 'fire' || elem === 'ice')) {
            const splashR = 2.1 * TILE_SIZE;
            for (const smid in monsters) {
              if (smid === mid) continue;
              const sm = monsters[smid];
              if (!sm.alive) continue;
              const smSize = sm.size || 1;
              const smCx = (sm.renderX || sm.x * TILE_SIZE) + (smSize * TILE_SIZE) / 2;
              const smCy = (sm.renderY || sm.y * TILE_SIZE) + (smSize * TILE_SIZE) / 2;
              if (Math.hypot(pr.x - smCx, pr.y - smCy) <= splashR) {
                socket.emit('hitMonster', { monsterId: sm.id, isSplash: true, element: elem });
              }
            }
          }
        }

        const hitColor = pr.weaponType === 'bow'
          ? '#38bdf8'
          : (elem === 'fire' ? '#f97316' : (elem === 'ice' ? '#38bdf8' : '#facc15'));
        const hitRadius = pr.weaponType === 'wand' ? (elem === 'lightning' ? 32 : 56) : 24;

        hitEffects.push({
          x: pr.x,
          y: pr.y,
          radius: hitRadius,
          color: hitColor,
          born: now,
          duration: pr.weaponType === 'wand' ? 260 : 180
        });

        if (!pr.pierce) {
          exploded = true;
          break;
        }
      }
    }

    if (exploded || pr.traveled >= pr.maxRangePx || pr.x < 0 || pr.x > mapW * TILE_SIZE || pr.y < 0 || pr.y > mapH * TILE_SIZE) {
      projectiles.splice(i, 1);
    }
  }

  // 5) 이펙트 수명 정리
  burstEffects = burstEffects.filter(b => now - b.born < b.duration);
  meleeEffects = meleeEffects.filter(m => now - m.born < m.duration);
  hitEffects = hitEffects.filter(h => now - h.born < h.duration);
  lightningEffects = lightningEffects.filter(l => now - l.born < l.duration);
  floatingDamages = floatingDamages.filter(f => now - f.born < f.duration);
  skillPopups = skillPopups.filter(s => now - s.born < s.duration);
  bossTelegraphs = bossTelegraphs.filter(t => now - t.born < t.duration + 180);
  footstepDusts = footstepDusts.filter(d => now - d.born < d.duration);

  // 6) 카메라 추적 & 본인 한정 화면 흔들림 감쇠
  if (me) {
    const worldPxW = mapW * TILE_SIZE;
    const worldPxH = mapH * TILE_SIZE;
    let targetCamX = me.renderX + 20 - viewLogicalW / 2;
    let targetCamY = me.renderY + 20 - viewLogicalH / 2;

    if (viewLogicalW < worldPxW) targetCamX = Math.max(0, Math.min(worldPxW - viewLogicalW, targetCamX));
    else targetCamX = (worldPxW - viewLogicalW) / 2;

    if (viewLogicalH < worldPxH) targetCamY = Math.max(0, Math.min(worldPxH - viewLogicalH, targetCamY));
    else targetCamY = (worldPxH - viewLogicalH) / 2;

    cameraX += (targetCamX - cameraX) * Math.min(1, dtSec * 14);
    cameraY += (targetCamY - cameraY) * Math.min(1, dtSec * 14);
  }

  if (screenShakeMag > 0.1) screenShakeMag *= 0.84;
  else screenShakeMag = 0;
}

// ================= [Zero-Lag 렌더링 헬퍼] =================
function drawPixelTree(px, py, trunkColor, leafDark, leafLight, accentColor = null) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(px + 20, py + 36, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = trunkColor;
  ctx.fillRect(px + 15, py + 22, 10, 14);
  ctx.fillStyle = leafDark;
  ctx.fillRect(px + 4, py + 8, 32, 18);
  ctx.fillRect(px + 8, py + 2, 24, 10);
  ctx.fillStyle = leafLight;
  ctx.fillRect(px + 7, py + 6, 26, 12);
  ctx.fillRect(px + 11, py + 2, 18, 6);
  if (accentColor) {
    ctx.fillStyle = accentColor;
    ctx.fillRect(px + 10, py + 11, 4, 4);
    ctx.fillRect(px + 25, py + 8, 4, 4);
    ctx.fillRect(px + 18, py + 16, 4, 4);
  }
}

function drawObstacleItem(obs) {
  const px = obs.x * TILE_SIZE;
  const py = obs.y * TILE_SIZE;
  const t = obs.type;

  if (t.startsWith('npc_') || t === 'billboard') return;

  if (t === 'window') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 3, py + 2, 34, 30);
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(px + 6, py + 5, 28, 24);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(px + 10, py + 8, 4, 4);
    ctx.fillRect(px + 24, py + 14, 3, 3);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 4, py + 3, 32, 28);
  } else if (t === 'bookshelf') {
    ctx.fillStyle = '#451a03';
    ctx.fillRect(px + 3, py + 2, 34, 36);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 5, py + 4, 30, 14);
    ctx.fillRect(px + 5, py + 21, 30, 14);
    ['#ef4444', '#38bdf8', '#facc15', '#10b981', '#c084fc'].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(px + 7 + i * 5, py + 6, 4, 11);
      ctx.fillRect(px + 7 + ((i + 2) % 5) * 5, py + 23, 4, 11);
    });
  } else if (t === 'pillar' || t === 'gate_pillar') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px + 6, py + 32, 28, 8);
    ctx.fillStyle = t === 'gate_pillar' ? '#475569' : '#57373c';
    ctx.fillRect(px + 7, py + 2, 26, 34);
    ctx.fillStyle = t === 'gate_pillar' ? '#94a3b8' : '#855860';
    ctx.fillRect(px + 10, py + 4, 8, 30);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(px + 5, py + 2, 30, 5);
  } else if (t === 'table') {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(px + 4, py + 30, 32, 8);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 4, py + 10, 32, 22);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(px + 6, py + 12, 28, 14);
  } else if (t === 'trail_tree') {
    drawPixelTree(px, py, '#6b4226', '#166534', '#22c55e', '#fde047');
  } else if (t === 'trail_stump') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px + 20, py + 32, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 9, py + 16, 22, 16);
    ctx.fillStyle = '#d97706';
    ctx.beginPath(); ctx.ellipse(px + 20, py + 16, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (t === 'trail_rock') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 7, py + 14, 26, 20);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 10, py + 12, 18, 10);
  } else if (t === 'forest_tree') {
    if (forestTilesLoaded && forestTilesClean && forestTilesClean.width >= 300) {
      const sw = Math.floor(forestTilesClean.width * 0.056);
      const sh = Math.floor(forestTilesClean.height * 0.088);
      const sx = Math.floor(forestTilesClean.width * 0.197);
      const sy = Math.floor(forestTilesClean.height * 0.025);
      ctx.drawImage(forestTilesClean, sx, sy, sw, sh, px + 1, py - 4, 38, 44);
    } else {
      drawPixelTree(px, py, '#5c3a21', '#15803d', '#4ade80', '#f472b6');
    }
  } else if (t === 'crystal_rock') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 6, py + 16, 28, 18);
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath(); ctx.moveTo(px + 20, py + 3); ctx.lineTo(px + 30, py + 24); ctx.lineTo(px + 10, py + 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(px + 18, py + 9, 4, 12);
  } else if (t === 'plague_tree') {
    drawPixelTree(px, py, '#3b2417', '#143326', '#265942', '#a855f7');
  } else if (t === 'toxic_rock') {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(px + 6, py + 16, 28, 18);
    ctx.fillStyle = '#7e22ce';
    ctx.beginPath(); ctx.arc(px + 20, py + 16, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#d8b4fe';
    ctx.fillRect(px + 14, py + 10, 4, 4);
    ctx.fillRect(px + 23, py + 12, 3, 3);
  } else if (t === 'abyss_tree') {
    drawPixelTree(px, py, '#1e1b4b', '#064e3b', '#0d9488', '#38bdf8');
  } else if (t === 'rune_pillar') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(px + 6, py + 33, 28, 7);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 8, py + 2, 24, 34);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(px + 18, py + 8, 4, 18);
    ctx.fillRect(px + 14, py + 14, 12, 4);
  }
}

// ================= [로비 중앙 전광판 (상시 문구·유지 시간·소거율 노출)] =================
function drawLobbyCentralBillboard() {
  const bx = 7.4 * TILE_SIZE;
  const by = 0.25 * TILE_SIZE;
  const bw = 5.2 * TILE_SIZE;
  const bh = 2.05 * TILE_SIZE;

  if (bx + bw < cameraX - 40 || bx > cameraX + viewLogicalW + 40) return;

  ctx.fillStyle = '#1c1015';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

  ctx.fillStyle = '#05080d';
  ctx.fillRect(bx + 5, by + 5, bw - 10, bh - 10);

  const elapsedStr = formatBillboardDuration(billboardData.textSince);
  const failedCnt = billboardData.failedCount || 0;
  ctx.font = 'bold 9px "DungGeunMo"';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`📺 유지 ${elapsedStr}`, bx + 9, by + 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#facc15';
  ctx.fillText(`소거 ${failedCnt}/1000`, bx + bw - 9, by + 16);

  const rawText = (billboardData.boxText || '').replace(/\r/g, '');
  ctx.font = '10px "DungGeunMo"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fef08a';

  const maxLineW = bw - 18;
  const lines = [];
  rawText.split('\n').forEach(para => {
    let cur = '';
    for (let i = 0; i < para.length; i++) {
      const test = cur + para[i];
      if (ctx.measureText(test).width > maxLineW && cur.length > 0) {
        lines.push(cur);
        cur = para[i];
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
  });

  const displayLines = lines.slice(0, 4);
  displayLines.forEach((ln, idx) => {
    ctx.fillText(ln, bx + bw / 2, by + 31 + idx * 12);
  });

  ctx.font = '9px "DungGeunMo"';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('[클릭 또는 SPACE: 비밀번호 해킹]', bx + bw / 2, by + bh + 11);
}

// ================= [로비 4인 NPC 렌더링 (2×2 덩치 큰 힘센 대장장이 '대장간' 포함)] =================
function drawDormNpcs(now) {
  const me = players[myId];
  const bob = Math.sin(now * 0.005) * 1.5;

  DORM_NPCS.forEach(npc => {
    const sz = npc.size || 1;
    const px = npc.x * TILE_SIZE;
    const py = npc.y * TILE_SIZE;
    const wPx = sz * TILE_SIZE;
    const hPx = sz * TILE_SIZE;
    if (px + wPx < cameraX - 60 || px > cameraX + viewLogicalW + 60) return;

    const npcTileCx = npc.x + (sz - 1) * 0.5;
    const npcTileCy = npc.y + (sz - 1) * 0.5;
    const interactDist = sz === 2 ? 2.4 : 1.9;

    if (npc.id === 'npc_blacksmith') {
      // [2x2 대형 NPC: 덩치 큰 힘센 대장장이 남자 + 모루/화덕 불꽃]
      const cx = px + wPx / 2;
      const dy = py + bob * 0.8;

      // 바닥 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(cx, py + hPx - 6, 34, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      // 화덕 열기 링
      const heatPulse = 32 + Math.sin(now * 0.007) * 3;
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, py + hPx - 8, heatPulse, heatPulse * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 단단한 다리 & 부츠
      ctx.fillStyle = '#292524';
      ctx.fillRect(px + 20, dy + 56, 14, 16);
      ctx.fillRect(px + 46, dy + 56, 14, 16);

      // 넓은 근육질 상체 (민소매/가죽 앞치마)
      ctx.fillStyle = '#d99b6c'; // 근육 팔·어깨
      ctx.fillRect(px + 8, dy + 24, 64, 24);
      ctx.fillRect(px + 10, dy + 42, 14, 14);
      ctx.fillRect(px + 56, dy + 42, 14, 14);

      // 가죽 대장간 앞치마 & 붉은 허리띠
      ctx.fillStyle = '#5c2b16';
      ctx.fillRect(px + 20, dy + 24, 40, 36);
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(px + 24, dy + 28, 32, 26);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px + 20, dy + 46, 40, 5);

      // 듬직한 머리와 풍성한 수염 & 붉은 머리띠
      ctx.fillStyle = '#e5a97c';
      ctx.fillRect(px + 26, dy + 6, 28, 22);
      ctx.fillStyle = '#1c1917'; // 머리칼 + 수염
      ctx.fillRect(px + 24, dy + 2, 32, 8);
      ctx.fillRect(px + 24, dy + 20, 32, 10);
      ctx.fillStyle = '#dc2626'; // 붉은 머리띠
      ctx.fillRect(px + 25, dy + 8, 30, 4);
      // 눈
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px + 32, dy + 14, 4, 4);
      ctx.fillRect(px + 44, dy + 14, 4, 4);

      // 오른손 대형 대장장이 망치 (살짝 들썩이는 모션)
      const hammerLift = Math.sin(now * 0.008) * 3;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(px + 63, dy + 16 + hammerLift, 5, 34);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px + 56, dy + 10 + hammerLift, 19, 12);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(px + 58, dy + 11 + hammerLift, 15, 4);

      // 앞쪽 작은 모루
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + 6, dy + 60, 22, 10);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px + 3, dy + 56, 28, 6);

      // 이름표 & 역할 뱃지
      ctx.font = 'bold 12px "DungGeunMo"';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(npc.name, cx + 1, dy - 3);
      ctx.fillStyle = '#fef08a';
      ctx.fillText(npc.name, cx, dy - 4);
      ctx.font = '10px "DungGeunMo"';
      ctx.fillStyle = '#fb923c';
      ctx.fillText('⚒️무기강화·2슬롯', cx, dy - 16);

      if (me && Math.hypot(me.x - npcTileCx, me.y - npcTileCy) <= interactDist) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(cx - 38, dy - 38, 76, 16);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 38, dy - 38, 76, 16);
        ctx.fillStyle = '#4ade80';
        ctx.fillText('SPACE / 클릭', cx, dy - 26);
      }
      return;
    }

    // 일반 1x1 NPC 렌더링
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(px + 20, py + 36, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyColors = {
      npc_helicopter: { robe: '#1d4ed8', accent: '#facc15', hair: '#0f172a' },
      npc_nong:       { robe: '#c2410c', accent: '#fde047', hair: '#9a3412' },
      npc_haerin:     { robe: '#be185d', accent: '#fbcfe8', hair: '#4c1d95' }
    };
    const pal = bodyColors[npc.id] || bodyColors.npc_helicopter;

    const dy = py + bob;
    ctx.fillStyle = pal.robe;
    ctx.fillRect(px + 10, dy + 17, 20, 17);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(px + 17, dy + 18, 6, 15);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(px + 12, dy + 5, 16, 13);
    ctx.fillStyle = pal.hair;
    ctx.fillRect(px + 11, dy + 3, 18, 5);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 15, dy + 10, 2, 3);
    ctx.fillRect(px + 23, dy + 10, 2, 3);

    const roleTag = npc.id === 'npc_haerin' ? '🎨외형·크기' : (npc.id === 'npc_helicopter' ? '📋패치안내' : '🤣아재개그');
    ctx.font = 'bold 10px "DungGeunMo"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(npc.name, px + 21, dy - 1);
    ctx.fillStyle = '#fef08a';
    ctx.fillText(npc.name, px + 20, dy - 2);
    ctx.font = '9px "DungGeunMo"';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(roleTag, px + 20, dy - 13);

    if (me && Math.hypot(me.x - npcTileCx, me.y - npcTileCy) <= interactDist) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(px - 14, dy - 33, 68, 15);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 14, dy - 33, 68, 15);
      ctx.fillStyle = '#4ade80';
      ctx.fillText('SPACE / 클릭', px + 20, dy - 22);
    }
  });
}

// ================= [몬스터 렌더링 (9종 + 빙결 상태 시각화 · 보스 CC 면역)] =================
function drawMonsters(now) {
  for (const mid in monsters) {
    const m = monsters[mid];
    if (!m.alive) continue;
    initMonsterRenderFields(m);

    const mSize = m.size || 1;
    const px = m.renderX;
    const py = m.renderY;
    const wPx = mSize * TILE_SIZE;
    const hPx = mSize * TILE_SIZE;

    if (px + wPx < cameraX - 50 || px > cameraX + viewLogicalW + 50) continue;

    const bob = Math.sin(now * 0.006 + px * 0.05) * (mSize === 2 ? 2.5 : 1.8);
    const isHit = m.hitFlashUntil > now;

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(px + wPx / 2, py + hPx - 5, wPx * 0.36, mSize === 2 ? 12 : 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (m.isBoss) {
      const pulse = 36 + Math.sin(now * 0.008) * 5;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(px + wPx / 2, py + hPx - 8, pulse, pulse * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const cx = px + wPx / 2;
    const cy = py + hPx / 2 + bob;

    if (m.type === 'mandrake') {
      ctx.fillStyle = isHit ? '#fff' : '#d97706';
      ctx.beginPath(); ctx.arc(cx, cy + 4, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(cx - 8, cy - 15, 6, 9);
      ctx.fillRect(cx + 2, cy - 16, 6, 10);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 5, cy + 1, 3, 3); ctx.fillRect(cx + 2, cy + 1, 3, 3);
    } else if (m.type === 'slime') {
      ctx.fillStyle = isHit ? '#fff' : '#7e22ce';
      ctx.beginPath(); ctx.arc(cx, cy + 4, 14, Math.PI, 0); ctx.lineTo(cx + 14, cy + 14); ctx.lineTo(cx - 14, cy + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(cx - 7, cy - 3, 5, 4);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 6, cy + 4, 3, 3); ctx.fillRect(cx + 3, cy + 4, 3, 3);
    } else if (m.type === 'wolf') {
      ctx.fillStyle = isHit ? '#fff' : '#475569';
      ctx.fillRect(cx - 15, cy - 4, 30, 16);
      ctx.fillRect(cx - 12, cy - 13, 18, 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 8, cy - 9, 3, 3); ctx.fillRect(cx, cy - 9, 3, 3);
    } else if (m.type === 'cold_virus') {
      ctx.fillStyle = isHit ? '#fff' : '#84cc16';
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI * 2 / 6) * k + now * 0.002;
        ctx.fillRect(cx + Math.cos(a) * 14 - 2, cy + Math.sin(a) * 14 - 2, 4, 4);
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 5, cy - 2, 3, 3); ctx.fillRect(cx + 2, cy - 2, 3, 3);
    } else if (m.type === 'cavity_germs') {
      ctx.fillStyle = isHit ? '#fff' : '#9333ea';
      ctx.fillRect(cx - 13, cy - 10, 26, 22);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(cx - 12, cy - 16, 5, 6); ctx.fillRect(cx + 7, cy - 16, 5, 6);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 7, cy - 3, 4, 4); ctx.fillRect(cx + 3, cy - 3, 4, 4);
    } else if (m.type === 'flu_behemoth') {
      ctx.fillStyle = isHit ? '#fff' : '#365314';
      ctx.beginPath(); ctx.arc(cx, cy, 29, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.beginPath(); ctx.arc(cx, cy - 3, 21, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 11, cy - 8, 7, 6); ctx.fillRect(cx + 4, cy - 8, 7, 6);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 10, cy + 7, 20, 5);
    } else if (m.type === 'sleepless_shadow') {
      ctx.fillStyle = isHit ? '#fff' : '#0f172a';
      ctx.beginPath(); ctx.arc(cx, cy - 2, 13, Math.PI, 0); ctx.lineTo(cx + 14, cy + 14); ctx.lineTo(cx - 14, cy + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(cx - 6, cy - 4, 4, 3); ctx.fillRect(cx + 2, cy - 4, 4, 3);
    } else if (m.type === 'ancient_golem') {
      ctx.fillStyle = isHit ? '#fff' : '#3f2e21';
      ctx.fillRect(cx - 26, cy - 24, 52, 48);
      ctx.fillStyle = '#15803d';
      ctx.fillRect(cx - 28, cy - 30, 56, 14);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(cx - 14, cy - 8, 9, 6); ctx.fillRect(cx + 5, cy - 8, 9, 6);
      ctx.fillRect(cx - 6, cy + 6, 12, 12);
    } else if (m.type === 'abyss_beast_king') {
      ctx.fillStyle = isHit ? '#fff' : '#3b0764';
      ctx.fillRect(cx - 30, cy - 22, 60, 48);
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(cx - 24, cy - 18, 48, 34);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy - 22); ctx.lineTo(cx - 34, cy - 40); ctx.lineTo(cx - 14, cy - 24);
      ctx.moveTo(cx + 26, cy - 22); ctx.lineTo(cx + 34, cy - 40); ctx.lineTo(cx + 14, cy - 24);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 14, cy - 9, 9, 6); ctx.fillRect(cx + 5, cy - 9, 9, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx - 12, cy + 8, 5, 7); ctx.fillRect(cx + 7, cy + 8, 5, 7);
    }

    // 빙결 상태 시각화 (모든 [BOSS] 몬스터는 면역이므로 미표시)
    if (!m.isBoss && m.frozenUntil && m.frozenUntil > now) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.fillRect(px + 2, py + 2, wPx - 4, hPx - 4);
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, wPx - 4, hPx - 4);
    }

    // 체력바 & 이름표
    const barW = mSize === 2 ? 72 : 38;
    const barX = cx - barW / 2;
    const barY = py - (m.isBoss ? 18 : 10);
    const hpRatio = Math.max(0, Math.min(1, m.hp / (m.maxHp || 1)));

    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, m.isBoss ? 8 : 6);
    ctx.fillStyle = m.isBoss ? '#ef4444' : '#22c55e';
    ctx.fillRect(barX, barY, barW * hpRatio, m.isBoss ? 6 : 4);

    ctx.font = m.isBoss ? 'bold 11px "DungGeunMo"' : '10px "DungGeunMo"';
    ctx.textAlign = 'center';
    const displayName = m.isBoss ? `[BOSS] ${m.name} (${m.hp.toLocaleString()})` : m.name;
    ctx.fillStyle = '#000';
    ctx.fillText(displayName, cx + 1, barY - 4);
    ctx.fillStyle = m.isBoss ? '#facc15' : '#e2e8f0';
    ctx.fillText(displayName, cx, barY - 5);
  }
}

// ================= [플레이어 · 커스텀 아바타 · 1~3×1~3 크기 스케일링 · 무기 · 태극구 궤도] =================
function drawEquippedWeaponSimple(cx, cy, angle, weaponType, weaponLv, isAttacking) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle + (isAttacking ? 0.55 : 0));

  const tierColor = weaponLv >= 20 ? '#facc15' : (weaponLv >= 10 ? '#38bdf8' : '#e2e8f0');

  if (weaponType === 'wand') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(4, -2, 18, 4);
    ctx.fillStyle = tierColor;
    ctx.beginPath(); ctx.arc(23, 0, 5, 0, Math.PI * 2); ctx.fill();
  } else if (weaponType === 'greatsword') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(4, -5, 4, 10);
    ctx.fillStyle = tierColor;
    ctx.fillRect(8, -3, 24, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(10, -1, 20, 2);
  } else if (weaponType === 'hammer') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(4, -2, 16, 4);
    ctx.fillStyle = tierColor;
    ctx.fillRect(18, -8, 10, 16);
  } else if (weaponType === 'bow') {
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(8, 0, 12, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();
  } else if (weaponType === 'daggers') {
    ctx.fillStyle = tierColor;
    ctx.fillRect(6, -6, 13, 3);
    ctx.fillRect(6, 3, 13, 3);
  } else if (weaponType === 'taijiorb') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(15, -3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(15, 3, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTaijiActiveOrbs(p, cx, cy, now) {
  if (!p || p.taijiActiveUntil <= now) return;
  const c = p.character || {};
  const has100 = hasWeaponSkill100Client(c, 'taijiorb');
  const innerCount = has100 ? 4 : 2;
  const innerR = 3.0 * TILE_SIZE;
  const baseAng = (p.id === myId) ? taijiOrbitAngle : (now * (has100 ? 0.0056 : 0.0034));

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < innerCount; i++) {
    const a = baseAng + (Math.PI * 2 / innerCount) * i;
    const ox = cx + Math.cos(a) * innerR;
    const oy = cy + Math.sin(a) * innerR;
    const isYang = i % 2 === 0;
    ctx.fillStyle = isYang ? 'rgba(239, 68, 68, 0.32)' : 'rgba(56, 189, 248, 0.32)';
    ctx.beginPath(); ctx.arc(ox, oy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isYang ? '#ef4444' : '#38bdf8';
    ctx.beginPath(); ctx.arc(ox, oy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ox - 2, oy - 2, 3, 0, Math.PI * 2); ctx.fill();
  }

  if (p.taijiOuterUntil > now) {
    const outerR = 4.5 * TILE_SIZE;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();

    for (let j = 0; j < 2; j++) {
      const a = -baseAng * 1.25 + Math.PI * j;
      const ox = cx + Math.cos(a) * outerR;
      const oy = cy + Math.sin(a) * outerR;
      const isYang = j === 0;
      ctx.fillStyle = isYang ? 'rgba(249, 115, 22, 0.34)' : 'rgba(99, 102, 241, 0.34)';
      ctx.beginPath(); ctx.arc(ox, oy, 23, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isYang ? '#f97316' : '#6366f1';
      ctx.beginPath(); ctx.arc(ox, oy, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPlayers(now) {
  const sortedPlayers = Object.values(players).sort((a, b) => (a.renderY || 0) - (b.renderY || 0));

  for (let i = 0; i < sortedPlayers.length; i++) {
    const p = sortedPlayers[i];
    initPlayerRenderFields(p);
    const rx = p.renderX + (p.lungeOffsetX || 0);
    const ry = p.renderY + (p.lungeOffsetY || 0);

    if (rx < cameraX - 240 || rx > cameraX + viewLogicalW + 240) continue;

    const c = p.character || {};
    const aw = Math.min(3, Math.max(1, c.avatarWidth || 1));
    const ah = Math.min(3, Math.max(1, c.avatarHeight || 1));
    const wPx = aw * TILE_SIZE;
    const hPx = ah * TILE_SIZE;

    const cx = rx + 20;
    const feetY = ry + 36;
    const topY = feetY - hPx;
    const bodyCy = feetY - hPx * 0.5;
    const bounce = Math.abs(Math.sin(p.walkPhase || 0)) * 3.5;

    // 100강 스킬 잔상 렌더링
    for (let ai = 0; ai < p.afterimages.length; ai++) {
      const aft = p.afterimages[ai];
      const alpha = Math.max(0, 1 - (now - aft.born) / 260) * 0.45;
      ctx.fillStyle = aft.color || '#38bdf8';
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(aft.x + 20, aft.y + 36 - hPx * 0.5, Math.max(14, Math.min(wPx, hPx) * 0.35), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 태극구 회전 궤도 (발밑 기준)
    drawTaijiActiveOrbs(p, cx, ry + 20, now);

    // 발밑 2.5D 그림자 (캐릭터 가로 크기에 맞춰 확장)
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, feetY, Math.max(13, wPx * 0.38), 5 + (aw - 1) * 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // [해린이언니 커스텀 캐릭터 아바타] vs [기본 외형] — 발끝 고정(feetY)으로 1~3×1~3 블록 스케일링
    const customImg = c.customAvatar ? getCachedAvatarImage(c.customAvatar) : null;
    if (customImg) {
      ctx.save();
      ctx.translate(cx, feetY - bounce);
      if (p.dir === 'left') ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(customImg, -wPx / 2, -hPx, wPx, hPx);
      ctx.restore();
    } else {
      const isMale = (c.gender || 'male') === 'male';
      const eyeShift = p.dir === 'left' ? -2 : (p.dir === 'right' ? 2 : 0);
      ctx.save();
      ctx.translate(cx, feetY - bounce);
      ctx.scale(aw, ah);
      // 1x1 기준 (rx+20, ry+36)을 원점 (0, 0)으로 변환한 도트 좌표
      // 다리
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-7, -8, 5, 8);
      ctx.fillRect(2, -8, 5, 8);
      // 몸통
      ctx.fillStyle = isMale ? '#dc2626' : '#ec4899';
      ctx.fillRect(-9, -20, 18, 13);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-3, -19, 6, 11);
      // 머리
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-8, -32, 16, 13);
      ctx.fillStyle = isMale ? '#991b1b' : '#16a34a';
      ctx.fillRect(-10, -34, 20, 5);
      // 눈
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-5 + eyeShift, -27, 2, 3);
      ctx.fillRect(3 + eyeShift, -27, 2, 3);
      ctx.restore();
    }

    // 장착 무기 렌더링
    const eqWep = c.equippedWeapon || 'wand';
    const eqLv = getEquippedWeaponLevel(c);
    drawEquippedWeaponSimple(cx, bodyCy - bounce + 2, p.angle || 0, eqWep, eqLv, p.attackAnimUntil > now);

    // 본인 보스 디버프 표시 (확대된 캐릭터 몸집에 맞춘 피격 저주 테두리)
    if (p.id === myId && myDebuffUntil > now) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, bodyCy, wPx * 0.52, hPx * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 머리 위 칭호 & 닉네임 (캐릭터 세로 높이 topY 기준으로 자동 상승)
    const labelBaseY = topY + 2;
    const titleStr = getSelectedOverheadTitle(c);
    ctx.font = '10px "DungGeunMo"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(titleStr, cx + 1, labelBaseY - 14);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(titleStr, cx, labelBaseY - 15);

    ctx.font = 'bold 11px "DungGeunMo"';
    ctx.fillStyle = '#000';
    ctx.fillText(p.name, cx + 1, labelBaseY - 2);
    ctx.fillStyle = p.id === myId ? '#fef08a' : '#ffffff';
    ctx.fillText(p.name, cx, labelBaseY - 3);

    // 일반 대화 말풍선
    if (p.chatText && p.chatText.length > 0) {
      ctx.font = '11px "DungGeunMo"';
      const tw = ctx.measureText(p.chatText).width;
      const bw = Math.max(46, tw + 16);
      const bh = 22;
      const bx = cx - bw / 2;
      const by = labelBaseY - 48;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(p.chatText, cx, by + 15);
    }
  }
}

// ================= [장판 전조 · 투사체(3속성) · 번개 · 근접 검기 · 기운 폭발 렌더링] =================
function drawBossTelegraphs(now) {
  for (let i = 0; i < bossTelegraphs.length; i++) {
    const t = bossTelegraphs[i];
    const progress = Math.max(0, Math.min(1, (now - t.born) / t.duration));

    ctx.fillStyle = 'rgba(220, 38, 38, 0.18)';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radiusPx, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(239, 68, 68, ${0.22 + progress * 0.35})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radiusPx * progress, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radiusPx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = 'bold 12px "DungGeunMo"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(`⚠️ ${t.label}`, t.x, t.y + 4);
  }
}

function drawCombatAndVisualEffects(now) {
  // 발자국 먼지
  for (let i = 0; i < footstepDusts.length; i++) {
    const d = footstepDusts[i];
    const p = (now - d.born) / d.duration;
    ctx.fillStyle = d.color;
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.beginPath();
    ctx.arc(d.x, d.y, 3 + p * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 근접 부채꼴 베기/충격파 이펙트
  for (let i = 0; i < meleeEffects.length; i++) {
    const me = meleeEffects[i];
    const p = (now - me.born) / me.duration;
    const alpha = Math.max(0, 1 - p);
    ctx.save();
    ctx.globalAlpha = alpha;
    const col = me.skillTier >= 100 ? '#f43f5e' : (me.weaponType === 'hammer' ? '#f59e0b' : (me.weaponType === 'daggers' ? '#22d3ee' : '#fb923c'));
    ctx.strokeStyle = col;
    ctx.lineWidth = me.skillTier >= 50 ? 10 : 6;
    ctx.beginPath();
    ctx.arc(me.x, me.y, me.rangePx * (0.65 + p * 0.35), me.angle - me.arcRad / 2, me.angle + me.arcRad / 2);
    ctx.stroke();
    ctx.restore();
  }

  // 투사체 (지팡이 3속성 색상 분리 / 활 관통 화살)
  for (let i = 0; i < projectiles.length; i++) {
    const pr = projectiles[i];
    if (pr.weaponType === 'bow') {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.angle);
      ctx.fillStyle = pr.skillTier >= 100 ? '#f43f5e' : '#38bdf8';
      ctx.fillRect(-14, -2, 28, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(8, -3, 6, 6);
      ctx.restore();
    } else {
      const elem = pr.element || 'fire';
      let outerCol = 'rgba(239, 68, 68, 0.38)', midCol = '#f97316', coreCol = '#fef08a';
      if (elem === 'ice') {
        outerCol = 'rgba(56, 189, 248, 0.38)'; midCol = '#0ea5e9'; coreCol = '#e0f2fe';
      } else if (elem === 'lightning') {
        outerCol = 'rgba(250, 204, 21, 0.42)'; midCol = '#facc15'; coreCol = '#ffffff';
      }
      const r = 8;
      ctx.fillStyle = outerCol;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = midCol;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coreCol;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 뇌전구 2타: 하늘에서 내리꽂히는 번개 이펙트
  for (let i = 0; i < lightningEffects.length; i++) {
    const l = lightningEffects[i];
    const p = (now - l.born) / l.duration;
    const alpha = Math.max(0, 1 - p);
    ctx.save();
    ctx.globalAlpha = alpha;
    const pts = [
      { x: l.x + 8, y: l.y - 165 },
      { x: l.x - 10, y: l.y - 115 },
      { x: l.x + 11, y: l.y - 68 },
      { x: l.x - 7, y: l.y - 28 },
      { x: l.x, y: l.y }
    ];
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 6;
    ctx.beginPath();
    pts.forEach((pt, idx) => idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 12 + p * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 피격/폭발/밀쳐내기 링
  for (let i = 0; i < hitEffects.length; i++) {
    const h = hitEffects[i];
    const p = (now - h.born) / h.duration;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.strokeStyle = h.color || '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius * (0.3 + p * 0.7), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 360도 기운 발산 이펙트
  for (let i = 0; i < burstEffects.length; i++) {
    const b = burstEffects[i];
    const p = (now - b.born) / b.duration;
    const alpha = Math.max(0, 1 - p);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = b.palette.primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.maxRadius * p, 0, Math.PI * 2);
    ctx.stroke();

    for (let k = 0; k < b.particles.length; k++) {
      const pt = b.particles[k];
      const dist = pt.speed * 18 * p;
      ctx.fillStyle = pt.color;
      ctx.fillRect(b.cx + Math.cos(pt.angle) * dist, b.cy + Math.sin(pt.angle) * dist, pt.size, pt.size);
    }
    ctx.restore();
  }

  // 데미지, 무기 변경 및 기회 획득 플로팅 텍스트
  for (let i = 0; i < floatingDamages.length; i++) {
    const f = floatingDamages[i];
    const p = (now - f.born) / f.duration;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.font = 'bold 13px "DungGeunMo"';
    ctx.textAlign = 'center';
    const fy = f.y - p * 32;
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, f.x + 1, fy + 1);
    ctx.fillStyle = f.color || '#fef08a';
    ctx.fillText(f.text, f.x, fy);
    ctx.restore();
  }

  // 상태이상(보스 디버프 등) 알림 팝업
  for (let i = 0; i < skillPopups.length; i++) {
    const s = skillPopups[i];
    const p = (now - s.born) / s.duration;
    const alpha = p < 0.7 ? 1 : Math.max(0, (1 - p) / 0.3);
    const riseY = s.y - 26 - p * 28;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = s.tier >= 100 ? 'bold 14px "DungGeunMo"' : 'bold 12px "DungGeunMo"';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#090508';
    ctx.strokeText(s.text, s.x, riseY);
    ctx.fillStyle = s.color || '#fef08a';
    ctx.fillText(s.text, s.x, riseY);
    ctx.restore();
  }
}

// ================= [메인 렌더링 & 60FPS 고정 틱 드라이버] =================
function drawGame(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  const shakeX = screenShakeMag > 0.2 ? (Math.random() - 0.5) * screenShakeMag : 0;
  const shakeY = screenShakeMag > 0.2 ? (Math.random() - 0.5) * screenShakeMag : 0;
  ctx.translate(-Math.round(cameraX + shakeX), -Math.round(cameraY + shakeY));

  // 1) 오프스크린 월드 배경 뷰포트 슬라이스 출력
  if (worldBgCanvas) {
    const sx = Math.max(0, Math.floor(cameraX));
    const sy = Math.max(0, Math.floor(cameraY));
    const sw = Math.min(worldBgCanvas.width - sx, Math.ceil(viewLogicalW) + 2);
    const sh = Math.min(worldBgCanvas.height - sy, Math.ceil(viewLogicalH) + 2);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(worldBgCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }

  // 2) 보스 장판 전조
  drawBossTelegraphs(now);

  // 3) 장애물
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const ox = obs.x * TILE_SIZE;
    if (ox < cameraX - 50 || ox > cameraX + viewLogicalW + 50) continue;
    drawObstacleItem(obs);
  }

  // 4) 로비 중앙 전광판 & 4인 NPC (2x2 대장간 포함)
  drawLobbyCentralBillboard();
  drawDormNpcs(now);

  // 5) 몬스터 & 플레이어
  drawMonsters(now);
  drawPlayers(now);

  // 6) 전투 이펙트 & 번개/피격/디버프 알림
  drawCombatAndVisualEffects(now);

  ctx.restore();

  // 7) 좌측 상단 현재 구역 표기
  const me = players[myId];
  if (me) {
    const zName = getZoneNameByX(me.x);
    ctx.fillStyle = 'rgba(10, 6, 12, 0.72)';
    ctx.fillRect(8, 8, 154, 22);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, 154, 22);
    ctx.font = 'bold 11px "DungGeunMo"';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(zName, 16, 23);
  }
}

const FIXED_STEP_MS = 1000 / 60;
let tickAccumulator = 0;

function mainGameLoop() {
  const now = Date.now();
  const delta = Math.min(100, now - lastRenderFrameTime);
  lastRenderFrameTime = now;
  tickAccumulator += delta;

  let steps = 0;
  while (tickAccumulator >= FIXED_STEP_MS && steps < 4) {
    stepGameSimulation(FIXED_STEP_MS / 1000, now);
    tickAccumulator -= FIXED_STEP_MS;
    steps++;
  }

  drawGame(now);
  requestAnimationFrame(mainGameLoop);
}

requestAnimationFrame(mainGameLoop);