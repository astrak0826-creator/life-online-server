require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 환경변수 우선 적용 (미설정 시 기본값 fallback)
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://astrak0826_db_user:N9BZo8Kh2mcHsAKk@cluster0.coyo29h.mongodb.net/azaekaban?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'azaekaban_dagger_rpg_secret_2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'masterAdminKey!999#';

mongoose.connect(MONGO_URI)
    .then(() => console.log('🍃 MongoDB Atlas 인생온라인 DB 연결 완료!'))
    .catch(err => console.error('❌ DB 연결 에러:', err));

const MAX_TOKENS = 120;
const REFILL_INTERVAL_MS = 60 * 1000; // 1분당 1개 충전

// 무기 0강 -> 1강부터 29강 -> 30강까지의 강화 확률 테이블
const ENHANCE_RATES = {
    0: 0.95,  1: 0.90,  2: 0.85,  3: 0.80,  4: 0.75,
    5: 0.70,  6: 0.65,  7: 0.60,  8: 0.55,  9: 0.50,
    10: 0.45, 11: 0.40, 12: 0.35, 13: 0.30, 14: 0.25,
    15: 0.22, 16: 0.19, 17: 0.16, 18: 0.13, 19: 0.10,
    20: 0.09, 21: 0.08, 22: 0.075, 23: 0.07, 24: 0.06,
    25: 0.05, 26: 0.04, 27: 0.03, 28: 0.02, 29: 0.01
};

// 5종 무기 스펙 및 해금 조건 정의
const WEAPON_SPECS = {
    wand: {
        key: 'wand',
        name: '마법 지팡이',
        cooldownMs: 880,
        baseMult: 1.0,
        splashMult: 0.5,
        unlockStat: null,
        unlockReq: 0,
        unlockDesc: '기본 지급 무기'
    },
    greatsword: {
        key: 'greatsword',
        name: '마도 대검',
        cooldownMs: 1050,
        baseMult: 1.15,
        unlockStat: 'stamina',
        unlockReq: 10,
        unlockDesc: '체력(몸통) +10강 이상 달성'
    },
    daggers: {
        key: 'daggers',
        name: '쌍단검',
        cooldownMs: 300,
        baseMult: 0.42,
        unlockStat: 'appearance',
        unlockReq: 10,
        unlockDesc: '외모(오른다리) +10강 이상 달성'
    },
    bow: {
        key: 'bow',
        name: '아케인 활',
        cooldownMs: 780,
        baseMult: 0.85,
        unlockStat: 'iq',
        unlockReq: 110,
        unlockDesc: '지능(머리) IQ 110 (+10강) 이상 달성'
    },
    chakram: {
        key: 'chakram',
        name: '차크람',
        cooldownMs: 1100,
        baseMult: 0.65,
        unlockStat: 'wealth',
        unlockReq: 10,
        unlockDesc: '재력(왼팔) +10강 이상 달성'
    }
};

const WEAPON_KEYS = Object.keys(WEAPON_SPECS);

// 기회(토큰) 자동 계산 헬퍼 함수
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

// 기존 유저 호환, 무기 5종 데이터 및 최고 달성 스탯(maxStats) 동기화 헬퍼
function syncCharacterProgress(char) {
    if (!char) return;
    if (typeof char.wand !== 'number') char.wand = 0;
    if (typeof char.customTitle !== 'string') char.customTitle = '';
    if (!char.titleStat) char.titleStat = 'education';
    if (!char.auraColor) char.auraColor = 'red';

    // 무기별 강화 단계 초기화 및 기존 wand 값과 양방향 동기화
    if (!char.weapons || typeof char.weapons !== 'object') {
        char.weapons = {
            wand: char.wand || 0,
            greatsword: 0,
            daggers: 0,
            bow: 0,
            chakram: 0
        };
    } else {
        if (typeof char.weapons.wand !== 'number') char.weapons.wand = char.wand || 0;
        else char.wand = Math.max(char.wand || 0, char.weapons.wand || 0);
        char.weapons.wand = char.wand;

        if (typeof char.weapons.greatsword !== 'number') char.weapons.greatsword = 0;
        if (typeof char.weapons.daggers !== 'number') char.weapons.daggers = 0;
        if (typeof char.weapons.bow !== 'number') char.weapons.bow = 0;
        if (typeof char.weapons.chakram !== 'number') char.weapons.chakram = 0;
    }

    // 무기 해금 여부 초기화
    if (!char.unlockedWeapons || typeof char.unlockedWeapons !== 'object') {
        char.unlockedWeapons = {
            wand: true,
            greatsword: false,
            daggers: false,
            bow: false,
            chakram: false
        };
    } else {
        char.unlockedWeapons.wand = true;
        if (typeof char.unlockedWeapons.greatsword !== 'boolean') char.unlockedWeapons.greatsword = false;
        if (typeof char.unlockedWeapons.daggers !== 'boolean') char.unlockedWeapons.daggers = false;
        if (typeof char.unlockedWeapons.bow !== 'boolean') char.unlockedWeapons.bow = false;
        if (typeof char.unlockedWeapons.chakram !== 'boolean') char.unlockedWeapons.chakram = false;
    }

    // 현재 장착 중인 무기
    if (!char.equippedWeapon || !WEAPON_SPECS[char.equippedWeapon] || !char.unlockedWeapons[char.equippedWeapon]) {
        char.equippedWeapon = 'wand';
    }

    // 역대 최고 달성 기록(maxStats) 동기화
    if (!char.maxStats) {
        char.maxStats = {
            education: char.education || 0,
            appearance: char.appearance || 0,
            wealth: char.wealth || 0,
            iq: char.iq !== undefined ? char.iq : 100,
            stamina: char.stamina || 0,
            personality: char.personality || 0,
            wand: char.weapons.wand || 0,
            greatsword: char.weapons.greatsword || 0,
            daggers: char.weapons.daggers || 0,
            bow: char.weapons.bow || 0,
            chakram: char.weapons.chakram || 0
        };
    } else {
        char.maxStats.education = Math.max(char.maxStats.education || 0, char.education || 0);
        char.maxStats.appearance = Math.max(char.maxStats.appearance || 0, char.appearance || 0);
        char.maxStats.wealth = Math.max(char.maxStats.wealth || 0, char.wealth || 0);
        char.maxStats.iq = Math.max(char.maxStats.iq || 100, char.iq !== undefined ? char.iq : 100);
        char.maxStats.stamina = Math.max(char.maxStats.stamina || 0, char.stamina || 0);
        char.maxStats.personality = Math.max(char.maxStats.personality || 0, char.personality || 0);
        char.maxStats.wand = Math.max(char.maxStats.wand || 0, char.weapons.wand || 0);
        char.maxStats.greatsword = Math.max(char.maxStats.greatsword || 0, char.weapons.greatsword || 0);
        char.maxStats.daggers = Math.max(char.maxStats.daggers || 0, char.weapons.daggers || 0);
        char.maxStats.bow = Math.max(char.maxStats.bow || 0, char.weapons.bow || 0);
        char.maxStats.chakram = Math.max(char.maxStats.chakram || 0, char.weapons.chakram || 0);
    }
}

