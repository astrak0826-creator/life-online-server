require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6
});

app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 환경변수 우선 적용 (미설정 시 기본값 fallback)
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://astrak0826_db_user:N9BZo8Kh2mcHsAKk@cluster0.coyo29h.mongodb.net/azaekaban?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'azaekaban_dagger_rpg_secret_2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'masterAdminKey!999#';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('🍃 MongoDB Atlas 인생온라인 DB 연결 완료!');
        loadBillboardFromDB();
    })
    .catch(err => console.error('❌ DB 연결 에러:', err));

const MAX_TOKENS = 120;
const REFILL_INTERVAL_MS = 60 * 1000; // 1분당 1개 충전

const STAT_LABELS = {
    education: '학력',
    appearance: '외모',
    wealth: '재력',
    iq: '지능',
    stamina: '체력',
    personality: '성격'
};

// ================= [비동기 논블로킹 DB 저장 큐 (사냥·전투·강화 Zero-Lag)] =================
const dirtyUserSaves = new Map();

function queueUserCharacterSave(userId, characterObj) {
    if (!userId || !characterObj) return;
    dirtyUserSaves.set(String(userId), JSON.parse(JSON.stringify(characterObj)));
}

async function flushSingleUserSave(userId) {
    const key = String(userId);
    if (!dirtyUserSaves.has(key)) return;
    const snapshot = dirtyUserSaves.get(key);
    dirtyUserSaves.delete(key);
    try {
        await User.updateOne(
            { _id: key },
            { $set: { character: snapshot, updatedAt: new Date() } }
        );
    } catch (err) {
        console.error('단일 유저 DB 저장 오류:', err);
    }
}

setInterval(async () => {
    if (dirtyUserSaves.size === 0) return;
    const entries = Array.from(dirtyUserSaves.entries());
    dirtyUserSaves.clear();
    for (const [uid, charData] of entries) {
        try {
            await User.updateOne(
                { _id: uid },
                { $set: { character: charData, updatedAt: new Date() } }
            );
        } catch (err) {
            console.error('비동기 배치 DB 저장 오류:', err);
        }
    }
}, 2500);

// ================= [로비 중앙 전광판 (〈하이잭 디스〉 영구 저장 시스템)] =================
const billboardSchema = new mongoose.Schema({
    key: { type: String, unique: true, default: 'lobby_main' },
    currentPin: { type: String, default: '000' },
    boxText: { type: String, default: '' },
    textSince: { type: Number, default: Date.now },
    failedPins: { type: [String], default: [] }
});
const BillboardModel = mongoose.models.Billboard || mongoose.model('Billboard', billboardSchema);

function generateRandomPin() {
    return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

const billboardState = {
    currentPin: generateRandomPin(),
    boxText: '인생온라인 로비 전광판!\n비밀번호(000~999)를 뚫고 원하는 문구를 남겨보세요.',
    textSince: Date.now(),
    failedPins: [],
    activeClaimToken: null,
    claimOwnerSocketId: null,
    claimOwnerUserId: null,
    claimExpiresAt: 0
};

async function loadBillboardFromDB() {
    try {
        let doc = await BillboardModel.findOne({ key: 'lobby_main' });
        if (!doc) {
            doc = await BillboardModel.create({
                key: 'lobby_main',
                currentPin: billboardState.currentPin,
                boxText: billboardState.boxText,
                textSince: billboardState.textSince,
                failedPins: []
            });
        } else {
            billboardState.currentPin = doc.currentPin || generateRandomPin();
            billboardState.boxText = doc.boxText || billboardState.boxText;
            billboardState.textSince = doc.textSince || Date.now();
            billboardState.failedPins = Array.isArray(doc.failedPins) ? doc.failedPins : [];
        }
        console.log(`📺 로비 전광판 로드 완료 (소거율: ${billboardState.failedPins.length}/1000)`);
    } catch (err) {
        console.error('전광판 DB 로드 오류:', err);
    }
}

function saveBillboardAsync() {
    BillboardModel.updateOne(
        { key: 'lobby_main' },
        {
            $set: {
                currentPin: billboardState.currentPin,
                boxText: billboardState.boxText,
                textSince: billboardState.textSince,
                failedPins: billboardState.failedPins
            }
        },
        { upsert: true }
    ).catch(err => console.error('전광판 DB 저장 오류:', err));
}

function getBillboardPublicData() {
    return {
        boxText: billboardState.boxText,
        textSince: billboardState.textSince,
        failedCount: billboardState.failedPins.length,
        failedPins: billboardState.failedPins
    };
}

// ================= [한국 시각(KST) 날짜 및 00:00 스탯 자연 하락 로직] =================
function getKstDateString(date = new Date()) {
    const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
    return new Date(kstMs).toISOString().slice(0, 10);
}

function countKstDaysBetween(fromDateStr, toDateStr) {
    if (!fromDateStr || !toDateStr) return 0;
    const fromMs = Date.parse(`${fromDateStr}T00:00:00Z`);
    const toMs = Date.parse(`${toDateStr}T00:00:00Z`);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return 0;
    return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function calcSixStatSum(c) {
    if (!c) return 0;
    const iqDiff = (c.iq !== undefined ? c.iq : 100) - 100;
    return iqDiff + (c.education || 0) + (c.appearance || 0) + (c.wealth || 0) + (c.stamina || 0) + (c.personality || 0);
}

function applyDailyStatDecay(char, todayKst = getKstDateString()) {
    if (!char) return [];
    if (!char.lastDecayDate) {
        char.lastDecayDate = todayKst;
        return [];
    }

    const daysElapsed = countKstDaysBetween(char.lastDecayDate, todayKst);
    if (daysElapsed <= 0) return [];

    const logs = [];
    for (let d = 0; d < daysElapsed; d++) {
        if (calcSixStatSum(char) <= 100) break;

        const candidates = [];
        if ((char.education || 0) > 0) candidates.push('education');
        if ((char.appearance || 0) > 0) candidates.push('appearance');
        if ((char.wealth || 0) > 0) candidates.push('wealth');
        if ((char.stamina || 0) > 0) candidates.push('stamina');
        if ((char.personality || 0) > 0) candidates.push('personality');
        if ((char.iq !== undefined ? char.iq : 100) > 0) candidates.push('iq');

        if (candidates.length === 0) break;

        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        if (picked === 'iq') {
            char.iq = Math.max(0, (char.iq !== undefined ? char.iq : 100) - 1);
        } else {
            char[picked] = Math.max(0, (char[picked] || 0) - 1);
        }
        logs.push({ stat: picked, name: STAT_LABELS[picked] });
    }

    char.lastDecayDate = todayKst;
    return logs;
}

function formatDecayNotice(logs) {
    if (!logs || logs.length === 0) return '';
    if (logs.length === 1) {
        const suffix = logs[0].stat === 'iq' ? '1 (IQ -1)' : '1강';
        return `🌙 자정(00:00) 정산: 6대 스탯 총합이 100을 초과하여 [${logs[0].name}]이(가) ${suffix} 하락했습니다.`;
    }
    const counts = {};
    logs.forEach(item => {
        counts[item.name] = (counts[item.name] || 0) + 1;
    });
    const summary = Object.entries(counts).map(([name, cnt]) => `${name} -${cnt}`).join(', ');
    return `🌙 자정(00:00) 누적 정산(${logs.length}일): 6대 스탯 총합 100 초과로 [${summary}] 하락했습니다.`;
}

// ================= [무기 6종 스펙 (v3.2 6종 밸런스 리워크 & 50/100강 중첩 유지)] =================
const ENHANCE_RATES = {
    0: 0.95,  1: 0.90,  2: 0.85,  3: 0.80,  4: 0.75,
    5: 0.70,  6: 0.65,  7: 0.60,  8: 0.55,  9: 0.50,
    10: 0.45, 11: 0.40, 12: 0.35, 13: 0.30, 14: 0.25,
    15: 0.22, 16: 0.19, 17: 0.16, 18: 0.13, 19: 0.10,
    20: 0.09, 21: 0.08, 22: 0.075, 23: 0.07, 24: 0.06,
    25: 0.05, 26: 0.04, 27: 0.03, 28: 0.02, 29: 0.01
};

const WEAPON_SPECS = {
    wand: {
        key: 'wand',
        name: '지팡이',
        cooldownMs: 500,      // 공속 0.5초
        baseMult: 1.00,
        fireSplashMult: 0.60, // 화염구 스플래시 60%
        iceSplashMult: 0.10,  // 빙결구 스플래시 10% + 3초 이속 50%
        skill50Mult: 0,       // 50강(IQ 150): 20% 확률 반경 4타일 밀쳐내기 (데미지 없음)
        skill100Mult: 1.00,   // 100강(IQ 200): 3속성 랜덤 2발 연속 발사
        unlockStat: null,
        unlockReq: 0,
        unlockDesc: '기본 지급 무기',
        skillStat: 'iq',
        skill50Req: 150,
        skill100Req: 200,
        skill50Name: '마력 충격파(넉백)',
        skill100Name: '이중 원소 연사'
    },
    greatsword: {
        key: 'greatsword',
        name: '대검',
        cooldownMs: 1000,     // 공속 1.0초
        baseMult: 3.20,       // 전방 160도 3.2타일 광역 베기 320%
        skill50Mult: 2.40,    // 50강: 3타마다 360도 3.6타일 회전 참격 240% × 2타 (100강에도 유지)
        skill100Mult: 2.80,   // 100강: 5.5타일 거대 관통 검기 파동 280% 추가 발사 (강제 돌진 삭제)
        unlockStat: 'stamina',
        unlockReq: 10,
        unlockDesc: '현재 체력(몸통) +10강 이상 유지',
        skillStat: 'stamina',
        skill50Req: 50,
        skill100Req: 100,
        skill50Name: '회전 참격(GG)',
        skill100Name: '패왕의 검기'
    },
    hammer: {
        key: 'hammer',
        name: '망치',
        cooldownMs: 800,      // 공속 0.8초
        baseMult: 2.50,       // 전방 130도 2.8타일 내려찍기 250%
        skill50Mult: 3.60,    // 50강: 30% 확률 4.5타일 블랙홀 흡입 + 360도 360% (100강에도 유지)
        skill100Mult: 2.40,   // 100강: 5.5타일 내 적 머리 위 원격 운석 낙하 3.8타일 240% (강제 점프 삭제)
        unlockStat: 'education',
        unlockReq: 10,
        unlockDesc: '현재 학력(오른팔) +10강 이상 유지',
        skillStat: 'education',
        skill50Req: 50,
        skill100Req: 100,
        skill50Name: '중력 붕괴(블랙홀)',
        skill100Name: '운석 강하'
    },
    bow: {
        key: 'bow',
        name: '활',
        cooldownMs: 600,      // 공속 0.6초
        baseMult: 1.95,       // 12타일 무제한 관통 화살 195%
        skill50Mult: 1.10,    // 50강: 4타마다 3갈래×3연사 (화살당 110%)
        skill50EnhancedMult: 1.40, // 100강 달성 시 삼삼구샷 화살당 140%로 상승
        skill100Mult: 1.95,   // 100강: 기본 사격 2연발 관통 화살 (강제 스텝 삭제)
        unlockStat: 'appearance',
        unlockReq: 10,
        unlockDesc: '현재 외모(오른다리) +10강 이상 유지',
        skillStat: 'appearance',
        skill50Req: 50,
        skill100Req: 100,
        skill50Name: '삼삼구샷',
        skill100Name: '이중 관통 사격'
    },
    daggers: {
        key: 'daggers',
        name: '쌍수',
        cooldownMs: 250,      // 공속 0.25초 (초당 4타)
        baseMult: 1.00,       // 단일 2.6타일 초고속 찌르기 100%
        skill50Mult: 0.50,    // 50강: 20% 확률 새비지 블로우 50% × 6연타 (총 300%, 100강에도 유지)
        skill100Mult: 0.95,   // 100강: 그림자 환영 분신이 적 뒤편에서 95% 추가타 (무작위 텔포 삭제)
        unlockStat: 'wealth',
        unlockReq: 10,
        unlockDesc: '현재 재력(왼팔) +10강 이상 유지',
        skillStat: 'wealth',
        skill50Req: 50,
        skill100Req: 100,
        skill50Name: '새비지 블로우',
        skill100Name: '환영 분신'
    },
    taijiorb: {
        key: 'taijiorb',
        name: '태극구',
        cooldownMs: 420,      // 0.5초 틱 회전 타격
        baseMult: 1.50,       // 반경 3.35타일 음·양 구슬 150%
        skill50Mult: 0.90,    // 50강: 5초마다 2초간 4.8타일 외곽 역회전 거대 구슬 90% 추가 중첩
        skill100Mult: 1.50,   // 100강: 이속 +28% + 내부 4구슬 150% × 2연타
        unlockStat: 'personality',
        unlockReq: 10,
        unlockDesc: '현재 성격(왼다리) +10강 이상 유지',
        skillStat: 'personality',
        skill50Req: 50,
        skill100Req: 100,
        skill50Name: '음양양의',
        skill100Name: '무위 축지'
    }
};

const WEAPON_KEYS = Object.keys(WEAPON_SPECS);
const VALID_TITLE_STATS = ['education', 'appearance', 'wealth', 'iq', 'stamina', 'personality', ...WEAPON_KEYS];

function resolveTokens(charData) {
    const now = Date.now();
    const last = new Date(charData.lastTokenRefill || now).getTime();
    const currentTokens = typeof charData.enhanceTokens === 'number' ? charData.enhanceTokens : MAX_TOKENS;

    if (currentTokens >= MAX_TOKENS) {
        return { tokens: MAX_TOKENS, lastRefill: new Date(now) };
    }

    const elapsed = Math.max(0, now - last);
    const gained = Math.floor(elapsed / REFILL_INTERVAL_MS);

    if (gained > 0) {
        const newTokens = Math.min(MAX_TOKENS, currentTokens + gained);
        let newLast = last + gained * REFILL_INTERVAL_MS;
        if (newTokens >= MAX_TOKENS) newLast = now;
        return { tokens: newTokens, lastRefill: new Date(newLast) };
    }

    return { tokens: currentTokens, lastRefill: new Date(last) };
}

// 실시간 스탯 기준 무기 사용 가능 여부 (+10강 실시간 검사, 미만 시 즉시 봉인)
function meetsWeaponStatReq(char, weaponKey) {
    const spec = WEAPON_SPECS[weaponKey];
    if (!spec) return false;
    if (!spec.unlockStat) return true;
    const curVal = spec.unlockStat === 'iq'
        ? (char.iq !== undefined ? char.iq : 100)
        : (char[spec.unlockStat] || 0);
    return curVal >= spec.unlockReq;
}

// 실시간 스탯 기준 50강 스킬 개방 여부 (지능은 IQ 150)
function hasWeaponSkill50(char, weaponKey) {
    const spec = WEAPON_SPECS[weaponKey];
    if (!spec || !spec.skillStat) return false;
    const curVal = spec.skillStat === 'iq'
        ? (char.iq !== undefined ? char.iq : 100)
        : (char[spec.skillStat] || 0);
    return curVal >= spec.skill50Req;
}

// 실시간 스탯 기준 100강 평타 각성 개방 여부 (지능은 IQ 200)
function hasWeaponSkill100(char, weaponKey) {
    const spec = WEAPON_SPECS[weaponKey];
    if (!spec || !spec.skillStat) return false;
    const curVal = spec.skillStat === 'iq'
        ? (char.iq !== undefined ? char.iq : 100)
        : (char[spec.skillStat] || 0);
    return curVal >= spec.skill100Req;
}

function clampAvatarDim(val) {
    const n = Math.round(Number(val));
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(1, n));
}

// 6종 무기 · 2슬롯 출정 무기 · 캐릭터 크기(1~3x1~3) · 무기 표시 여부(showWeapon) · 실시간 봉인 동기화
function syncCharacterProgress(char) {
    if (!char) return { autoUnequippedWeapon: null };
    if (typeof char.wand !== 'number') char.wand = 0;
    if (typeof char.customTitle !== 'string') char.customTitle = '';
    if (typeof char.customAvatar !== 'string') char.customAvatar = '';
    if (typeof char.showWeapon !== 'boolean') char.showWeapon = true;
    char.avatarWidth = clampAvatarDim(char.avatarWidth);
    char.avatarHeight = clampAvatarDim(char.avatarHeight);

    if (!char.titleStat || !VALID_TITLE_STATS.includes(char.titleStat)) {
        char.titleStat = 'education';
    }
    if (!char.auraColor) char.auraColor = 'red';
    if (typeof char.lastDecayDate !== 'string') char.lastDecayDate = '';

    // 6종 무기 강화 수치 정규화 (구버전 불필요 키 자동 제거)
    const prevW = (char.weapons && typeof char.weapons === 'object') ? char.weapons : {};
    const wandLv = typeof prevW.wand === 'number' ? prevW.wand : (char.wand || 0);
    char.wand = wandLv;
    char.weapons = {
        wand: wandLv,
        greatsword: typeof prevW.greatsword === 'number' ? prevW.greatsword : 0,
        hammer: typeof prevW.hammer === 'number' ? prevW.hammer : 0,
        bow: typeof prevW.bow === 'number' ? prevW.bow : 0,
        daggers: typeof prevW.daggers === 'number' ? prevW.daggers : 0,
        taijiorb: typeof prevW.taijiorb === 'number' ? prevW.taijiorb : 0
    };

    // 대장간 전수 이력 정규화 (6종 무기만 유지)
    const prevU = (char.unlockedWeapons && typeof char.unlockedWeapons === 'object') ? char.unlockedWeapons : {};
    char.unlockedWeapons = {
        wand: true,
        greatsword: Boolean(prevU.greatsword),
        hammer: Boolean(prevU.hammer),
        bow: Boolean(prevU.bow),
        daggers: Boolean(prevU.daggers),
        taijiorb: Boolean(prevU.taijiorb)
    };

    // 출정 무기 2슬롯(loadoutWeapons) 정규화
    let rawLoadout = Array.isArray(char.loadoutWeapons) ? char.loadoutWeapons.slice(0, 2) : [];
    rawLoadout = rawLoadout.map(w => (typeof w === 'string' && WEAPON_SPECS[w] && char.unlockedWeapons[w]) ? w : '');
    while (rawLoadout.length < 2) rawLoadout.push('');

    if (!rawLoadout[0] && !rawLoadout[1]) {
        const eq = char.equippedWeapon;
        if (eq && WEAPON_SPECS[eq] && char.unlockedWeapons[eq] && meetsWeaponStatReq(char, eq)) {
            rawLoadout[0] = eq;
            if (eq !== 'wand') rawLoadout[1] = 'wand';
        } else {
            rawLoadout[0] = 'wand';
        }
    }
    if (!rawLoadout[0] && rawLoadout[1]) {
        rawLoadout[0] = rawLoadout[1];
        rawLoadout[1] = '';
    }
    if (rawLoadout[0] && rawLoadout[1] && rawLoadout[0] === rawLoadout[1]) {
        rawLoadout[1] = '';
    }
    if (!rawLoadout[0]) rawLoadout[0] = 'wand';
    char.loadoutWeapons = [rawLoadout[0], rawLoadout[1] || ''];

    // 현재 장착 무기 보정 + 실시간 스탯 봉인 검사
    const isUsableNow = (w) => Boolean(w && WEAPON_SPECS[w] && char.unlockedWeapons[w] && meetsWeaponStatReq(char, w));
    let autoUnequippedWeapon = null;

    if (!isUsableNow(char.equippedWeapon) || !char.loadoutWeapons.includes(char.equippedWeapon)) {
        if (char.equippedWeapon && char.equippedWeapon !== 'wand' && WEAPON_SPECS[char.equippedWeapon] && !meetsWeaponStatReq(char, char.equippedWeapon)) {
            autoUnequippedWeapon = WEAPON_SPECS[char.equippedWeapon].name;
        }
        if (isUsableNow(char.loadoutWeapons[0])) {
            char.equippedWeapon = char.loadoutWeapons[0];
        } else if (isUsableNow(char.loadoutWeapons[1])) {
            char.equippedWeapon = char.loadoutWeapons[1];
        } else {
            char.equippedWeapon = 'wand';
            if (!char.loadoutWeapons.includes('wand')) {
                char.loadoutWeapons[0] = 'wand';
                if (char.loadoutWeapons[1] === 'wand') char.loadoutWeapons[1] = '';
            }
        }
    }

    // 칭호 이력용 역대 최고 달성 기록(maxStats) 동기화
    const prevM = (char.maxStats && typeof char.maxStats === 'object') ? char.maxStats : {};
    char.maxStats = {
        education: Math.max(prevM.education || 0, char.education || 0),
        appearance: Math.max(prevM.appearance || 0, char.appearance || 0),
        wealth: Math.max(prevM.wealth || 0, char.wealth || 0),
        iq: Math.max(prevM.iq || 100, char.iq !== undefined ? char.iq : 100),
        stamina: Math.max(prevM.stamina || 0, char.stamina || 0),
        personality: Math.max(prevM.personality || 0, char.personality || 0),
        wand: Math.max(prevM.wand || 0, char.weapons.wand || 0),
        greatsword: Math.max(prevM.greatsword || 0, char.weapons.greatsword || 0),
        hammer: Math.max(prevM.hammer || 0, char.weapons.hammer || 0),
        bow: Math.max(prevM.bow || 0, char.weapons.bow || 0),
        daggers: Math.max(prevM.daggers || 0, char.weapons.daggers || 0),
        taijiorb: Math.max(prevM.taijiorb || 0, char.weapons.taijiorb || 0)
    };

    return { autoUnequippedWeapon };
}

function getEquippedWeaponLevel(c) {
    if (!c) return 0;
    const eq = c.equippedWeapon || 'wand';
    if (c.weapons && typeof c.weapons[eq] === 'number') {
        return c.weapons[eq];
    }
    return eq === 'wand' ? (c.wand || 0) : 0;
}

function calcCombatPower(c) {
    if (!c) return 0;
    const iqLv = Math.max(0, (c.iq !== undefined ? c.iq : 100) - 100);
    const sixStatSum = iqLv + (c.education || 0) + (c.appearance || 0) + (c.wealth || 0) + (c.stamina || 0) + (c.personality || 0);
    const weaponScore = getEquippedWeaponLevel(c) * 10;
    return sixStatSum + weaponScore;
}

// ================= [계정 및 인증 API] =================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, nickname, gender, securityQuestion, securityAnswer } = req.body;
        if (!username || !password || !nickname || !securityAnswer) {
            return res.status(400).json({ message: '모든 항목(보안 질문 답변 포함)을 입력해주세요.' });
        }

        const cleanUsername = username.trim();
        const cleanNickname = nickname.trim();
        const cleanAnswer = securityAnswer.trim().toLowerCase();

        const exists = await User.findOne({ username: cleanUsername });
        if (exists) {
            return res.status(400).json({ message: '이미 존재하는 아이디입니다.' });
        }

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            username: cleanUsername,
            password: hashedPassword,
            nickname: cleanNickname,
            securityQuestion: securityQuestion || '내가 가장 소중하게 생각하는 것은?',
            securityAnswer: cleanAnswer,
            character: {
                gender: gender === 'female' ? 'female' : 'male',
                color: colors[Math.floor(Math.random() * colors.length)],
                education: 0,
                appearance: 0,
                wealth: 0,
                iq: 100,
                stamina: 0,
                personality: 0,
                wand: 0,
                equippedWeapon: 'wand',
                loadoutWeapons: ['wand', ''],
                weapons: { wand: 0, greatsword: 0, hammer: 0, bow: 0, daggers: 0, taijiorb: 0 },
                unlockedWeapons: { wand: true, greatsword: false, hammer: false, bow: false, daggers: false, taijiorb: false },
                maxStats: {
                    education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0,
                    wand: 0, greatsword: 0, hammer: 0, bow: 0, daggers: 0, taijiorb: 0
                },
                customTitle: '',
                titleStat: 'education',
                auraColor: 'red',
                showWeapon: true,
                customAvatar: '',
                avatarWidth: 1,
                avatarHeight: 1,
                enhanceTokens: MAX_TOKENS,
                lastTokenRefill: new Date(),
                lastDecayDate: getKstDateString()
            }
        });

        await user.save();
        res.status(201).json({ message: '가입 완료! 로그인해주세요.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: '회원가입 처리 중 오류 발생' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.trim() });
        if (!user) {
            return res.status(400).json({ message: '아이디 또는 비밀번호 불일치' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: '아이디 또는 비밀번호 불일치' });
        }

        syncCharacterProgress(user.character);
        if (!user.character.lastDecayDate) {
            user.character.lastDecayDate = getKstDateString();
        }
        const tokenState = resolveTokens(user.character);
        user.character.enhanceTokens = tokenState.tokens;
        user.character.lastTokenRefill = tokenState.lastRefill;
        user.markModified('character');
        await user.save();

        const token = jwt.sign(
            { userId: user._id, username: user.username, nickname: user.nickname },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                nickname: user.nickname,
                character: user.character
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: '로그인 중 오류 발생' });
    }
});