// 현재 장착 무기 레벨 반환
function getEquippedWeaponLevel(c) {
    if (!c) return 0;
    const eq = c.equippedWeapon || 'wand';
    if (c.weapons && typeof c.weapons[eq] === 'number') {
        return c.weapons[eq];
    }
    return eq === 'wand' ? (c.wand || 0) : 0;
}

// 전투력 계산: 6대 스탯 강화합 + (현재 장착 중인 무기 강화단계 * 10)
function calcCombatPower(c) {
    if (!c) return 0;
    const iqLv = Math.max(0, (c.iq !== undefined ? c.iq : 100) - 100);
    const sixStatSum = iqLv + (c.education || 0) + (c.appearance || 0) + (c.wealth || 0) + (c.stamina || 0) + (c.personality || 0);
    const weaponScore = getEquippedWeaponLevel(c) * 10;
    return sixStatSum + weaponScore;
}

// 대사부 무기 해금 자격 검사 헬퍼
function canUnlockWeapon(char, weaponKey) {
    const spec = WEAPON_SPECS[weaponKey];
    if (!spec) return false;
    if (!spec.unlockStat) return true;
    const maxS = char.maxStats || {};
    const currentVal = spec.unlockStat === 'iq' ? (char.iq !== undefined ? char.iq : 100) : (char[spec.unlockStat] || 0);
    const bestVal = Math.max(currentVal, maxS[spec.unlockStat] || (spec.unlockStat === 'iq' ? 100 : 0));
    return bestVal >= spec.unlockReq;
}

// ================= [계정 및 인증 API] =================

// 1. 회원가입 API
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
                weapons: {
                    wand: 0,
                    greatsword: 0,
                    daggers: 0,
                    bow: 0,
                    chakram: 0
                },
                unlockedWeapons: {
                    wand: true,
                    greatsword: false,
                    daggers: false,
                    bow: false,
                    chakram: false
                },
                maxStats: {
                    education: 0,
                    appearance: 0,
                    wealth: 0,
                    iq: 100,
                    stamina: 0,
                    personality: 0,
                    wand: 0,
                    greatsword: 0,
                    daggers: 0,
                    bow: 0,
                    chakram: 0
                },
                customTitle: '',
                titleStat: 'education',
                auraColor: 'red',
                enhanceTokens: MAX_TOKENS,
                lastTokenRefill: new Date()
            }
        });

        await user.save();
        res.status(201).json({ message: '가입 완료! 로그인해주세요.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: '회원가입 처리 중 오류 발생' });
    }
});

// 2. 로그인 API
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

// 3. 아이디 찾기
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

// 4. 비밀번호 재설정
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

// 5. 유저 본인 계정 영구 삭제 (회원 탈퇴)
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

        await User.deleteOne({ _id: user._id });
        res.json({ success: true, message: '캐릭터와 계정 정보가 완전히 삭제되었습니다.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '계정 삭제 처리 중 오류가 발생했습니다.' });
    }
});

// 6. 관리자 마스터 키 기반 강제 계정 삭제
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

        res.json({ success: true, message: `[관리자] '${targetUsername}' 계정이 강제 영구 삭제되었습니다.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '관리자 삭제 처리 중 오류가 발생했습니다.' });
    }
});

// 7. 서열 랭킹 조회 API (상위 50위, 전투력 기준)
app.get('/api/rankings', async (req, res) => {
    try {
        const users = await User.find({})
            .select('nickname character')
            .lean();

        const rankingList = users.map(u => {
            const c = u.character || {};
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
                weapons: c.weapons || { wand: c.wand || 0, greatsword: 0, daggers: 0, bow: 0, chakram: 0 },
                unlockedWeapons: c.unlockedWeapons || { wand: true },
                maxStats: c.maxStats || {},
                customTitle: c.customTitle || '',
                titleStat: c.titleStat || 'education',
                auraColor: c.auraColor || 'red',
                totalScore
            };
        }).sort((a, b) => b.totalScore - a.totalScore).slice(0, 50).map((item, idx) => ({ rank: idx + 1, ...item }));

        res.json({ rankings: rankingList });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '랭킹 로드 실패' });
    }
});

// ================= [월드(60x15 확장: 기숙사 + 동쪽숲1 + 동쪽숲2) 및 몬스터 시스템] =================
const DORM_WIDTH = 20;
const FOREST1_END = 40;
const MAP_WIDTH = 60;  // 0~19: 기숙사 홀, 20~39: 동쪽숲1, 40~59: 동쪽숲2 (역병의 숲)
const MAP_HEIGHT = 15;

const OBSTACLES = [
    // [좌측 0~19: 기숙사 내부 구조물]
    // 상단 중앙: 대형 마법 벽난로
    { x: 9, y: 1, type: 'fireplace' }, { x: 10, y: 1, type: 'fireplace' },

    // 상단 좌우: 고딕 아치 창문 & 서가
    { x: 2, y: 1, type: 'window' }, { x: 3, y: 1, type: 'window' },
    { x: 16, y: 1, type: 'window' }, { x: 17, y: 1, type: 'window' },
    { x: 6, y: 1, type: 'bookshelf' }, { x: 13, y: 1, type: 'bookshelf' },

    // 기숙사 4명의 NPC 배치 (신규 스승 NPC '대사부' 추가!)
    { x: 4, y: 3, type: 'npc_helicopter' },  // 헬리콥터 (좌측 구역)
    { x: 15, y: 3, type: 'npc_nong' },       // 농 잊을리 (우측 구역)
    { x: 10, y: 11, type: 'npc_haerin' },    // 해린이언니 (하단 중앙 구역)
    { x: 17, y: 7, type: 'npc_master' },     // 대사부 (동쪽 출구 앞 명당 - 무기 전수 스승)

    // 내부 기둥 및 마법 연구 테이블
    { x: 3, y: 7, type: 'pillar' }, { x: 15, y: 7, type: 'pillar' },
    { x: 3, y: 11, type: 'table' }, { x: 16, y: 11, type: 'table' },

    // [경계선 X=20: 기숙사 - 동쪽숲1 연결 아치 게이트 기둥]
    { x: 20, y: 1, type: 'gate_pillar' },
    { x: 20, y: 2, type: 'gate_pillar' },
    { x: 20, y: 3, type: 'gate_pillar' },
    { x: 20, y: 11, type: 'gate_pillar' },
    { x: 20, y: 12, type: 'gate_pillar' },
    { x: 20, y: 13, type: 'gate_pillar' },

    // [중앙 21~39: 동쪽숲1 자연 장애물]
    { x: 23, y: 3, type: 'forest_tree' },
    { x: 28, y: 2, type: 'crystal_rock' },
    { x: 34, y: 3, type: 'forest_tree' },
    { x: 25, y: 7, type: 'crystal_rock' },
    { x: 31, y: 7, type: 'forest_tree' },
    { x: 37, y: 6, type: 'crystal_rock' },
    { x: 24, y: 12, type: 'forest_tree' },
    { x: 30, y: 12, type: 'crystal_rock' },
    { x: 36, y: 11, type: 'forest_tree' },

    // [경계선 X=40: 동쪽숲1 - 동쪽숲2 연결 아치 게이트 기둥]
    { x: 40, y: 1, type: 'gate_pillar' },
    { x: 40, y: 2, type: 'gate_pillar' },
    { x: 40, y: 3, type: 'gate_pillar' },
    { x: 40, y: 11, type: 'gate_pillar' },
    { x: 40, y: 12, type: 'gate_pillar' },
    { x: 40, y: 13, type: 'gate_pillar' },

    // [우측 41~59: 동쪽숲2 (질병 테마 역병의 숲) 장애물]
    { x: 43, y: 3, type: 'plague_tree' },
    { x: 49, y: 2, type: 'toxic_rock' },
    { x: 55, y: 3, type: 'plague_tree' },
    { x: 45, y: 8, type: 'toxic_rock' },
    { x: 52, y: 7, type: 'plague_tree' },
    { x: 44, y: 12, type: 'plague_tree' },
    { x: 50, y: 12, type: 'toxic_rock' },
    { x: 56, y: 11, type: 'plague_tree' }
];

const players = {};
const monsters = {};

// 동쪽숲1 & 동쪽숲2 몬스터 스펙 정의 (독감 거수는 2x2 크기 적용)
const MONSTER_SPECS = {
    // [동쪽숲1 몬스터]
    mandrake: {
        type: 'mandrake',
        name: '아기 맨드레이크',
        zone: 1,
        size: 1,
        maxHp: 500,
        moveInterval: 2800,
        dropRate: 0.10,
        bonusDropRate: 0,
        aggroRange: 0
    },
    slime: {
        type: 'slime',
        name: '어둠의 마법 슬라임',
        zone: 1,
        size: 1,
        maxHp: 1500,
        moveInterval: 1700,
        dropRate: 0.30,
        bonusDropRate: 0,
        aggroRange: 4
    },
    wolf: {
        type: 'wolf',
        name: '변종 늑대 마수',
        zone: 1,
        size: 1,
        maxHp: 3500,
        moveInterval: 1100,
        dropRate: 0.70,
        bonusDropRate: 0,
        aggroRange: 6
    },
    // [동쪽숲2 질병 몬스터]
    cold_virus: {
        type: 'cold_virus',
        name: '감기 바이러스',
        zone: 2,
        size: 1,
        maxHp: 4500,
        moveInterval: 2200,
        dropRate: 0.75,
        bonusDropRate: 0,
        aggroRange: 0
    },
    cavity_germs: {
        type: 'cavity_germs',
        name: '충치균 악마',
        zone: 2,
        size: 1,
        maxHp: 6500,
        moveInterval: 1350,
        dropRate: 0.85,
        bonusDropRate: 0,
        aggroRange: 5
    },
    flu_behemoth: {
        type: 'flu_behemoth',
        name: '독감 거수',
        zone: 2,
        size: 2, // 2x2 타일 거대 몬스터
        maxHp: 9000,
        moveInterval: 1050,
        dropRate: 1.00,      // 100% 확정 기회 +1
        bonusDropRate: 0.20, // 20% 확률로 기회 추가 +1 (총 +2)
        aggroRange: 7.5
    }
};

// 정수 타일 충돌 체크 (1x1 및 2x2 대형 몬스터 영역 모두 지원)
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

// 360도 자유 이동용 연속 좌표(Float) 장애물 충돌 판정
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
    const minX = zone === 2 ? 41 : 21;
    const maxX = (zone === 2 ? 58 : 38) - (size - 1);
    const minY = 2;
    const maxY = 13 - (size - 1);

    for (let attempt = 0; attempt < 120; attempt++) {
        const rx = minX + Math.floor(Math.random() * (maxX - minX + 1));
        const ry = minY + Math.floor(Math.random() * (maxY - minY + 1));
        if (!isTileBlocked(rx, ry, ignoreMonsterId, size)) {
            return { x: rx, y: ry };
        }
    }
    return { x: zone === 2 ? 47 : 26, y: 6 };
}

function initMonsters() {
    const spawnPlan = [
        // 동쪽숲1 (9마리)
        'mandrake', 'mandrake', 'mandrake', 'mandrake',
        'slime', 'slime', 'slime',
        'wolf', 'wolf',
        // 동쪽숲2 (9마리: 감기 바이러스 4, 충치균 악마 3, 2x2 독감 거수 2)
        'cold_virus', 'cold_virus', 'cold_virus', 'cold_virus',
        'cavity_germs', 'cavity_germs', 'cavity_germs',
        'flu_behemoth', 'flu_behemoth'
    ];
    spawnPlan.forEach((typeKey, idx) => {
        const spec = MONSTER_SPECS[typeKey];
        const id = `mon_${idx + 1}`;
        const pos = getRandomHuntingTile(spec.zone, spec.size, id);
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
            bonusDropRate: spec.bonusDropRate || 0,
            aggroRange: spec.aggroRange,
            alive: true,
            lastMoveTime: Date.now() + Math.floor(Math.random() * 1500)
        };
    });
}
initMonsters();

// 서버 사이드 몬스터 AI 이동 루프 (구역별 경계 및 2x2 충돌 지원)
setInterval(() => {
    const now = Date.now();
    const dirs = ['up', 'down', 'left', 'right'];

    for (const mid in monsters) {
        const m = monsters[mid];
        if (!m.alive) continue;
        if (now - m.lastMoveTime < m.moveInterval) continue;
        m.lastMoveTime = now;

        const prevX = m.x;
        const prevY = m.y;
        const prevDir = m.dir;
        const mSize = m.size || 1;
        const centerOffset = (mSize - 1) * 0.5;
        const mCenterX = m.x + centerOffset;
        const mCenterY = m.y + centerOffset;

        let chosenDir = dirs[Math.floor(Math.random() * dirs.length)];

        // 추격 반경(aggroRange)이 있는 몬스터는 같은 구역 내 가장 가까운 유저 추격
        if (m.aggroRange > 0) {
            let nearestPlayer = null;
            let minDist = Infinity;
            for (const pid in players) {
                const pl = players[pid];
                if (m.zone === 1 && (pl.x < 20.5 || pl.x >= 40.0)) continue;
                if (m.zone === 2 && pl.x < 40.5) continue;

                const d = Math.hypot(pl.x - mCenterX, pl.y - mCenterY);
                if (d <= m.aggroRange && d < minDist) {
                    minDist = d;
                    nearestPlayer = pl;
                }
            }

            if (nearestPlayer && minDist > (mSize === 2 ? 1.4 : 0.9)) {
                const dx = nearestPlayer.x - mCenterX;
                const dy = nearestPlayer.y - mCenterY;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    chosenDir = dx > 0 ? 'right' : 'left';
                } else {
                    chosenDir = dy > 0 ? 'down' : 'up';
                }
            }
        }

        let tx = m.x;
        let ty = m.y;
        if (chosenDir === 'up') ty -= 1;
        else if (chosenDir === 'down') ty += 1;
        else if (chosenDir === 'left') tx -= 1;
        else if (chosenDir === 'right') tx += 1;

        m.dir = chosenDir;

        const minX = m.zone === 2 ? 41 : 21;
        const maxX = (m.zone === 2 ? 58 : 38) - (mSize - 1);
        const minY = 2;
        const maxY = 13 - (mSize - 1);

        if (tx >= minX && tx <= maxX && ty >= minY && ty <= maxY && !isTileBlocked(tx, ty, m.id, mSize)) {
            m.x = tx;
            m.y = ty;
        }

        if (m.x !== prevX || m.y !== prevY || m.dir !== prevDir) {
            io.emit('monsterMoved', {
                id: m.id,
                x: m.x,
                y: m.y,
                dir: m.dir
            });
        }
    }
}, 200);

// ================= [소켓 통신] =================
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
        if (players[sid].userId === userId) {
            delete players[sid];
            io.emit('playerLeft', sid);
        }
    }

    const dbUser = await User.findById(userId);
    const char = dbUser ? dbUser.character : {
        gender: 'male', education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0, wand: 0,
        equippedWeapon: 'wand',
        weapons: { wand: 0, greatsword: 0, daggers: 0, bow: 0, chakram: 0 },
        unlockedWeapons: { wand: true, greatsword: false, daggers: false, bow: false, chakram: false },
        maxStats: { education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0, wand: 0, greatsword: 0, daggers: 0, bow: 0, chakram: 0 },
        customTitle: '', titleStat: 'education', auraColor: 'red',
        enhanceTokens: MAX_TOKENS, lastTokenRefill: new Date()
    };
    syncCharacterProgress(char);
    const tokenState = resolveTokens(char);

    if (dbUser) {
        dbUser.character.enhanceTokens = tokenState.tokens;
        dbUser.character.lastTokenRefill = tokenState.lastRefill;
        dbUser.markModified('character');
        await dbUser.save();
    }

    // 스폰 위치는 항상 안전한 기숙사 내부 (X: 2 ~ 16, Y: 2 ~ 12)
    let spawnX = 5, spawnY = 7;
    while (isTileBlocked(spawnX, spawnY)) {
        spawnX = Math.floor(Math.random() * (DORM_WIDTH - 5)) + 2;
        spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 4)) + 2;
    }

    players[socket.id] = {
        id: socket.id,
        userId: userId,
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
        chatTimer: null,
        lastMoveTime: 0,
        lastAttackTime: 0
    };

    socket.emit('init', {
        myId: socket.id,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        obstacles: OBSTACLES,
        players: players,
        monsters: monsters
    });

    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 360도 자유 이동 및 무렉(Client-Side Prediction) 위치 동기화
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

            if (dist <= 4.5 && !isFloatPosBlocked(nextX, nextY)) {
                p.x = Math.max(0.2, Math.min(MAP_WIDTH - 1.2, nextX));
                p.y = Math.max(0.8, Math.min(MAP_HEIGHT - 1.2, nextY));
                socket.broadcast.emit('playerMoved', {
                    id: socket.id,
                    x: p.x,
                    y: p.y,
                    dir: p.dir,
                    angle: p.angle,
                    sprint: p.sprint
                });
            } else {
                io.emit('playerMoved', {
                    id: socket.id,
                    x: p.x,
                    y: p.y,
                    dir: p.dir,
                    angle: p.angle,
                    sprint: p.sprint,
                    reconcile: true
                });
            }
            return;
        }

        const dir = typeof payload === 'string' ? payload : payload.dir;
        if (!['up', 'down', 'left', 'right'].includes(dir)) return;

        p.dir = dir;
        p.sprint = isRunning;
        let targetX = p.x;
        let targetY = p.y;
        if (dir === 'up') { targetY -= 1; p.angle = -Math.PI / 2; }
        else if (dir === 'down') { targetY += 1; p.angle = Math.PI / 2; }
        else if (dir === 'left') { targetX -= 1; p.angle = Math.PI; }
        else if (dir === 'right') { targetX += 1; p.angle = 0; }

        if (!isFloatPosBlocked(targetX, targetY)) {
            p.x = targetX;
            p.y = targetY;
        }
        io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, dir: p.dir, angle: p.angle, sprint: isRunning });
    });

    // 무기별 공격/투사체 발사 (A키, 장착 무기별 고유 쿨타임 및 모션 동기화)
    socket.on('fireProjectile', (payload = {}) => {
        const p = players[socket.id];
        if (!p) return;

        const c = p.character || {};
        const weaponType = (c.equippedWeapon && WEAPON_SPECS[c.equippedWeapon]) ? c.equippedWeapon : 'wand';
        const wSpec = WEAPON_SPECS[weaponType];

        const now = Date.now();
        if (now - (p.lastAttackTime || 0) < wSpec.cooldownMs) return;
        p.lastAttackTime = now;

        if (typeof payload.x === 'number' && typeof payload.y === 'number') {
            if (Math.hypot(payload.x - p.x, payload.y - p.y) <= 3.5 && !isFloatPosBlocked(payload.x, payload.y)) {
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

        io.emit('projectileFired', {
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
            wandLv: weaponLv,
            swingSide: swingSide,
            attackPower: combatPower
        });
    });

    // 사냥터 몬스터 피격 및 처치 보상('기회' 획득) 처리
    socket.on('hitMonster', async (payload) => {
        const p = players[socket.id];
        if (!p || !payload || !payload.monsterId) return;

        const m = monsters[payload.monsterId];
        if (!m || !m.alive) return;

        const c = p.character || {};
        const eqWeapon = (c.equippedWeapon && WEAPON_SPECS[c.equippedWeapon]) ? c.equippedWeapon : 'wand';
        const basePower = calcCombatPower(c);

        // 무기별 대미지 계수 검증 (스플래시 폭발 등 반영)
        let mult = WEAPON_SPECS[eqWeapon].baseMult;
        if (payload.isSplash && eqWeapon === 'wand') {
            mult = WEAPON_SPECS.wand.splashMult;
        }
        const damage = Math.max(1, Math.round(basePower * mult));

        m.hp = Math.max(0, m.hp - damage);

        if (m.hp > 0) {
            io.emit('monsterDamaged', {
                id: m.id,
                hp: m.hp,
                maxHp: m.maxHp,
                damage: damage,
                attackerId: socket.id,
                x: m.x,
                y: m.y
            });
        } else {
            m.alive = false;
            let gainedTokenCount = 0;
            if (Math.random() < m.dropRate) {
                gainedTokenCount += 1;
                if (m.bonusDropRate && Math.random() < m.bonusDropRate) {
                    gainedTokenCount += 1;
                }
            }

            let updatedTokens = p.enhanceTokens;
            let updatedLastRefill = p.lastTokenRefill;

            if (gainedTokenCount > 0) {
                try {
                    const u = await User.findById(p.userId);
                    if (u) {
                        const tokenState = resolveTokens(u.character);
                        const nextTokens = Math.min(MAX_TOKENS, tokenState.tokens + gainedTokenCount);
                        const nextRefill = nextTokens >= MAX_TOKENS ? new Date() : tokenState.lastRefill;

                        u.character.enhanceTokens = nextTokens;
                        u.character.lastTokenRefill = nextRefill;
                        u.markModified('character');
                        await u.save();

                        updatedTokens = nextTokens;
                        updatedLastRefill = nextRefill.getTime();
                        p.enhanceTokens = updatedTokens;
                        p.lastTokenRefill = updatedLastRefill;
                    }
                } catch (err) {
                    console.error('몬스터 보상 지급 오류:', err);
                }
            }

            io.emit('monsterKilled', {
                id: m.id,
                name: m.name,
                damage: damage,
                attackerId: socket.id,
                attackerName: p.name,
                x: m.x,
                y: m.y,
                rewarded: gainedTokenCount > 0,
                rewardCount: gainedTokenCount,
                tokens: updatedTokens,
                lastRefill: updatedLastRefill
            });

            // 4.5초 뒤 해당 구역 내 무작위 빈 타일에 리스폰
            setTimeout(() => {
                const pos = getRandomHuntingTile(m.zone || 1, m.size || 1, m.id);
                m.x = pos.x;
                m.y = pos.y;
                m.hp = m.maxHp;
                m.alive = true;
                m.lastMoveTime = Date.now();
                io.emit('monsterRespawned', m);
            }, 4500);
        }
    });

    // 대사부 NPC를 통한 신규 무기 전수(해금) 소켓 이벤트
    socket.on('unlockWeapon', async (weaponType, callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });
        if (!WEAPON_SPECS[weaponType]) return callback && callback({ success: false, message: '존재하지 않는 무기입니다.' });

        const u = await User.findById(userId);
        if (!u) return callback && callback({ success: false, message: '계정 정보를 찾을 수 없습니다.' });
        syncCharacterProgress(u.character);

        if (u.character.unlockedWeapons[weaponType]) {
            return callback && callback({ success: false, message: '이미 전수받은 무기입니다.' });
        }

        if (!canUnlockWeapon(u.character, weaponType)) {
            return callback && callback({
                success: false,
                message: `아직 수련이 부족하구나! [${WEAPON_SPECS[weaponType].unlockDesc}] 조건을 먼저 달성하고 오너라.`
            });
        }

        u.character.unlockedWeapons[weaponType] = true;
        u.character.equippedWeapon = weaponType;
        u.markModified('character');
        await u.save();

        p.character = u.character;
        io.emit('playerStatUpdated', {
            id: socket.id,
            character: u.character
        });

        if (callback) {
            callback({
                success: true,
                weaponType,
                character: u.character,
                message: `허허, 훌륭하구나! 이제부터 [${WEAPON_SPECS[weaponType].name}]을(를) 네 무기로 쓸 수 있다!`
            });
        }
    });

    // 무기 장착 교체 소켓 이벤트
    socket.on('equipWeapon', async (weaponType, callback) => {
        const p = players[socket.id];
        if (!p) return callback && callback({ success: false, message: '플레이어 정보 없음' });
        if (!WEAPON_SPECS[weaponType]) return callback && callback({ success: false, message: '존재하지 않는 무기입니다.' });

        const u = await User.findById(userId);
        if (!u) return callback && callback({ success: false, message: '계정 정보를 찾을 수 없습니다.' });
        syncCharacterProgress(u.character);

        if (!u.character.unlockedWeapons[weaponType]) {
            return callback && callback({
                success: false,
                message: `아직 해금되지 않은 무기입니다. 기숙사의 [대사부] NPC에게서 전수받으세요!`
            });
        }

        u.character.equippedWeapon = weaponType;
        u.markModified('character');
        await u.save();

        p.character = u.character;
        io.emit('playerStatUpdated', {
            id: socket.id,
            character: u.character
        });

        if (callback) {
            callback({
                success: true,
                weaponType,
                character: u.character,
                message: `[${WEAPON_SPECS[weaponType].name}] 장착 완료!`
            });
        }
    });

    // 유저 칭호 및 기운 발산 색상 변경 소켓 이벤트
    socket.on('updatePreferences', async (prefs) => {
        const p = players[socket.id];
        if (!p || !prefs) return;

        const validStats = ['education', 'appearance', 'wealth', 'iq', 'stamina', 'personality', ...WEAPON_KEYS];
        const validColors = ['red', 'yellow', 'blue', 'green'];

        const u = await User.findById(userId);
        if (!u) return;
        syncCharacterProgress(u.character);

        if (prefs.titleStat && validStats.includes(prefs.titleStat)) {
            u.character.titleStat = prefs.titleStat;
        }
        if (typeof prefs.customTitle === 'string') {
            u.character.customTitle = prefs.customTitle.trim().slice(0, 30);
        }
        if (prefs.auraColor && validColors.includes(prefs.auraColor)) {
            u.character.auraColor = prefs.auraColor;
        }
        if (prefs.equippedWeapon && WEAPON_SPECS[prefs.equippedWeapon] && u.character.unlockedWeapons[prefs.equippedWeapon]) {
            u.character.equippedWeapon = prefs.equippedWeapon;
        }

        u.markModified('character');
        await u.save();
        p.character = u.character;

        io.emit('playerStatUpdated', {
            id: socket.id,
            character: u.character
        });
    });

    // 6대 스탯 + 무기 5종 개별 강화 소켓 이벤트
    socket.on('tryEnhanceStat', async (statType, callback) => {
        const p = players[socket.id];
        if (!p) return callback({ success: false, message: '플레이어 정보 없음' });

        const u = await User.findById(userId);
        if (!u) return callback({ success: false, message: '유저 계정 미확인' });
        syncCharacterProgress(u.character);

        const isWeaponStat = WEAPON_KEYS.includes(statType);
        if (isWeaponStat) {
            if (!u.character.unlockedWeapons[statType]) {
                return callback({
                    success: false,
                    message: `아직 전수받지 않은 무기입니다! 기숙사의 [대사부] NPC에게서 먼저 전수받으세요.`
                });
            }
            const curWepLv = u.character.weapons[statType] || 0;
            if (curWepLv >= 30) {
                return callback({
                    success: false,
                    message: `${WEAPON_SPECS[statType].name}이(가) 이미 최고 단계(+30강)에 도달했습니다!`
                });
            }
        }

        const tokenState = resolveTokens(u.character);
        if (tokenState.tokens < 1) {
            return callback({
                success: false,
                noTokens: true,
                tokens: tokenState.tokens,
                lastRefill: tokenState.lastRefill.getTime(),
                message: '기회가 부족합니다. (1분당 1회 충전 또는 사냥터 몬스터 처치)'
            });
        }

        let currentTokens = tokenState.tokens - 1;
        let newLastRefill = tokenState.lastRefill;
        if (tokenState.tokens === MAX_TOKENS) {
            newLastRefill = new Date();
        }

        const rand = Math.random() * 100;
        let result = { type: 'keep', change: 0, message: '아무 일도 일어나지 않았습니다.' };

        if (isWeaponStat) {
            const wName = WEAPON_SPECS[statType].name;
            const curLv = u.character.weapons[statType] || 0;
            const successProb = ENHANCE_RATES[curLv] !== undefined ? ENHANCE_RATES[curLv] : 0;

            if (Math.random() < successProb) {
                const nextLv = curLv + 1;
                u.character.weapons[statType] = nextLv;
                if (statType === 'wand') u.character.wand = nextLv;
                result = {
                    type: 'success',
                    change: 1,
                    message: `⚔️ ${wName} 강화 성공! (+${nextLv}강 달성 · 장착 시 전투력 +10 상승!)`
                };
            } else {
                if (curLv > 0 && Math.random() < 0.5) {
                    const nextLv = curLv - 1;
                    u.character.weapons[statType] = nextLv;
                    if (statType === 'wand') u.character.wand = nextLv;
                    result = {
                        type: 'fail',
                        change: -1,
                        message: `💥 ${wName} 연성 실패! 마력이 역류하여 단계가 하락했습니다 (-1강 → +${nextLv}강).`
                    };
                } else {
                    result = {
                        type: 'keep',
                        change: 0,
                        message: `🔨 ${wName} 연성 실패... 다행히 단계가 유지되었습니다 (+${curLv}강).`
                    };
                }
            }
        } else {
            switch (statType) {
                // 1. 학력: 성공 1% (+1), 유지 99%
                case 'education': {
                    if (rand < 1.0) {
                        u.character.education += 1;
                        result = { type: 'success', change: 1, message: '🎉 학력 강화 성공! 학위가 올랐습니다. (전투력 +1)' };
                    }
                    break;
                }

                // 2. 외모: 성공 2% (+1), 유지 97%, 실패 1% (-1) [0강 보호]
                case 'appearance': {
                    if (rand < 2.0) {
                        u.character.appearance += 1;
                        result = { type: 'success', change: 1, message: '✨ 외모 관리 성공! 아우라가 달라졌습니다. (전투력 +1)' };
                    } else if (rand >= 99.0 && u.character.appearance > 0) {
                        u.character.appearance -= 1;
                        result = { type: 'fail', change: -1, message: '💦 관리 소홀... 외모가 조금 서운해졌습니다. (전투력 -1)' };
                    }
                    break;
                }

                // 3. 재력: 성공 1% (+1), 대성공 0.99% (+2), 유지 97%, 실패 1% (-1), 대폭락 0.01% (-100강) [0강 보호]
                case 'wealth': {
                    if (u.character.wealth === 0) {
                        if (rand < 1.0) {
                            u.character.wealth += 1;
                            result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 소득이 늘었습니다. (전투력 +1)' };
                        } else if (rand < 1.99) {
                            u.character.wealth += 2;
                            result = { type: 'great_success', change: 2, message: '💎 재력 대성공!! 투자 대박 (+2강 · 전투력 +2)!' };
                        }
                    } else {
                        if (rand < 1.0) {
                            u.character.wealth += 1;
                            result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 자산이 증식되었습니다. (전투력 +1)' };
                        } else if (rand < 1.99) {
                            u.character.wealth += 2;
                            result = { type: 'great_success', change: 2, message: '💎 재력 대성공!! 벼락부자가 되었습니다 (+2강 · 전투력 +2)!' };
                        } else if (rand >= 98.99 && rand < 99.99) {
                            u.character.wealth -= 1;
                            result = { type: 'fail', change: -1, message: '📉 투자 손실... 자산이 줄었습니다 (-1강 · 전투력 -1).' };
                        } else if (rand >= 99.99) {
                            const prevWealth = u.character.wealth;
                            u.character.wealth = Math.max(0, prevWealth - 100);
                            const dropped = u.character.wealth - prevWealth;
                            result = {
                                type: 'catastrophe',
                                change: dropped,
                                message: `🚨 0.01% 대폭락!! 자산 시장의 거대한 충격으로 재력이 100강 하락했습니다! (현재 +${u.character.wealth}강)`
                            };
                        }
                    }
                    break;
                }

                // 4. 지능: 기본값 IQ100 / 성공 1% (+1), 대성공 1% (+2), 유지 97%, 실패 1% (-1) [IQ 0 보호]
                case 'iq': {
                    if (rand < 1.0) {
                        u.character.iq += 1;
                        result = { type: 'success', change: 1, message: '🧠 지능 향상 성공 (+1 IQ · 전투력 +1)!' };
                    } else if (rand < 2.0) {
                        u.character.iq += 2;
                        result = { type: 'great_success', change: 2, message: '💡 번뜩이는 영감 폭발 (+2 IQ · 전투력 +2)!' };
                    } else if (rand >= 99.0 && u.character.iq > 0) {
                        u.character.iq -= 1;
                        result = { type: 'fail', change: -1, message: '😵 뇌정지가 왔습니다 (-1 IQ).' };
                    }
                    break;
                }

                // 5. 체력: 성공 3% (+1), 유지 96.5%, 실패 0.5% (-1) [0강 보호]
                case 'stamina': {
                    if (rand < 3.0) {
                        u.character.stamina += 1;
                        result = { type: 'success', change: 1, message: '💪 체력 강화 성공! 피지컬이 상승했습니다. (전투력 +1)' };
                    } else if (rand >= 99.5 && u.character.stamina > 0) {
                        u.character.stamina -= 1;
                        result = { type: 'fail', change: -1, message: '🩹 무리한 운동으로 근육통이 왔습니다 (-1강 · 전투력 -1).' };
                    }
                    break;
                }

                // 6. 성격: 성공 2% (+1), 대성공 1% (+2), 유지 96%, 실패 1% (-1) [0강 보호]
                case 'personality': {
                    if (rand < 2.0) {
                        u.character.personality += 1;
                        result = { type: 'success', change: 1, message: '🍀 성격 수양 성공! 인성이 깊어졌습니다. (전투력 +1)' };
                    } else if (rand < 3.0) {
                        u.character.personality += 2;
                        result = { type: 'great_success', change: 2, message: '🕊️ 성격 대성공!! 해탈의 경지에 다가섭니다 (+2강 · 전투력 +2)!' };
                    } else if (rand >= 99.0 && u.character.personality > 0) {
                        u.character.personality -= 1;
                        result = { type: 'fail', change: -1, message: '💢 욱하는 마음에 인성이 깎였습니다 (-1강 · 전투력 -1).' };
                    }
                    break;
                }

                default:
                    return callback({ success: false, message: '알 수 없는 스탯입니다.' });
            }
        }

        // 최고 달성 기록(maxStats) 동기화 후 DB 저장
        syncCharacterProgress(u.character);
        u.character.enhanceTokens = currentTokens;
        u.character.lastTokenRefill = newLastRefill;
        u.markModified('character');
        await u.save();

        p.character = u.character;
        p.enhanceTokens = currentTokens;
        p.lastTokenRefill = newLastRefill.getTime();

        io.emit('playerStatUpdated', {
            id: socket.id,
            character: u.character
        });

        callback({
            success: true,
            result,
            character: u.character,
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

        if (p.chatTimer) clearTimeout(p.chatTimer);
        p.chatTimer = setTimeout(() => {
            if (players[socket.id]) {
                players[socket.id].chatText = '';
                io.emit('playerChatClear', { id: socket.id });
            }
        }, 4500);
    });

    // 기운 발산(Space) 전체 유저에게 실시간 공유
    socket.on('emitAura', () => {
        if (!players[socket.id]) return;
        socket.broadcast.emit('playerAura', { id: socket.id });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🌟 인생온라인 서버 가동 중: 포트 ${PORT}`);
});