app.post('/api/find-id', async (req, res) => {
    try {
        const { nickname, securityAnswer } = req.body;
        if (!nickname || !securityAnswer) {
            return res.status(400).json({ message: '닉네임과 보안 답변을 모두 입력해주세요.' });
        }

        const user = await User.findOne({
            nickname: nickname.trim(),
            securityAnswer: securityAnswer.trim().toLowerCase()
        });

        if (!user) {
            return res.status(404).json({ message: '일치하는 계정 정보를 찾을 수 없습니다.' });
        }

        res.json({ username: user.username });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: '아이디 찾기 처리 중 오류 발생' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { username, securityAnswer, newPassword } = req.body;
        if (!username || !securityAnswer || !newPassword) {
            return res.status(400).json({ message: '모든 항목을 입력해주세요.' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ message: '새 비밀번호는 4자리 이상이어야 합니다.' });
        }

        const user = await User.findOne({
            username: username.trim(),
            securityAnswer: securityAnswer.trim().toLowerCase()
        });

        if (!user) {
            return res.status(404).json({ message: '아이디 또는 보안 답변이 일치하지 않습니다.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ message: '비밀번호가 성공적으로 재설정되었습니다! 새 비밀번호로 로그인해주세요.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: '비밀번호 재설정 처리 중 오류 발생' });
    }
});

app.post('/api/user/delete', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: '아이디와 비밀번호를 모두 입력해야 합니다.' });
        }

        const user = await User.findOne({ username: username.trim() });
        if (!user) {
            return res.status(404).json({ message: '계정을 찾을 수 없습니다.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: '비밀번호가 일치하지 않아 삭제할 수 없습니다.' });
        }

        dirtyUserSaves.delete(String(user._id));
        await User.deleteOne({ _id: user._id });
        res.json({ success: true, message: '캐릭터와 계정 정보가 완전히 삭제되었습니다.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '계정 삭제 처리 중 오류가 발생했습니다.' });
    }
});

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { adminSecret, targetUsername } = req.body;
        if (!adminSecret || adminSecret !== ADMIN_SECRET) {
            return res.status(403).json({ message: '관리자 권한 인증에 실패했습니다.' });
        }
        if (!targetUsername) {
            return res.status(400).json({ message: '삭제할 대상 유저의 아이디를 입력해주세요.' });
        }

        const deleted = await User.findOneAndDelete({ username: targetUsername.trim() });
        if (!deleted) {
            return res.status(404).json({ message: '해당 대상 유저가 존재하지 않습니다.' });
        }

        dirtyUserSaves.delete(String(deleted._id));
        res.json({ success: true, message: `[관리자] '${targetUsername}' 계정이 강제 영구 삭제되었습니다.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '관리자 삭제 처리 중 오류가 발생했습니다.' });
    }
});

// 서열 랭킹 조회 API (온라인 유저의 실시간 메모리 스탯 반영)
app.get('/api/rankings', async (req, res) => {
    try {
        const users = await User.find({})
            .select('_id nickname character')
            .lean();

        const onlineByUid = new Map();
        for (const sid in players) {
            onlineByUid.set(String(players[sid].userId), players[sid].character);
        }

        const rankingList = users.map(u => {
            const c = onlineByUid.get(String(u._id)) || u.character || {};
            syncCharacterProgress(c);
            const totalScore = calcCombatPower(c);
            return {
                nickname: u.nickname,
                gender: c.gender || 'male',
                education: c.education || 0,
                appearance: c.appearance || 0,
                wealth: c.wealth || 0,
                iq: c.iq !== undefined ? c.iq : 100,
                stamina: c.stamina || 0,
                personality: c.personality || 0,
                wand: c.wand || 0,
                equippedWeapon: c.equippedWeapon || 'wand',
                loadoutWeapons: c.loadoutWeapons || ['wand', ''],
                weapons: c.weapons || { wand: c.wand || 0, greatsword: 0, hammer: 0, bow: 0, daggers: 0, taijiorb: 0 },
                unlockedWeapons: c.unlockedWeapons || { wand: true },
                maxStats: c.maxStats || {},
                customTitle: c.customTitle || '',
                titleStat: c.titleStat || 'education',
                auraColor: c.auraColor || 'red',
                showWeapon: c.showWeapon !== false,
                avatarWidth: c.avatarWidth || 1,
                avatarHeight: c.avatarHeight || 1,
                totalScore
            };
        }).sort((a, b) => b.totalScore - a.totalScore).slice(0, 50).map((item, idx) => ({ rank: idx + 1, ...item }));

        res.json({ rankings: rankingList });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '랭킹 로드 실패' });
    }
});

// ================= [월드 구성(100x15): 로비 + 동쪽 숲 오솔길 + 동쪽숲1 + 동쪽숲2 + 동쪽숲3] =================
const DORM_WIDTH = 20;     // 0~19: 기숙사 로비
const TRAIL_END = 40;      // 20~39: 동쪽 숲 오솔길
const FOREST1_END = 60;    // 40~59: 동쪽숲 1 (마법의 숲)
const FOREST2_END = 80;    // 60~79: 동쪽숲 2 (역병의 숲)
const MAP_WIDTH = 100;     // 80~99: 동쪽숲 3 (심연의 고대 숲)
const MAP_HEIGHT = 15;

// 2x2 대장간 NPC 위치 (좌상단 17,6 ~ 우하단 18,7 / 중심 17.5, 6.5)
const BLACKSMITH_CENTER_X = 17.5;
const BLACKSMITH_CENTER_Y = 6.5;

const OBSTACLES = [
    // [0~19: 기숙사 로비]
    { x: 9, y: 1, type: 'billboard' }, { x: 10, y: 1, type: 'billboard' },
    { x: 2, y: 1, type: 'window' }, { x: 3, y: 1, type: 'window' },
    { x: 16, y: 1, type: 'window' }, { x: 17, y: 1, type: 'window' },
    { x: 6, y: 1, type: 'bookshelf' }, { x: 13, y: 1, type: 'bookshelf' },

    // 로비 4명의 NPC (대장간 NPC는 2x2 대형)
    { x: 4, y: 3, type: 'npc_helicopter' },
    { x: 15, y: 3, type: 'npc_nong' },
    { x: 10, y: 11, type: 'npc_haerin' },
    { x: 17, y: 6, type: 'npc_blacksmith' },
    { x: 18, y: 6, type: 'npc_blacksmith' },
    { x: 17, y: 7, type: 'npc_blacksmith' },
    { x: 18, y: 7, type: 'npc_blacksmith' },

    // 내부 기둥 및 테이블
    { x: 3, y: 7, type: 'pillar' }, { x: 15, y: 7, type: 'pillar' },
    { x: 3, y: 11, type: 'table' }, { x: 16, y: 11, type: 'table' },

    // [X=20: 기숙사 - 동쪽 숲 오솔길 게이트]
    { x: 20, y: 1, type: 'gate_pillar' }, { x: 20, y: 2, type: 'gate_pillar' }, { x: 20, y: 3, type: 'gate_pillar' },
    { x: 20, y: 11, type: 'gate_pillar' }, { x: 20, y: 12, type: 'gate_pillar' }, { x: 20, y: 13, type: 'gate_pillar' },

    // [21~39: 동쪽 숲 오솔길 (중간 맵 · 비전투 완충 지대)]
    { x: 24, y: 2, type: 'trail_tree' }, { x: 29, y: 3, type: 'trail_stump' }, { x: 35, y: 2, type: 'trail_tree' },
    { x: 23, y: 12, type: 'trail_tree' }, { x: 30, y: 12, type: 'trail_rock' }, { x: 36, y: 12, type: 'trail_tree' },

    // [X=40: 동쪽 숲 오솔길 - 동쪽숲1 게이트]
    { x: 40, y: 1, type: 'gate_pillar' }, { x: 40, y: 2, type: 'gate_pillar' }, { x: 40, y: 3, type: 'gate_pillar' },
    { x: 40, y: 11, type: 'gate_pillar' }, { x: 40, y: 12, type: 'gate_pillar' }, { x: 40, y: 13, type: 'gate_pillar' },

    // [41~59: 동쪽숲 1 (밝은 마법의 숲)]
    { x: 43, y: 3, type: 'forest_tree' },
    { x: 48, y: 2, type: 'crystal_rock' },
    { x: 54, y: 3, type: 'forest_tree' },
    { x: 45, y: 7, type: 'crystal_rock' },
    { x: 51, y: 7, type: 'forest_tree' },
    { x: 57, y: 6, type: 'crystal_rock' },
    { x: 44, y: 12, type: 'forest_tree' },
    { x: 50, y: 12, type: 'crystal_rock' },
    { x: 56, y: 11, type: 'forest_tree' },

    // [X=60: 동쪽숲1 - 동쪽숲2 게이트]
    { x: 60, y: 1, type: 'gate_pillar' }, { x: 60, y: 2, type: 'gate_pillar' }, { x: 60, y: 3, type: 'gate_pillar' },
    { x: 60, y: 11, type: 'gate_pillar' }, { x: 60, y: 12, type: 'gate_pillar' }, { x: 60, y: 13, type: 'gate_pillar' },

    // [61~79: 동쪽숲 2 (역병의 숲)]
    { x: 63, y: 3, type: 'plague_tree' },
    { x: 69, y: 2, type: 'toxic_rock' },
    { x: 75, y: 3, type: 'plague_tree' },
    { x: 65, y: 8, type: 'toxic_rock' },
    { x: 72, y: 7, type: 'plague_tree' },
    { x: 64, y: 12, type: 'plague_tree' },
    { x: 70, y: 12, type: 'toxic_rock' },
    { x: 76, y: 11, type: 'plague_tree' },

    // [X=80: 동쪽숲2 - 동쪽숲3 게이트]
    { x: 80, y: 1, type: 'gate_pillar' }, { x: 80, y: 2, type: 'gate_pillar' }, { x: 80, y: 3, type: 'gate_pillar' },
    { x: 80, y: 11, type: 'gate_pillar' }, { x: 80, y: 12, type: 'gate_pillar' }, { x: 80, y: 13, type: 'gate_pillar' },

    // [81~99: 동쪽숲 3 (심연의 고대 숲)]
    { x: 83, y: 2, type: 'abyss_tree' },
    { x: 90, y: 2, type: 'rune_pillar' },
    { x: 96, y: 2, type: 'abyss_tree' },
    { x: 84, y: 12, type: 'abyss_tree' },
    { x: 91, y: 12, type: 'rune_pillar' },
    { x: 96, y: 12, type: 'abyss_tree' }
];

const players = {};
const playerChatTimers = new Map();
const monsters = {};

function getWorldZoneByX(x) {
    if (x < DORM_WIDTH) return 0;
    if (x < TRAIL_END) return 1;
    if (x < FOREST1_END) return 2;
    if (x < FOREST2_END) return 3;
    return 4;
}

function isNearBlacksmith(p) {
    if (!p) return false;
    return p.x < DORM_WIDTH && Math.hypot(p.x - BLACKSMITH_CENTER_X, p.y - BLACKSMITH_CENTER_Y) <= 4.5;
}

function emitToNearbyZones(centerZone, eventName, payload, excludeSocketId = null) {
    for (const sid in players) {
        if (sid === excludeSocketId) continue;
        const pz = getWorldZoneByX(players[sid].x);
        if (Math.abs(pz - centerZone) <= 1) {
            io.to(sid).emit(eventName, payload);
        }
    }
}

function getZoneBounds(huntingZone, size = 1) {
    let minX = 41, maxX = 58;
    if (huntingZone === 2) { minX = 61; maxX = 78; }
    else if (huntingZone === 3) { minX = 81; maxX = 98; }
    return {
        minX,
        maxX: maxX - (size - 1),
        minY: 2,
        maxY: 13 - (size - 1)
    };
}

// ================= [몬스터 스펙 정의] =================
const MONSTER_SPECS = {
    mandrake: {
        type: 'mandrake', name: '아기 맨드레이크', zone: 1, size: 1,
        maxHp: 500, moveInterval: 2800, dropRate: 0.10, rewardCount: 1,
        aggroRange: 0, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    slime: {
        type: 'slime', name: '어둠의 마법 슬라임', zone: 1, size: 1,
        maxHp: 1500, moveInterval: 1700, dropRate: 0.13, rewardCount: 1,
        aggroRange: 4, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    wolf: {
        type: 'wolf', name: '변종 늑대 마수', zone: 1, size: 1,
        maxHp: 3500, moveInterval: 1100, dropRate: 0.17, rewardCount: 1,
        aggroRange: 6, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    cold_virus: {
        type: 'cold_virus', name: '감기 바이러스', zone: 2, size: 1,
        maxHp: 4500, moveInterval: 2200, dropRate: 0.21, rewardCount: 1,
        aggroRange: 0, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    cavity_germs: {
        type: 'cavity_germs', name: '충치균 악마', zone: 2, size: 1,
        maxHp: 6500, moveInterval: 1350, dropRate: 0.25, rewardCount: 1,
        aggroRange: 5, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    flu_behemoth: {
        type: 'flu_behemoth', name: '독감 거수', zone: 2, size: 2,
        maxHp: 9000, moveInterval: 1050, dropRate: 0.32, rewardCount: 1,
        aggroRange: 7.5, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    sleepless_shadow: {
        type: 'sleepless_shadow', name: '불면의 그림자', zone: 3, size: 1,
        maxHp: 12500, moveInterval: 920, dropRate: 0.36, rewardCount: 1,
        aggroRange: 7.5, isBoss: false, pullImmune: false, respawnMs: 4500
    },
    ancient_golem: {
        type: 'ancient_golem', name: '고대 나무 골렘', zone: 3, size: 2,
        maxHp: 19000, moveInterval: 1550, dropRate: 0.42, rewardCount: 1,
        aggroRange: 5.5, isBoss: false, pullImmune: false, respawnMs: 5000
    },
    abyss_beast_king: {
        type: 'abyss_beast_king', name: '심연의 마수왕', zone: 3, size: 2,
        maxHp: 50000, moveInterval: 1150, dropRate: 1.00, rewardCount: 5,
        aggroRange: 9.0, isBoss: true, pullImmune: true, respawnMs: 5 * 60 * 1000
    }
};

function isTileBlocked(x, y, ignoreMonsterId = null, size = 1) {
    for (let dx = 0; dx < size; dx++) {
        for (let dy = 0; dy < size; dy++) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return true;
            if (OBSTACLES.some(obs => obs.x === tx && obs.y === ty)) return true;
            for (const id in players) {
                if (Math.round(players[id].x) === tx && Math.round(players[id].y) === ty) return true;
            }
            for (const mid in monsters) {
                if (mid === ignoreMonsterId) continue;
                const m = monsters[mid];
                if (!m.alive) continue;
                const mSize = m.size || 1;
                if (tx >= m.x && tx < m.x + mSize && ty >= m.y && ty < m.y + mSize) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isMonsterPullPosValid(x, y, zone = 1, size = 1) {
    const b = getZoneBounds(zone, size);
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return false;
    for (let dx = 0; dx < size; dx++) {
        for (let dy = 0; dy < size; dy++) {
            const tx = Math.round(x) + dx;
            const ty = Math.round(y) + dy;
            if (OBSTACLES.some(obs => obs.x === tx && obs.y === ty)) return false;
        }
    }
    return true;
}

function isFloatPosBlocked(fx, fy) {
    if (fx < 0.2 || fx > MAP_WIDTH - 1.2 || fy < 0.8 || fy > MAP_HEIGHT - 1.2) return true;
    for (let i = 0; i < OBSTACLES.length; i++) {
        const obs = OBSTACLES[i];
        if (Math.abs(fx - obs.x) < 0.68 && Math.abs(fy - obs.y) < 0.68) {
            return true;
        }
    }
    return false;
}

function getRandomHuntingTile(zone = 1, size = 1, ignoreMonsterId = null) {
    const b = getZoneBounds(zone, size);
    for (let attempt = 0; attempt < 140; attempt++) {
        const rx = b.minX + Math.floor(Math.random() * (b.maxX - b.minX + 1));
        const ry = b.minY + Math.floor(Math.random() * (b.maxY - b.minY + 1));
        if (!isTileBlocked(rx, ry, ignoreMonsterId, size)) {
            return { x: rx, y: ry };
        }
    }
    return { x: b.minX + 5, y: 6 };
}

function initMonsters() {
    const spawnPlan = [
        'mandrake', 'mandrake', 'mandrake', 'mandrake',
        'slime', 'slime', 'slime',
        'wolf', 'wolf',
        'cold_virus', 'cold_virus', 'cold_virus', 'cold_virus',
        'cavity_germs', 'cavity_germs', 'cavity_germs',
        'flu_behemoth', 'flu_behemoth',
        'sleepless_shadow', 'sleepless_shadow', 'sleepless_shadow', 'sleepless_shadow',
        'ancient_golem', 'ancient_golem', 'ancient_golem',
        'abyss_beast_king'
    ];
    spawnPlan.forEach((typeKey, idx) => {
        const spec = MONSTER_SPECS[typeKey];
        const id = `mon_${idx + 1}`;
        const pos = spec.isBoss ? { x: 91, y: 6 } : getRandomHuntingTile(spec.zone, spec.size, id);
        monsters[id] = {
            id,
            type: spec.type,
            name: spec.name,
            zone: spec.zone,
            size: spec.size,
            x: pos.x,
            y: pos.y,
            dir: 'left',
            hp: spec.maxHp,
            maxHp: spec.maxHp,
            moveInterval: spec.moveInterval,
            dropRate: spec.dropRate,
            rewardCount: spec.rewardCount || 1,
            aggroRange: spec.aggroRange,
            isBoss: Boolean(spec.isBoss),
            pullImmune: Boolean(spec.pullImmune),
            respawnMs: spec.respawnMs || 4500,
            alive: true,
            frozenUntil: 0,
            lastMoveTime: Date.now() + Math.floor(Math.random() * 1500),
            lastBossAttackTime: 0,
            isCastingPattern: false
        };
    });
}
initMonsters();

// ================= [보스 〈심연의 마수왕〉 장판 전조 & 캐릭터 크기(1~3x1~3) 연동 피격 판정] =================
let bossTelegraphSeq = 0;

function isPlayerHitByCircle(pl, circleX, circleY, radiusTiles) {
    const aw = clampAvatarDim(pl.character?.avatarWidth);
    const ah = clampAvatarDim(pl.character?.avatarHeight);
    const halfW = aw * 0.5 - 0.15;
    const halfH = ah * 0.5 - 0.15;
    const bodyCx = pl.x;
    const bodyCy = pl.y - (ah - 1) * 0.5;

    const closestX = Math.max(bodyCx - halfW, Math.min(circleX, bodyCx + halfW));
    const closestY = Math.max(bodyCy - halfH, Math.min(circleY, bodyCy + halfH));
    return Math.hypot(circleX - closestX, circleY - closestY) <= radiusTiles;
}

function triggerBossTelegraphAttack(boss, targetPlayer) {
    if (!boss || !boss.alive || boss.isCastingPattern) return;
    boss.isCastingPattern = true;
    boss.lastBossAttackTime = Date.now();

    const bossCenterX = boss.x + (boss.size - 1) * 0.5;
    const bossCenterY = boss.y + (boss.size - 1) * 0.5;

    const useTargetCircle = Math.random() < 0.6;
    const centerX = useTargetCircle ? Number(targetPlayer.x.toFixed(2)) : Number(bossCenterX.toFixed(2));
    const centerY = useTargetCircle ? Number(targetPlayer.y.toFixed(2)) : Number(bossCenterY.toFixed(2));
    const radiusTiles = useTargetCircle ? 2.7 : 4.2;
    const telegraphMs = 1400;

    const patternId = `bt_${++bossTelegraphSeq}`;
    emitToNearbyZones(4, 'bossTelegraph', {
        id: patternId,
        bossId: boss.id,
        x: centerX,
        y: centerY,
        radius: radiusTiles,
        duration: telegraphMs,
        label: useTargetCircle ? '심연의 낙인!' : '마수왕의 포효!'
    });

    setTimeout(() => {
        boss.isCastingPattern = false;
        if (!boss.alive) return;

        const now = Date.now();
        const hitPlayerIds = [];
        const debuffDurationMs = 10000;

        for (const sid in players) {
            const pl = players[sid];
            if (pl.x < 78.0) continue;
            if (isPlayerHitByCircle(pl, centerX, centerY, radiusTiles)) {
                pl.debuffUntil = now + debuffDurationMs;
                hitPlayerIds.push(sid);
                io.to(sid).emit('playerDebuffed', {
                    id: sid,
                    debuffUntil: pl.debuffUntil,
                    durationMs: debuffDurationMs,
                    message: '🩸 [심연의 마수왕]의 장판 공격에 적중! 10초간 공격 데미지가 95% 감소(5% 적용)합니다!'
                });
            }
        }

        emitToNearbyZones(4, 'bossAttackResolve', {
            id: patternId,
            bossId: boss.id,
            x: centerX,
            y: centerY,
            radius: radiusTiles,
            hitPlayerIds
        });
    }, telegraphMs);
}

// ================= [서버 몬스터 AI 이동 루프 (빙결 50% 둔화 & 모든 BOSS CC 면역)] =================
setInterval(() => {
    const now = Date.now();
    const dirs = ['up', 'down', 'left', 'right'];
    const movedByWorldZone = { 2: [], 3: [], 4: [] };

    for (const mid in monsters) {
        const m = monsters[mid];
        if (!m.alive) continue;

        const mSize = m.size || 1;
        const centerOffset = (mSize - 1) * 0.5;
        const mCenterX = m.x + centerOffset;
        const mCenterY = m.y + centerOffset;

        let nearestPlayer = null;
        let minDist = Infinity;
        if (m.aggroRange > 0) {
            for (const pid in players) {
                const pl = players[pid];
                if (m.zone === 1 && (pl.x < 40.5 || pl.x >= 60.0)) continue;
                if (m.zone === 2 && (pl.x < 60.5 || pl.x >= 80.0)) continue;
                if (m.zone === 3 && pl.x < 80.5) continue;

                const d = Math.hypot(pl.x - mCenterX, pl.y - mCenterY);
                if (d <= m.aggroRange && d < minDist) {
                    minDist = d;
                    nearestPlayer = pl;
                }
            }
        }

        if (m.isBoss && nearestPlayer && !m.isCastingPattern && (now - (m.lastBossAttackTime || 0) >= 5200)) {
            triggerBossTelegraphAttack(m, nearestPlayer);
        }

        if (m.isCastingPattern) continue;

        // 빙결 상태 시 이동 주기 2배 (= 이동속도 50%), 모든 [BOSS] 몬스터는 CC 면역
        const isFrozen = !m.isBoss && Boolean(m.frozenUntil && now < m.frozenUntil);
        const effectiveInterval = isFrozen ? (m.moveInterval * 2) : m.moveInterval;
        if (now - m.lastMoveTime < effectiveInterval) continue;
        m.lastMoveTime = now;

        const prevX = m.x;
        const prevY = m.y;
        const prevDir = m.dir;

        let chosenDir = dirs[Math.floor(Math.random() * dirs.length)];
        if (nearestPlayer && minDist > (mSize === 2 ? 1.45 : 0.9)) {
            const dx = nearestPlayer.x - mCenterX;
            const dy = nearestPlayer.y - mCenterY;
            if (Math.abs(dx) >= Math.abs(dy)) {
                chosenDir = dx > 0 ? 'right' : 'left';
            } else {
                chosenDir = dy > 0 ? 'down' : 'up';
            }
        }

        let tx = Math.round(m.x);
        let ty = Math.round(m.y);
        if (chosenDir === 'up') ty -= 1;
        else if (chosenDir === 'down') ty += 1;
        else if (chosenDir === 'left') tx -= 1;
        else if (chosenDir === 'right') tx += 1;

        m.dir = chosenDir;

        const b = getZoneBounds(m.zone, mSize);
        if (tx >= b.minX && tx <= b.maxX && ty >= b.minY && ty <= b.maxY && !isTileBlocked(tx, ty, m.id, mSize)) {
            m.x = tx;
            m.y = ty;
        }

        if (m.x !== prevX || m.y !== prevY || m.dir !== prevDir) {
            const worldZone = m.zone + 1;
            if (movedByWorldZone[worldZone]) {
                movedByWorldZone[worldZone].push({ id: m.id, x: m.x, y: m.y, dir: m.dir });
            }
        }
    }

    for (const wz of [2, 3, 4]) {
        if (movedByWorldZone[wz].length > 0) {
            emitToNearbyZones(wz, 'monstersMovedBatch', movedByWorldZone[wz]);
        }
    }
}, 200);

// ================= [한국 시각(KST) 매일 00:00 스탯 자연 하락 스케줄러] =================
let lastGlobalDecayDate = getKstDateString();
let isRunningMidnightDecay = false;

async function runMidnightStatDecayIfNeeded() {
    if (isRunningMidnightDecay) return;
    const todayKst = getKstDateString();
    if (todayKst === lastGlobalDecayDate) return;

    isRunningMidnightDecay = true;
    try {
        lastGlobalDecayDate = todayKst;
        const users = await User.find({ 'character.lastDecayDate': { $ne: todayKst } });

        for (const u of users) {
            if (!u.character) continue;
            const onlineSid = Object.keys(players).find(sid => String(players[sid].userId) === String(u._id));
            const targetChar = onlineSid ? players[onlineSid].character : u.character;

            const logs = applyDailyStatDecay(targetChar, todayKst);
            const { autoUnequippedWeapon } = syncCharacterProgress(targetChar);

            if (logs.length > 0) {
                u.character = targetChar;
                u.markModified('character');
                await u.save();

                if (onlineSid && players[onlineSid]) {
                    players[onlineSid].character = targetChar;
                    io.emit('playerStatUpdated', { id: onlineSid, character: targetChar });
                    let msg = formatDecayNotice(logs);
                    if (autoUnequippedWeapon) {
                        msg += ` (스탯 하락으로 [${autoUnequippedWeapon}]이(가) 봉인되어 보유 무기로 자동 전환되었습니다.)`;
                    }
                    io.to(onlineSid).emit('statDecayNotice', {
                        logs,
                        message: msg,
                        character: targetChar
                    });
                }
            }
        }

        await User.updateMany(
            { 'character.lastDecayDate': { $ne: todayKst } },
            { $set: { 'character.lastDecayDate': todayKst } }
        );
        console.log(`🌙 KST ${todayKst} 00:00 스탯 자연 하락 정산 완료`);
    } catch (err) {
        console.error('자정 스탯 정산 오류:', err);
    } finally {
        isRunningMidnightDecay = false;
    }
}

setInterval(runMidnightStatDecayIfNeeded, 30 * 1000);

// ================= [소켓 인증 및 통신] =================
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('인증 필요'));
    try {
        socket.decodedUser = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        next(new Error('토큰 만료'));
    }
});

io.on('connection', async (socket) => {
    const { userId, nickname } = socket.decodedUser;

    for (const sid in players) {
        if (String(players[sid].userId) === String(userId)) {
            await flushSingleUserSave(userId);
            delete players[sid];
            io.emit('playerLeft', sid);
        }
    }

    const dbUser = await User.findById(userId).lean();
    const char = (dbUser && dbUser.character) ? dbUser.character : {
        gender: 'male', education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0, wand: 0,
        equippedWeapon: 'wand',
        loadoutWeapons: ['wand', ''],
        weapons: { wand: 0, greatsword: 0, hammer: 0, bow: 0, daggers: 0, taijiorb: 0 },
        unlockedWeapons: { wand: true, greatsword: false, hammer: false, bow: false, daggers: false, taijiorb: false },
        maxStats: {
            education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0,
            wand: 0, greatsword: 0, hammer: 0, bow: 0, daggers: 0, taijiorb: 0
        },
        customTitle: '', titleStat: 'education', auraColor: 'red', showWeapon: true, customAvatar: '',
        avatarWidth: 1, avatarHeight: 1,
        enhanceTokens: MAX_TOKENS, lastTokenRefill: new Date(),
        lastDecayDate: getKstDateString()
    };

    const decayLogs = applyDailyStatDecay(char, getKstDateString());
    const { autoUnequippedWeapon } = syncCharacterProgress(char);
    const tokenState = resolveTokens(char);

    char.enhanceTokens = tokenState.tokens;
    char.lastTokenRefill = tokenState.lastRefill;
    if (dbUser) {
        queueUserCharacterSave(userId, char);
    }

    let spawnX = 6, spawnY = 7;
    while (isTileBlocked(spawnX, spawnY)) {
        spawnX = Math.floor(Math.random() * (DORM_WIDTH - 6)) + 2;
        spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 6)) + 4;
    }

    players[socket.id] = {
        id: socket.id,
        userId: String(userId),
        name: nickname,
        x: spawnX,
        y: spawnY,
        dir: 'down',
        angle: Math.PI / 2,
        sprint: false,
        color: char.color || '#3b82f6',
        character: char,
        enhanceTokens: tokenState.tokens,
        lastTokenRefill: tokenState.lastRefill.getTime(),
        chatText: '',
        debuffUntil: 0,
        lastMoveTime: 0,
        lastAttackTime: 0
    };

    socket.emit('init', {
        myId: socket.id,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        obstacles: OBSTACLES,
        players: players,
        monsters: monsters,
        billboard: getBillboardPublicData()
    });

    if (decayLogs.length > 0) {
        let msg = formatDecayNotice(decayLogs);
        if (autoUnequippedWeapon) {
            msg += ` (스탯 하락으로 [${autoUnequippedWeapon}]이(가) 봉인되어 자동 전환되었습니다.)`;
        }
        socket.emit('statDecayNotice', {
            logs: decayLogs,
            message: msg,
            character: char
        });
    }

    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 360도 자유 이동 동기화
    socket.on('move', (payload) => {
        const p = players[socket.id];
        if (!p || !payload) return;

        const now = Date.now();
        const isRunning = Boolean(payload.sprint);

        if (typeof payload.x === 'number' && typeof payload.y === 'number') {
            const nextX = Number(payload.x);
            const nextY = Number(payload.y);
            if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

            const dist = Math.hypot(nextX - p.x, nextY - p.y);
            if (typeof payload.dir === 'string' && ['up', 'down', 'left', 'right'].includes(payload.dir)) {
                p.dir = payload.dir;
            }
            if (typeof payload.angle === 'number' && Number.isFinite(payload.angle)) {
                p.angle = payload.angle;
            }
            p.sprint = isRunning;
            p.lastMoveTime = now;

            if (dist <= 6.5 && !isFloatPosBlocked(nextX, nextY)) {
                p.x = Math.max(0.2, Math.min(MAP_WIDTH - 1.2, nextX));
                p.y = Math.max(0.8, Math.min(MAP_HEIGHT - 1.2, nextY));
                const wz = getWorldZoneByX(p.x);
                emitToNearbyZones(wz, 'playerMoved', {
                    id: socket.id,
                    x: p.x,
                    y: p.y,
                    dir: p.dir,
                    angle: p.angle,
                    sprint: p.sprint
                }, socket.id);
            } else {
                socket.emit('playerMoved', {
                    id: socket.id,
                    x: p.x,
                    y: p.y,
                    dir: p.dir,
                    angle: p.angle,
                    sprint: p.sprint,
                    reconcile: true
                });
            }
        }
    });

    // 무기별 평타 & 50강·100강 중첩 스킬 발사 동기화 (모든 BOSS CC 면역)
    socket.on('fireProjectile', (payload = {}) => {
        const p = players[socket.id];
        if (!p) return;

        const c = p.character || {};
        const weaponType = (c.equippedWeapon && WEAPON_SPECS[c.equippedWeapon]) ? c.equippedWeapon : 'wand';
        const wSpec = WEAPON_SPECS[weaponType];
        const unlocked50 = hasWeaponSkill50(c, weaponType);
        const unlocked100 = hasWeaponSkill100(c, weaponType);

        const now = Date.now();
        const isExtraShot = Boolean(
            (payload.isExtraWandShot || payload.isExtraShot) &&
            (weaponType === 'wand' || weaponType === 'bow') &&
            unlocked100
        );
        if (!isExtraShot) {
            if (now - (p.lastAttackTime || 0) < wSpec.cooldownMs * 0.78) return;
            p.lastAttackTime = now;
        }

        if (typeof payload.x === 'number' && typeof payload.y === 'number') {
            if (Math.hypot(payload.x - p.x, payload.y - p.y) <= 6.0 && !isFloatPosBlocked(payload.x, payload.y)) {
                p.x = payload.x;
                p.y = payload.y;
            }
        }
        if (typeof payload.angle === 'number' && Number.isFinite(payload.angle)) {
            p.angle = payload.angle;
        }
        if (typeof payload.dir === 'string' && ['up', 'down', 'left', 'right'].includes(payload.dir)) {
            p.dir = payload.dir;
        }

        const weaponLv = getEquippedWeaponLevel(c);
        const combatPower = calcCombatPower(c);
        const angle = typeof p.angle === 'number' ? p.angle : Math.PI / 2;
        const swingSide = typeof payload.swingSide === 'number' ? payload.swingSide : 1;
        const element = (weaponType === 'wand' && ['fire', 'ice', 'lightning'].includes(payload.element))
            ? payload.element
            : null;

        const verifiedSkill50 = Boolean(unlocked50 && (payload.skill50Triggered || payload.skillTier === 50));
        const verifiedSkill100 = Boolean(unlocked100 && (payload.skill100Triggered || payload.skillTier === 100));
        const verifiedSkillType = (verifiedSkill50 || verifiedSkill100) && typeof payload.skillType === 'string'
            ? payload.skillType
            : null;
        const verifiedSkillTier = verifiedSkill100 ? 100 : (verifiedSkill50 ? 50 : 0);

        const wz = getWorldZoneByX(p.x);

        // 지팡이 50강(IQ 150+): 반경 4타일 원 범위 밀쳐내기 (데미지 없음, 모든 [BOSS] CC 면역)
        if (weaponType === 'wand' && unlocked50 && payload.triggerKnockback && !isExtraShot) {
            const pushedList = [];
            for (const mid in monsters) {
                const m = monsters[mid];
                if (!m.alive || m.isBoss) continue;
                if ((m.zone + 1) !== wz) continue;

                const mSize = m.size || 1;
                const mCenterX = m.x + (mSize - 1) * 0.5;
                const mCenterY = m.y + (mSize - 1) * 0.5;
                const dx = mCenterX - p.x;
                const dy = mCenterY - p.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 4.0) {
                    const ux = dist > 0.01 ? (dx / dist) : Math.cos(angle);
                    const uy = dist > 0.01 ? (dy / dist) : Math.sin(angle);
                    const b = getZoneBounds(m.zone, mSize);

                    let finalX = null, finalY = null;
                    for (const pushDist of [3.0, 2.5, 2.0, 1.5, 1.0, 0.5]) {
                        const candX = Math.max(b.minX, Math.min(b.maxX, Number((m.x + ux * pushDist).toFixed(2))));
                        const candY = Math.max(b.minY, Math.min(b.maxY, Number((m.y + uy * pushDist).toFixed(2))));
                        if (isMonsterPullPosValid(candX, candY, m.zone, mSize)) {
                            finalX = candX;
                            finalY = candY;
                            break;
                        }
                    }

                    if (finalX !== null && finalY !== null) {
                        m.x = finalX;
                        m.y = finalY;
                        m.lastMoveTime = now + 450;
                        pushedList.push({ id: m.id, x: m.x, y: m.y });
                    }
                }
            }

            emitToNearbyZones(wz, 'monstersKnockedBack', {
                ownerId: socket.id,
                cx: p.x,
                cy: p.y,
                radius: 4.0,
                pushed: pushedList
            });
        }

        // 망치 50강 '중력 붕괴(블랙홀)': 100강에도 유지 · 반경 4.5타일 흡입 (모든 [BOSS] CC 면역)
        if (weaponType === 'hammer' && unlocked50 && (payload.triggerBlackhole || verifiedSkillType === 'blackhole')) {
            const pullCenterX = p.x + Math.cos(angle) * 1.2;
            const pullCenterY = p.y + Math.sin(angle) * 1.2;
            const pulledList = [];

            for (const mid in monsters) {
                const m = monsters[mid];
                if (!m.alive || m.isBoss || m.pullImmune) continue;
                if ((m.zone + 1) !== wz) continue;

                const mSize = m.size || 1;
                const mCenterX = m.x + (mSize - 1) * 0.5;
                const mCenterY = m.y + (mSize - 1) * 0.5;
                const dist = Math.hypot(mCenterX - p.x, mCenterY - p.y);

                if (dist <= 4.5) {
                    const jitterX = (Math.random() - 0.5) * 0.5;
                    const jitterY = (Math.random() - 0.5) * 0.5;
                    const b = getZoneBounds(m.zone, mSize);
                    let destX = Math.max(b.minX, Math.min(b.maxX, Number((pullCenterX - (mSize - 1) * 0.5 + jitterX).toFixed(2))));
                    let destY = Math.max(b.minY, Math.min(b.maxY, Number((pullCenterY - (mSize - 1) * 0.5 + jitterY).toFixed(2))));

                    if (!isMonsterPullPosValid(destX, destY, m.zone, mSize)) {
                        destX = Math.max(b.minX, Math.min(b.maxX, Math.round(pullCenterX)));
                        destY = Math.max(b.minY, Math.min(b.maxY, Math.round(pullCenterY)));
                    }

                    if (isMonsterPullPosValid(destX, destY, m.zone, mSize)) {
                        m.x = destX;
                        m.y = destY;
                        m.lastMoveTime = now + 650;
                        pulledList.push({ id: m.id, x: m.x, y: m.y });
                    }
                }
            }

            if (pulledList.length > 0) {
                emitToNearbyZones(wz, 'monstersPulled', {
                    ownerId: socket.id,
                    cx: pullCenterX,
                    cy: pullCenterY,
                    pulled: pulledList
                });
            }
        }

        const meteorX = (weaponType === 'hammer' && verifiedSkill100 && typeof payload.meteorX === 'number') ? payload.meteorX : null;
        const meteorY = (weaponType === 'hammer' && verifiedSkill100 && typeof payload.meteorY === 'number') ? payload.meteorY : null;
        const cloneX = (weaponType === 'daggers' && verifiedSkill100 && typeof payload.cloneX === 'number') ? payload.cloneX : null;
        const cloneY = (weaponType === 'daggers' && verifiedSkill100 && typeof payload.cloneY === 'number') ? payload.cloneY : null;

        emitToNearbyZones(wz, 'projectileFired', {
            ownerId: socket.id,
            ownerName: p.name,
            x: p.x,
            y: p.y,
            dir: p.dir,
            angle: angle,
            vx: Math.cos(angle),
            vy: Math.sin(angle),
            weaponType: weaponType,
            weaponLv: weaponLv,
            element: element,
            swingSide: swingSide,
            attackPower: combatPower,
            skillType: verifiedSkillType,
            skillTier: verifiedSkillTier,
            skill50Triggered: verifiedSkill50,
            skill100Triggered: verifiedSkill100,
            meteorX: meteorX,
            meteorY: meteorY,
            cloneX: cloneX,
            cloneY: cloneY,
            isExtraShot: isExtraShot
        }, socket.id);
    });

    // 사냥터 몬스터 피격 및 처치 (6종 무기 배율 + 지팡이 3속성 + 모든 BOSS CC 면역)
    function applyDamageToMonster(p, m, mult, opts = {}) {
        if (!p || !m || !m.alive) return false;
        const c = p.character || {};
        const basePower = calcCombatPower(c);
        const now = Date.now();
        const isDebuffed = Boolean(p.debuffUntil && now < p.debuffUntil);

        let damage = Math.max(1, Math.round(basePower * mult));
        if (isDebuffed) {
            damage = Math.max(1, Math.round(damage * 0.05));
        }

        // 빙결 CC 적용 (모든 [BOSS] 몬스터는 CC 면역)
        if (opts.applyFreeze && !m.isBoss) {
            m.frozenUntil = now + 3000;
        }

        m.hp = Math.max(0, m.hp - damage);
        const monsterWorldZone = m.zone + 1;

        if (m.hp > 0) {
            emitToNearbyZones(monsterWorldZone, 'monsterDamaged', {
                id: m.id,
                hp: m.hp,
                maxHp: m.maxHp,
                damage: damage,
                isDebuffed: isDebuffed,
                hitType: opts.hitType || 'normal',
                frozenUntil: m.frozenUntil || 0,
                attackerId: socket.id,
                x: m.x,
                y: m.y
            });
            return true;
        } else {
            m.alive = false;
            m.isCastingPattern = false;
            m.frozenUntil = 0;

            let gainedTokenCount = 0;
            if (Math.random() < m.dropRate) {
                gainedTokenCount = m.rewardCount || 1;
            }

            let updatedTokens = p.enhanceTokens;
            let updatedLastRefill = p.lastTokenRefill;

            if (gainedTokenCount > 0) {
                const tokenState = resolveTokens(p.character);
                const nextTokens = Math.min(MAX_TOKENS, tokenState.tokens + gainedTokenCount);
                const nextRefill = nextTokens >= MAX_TOKENS ? new Date() : tokenState.lastRefill;

                p.character.enhanceTokens = nextTokens;
                p.character.lastTokenRefill = nextRefill;
                updatedTokens = nextTokens;
                updatedLastRefill = nextRefill.getTime();
                p.enhanceTokens = updatedTokens;
                p.lastTokenRefill = updatedLastRefill;

                queueUserCharacterSave(p.userId, p.character);
            }

            io.emit('monsterKilled', {
                id: m.id,
                name: m.name,
                isBoss: Boolean(m.isBoss),
                damage: damage,
                isDebuffed: isDebuffed,
                hitType: opts.hitType || 'normal',
                attackerId: socket.id,
                attackerName: p.name,
                x: m.x,
                y: m.y,
                rewarded: gainedTokenCount > 0,
                rewardCount: gainedTokenCount,
                tokens: updatedTokens,
                lastRefill: updatedLastRefill
            });

            if (m.isBoss) {
                io.emit('systemNotice', {
                    message: `👑 [${p.name}]님이 동쪽숲 3 보스 [${m.name}]을(를) 처치하여 기회 +${m.rewardCount}개를 획득했습니다! (5분 뒤 재소환)`
                });
            }

            const respawnDelay = m.respawnMs || 4500;
            setTimeout(() => {
                const pos = m.isBoss ? { x: 91, y: 6 } : getRandomHuntingTile(m.zone || 1, m.size || 1, m.id);
                m.x = pos.x;
                m.y = pos.y;
                m.hp = m.maxHp;
                m.alive = true;
                m.isCastingPattern = false;
                m.frozenUntil = 0;
                m.lastMoveTime = Date.now();
                io.emit('monsterRespawned', m);
                if (m.isBoss) {
                    io.emit('systemNotice', {
                        message: `🔥 동쪽숲 3에 보스 [${m.name}]이(가) 다시 출현했습니다!`
                    });
                }
            }, respawnDelay);
            return false;
        }
    }

    socket.on('hitMonster', (payload) => {
        const p = players[socket.id];
        if (!p || !payload || !payload.monsterId) return;

        const m = monsters[payload.monsterId];
        if (!m || !m.alive) return;

        const c = p.character || {};
        const eqWeapon = (c.equippedWeapon && WEAPON_SPECS[c.equippedWeapon]) ? c.equippedWeapon : 'wand';
        const wSpec = WEAPON_SPECS[eqWeapon];

        // 1) 지팡이 3속성 전용 판정
        if (eqWeapon === 'wand') {
            const elem = ['fire', 'ice', 'lightning'].includes(payload.element) ? payload.element : 'fire';

            if (elem === 'fire') {
                const mult = payload.isSplash ? wSpec.fireSplashMult : 1.0;
                applyDamageToMonster(p, m, mult, { hitType: 'fire' });
                return;
            }

            if (elem === 'ice') {
                const mult = payload.isSplash ? wSpec.iceSplashMult : 1.0;
                applyDamageToMonster(p, m, mult, { hitType: 'ice', applyFreeze: true });
                return;
            }

            if (elem === 'lightning') {
                if (payload.isSplash) return;
                const stillAlive = applyDamageToMonster(p, m, 1.0, { hitType: 'lightning_orb' });

                if (stillAlive) {
                    const targetMonsterId = m.id;
                    setTimeout(() => {
                        const curP = players[socket.id];
                        const curM = monsters[targetMonsterId];
                        if (!curP || !curM || !curM.alive) return;

                        emitToNearbyZones(curM.zone + 1, 'lightningStrike', {
                            monsterId: curM.id,
                            x: curM.x,
                            y: curM.y,
                            size: curM.size || 1
                        });

                        const boltMult = 1.0 + Math.random() * 2.0;
                        applyDamageToMonster(curP, curM, boltMult, { hitType: 'lightning_bolt' });
                    }, 110);
                }
                return;
            }
        }

        // 2) 활 전용 판정 (50강 삼삼구샷: 100강 달성 시 화살당 140%, 미만 시 110% / 기본·이중관통 195%)
        if (eqWeapon === 'bow') {
            let mult = wSpec.baseMult;
            if (payload.skillTier === 50 && hasWeaponSkill50(c, 'bow')) {
                mult = hasWeaponSkill100(c, 'bow') ? wSpec.skill50EnhancedMult : wSpec.skill50Mult;
            }
            applyDamageToMonster(p, m, mult, { hitType: payload.skillTier === 50 ? 'bow_50' : 'normal' });
            return;
        }

        // 3) 대검 / 망치 / 쌍수 / 태극구: 50강·100강 중첩 독립 판정
        let mult = wSpec.baseMult;
        let hitType = 'normal';
        if (payload.skillTier === 100 && hasWeaponSkill100(c, eqWeapon)) {
            mult = wSpec.skill100Mult;
            hitType = `${eqWeapon}_100`;
        } else if ((payload.skillTier === 50 || payload.skillHit) && hasWeaponSkill50(c, eqWeapon)) {
            mult = wSpec.skill50Mult;
            hitType = `${eqWeapon}_50`;
        }
        applyDamageToMonster(p, m, mult, { hitType });
    });

    // ================= [로비 중앙 전광판 (하이잭 디스)] =================
    socket.on('billboardGuess', (pinInput, callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });

        const cleanPin = String(pinInput || '').trim();
        if (!/^\d{3}$/.test(cleanPin)) {
            return callback && callback({ success: false, message: '3자리 숫자(000~999)를 입력해주세요.' });
        }

        if (billboardState.failedPins.includes(cleanPin)) {
            return callback && callback({
                success: false,
                alreadyFailed: true,
                billboard: getBillboardPublicData(),
                message: `번호 [${cleanPin}]은(는) 이미 소거된 오답입니다. (기회 차감 없음)`
            });
        }

        const tokenState = resolveTokens(p.character);
        if (tokenState.tokens < 1) {
            return callback && callback({
                success: false,
                noTokens: true,
                tokens: tokenState.tokens,
                lastRefill: tokenState.lastRefill.getTime(),
                message: '기회가 부족합니다. (1회 추리당 기회 1 소모)'
            });
        }

        const nextTokens = tokenState.tokens - 1;
        const nextRefill = tokenState.tokens === MAX_TOKENS ? new Date() : tokenState.lastRefill;

        p.character.enhanceTokens = nextTokens;
        p.character.lastTokenRefill = nextRefill;
        p.enhanceTokens = nextTokens;
        p.lastTokenRefill = nextRefill.getTime();
        queueUserCharacterSave(p.userId, p.character);

        if (cleanPin === billboardState.currentPin) {
            const claimToken = crypto.randomBytes(12).toString('hex');
            billboardState.activeClaimToken = claimToken;
            billboardState.claimOwnerSocketId = socket.id;
            billboardState.claimOwnerUserId = p.userId;
            billboardState.claimExpiresAt = Date.now() + 5 * 60 * 1000;

            return callback && callback({
                success: true,
                matched: true,
                claimToken,
                tokens: nextTokens,
                lastRefill: nextRefill.getTime(),
                message: `🔓 비밀번호 [${cleanPin}] 일치! 전광판 텍스트 작성 페이지로 진입하시겠습니까?`
            });
        }

        billboardState.failedPins.push(cleanPin);
        saveBillboardAsync();
        const pub = getBillboardPublicData();
        io.emit('billboardUpdated', pub);

        return callback && callback({
            success: true,
            matched: false,
            tokens: nextTokens,
            lastRefill: nextRefill.getTime(),
            billboard: pub,
            message: `❌ [${cleanPin}] 불일치! 오답 목록에 기록되었습니다. (${pub.failedCount}/1000)`
        });
    });

    socket.on('billboardSubmit', (payload, callback) => {
        const p = players[socket.id];
        if (!p || !payload) return callback && callback({ success: false, message: '잘못된 요청입니다.' });

        const { claimToken, newText } = payload;
        const now = Date.now();
        if (
            !claimToken ||
            claimToken !== billboardState.activeClaimToken ||
            billboardState.claimOwnerUserId !== p.userId ||
            now > billboardState.claimExpiresAt
        ) {
            return callback && callback({ success: false, message: '작성 권한이 만료되었거나 유효하지 않습니다.' });
        }

        const cleanText = String(newText || '').trim().slice(0, 120);
        if (cleanText.length === 0) {
            return callback && callback({ success: false, message: '전광판에 게시할 문구를 입력해주세요.' });
        }

        billboardState.boxText = cleanText;
        billboardState.textSince = now;
        billboardState.failedPins = [];
        billboardState.currentPin = generateRandomPin();
        billboardState.activeClaimToken = null;
        billboardState.claimOwnerSocketId = null;
        billboardState.claimOwnerUserId = null;
        billboardState.claimExpiresAt = 0;

        saveBillboardAsync();
        const pub = getBillboardPublicData();
        io.emit('billboardUpdated', pub);
        io.emit('systemNotice', {
            message: `📺 [${p.name}]님이 로비 전광판의 암호를 해제하고 새로운 문구를 게시했습니다! (새 비밀번호 무작위 재설정 완료)`
        });

        return callback && callback({
            success: true,
            billboard: pub,
            message: '전광판 문구가 등록되었으며, 새 비밀번호가 무작위로 자동 설정되었습니다!'
        });
    });

    // ================= [해린이언니 캐릭터 외형 & 크기(1~3x1~3) 커스터마이징] =================
    socket.on('updateCustomAvatar', (payload, callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });

        let hasAvatarField = false;
        let rawAvatar = '';
        let nextW = p.character.avatarWidth || 1;
        let nextH = p.character.avatarHeight || 1;

        if (typeof payload === 'string') {
            hasAvatarField = true;
            rawAvatar = payload.trim();
        } else if (payload && typeof payload === 'object') {
            if (typeof payload.customAvatar === 'string') {
                hasAvatarField = true;
                rawAvatar = payload.customAvatar.trim();
            }
            if (payload.avatarWidth !== undefined) nextW = clampAvatarDim(payload.avatarWidth);
            if (payload.avatarHeight !== undefined) nextH = clampAvatarDim(payload.avatarHeight);
        }

        if (hasAvatarField && rawAvatar.length > 0) {
            const isValidPrefix =
                rawAvatar.startsWith('data:image/png;base64,') ||
                rawAvatar.startsWith('data:image/webp;base64,') ||
                rawAvatar.startsWith('data:image/jpeg;base64,');
            if (!isValidPrefix) {
                return callback && callback({ success: false, message: '지원하지 않는 이미지 형식입니다.' });
            }
            if (rawAvatar.length > 32768) {
                return callback && callback({ success: false, message: '압축된 이미지 용량이 제한(32KB)을 초과했습니다.' });
            }
        }

        if (hasAvatarField) p.character.customAvatar = rawAvatar;
        p.character.avatarWidth = nextW;
        p.character.avatarHeight = nextH;
        queueUserCharacterSave(p.userId, p.character);

        io.emit('playerStatUpdated', {
            id: socket.id,
            character: p.character
        });

        if (callback) {
            let msg = `📏 캐릭터 크기가 ${nextW}×${nextH} 블록으로 적용되었습니다! (피격 판정 연동)`;
            if (hasAvatarField) {
                msg = rawAvatar
                    ? `✨ 커스텀 외형 및 크기(${nextW}×${nextH})가 적용되었습니다!`
                    : `🔄 기본 외형으로 복구되었습니다! (크기 ${nextW}×${nextH})`;
            }
            callback({
                success: true,
                character: p.character,
                message: msg
            });
        }
    });

    socket.on('updateAvatarSize', (payload, callback) => {
        const p = players[socket.id];
        if (!p || !payload) return callback && callback({ success: false, message: '잘못된 요청입니다.' });

        const nextW = clampAvatarDim(payload.width);
        const nextH = clampAvatarDim(payload.height);
        p.character.avatarWidth = nextW;
        p.character.avatarHeight = nextH;
        queueUserCharacterSave(p.userId, p.character);

        io.emit('playerStatUpdated', {
            id: socket.id,
            character: p.character
        });

        if (callback) {
            callback({
                success: true,
                character: p.character,
                message: `📏 캐릭터 크기가 [${nextW}×${nextH}] 블록으로 변경되었습니다! (크기가 클수록 피격 범위도 커집니다)`
            });
        }
    });

    // ================= [대장간 NPC 전용: 무기 전수 · 출정 2슬롯 세팅 · 즉시 스왑(X)] =================
    socket.on('unlockWeapon', (weaponType, callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });
        if (!isNearBlacksmith(p)) {
            return callback && callback({ success: false, message: '로비의 [대장간] NPC에게 직접 말을 걸어야 무기를 제작·전수받을 수 있습니다!' });
        }
        if (!WEAPON_SPECS[weaponType]) return callback && callback({ success: false, message: '존재하지 않는 무기입니다.' });

        const c = p.character;
        syncCharacterProgress(c);

        if (c.unlockedWeapons[weaponType]) {
            return callback && callback({ success: false, message: '이미 보유 중인 무기입니다.' });
        }

        if (!meetsWeaponStatReq(c, weaponType)) {
            return callback && callback({
                success: false,
                message: `아직 근력이 부족하군! [${WEAPON_SPECS[weaponType].unlockDesc}] 조건을 현재 스탯으로 충족해 오게.`
            });
        }

        c.unlockedWeapons[weaponType] = true;
        if (!c.loadoutWeapons[1] && c.loadoutWeapons[0] !== weaponType) {
            c.loadoutWeapons[1] = weaponType;
        }
        queueUserCharacterSave(p.userId, c);

        io.emit('playerStatUpdated', { id: socket.id, character: c });

        if (callback) {
            callback({
                success: true,
                weaponType,
                character: c,
                message: `으하하! [${WEAPON_SPECS[weaponType].name}] 제작 완료다! 아래 출정 슬롯(1번/2번)에 세팅하고 사냥터로 나가게!`
            });
        }
    });

    socket.on('setLoadoutWeapons', (payload, callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });
        if (!isNearBlacksmith(p)) {
            return callback && callback({ success: false, message: '출정 무기 2종 세팅은 로비의 [대장간] NPC에게서만 가능합니다!' });
        }

        const c = p.character;
        syncCharacterProgress(c);

        const s0 = typeof payload?.slot0 === 'string' ? payload.slot0.trim() : '';
        const s1 = typeof payload?.slot1 === 'string' ? payload.slot1.trim() : '';

        if (!s0 || !WEAPON_SPECS[s0]) {
            return callback && callback({ success: false, message: '1번 슬롯(주무기)을 선택해주세요.' });
        }
        if (!c.unlockedWeapons[s0] || !meetsWeaponStatReq(c, s0)) {
            return callback && callback({ success: false, message: `1번 슬롯 [${WEAPON_SPECS[s0].name}]은(는) 미보유 또는 스탯 부족 봉인 상태입니다.` });
        }
        if (s1) {
            if (!WEAPON_SPECS[s1]) {
                return callback && callback({ success: false, message: '2번 슬롯 무기가 올바르지 않습니다.' });
            }
            if (s1 === s0) {
                return callback && callback({ success: false, message: '1번 슬롯과 2번 슬롯에 같은 무기를 중복 배치할 수 없습니다.' });
            }
            if (!c.unlockedWeapons[s1] || !meetsWeaponStatReq(c, s1)) {
                return callback && callback({ success: false, message: `2번 슬롯 [${WEAPON_SPECS[s1].name}]은(는) 미보유 또는 스탯 부족 봉인 상태입니다.` });
            }
        }

        c.loadoutWeapons = [s0, s1 || ''];
        if (!c.loadoutWeapons.includes(c.equippedWeapon)) {
            c.equippedWeapon = s0;
        }

        queueUserCharacterSave(p.userId, c);
        io.emit('playerStatUpdated', { id: socket.id, character: c });

        const label1 = WEAPON_SPECS[s0].name;
        const label2 = s1 ? WEAPON_SPECS[s1].name : '없음';
        if (callback) {
            callback({
                success: true,
                character: c,
                message: `⚒️ 출정 무기 세팅 완료! [1번: ${label1} / 2번: ${label2}] — 필드에서 X 키로 즉시 교체하세요!`
            });
        }
    });

    socket.on('swapWeapon', (callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });

        const c = p.character;
        syncCharacterProgress(c);

        const [w0, w1] = c.loadoutWeapons || ['wand', ''];
        if (!w1 || !WEAPON_SPECS[w1]) {
            return callback && callback({
                success: false,
                message: '2번 보조 무기가 비어 있습니다! 로비의 [대장간] NPC에서 들고 다닐 무기 2종을 세팅하세요.'
            });
        }

        const nextWeapon = (c.equippedWeapon === w0) ? w1 : w0;
        if (!c.unlockedWeapons[nextWeapon]) {
            return callback && callback({ success: false, message: '미보유 무기로는 교체할 수 없습니다.' });
        }
        if (!meetsWeaponStatReq(c, nextWeapon)) {
            return callback && callback({
                success: false,
                message: `🔒 현재 스탯이 부족하여 [${WEAPON_SPECS[nextWeapon].name}]이(가) 봉인 상태입니다! (${WEAPON_SPECS[nextWeapon].unlockDesc})`
            });
        }

        c.equippedWeapon = nextWeapon;
        queueUserCharacterSave(p.userId, c);
        io.emit('playerStatUpdated', { id: socket.id, character: c });

        if (callback) {
            callback({
                success: true,
                equippedWeapon: nextWeapon,
                character: c,
                message: `🔄 [${WEAPON_SPECS[nextWeapon].name}](으)로 무기 변경!`
            });
        }
    });

    // 캐릭터 표시 설정 동기화 (칭호 / 기운 색상 / 장착 무기 보이기·숨기기)
    socket.on('updatePreferences', (prefs) => {
        const p = players[socket.id];
        if (!p || !prefs) return;

        const validColors = ['red', 'yellow', 'blue', 'green'];
        const c = p.character;
        syncCharacterProgress(c);

        if (prefs.titleStat && VALID_TITLE_STATS.includes(prefs.titleStat)) {
            c.titleStat = prefs.titleStat;
        }
        if (typeof prefs.customTitle === 'string') {
            c.customTitle = prefs.customTitle.trim().slice(0, 30);
        }
        if (prefs.auraColor && validColors.includes(prefs.auraColor)) {
            c.auraColor = prefs.auraColor;
        }
        if (typeof prefs.showWeapon === 'boolean') {
            c.showWeapon = prefs.showWeapon;
        }

        queueUserCharacterSave(p.userId, c);
        io.emit('playerStatUpdated', { id: socket.id, character: c });
    });

    // ================= [6대 스탯 강화(어디서나) & 무기 6종 강화(대장간 NPC 전용)] =================
    socket.on('tryEnhanceStat', (statType, callback) => {
        const p = players[socket.id];
        if (!p) return callback({ success: false, message: '플레이어 정보 없음' });

        const c = p.character;
        syncCharacterProgress(c);

        const isWeaponStat = WEAPON_KEYS.includes(statType);
        if (isWeaponStat) {
            if (!isNearBlacksmith(p)) {
                return callback({
                    success: false,
                    message: '⚒️ 무기 강화는 로비의 [대장간] NPC에게 말을 걸어야만 가능합니다!'
                });
            }
            if (!c.unlockedWeapons[statType]) {
                return callback({
                    success: false,
                    message: '아직 보유하지 않은 무기입니다! 먼저 [대장간]에서 제작·전수받으세요.'
                });
            }
            if (!meetsWeaponStatReq(c, statType)) {
                return callback({
                    success: false,
                    message: `🔒 현재 스탯이 +10강 미만이라 [${WEAPON_SPECS[statType].name}]이(가) 봉인 상태입니다!`
                });
            }
            const curWepLv = c.weapons[statType] || 0;
            if (curWepLv >= 30) {
                return callback({
                    success: false,
                    message: `${WEAPON_SPECS[statType].name}이(가) 이미 최고 단계(+30강)에 도달했습니다!`
                });
            }
        }

        const tokenState = resolveTokens(c);
        if (tokenState.tokens < 1) {
            return callback({
                success: false,
                noTokens: true,
                tokens: tokenState.tokens,
                lastRefill: tokenState.lastRefill.getTime(),
                message: '기회가 부족합니다. (1분당 1회 충전 또는 사냥터 몬스터 처치)'
            });
        }

        const currentTokens = tokenState.tokens - 1;
        const newLastRefill = tokenState.tokens === MAX_TOKENS ? new Date() : tokenState.lastRefill;

        const rand = Math.random() * 100;
        let result = { type: 'keep', change: 0, message: '아무 일도 일어나지 않았습니다.' };

        if (isWeaponStat) {
            const wName = WEAPON_SPECS[statType].name;
            const curLv = c.weapons[statType] || 0;
            const successProb = ENHANCE_RATES[curLv] !== undefined ? ENHANCE_RATES[curLv] : 0;

            if (Math.random() < successProb) {
                const nextLv = curLv + 1;
                c.weapons[statType] = nextLv;
                if (statType === 'wand') c.wand = nextLv;
                result = {
                    type: 'success',
                    change: 1,
                    message: `⚒️ ${wName} 단조 성공! (+${nextLv}강 달성 · 장착 시 전투력 +10 상승!)`
                };
            } else {
                if (curLv > 0 && Math.random() < 0.5) {
                    const nextLv = curLv - 1;
                    c.weapons[statType] = nextLv;
                    if (statType === 'wand') c.wand = nextLv;
                    result = {
                        type: 'fail',
                        change: -1,
                        message: `💥 ${wName} 단조 실패! 균열이 생겨 단계가 하락했습니다 (-1강 → +${nextLv}강).`
                    };
                } else {
                    result = {
                        type: 'keep',
                        change: 0,
                        message: `🔨 ${wName} 단조 실패... 다행히 단계가 유지되었습니다 (+${curLv}강).`
                    };
                }
            }
        } else {
            switch (statType) {
                case 'education': {
                    if (rand < 1.0) {
                        c.education += 1;
                        result = { type: 'success', change: 1, message: '🎉 학력 강화 성공! 학위가 올랐습니다. (전투력 +1)' };
                    }
                    break;
                }
                case 'appearance': {
                    if (rand < 11.0) {
                        c.appearance += 1;
                        result = { type: 'success', change: 1, message: '✨ 외모 관리 성공! 아우라가 달라졌습니다. (전투력 +1)' };
                    } else if (rand >= 90.0 && c.appearance > 0) {
                        c.appearance -= 1;
                        result = { type: 'fail', change: -1, message: '💦 관리 소홀... 외모가 조금 서운해졌습니다. (전투력 -1)' };
                    }
                    break;
                }
                case 'wealth': {
                    if (rand < 41.0) {
                        c.wealth += 1;
                        result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 자산이 증식되었습니다. (전투력 +1)' };
                    } else if (rand >= 60.0 && c.wealth > 0) {
                        c.wealth -= 1;
                        result = { type: 'fail', change: -1, message: '📉 투자 손실... 자산이 줄었습니다 (-1강 · 전투력 -1).' };
                    }
                    break;
                }
                case 'iq': {
                    if (rand < 2.0) {
                        c.iq += 1;
                        result = { type: 'success', change: 1, message: '🧠 지능 향상 성공 (+1 IQ · 전투력 +1)!' };
                    } else if (rand >= 99.0 && c.iq > 0) {
                        c.iq -= 1;
                        result = { type: 'fail', change: -1, message: '😵 뇌정지가 왔습니다 (-1 IQ).' };
                    }
                    break;
                }
                case 'stamina': {
                    if (rand < 7.0) {
                        c.stamina += 1;
                        result = { type: 'success', change: 1, message: '💪 체력 강화 성공! 피지컬이 상승했습니다. (전투력 +1)' };
                    } else if (rand >= 94.0 && c.stamina > 0) {
                        c.stamina -= 1;
                        result = { type: 'fail', change: -1, message: '🩹 무리한 운동으로 근육통이 왔습니다 (-1강 · 전투력 -1).' };
                    }
                    break;
                }
                case 'personality': {
                    if (rand < 5.0) {
                        c.personality += 1;
                        result = { type: 'success', change: 1, message: '🍀 성격 수양 성공! 인성이 깊어졌습니다. (전투력 +1)' };
                    } else if (rand >= 96.0 && c.personality > 0) {
                        c.personality -= 1;
                        result = { type: 'fail', change: -1, message: '💢 욱하는 마음에 인성이 깎였습니다 (-1강 · 전투력 -1).' };
                    }
                    break;
                }
                default:
                    return callback({ success: false, message: '알 수 없는 스탯입니다.' });
            }
        }

        const { autoUnequippedWeapon } = syncCharacterProgress(c);
        if (autoUnequippedWeapon) {
            result.message += ` 🔒 스탯 하락으로 [${autoUnequippedWeapon}]이(가) 봉인되어 자동 전환되었습니다!`;
        }

        c.enhanceTokens = currentTokens;
        c.lastTokenRefill = newLastRefill;
        p.enhanceTokens = currentTokens;
        p.lastTokenRefill = newLastRefill.getTime();
        queueUserCharacterSave(p.userId, c);

        io.emit('playerStatUpdated', {
            id: socket.id,
            character: c
        });

        callback({
            success: true,
            result,
            character: c,
            tokens: currentTokens,
            lastRefill: newLastRefill.getTime()
        });
    });

    socket.on('sendChat', (message) => {
        const p = players[socket.id];
        if (!p) return;
        const cleanMsg = String(message).trim().slice(0, 40);
        if (cleanMsg.length === 0) return;

        p.chatText = cleanMsg;
        io.emit('playerChat', { id: socket.id, name: p.name, message: cleanMsg });

        if (playerChatTimers.has(socket.id)) {
            clearTimeout(playerChatTimers.get(socket.id));
        }
        const timer = setTimeout(() => {
            if (players[socket.id]) {
                players[socket.id].chatText = '';
                io.emit('playerChatClear', { id: socket.id });
            }
            playerChatTimers.delete(socket.id);
        }, 4500);
        playerChatTimers.set(socket.id, timer);
    });

    socket.on('emitAura', () => {
        const p = players[socket.id];
        if (!p) return;
        emitToNearbyZones(getWorldZoneByX(p.x), 'playerAura', { id: socket.id }, socket.id);
    });

    socket.on('disconnect', async () => {
        if (playerChatTimers.has(socket.id)) {
            clearTimeout(playerChatTimers.get(socket.id));
            playerChatTimers.delete(socket.id);
        }
        const p = players[socket.id];
        if (p) {
            await flushSingleUserSave(p.userId);
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🌟 인생온라인 서버 가동 중: 포트 ${PORT}`);
});