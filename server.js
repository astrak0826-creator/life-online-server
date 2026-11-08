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
    .then(() => console.log('🍃 MongoDB Atlas 인생온라인:삼국지 DB 연결 완료!'))
    .catch(err => console.error('❌ DB 연결 에러:', err));

const MAX_TOKENS = 120;
const REFILL_INTERVAL_MS = 60 * 1000; // 1분당 1개 충전

// 국가별 시작 좌표 및 기본 지급 무기
const KINGDOM_CONFIG = {
    goguryeo: { name: '고구려', spawnX: 95, spawnY: 24, startWeapon: 'bow', secondWeapon: 'spear' },
    baekje:   { name: '백제',   spawnX: 62, spawnY: 120, startWeapon: 'sword', secondWeapon: 'bow' },
    silla:    { name: '신라',   spawnX: 128, spawnY: 122, startWeapon: 'spear', secondWeapon: 'sword' }
};

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

// 기존 유저 데이터 마이그레이션 및 maxStats 동기화 헬퍼
function ensureCharacterDefaults(char) {
    if (!char.kingdom) char.kingdom = 'silla';
    if (!char.maxStats) {
        char.maxStats = {
            education: char.education || 0,
            appearance: char.appearance || 0,
            wealth: char.wealth || 0,
            iq: char.iq || 100,
            stamina: char.stamina || 0,
            personality: char.personality || 0
        };
    } else {
        char.maxStats.education = Math.max(char.maxStats.education || 0, char.education || 0);
        char.maxStats.appearance = Math.max(char.maxStats.appearance || 0, char.appearance || 0);
        char.maxStats.wealth = Math.max(char.maxStats.wealth || 0, char.wealth || 0);
        char.maxStats.iq = Math.max(char.maxStats.iq || 100, char.iq || 100);
        char.maxStats.stamina = Math.max(char.maxStats.stamina || 0, char.stamina || 0);
        char.maxStats.personality = Math.max(char.maxStats.personality || 0, char.personality || 0);
    }

    if (typeof char.customTitle !== 'string') char.customTitle = '';
    if (!Array.isArray(char.unlockedSpecialTitles)) char.unlockedSpecialTitles = [];
    if (!char.level) char.level = 1;
    if (typeof char.exp !== 'number') char.exp = 0;
    if (typeof char.gold !== 'number') char.gold = 150;
    if (!char.materials) char.materials = { iron: 5, leather: 5 };
    if (!char.weapons || !Array.isArray(char.weapons.owned) || char.weapons.owned.length === 0) {
        const cfg = KINGDOM_CONFIG[char.kingdom] || KINGDOM_CONFIG.silla;
        char.weapons = {
            slot1: cfg.startWeapon,
            slot2: cfg.secondWeapon,
            activeSlot: 1,
            owned: [cfg.startWeapon, cfg.secondWeapon]
        };
    }
    if (!char.armor) char.armor = { helmet: 0, body: 0, boots: 0 };
    if (!Array.isArray(char.metNpcs)) char.metNpcs = [];

    const maxHp = 120 + (char.level - 1) * 20 + (char.stamina || 0) * 15 + (char.armor.body || 0) * 40;
    char.maxHp = maxHp;
    if (!char.hp || char.hp > maxHp) char.hp = maxHp;
}

// ================= [계정 및 인증 API] =================

// 1. 회원가입 API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, nickname, gender, kingdom, securityQuestion, securityAnswer } = req.body;
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

        const chosenKingdom = ['goguryeo', 'baekje', 'silla'].includes(kingdom) ? kingdom : 'silla';
        const kCfg = KINGDOM_CONFIG[chosenKingdom];

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
                kingdom: chosenKingdom,
                color: colors[Math.floor(Math.random() * colors.length)],
                education: 0,
                appearance: 0,
                wealth: 0,
                iq: 100,
                stamina: 0,
                personality: 0,
                maxStats: { education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0 },
                customTitle: '',
                unlockedSpecialTitles: [],
                titleStat: 'education',
                auraColor: chosenKingdom === 'goguryeo' ? 'red' : (chosenKingdom === 'baekje' ? 'blue' : 'yellow'),
                level: 1,
                exp: 0,
                hp: 120,
                maxHp: 120,
                gold: 150,
                materials: { iron: 5, leather: 5 },
                weapons: {
                    slot1: kCfg.startWeapon,
                    slot2: kCfg.secondWeapon,
                    activeSlot: 1,
                    owned: [kCfg.startWeapon, kCfg.secondWeapon]
                },
                armor: { helmet: 0, body: 0, boots: 0 },
                metNpcs: [],
                enhanceTokens: MAX_TOKENS,
                lastTokenRefill: new Date()
            }
        });

        await user.save();
        res.status(201).json({ message: `${kCfg.name} 무관으로 입문 등록 완료! 로그인해주세요.` });
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

        ensureCharacterDefaults(user.character);
        const tokenState = resolveTokens(user.character);
        user.character.enhanceTokens = tokenState.tokens;
        user.character.lastTokenRefill = tokenState.lastRefill;
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

// 7. 종합 랭킹 조회 API (상위 50위)
app.get('/api/rankings', async (req, res) => {
    try {
        const users = await User.find({})
            .select('nickname character')
            .lean();

        const rankingList = users.map(u => {
            const c = u.character || {};
            const totalScore = ((c.iq || 100) - 100) + (c.education || 0) + (c.appearance || 0) + (c.wealth || 0) + (c.stamina || 0) + (c.personality || 0);
            return {
                nickname: u.nickname,
                gender: c.gender || 'male',
                kingdom: c.kingdom || 'silla',
                level: c.level || 1,
                education: c.education || 0,
                appearance: c.appearance || 0,
                wealth: c.wealth || 0,
                iq: c.iq || 100,
                stamina: c.stamina || 0,
                personality: c.personality || 0,
                maxStats: c.maxStats || {},
                customTitle: c.customTitle || '',
                titleStat: c.titleStat || 'education',
                auraColor: c.auraColor || 'red',
                weapons: c.weapons || { slot1: 'spear', slot2: 'sword', activeSlot: 1 },
                armor: c.armor || { helmet: 0, body: 0, boots: 0 },
                metNpcs: c.metNpcs || [],
                totalScore
            };
        }).sort((a, b) => b.totalScore - a.totalScore).slice(0, 50).map((item, idx) => ({ rank: idx + 1, ...item }));

        res.json({ rankings: rankingList });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '랭킹 로드 실패' });
    }
});

// ================= [200x200 삼국지 월드 & 실시간 전투/몬스터/NPC] =================
const MAP_WIDTH = 200;
const MAP_HEIGHT = 200;

// 무기 제원 및 공격 범위
const WEAPON_SPECS = {
    sword:       { name: '환두대도', costGold: 100, costIron: 3, costLeather: 2, baseDmg: 22, cooldownMs: 280 },
    spear:       { name: '장창당 장창', costGold: 100, costIron: 4, costLeather: 1, baseDmg: 26, cooldownMs: 360 },
    bow:         { name: '고구려 맥궁', costGold: 120, costIron: 2, costLeather: 4, baseDmg: 24, cooldownMs: 420 },
    seven_sword: { name: '백제 칠지도', costGold: 550, costIron: 15, costLeather: 10, baseDmg: 45, cooldownMs: 480 },
    staff:       { name: '도깨비 석장', costGold: 500, costIron: 12, costLeather: 12, baseDmg: 38, cooldownMs: 520 }
};

// 역사 인물 NPC 15인 및 고증 퀴즈 데이터
const HISTORICAL_NPCS = [
    // 고구려 (북방)
    { id: 'gwanggaeto', name: '광개토대왕', kingdom: 'goguryeo', x: 95, y: 20, titleReward: '영락대왕의 기병', quizAnswer: 1 },
    { id: 'eulji',      name: '을지문덕',   kingdom: 'goguryeo', x: 82, y: 32, titleReward: '살수대첩의 지략가', quizAnswer: 2 },
    { id: 'yeongaesomun', name: '연개소문', kingdom: 'goguryeo', x: 112, y: 26, titleReward: '대막리지의 칼날', quizAnswer: 1 },
    { id: 'ondal',      name: '온달 장군',  kingdom: 'goguryeo', x: 88, y: 58, titleReward: '아차산성의 순정', quizAnswer: 3 },
    { id: 'dorim',      name: '승려 도림',  kingdom: 'goguryeo', x: 102, y: 48, titleReward: '바둑의 승부사', quizAnswer: 2 },
    // 백제 (서남부)
    { id: 'geunchogo',  name: '근초고왕',   kingdom: 'baekje',   x: 62, y: 116, titleReward: '해상제국의 패왕', quizAnswer: 1 },
    { id: 'muryeong',   name: '무령왕',     kingdom: 'baekje',   x: 52, y: 105, titleReward: '22담로의 수호자', quizAnswer: 2 },
    { id: 'seongwang',  name: '성왕',       kingdom: 'baekje',   x: 84, y: 82,  titleReward: '사비천도의 개혁가', quizAnswer: 3 },
    { id: 'gyebaek',    name: '계백 장군',  kingdom: 'baekje',   x: 75, y: 118, titleReward: '황산벌 결사대장', quizAnswer: 1 },
    { id: 'uijawang',   name: '의자왕',     kingdom: 'baekje',   x: 55, y: 132, titleReward: '해동증자의 눈물', quizAnswer: 2 },
    // 신라 (동남부)
    { id: 'jinheung',   name: '진흥왕',     kingdom: 'silla',    x: 102, y: 68, titleReward: '순수비의 개척자', quizAnswer: 1 },
    { id: 'seondeok',   name: '선덕여왕',   kingdom: 'silla',    x: 128, y: 118, titleReward: '첨성대의 혜안', quizAnswer: 3 },
    { id: 'kimyushin',  name: '김유신',     kingdom: 'silla',    x: 118, y: 125, titleReward: '용천검 화랑총관', quizAnswer: 2 },
    { id: 'isabu',      name: '이사부',     kingdom: 'silla',    x: 152, y: 72,  titleReward: '나무사자 정복자', quizAnswer: 1 },
    { id: 'bihyeong',   name: '비형랑',     kingdom: 'silla',    x: 138, y: 134, titleReward: '도깨비 대군주', quizAnswer: 2 },
    // 우산국 & 탐라국
    { id: 'uhaewang',   name: '우해왕(우산국)', kingdom: 'neutral', x: 175, y: 66, titleReward: '동해 절벽의 패자', quizAnswer: 3 },
    { id: 'goeulna',    name: '고을나(탐라국)', kingdom: 'neutral', x: 62, y: 178, titleReward: '삼을나 해양왕', quizAnswer: 1 }
];

// 몬스터 스폰 구역 및 초기화
const MONSTER_ZONES = [
    // 고구려 북방 수렵지
    { type: 'boar',   name: '개마고원 멧돼지', hp: 70,  atk: 8,  exp: 25, gold: 18, xMin: 55, xMax: 135, yMin: 12, yMax: 42, count: 16 },
    { type: 'malgal', name: '말갈족 기마병',   hp: 150, atk: 16, exp: 55, gold: 40, xMin: 40, xMax: 150, yMin: 8,  yMax: 35, count: 12 },
    // 백제 평야 & 해안
    { type: 'wolf',   name: '마한 들늑대',     hp: 65,  atk: 7,  exp: 22, gold: 16, xMin: 42, xMax: 88,  yMin: 95, yMax: 142, count: 15 },
    { type: 'pirate', name: '서해 왜구 노략꾼', hp: 140, atk: 15, exp: 50, gold: 38, xMin: 35, xMax: 65,  yMin: 125, yMax: 155, count: 10 },
    // 신라 산악 & 동해
    { type: 'bandit', name: '태백산 산적',     hp: 80,  atk: 9,  exp: 28, gold: 20, xMin: 105, xMax: 150, yMin: 92, yMax: 142, count: 15 },
    { type: 'squid',  name: '우산국 대왕오징어', hp: 220, atk: 22, exp: 85, gold: 65, xMin: 162, xMax: 192, yMin: 56, yMax: 78, count: 8 },
    // 탐라국
    { type: 'tamna_boar', name: '한라산 흑돼지왕', hp: 190, atk: 18, exp: 70, gold: 55, xMin: 48, xMax: 76, yMin: 168, yMax: 188, count: 8 },
    // 중앙 한강 유역 분쟁지 (고위험 고보상 레이드 몹)
    { type: 'tiger',  name: '중원 백두호랑이 영물', hp: 420, atk: 32, exp: 160, gold: 140, xMin: 68, xMax: 118, yMin: 52, yMax: 85, count: 10 }
];

const monsters = {};
let nextMonsterId = 1;

function spawnMonsterFromZone(zone) {
    const id = 'm_' + (nextMonsterId++);
    const x = Math.floor(Math.random() * (zone.xMax - zone.xMin + 1)) + zone.xMin;
    const y = Math.floor(Math.random() * (zone.yMax - zone.yMin + 1)) + zone.yMin;
    monsters[id] = {
        id,
        type: zone.type,
        name: zone.name,
        x,
        y,
        hp: zone.hp,
        maxHp: zone.hp,
        atk: zone.atk,
        exp: zone.exp,
        gold: zone.gold,
        zone
    };
}

MONSTER_ZONES.forEach(zone => {
    for (let i = 0; i < zone.count; i++) {
        spawnMonsterFromZone(zone);
    }
});

const players = {};

function isTileOutOfBounds(x, y) {
    return x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT;
}

// 몬스터 AI 루프 (1.2초마다 배회 및 인접 유저 공격)
setInterval(() => {
    const updatedMonsters = [];
    const playerList = Object.values(players);
    if (playerList.length === 0) return;

    for (const id in monsters) {
        const m = monsters[id];
        // 근처 8타일 이내에 플레이어가 있는지 확인
        let nearestPlayer = null;
        let minDist = 999;
        for (const p of playerList) {
            const d = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
            if (d < minDist) {
                minDist = d;
                nearestPlayer = p;
            }
        }

        if (nearestPlayer && minDist === 1) {
            // 인접 시 플레이어 공격
            const armorDef = ((nearestPlayer.character.armor?.body || 0) * 3) + ((nearestPlayer.character.armor?.helmet || 0) * 2);
            const staminaDef = Math.floor((nearestPlayer.character.stamina || 0) * 0.4);
            const dmg = Math.max(1, m.atk - armorDef - staminaDef);
            nearestPlayer.character.hp = Math.max(0, (nearestPlayer.character.hp || 100) - dmg);

            if (nearestPlayer.character.hp <= 0) {
                // 사망 시 소속 국가 수도에서 체력 회복 후 부활
                const kCfg = KINGDOM_CONFIG[nearestPlayer.character.kingdom] || KINGDOM_CONFIG.silla;
                nearestPlayer.x = kCfg.spawnX;
                nearestPlayer.y = kCfg.spawnY;
                nearestPlayer.character.hp = nearestPlayer.character.maxHp || 120;
                io.emit('playerMoved', { id: nearestPlayer.id, x: nearestPlayer.x, y: nearestPlayer.y, dir: 'down' });
            }
            io.to(nearestPlayer.id).emit('playerDamaged', {
                hp: nearestPlayer.character.hp,
                maxHp: nearestPlayer.character.maxHp,
                dmg,
                monsterId: m.id
            });
        } else if (nearestPlayer && minDist <= 6) {
            // 추격 이동
            const dx = Math.sign(nearestPlayer.x - m.x);
            const dy = Math.sign(nearestPlayer.y - m.y);
            if (Math.random() < 0.65) {
                if (dx !== 0 && Math.random() < 0.5) m.x = Math.max(m.zone.xMin, Math.min(m.zone.xMax, m.x + dx));
                else if (dy !== 0) m.y = Math.max(m.zone.yMin, Math.min(m.zone.yMax, m.y + dy));
                updatedMonsters.push({ id: m.id, x: m.x, y: m.y, hp: m.hp });
            }
        } else if (Math.random() < 0.22) {
            // 자유 배회
            const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
            const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
            m.x = Math.max(m.zone.xMin, Math.min(m.zone.xMax, m.x + dx));
            m.y = Math.max(m.zone.yMin, Math.min(m.zone.yMax, m.y + dy));
            updatedMonsters.push({ id: m.id, x: m.x, y: m.y, hp: m.hp });
        }
    }

    if (updatedMonsters.length > 0) {
        io.emit('monstersMoved', updatedMonsters);
    }
}, 1200);

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
    if (!dbUser) {
        socket.disconnect();
        return;
    }

    ensureCharacterDefaults(dbUser.character);
    const tokenState = resolveTokens(dbUser.character);
    dbUser.character.enhanceTokens = tokenState.tokens;
    dbUser.character.lastTokenRefill = tokenState.lastRefill;
    await dbUser.save();

    const char = dbUser.character;
    const kCfg = KINGDOM_CONFIG[char.kingdom] || KINGDOM_CONFIG.silla;
    const spawnX = kCfg.spawnX + Math.floor(Math.random() * 5) - 2;
    const spawnY = kCfg.spawnY + Math.floor(Math.random() * 5) - 2;

    players[socket.id] = {
        id: socket.id,
        userId: userId,
        name: nickname,
        x: spawnX,
        y: spawnY,
        dir: 'down',
        color: char.color || '#3b82f6',
        character: char,
        enhanceTokens: tokenState.tokens,
        lastTokenRefill: tokenState.lastRefill.getTime(),
        chatText: '',
        chatTimer: null,
        lastAttackTime: 0
    };

    socket.emit('init', {
        myId: socket.id,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        players: players,
        monsters: monsters,
        historicalNpcs: HISTORICAL_NPCS
    });

    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 이동 이벤트
    socket.on('move', (dir) => {
        const p = players[socket.id];
        if (!p) return;
        p.dir = dir;
        let targetX = p.x;
        let targetY = p.y;
        if (dir === 'up') targetY -= 1;
        else if (dir === 'down') targetY += 1;
        else if (dir === 'left') targetX -= 1;
        else if (dir === 'right') targetX += 1;

        if (!isTileOutOfBounds(targetX, targetY)) {
            p.x = targetX;
            p.y = targetY;
        }

        io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, dir: p.dir });
    });

    // 무기 슬롯 스왑 (1번 주무기 <-> 2번 보조무기)
    socket.on('swapWeapon', async () => {
        const p = players[socket.id];
        if (!p || !p.character.weapons) return;

        p.character.weapons.activeSlot = p.character.weapons.activeSlot === 1 ? 2 : 1;
        io.emit('playerWeaponSwapped', {
            id: socket.id,
            activeSlot: p.character.weapons.activeSlot,
            weapons: p.character.weapons
        });

        await User.findByIdAndUpdate(userId, {
            'character.weapons.activeSlot': p.character.weapons.activeSlot
        });
    });

    // 실시간 무기 공격 판정
    socket.on('attack', async () => {
        const p = players[socket.id];
        if (!p) return;

        const c = p.character;
        const activeWeaponKey = (c.weapons?.activeSlot === 2 ? c.weapons?.slot2 : c.weapons?.slot1) || 'spear';
        const spec = WEAPON_SPECS[activeWeaponKey] || WEAPON_SPECS.spear;

        const now = Date.now();
        // 외모 스탯에 따른 공격 속도 단축 보너스
        const speedBonus = Math.min(140, (c.appearance || 0) * 3);
        if (now - (p.lastAttackTime || 0) < Math.max(120, spec.cooldownMs - speedBonus)) return;
        p.lastAttackTime = now;

        // 방향 벡터
        let dx = 0, dy = 0;
        if (p.dir === 'up') dy = -1;
        else if (p.dir === 'down') dy = 1;
        else if (p.dir === 'left') dx = -1;
        else if (p.dir === 'right') dx = 1;

        // 무기별 타격 타일 계산
        const hitTiles = [];
        if (activeWeaponKey === 'sword') {
            hitTiles.push({ x: p.x + dx, y: p.y + dy });
        } else if (activeWeaponKey === 'spear') {
            hitTiles.push({ x: p.x + dx, y: p.y + dy });
            hitTiles.push({ x: p.x + dx * 2, y: p.y + dy * 2 });
        } else if (activeWeaponKey === 'bow') {
            for (let step = 1; step <= 5; step++) {
                hitTiles.push({ x: p.x + dx * step, y: p.y + dy * step });
            }
        } else if (activeWeaponKey === 'seven_sword') {
            hitTiles.push({ x: p.x + dx, y: p.y + dy });
            hitTiles.push({ x: p.x + dx * 2, y: p.y + dy * 2 });
            if (dx !== 0) {
                hitTiles.push({ x: p.x + dx, y: p.y - 1 });
                hitTiles.push({ x: p.x + dx, y: p.y + 1 });
            } else {
                hitTiles.push({ x: p.x - 1, y: p.y + dy });
                hitTiles.push({ x: p.x + 1, y: p.y + dy });
            }
        } else if (activeWeaponKey === 'staff') {
            for (let ox = -1; ox <= 1; ox++) {
                for (let oy = -1; oy <= 1; oy++) {
                    if (ox === 0 && oy === 0) continue;
                    hitTiles.push({ x: p.x + ox, y: p.y + oy });
                }
            }
        }

        // 6대 스탯 시너지 데미지 계산
        const statBonus = (c.stamina || 0) * 2.5 + (c.education || 0) * 2.2 + Math.max(0, (c.iq || 100) - 100) * 2.0 + (c.level || 1) * 3;
        const critChance = Math.min(50, 5 + Math.max(0, (c.iq || 100) - 100) * 0.8 + (c.personality || 0) * 0.5);
        const isCrit = (Math.random() * 100) < critChance;
        const finalDmg = Math.round((spec.baseDmg + statBonus) * (isCrit ? 1.65 : 1.0));

        const hitResults = [];
        let gainedGold = 0;
        let gainedExp = 0;
        let gainedIron = 0;
        let gainedLeather = 0;

        for (const mId in monsters) {
            const m = monsters[mId];
            const isHit = hitTiles.some(t => Math.abs(t.x - m.x) <= 0 && Math.abs(t.y - m.y) <= 0);
            if (!isHit) continue;

            m.hp -= finalDmg;
            const killed = m.hp <= 0;
            hitResults.push({ monsterId: m.id, x: m.x, y: m.y, dmg: finalDmg, isCrit, killed, remainHp: Math.max(0, m.hp) });

            // 성격 스탯에 따른 생명력 흡수
            if ((c.personality || 0) > 0) {
                c.hp = Math.min(c.maxHp, (c.hp || 100) + Math.ceil((c.personality || 0) * 0.5));
            }

            if (killed) {
                const wealthMultiplier = 1 + (c.wealth || 0) * 0.05;
                gainedGold += Math.round(m.gold * wealthMultiplier);
                gainedExp += m.exp;
                if (Math.random() < 0.55) gainedIron += 1;
                if (Math.random() < 0.65) gainedLeather += 1;

                const deadZone = m.zone;
                delete monsters[mId];
                setTimeout(() => {
                    spawnMonsterFromZone(deadZone);
                    io.emit('monstersSync', monsters);
                }, 5000);
            }

            // 활은 첫 적중 대상에서 화살 소멸
            if (activeWeaponKey === 'bow') break;
        }

        io.emit('playerAttackEffect', {
            id: socket.id,
            x: p.x,
            y: p.y,
            dir: p.dir,
            weapon: activeWeaponKey,
            hitResults
        });

        if (gainedGold > 0 || gainedExp > 0) {
            const u = await User.findById(userId);
            if (u) {
                ensureCharacterDefaults(u.character);
                u.character.gold += gainedGold;
                u.character.exp += gainedExp;
                u.character.materials.iron += gainedIron;
                u.character.materials.leather += gainedLeather;

                // 레벨업 체크
                const reqExp = u.character.level * 80;
                let leveledUp = false;
                if (u.character.exp >= reqExp) {
                    u.character.exp -= reqExp;
                    u.character.level += 1;
                    ensureCharacterDefaults(u.character);
                    u.character.hp = u.character.maxHp;
                    leveledUp = true;
                }

                await u.save();
                p.character = u.character;

                socket.emit('combatReward', {
                    character: u.character,
                    gainedGold,
                    gainedExp,
                    gainedIron,
                    gainedLeather,
                    leveledUp
                });
            }
        }
    });

    // 대장간 무기 제작/장착 및 방어구 강화
    socket.on('blacksmithAction', async (payload, callback) => {
        const p = players[socket.id];
        if (!p) return;
        const u = await User.findById(userId);
        if (!u) return;
        ensureCharacterDefaults(u.character);

        const c = u.character;
        // 재력 스탯에 따른 대장간 비용 할인 (최대 50% 할인)
        const discountRatio = Math.max(0.5, 1 - (c.wealth || 0) * 0.02);

        if (payload.action === 'craftWeapon') {
            const wKey = payload.weapon;
            const spec = WEAPON_SPECS[wKey];
            if (!spec) return callback({ success: false, message: '존재하지 않는 무기입니다.' });

            if (!c.weapons.owned.includes(wKey)) {
                const reqGold = Math.floor(spec.costGold * discountRatio);
                const reqIron = spec.costIron;
                const reqLeather = spec.costLeather;

                if (c.gold < reqGold || c.materials.iron < reqIron || c.materials.leather < reqLeather) {
                    return callback({
                        success: false,
                        message: `재료가 부족합니다. (필요: 금화 ${reqGold}, 철광석 ${reqIron}, 가죽 ${reqLeather})`
                    });
                }

                c.gold -= reqGold;
                c.materials.iron -= reqIron;
                c.materials.leather -= reqLeather;
                c.weapons.owned.push(wKey);
            }

            if (payload.slot === 2) c.weapons.slot2 = wKey;
            else c.weapons.slot1 = wKey;

            await u.save();
            p.character = c;
            io.emit('playerStatUpdated', { id: socket.id, character: c });
            return callback({ success: true, message: `[${spec.name}] 장착 완료!`, character: c });
        }

        if (payload.action === 'upgradeArmor') {
            const part = payload.part; // 'helmet', 'body', 'boots'
            if (!['helmet', 'body', 'boots'].includes(part)) return;

            const curLv = c.armor[part] || 0;
            if (curLv >= 4) {
                return callback({ success: false, message: '이미 최고 등급(대장군 신물 갑주)입니다.' });
            }

            const nextLv = curLv + 1;
            const reqGold = Math.floor((nextLv * 120) * discountRatio);
            const reqIron = nextLv * 3;
            const reqLeather = nextLv * 3;

            if (c.gold < reqGold || c.materials.iron < reqIron || c.materials.leather < reqLeather) {
                return callback({
                    success: false,
                    message: `재료 부족! (금화 ${reqGold}, 철광석 ${reqIron}, 가죽 ${reqLeather} 필요)`
                });
            }

            c.gold -= reqGold;
            c.materials.iron -= reqIron;
            c.materials.leather -= reqLeather;
            c.armor[part] = nextLv;
            ensureCharacterDefaults(c);

            await u.save();
            p.character = c;
            io.emit('playerStatUpdated', { id: socket.id, character: c });
            return callback({ success: true, message: `방어구 단조 성공! (+${nextLv}단계 달성)`, character: c });
        }
    });

    // 역사 인물 퀴즈 정답 처리 및 열전 도감 등록
    socket.on('submitNpcQuiz', async ({ npcId, answerIndex }, callback) => {
        const p = players[socket.id];
        if (!p) return;
        const npc = HISTORICAL_NPCS.find(n => n.id === npcId);
        if (!npc) return callback({ success: false, message: '인물 정보를 찾을 수 없습니다.' });

        if (npc.quizAnswer !== answerIndex) {
            return callback({ success: false, message: '아깝도다! 역사 기록을 다시 살펴보고 오거라.' });
        }

        const u = await User.findById(userId);
        if (!u) return;
        ensureCharacterDefaults(u.character);

        const isFirstClear = !u.character.metNpcs.includes(npcId);
        if (isFirstClear) {
            u.character.metNpcs.push(npcId);
            u.character.gold += 200;
            u.character.materials.iron += 5;
            u.character.materials.leather += 5;
            u.character.enhanceTokens = Math.min(MAX_TOKENS, (u.character.enhanceTokens || 0) + 15);
            if (npc.titleReward && !u.character.unlockedSpecialTitles.includes(npc.titleReward)) {
                u.character.unlockedSpecialTitles.push(npc.titleReward);
            }
            await u.save();
            p.character = u.character;
            io.emit('playerStatUpdated', { id: socket.id, character: u.character });
        }

        return callback({
            success: true,
            isFirstClear,
            rewardTitle: npc.titleReward,
            character: u.character,
            message: isFirstClear
                ? `🎉 정답! [${npc.name}] 열전이 도감에 등록되었으며 칭호 [${npc.titleReward}], 금화 200, 재료 5개, 기회 15회를 하사받았습니다!`
                : `정답입니다! (이미 [${npc.name}] 열전을 완료했습니다.)`
        });
    });

    // 유저 칭호(과거 거쳐간 모든 칭호 포함), 기운 색상, 소속 국가 변경
    socket.on('updatePreferences', async (prefs) => {
        const p = players[socket.id];
        if (!p) return;

        const validStats = ['education', 'appearance', 'wealth', 'iq', 'stamina', 'personality'];
        const validColors = ['red', 'yellow', 'blue', 'green'];
        const validKingdoms = ['goguryeo', 'baekje', 'silla'];

        const u = await User.findById(userId);
        if (!u) return;
        ensureCharacterDefaults(u.character);

        if (prefs.titleStat && validStats.includes(prefs.titleStat)) {
            u.character.titleStat = prefs.titleStat;
        }
        if (typeof prefs.customTitle === 'string') {
            u.character.customTitle = prefs.customTitle.slice(0, 24);
        }
        if (prefs.auraColor && validColors.includes(prefs.auraColor)) {
            u.character.auraColor = prefs.auraColor;
        }
        if (prefs.kingdom && validKingdoms.includes(prefs.kingdom)) {
            u.character.kingdom = prefs.kingdom;
            if (prefs.teleportToCapital) {
                const kCfg = KINGDOM_CONFIG[prefs.kingdom];
                p.x = kCfg.spawnX;
                p.y = kCfg.spawnY;
                io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, dir: 'down' });
            }
        }

        await u.save();
        p.character = u.character;

        io.emit('playerStatUpdated', {
            id: socket.id,
            character: u.character
        });
    });

    // 6대 스탯 강화 소켓 이벤트 (maxStats 자동 갱신)
    socket.on('tryEnhanceStat', async (statType, callback) => {
        const p = players[socket.id];
        if (!p) return callback({ success: false, message: '플레이어 정보 없음' });

        const u = await User.findById(userId);
        if (!u) return callback({ success: false, message: '유저 계정 미확인' });
        ensureCharacterDefaults(u.character);

        const tokenState = resolveTokens(u.character);
        if (tokenState.tokens < 1) {
            return callback({
                success: false,
                noTokens: true,
                tokens: tokenState.tokens,
                lastRefill: tokenState.lastRefill.getTime(),
                message: '기회가 부족합니다. (1분당 1회 충전)'
            });
        }

        let currentTokens = tokenState.tokens - 1;
        let newLastRefill = tokenState.lastRefill;
        if (tokenState.tokens === MAX_TOKENS) {
            newLastRefill = new Date();
        }

        const rand = Math.random() * 100;
        let result = { type: 'keep', change: 0, message: '아무 일도 일어나지 않았습니다.' };

        switch (statType) {
            case 'education': {
                if (rand < 1.0) {
                    u.character.education += 1;
                    result = { type: 'success', change: 1, message: '🎉 학력 강화 성공! 학위가 올랐습니다.' };
                }
                break;
            }
            case 'appearance': {
                if (rand < 2.0) {
                    u.character.appearance += 1;
                    result = { type: 'success', change: 1, message: '✨ 외모 관리 성공! 아우라가 달라졌습니다.' };
                } else if (rand >= 99.0 && u.character.appearance > 0) {
                    u.character.appearance -= 1;
                    result = { type: 'fail', change: -1, message: '💦 관리 소홀... 외모가 조금 서운해졌습니다.' };
                }
                break;
            }
            case 'wealth': {
                if (u.character.wealth === 0) {
                    if (rand < 1.0) {
                        u.character.wealth += 1;
                        result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 소득이 늘었습니다.' };
                    } else if (rand < 1.99) {
                        u.character.wealth += 2;
                        result = { type: 'great_success', change: 2, message: '💎 재력 대성공!! 투자 대박 (+2강)!' };
                    }
                } else {
                    if (rand < 1.0) {
                        u.character.wealth += 1;
                        result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 자산이 증식되었습니다.' };
                    } else if (rand < 1.99) {
                        u.character.wealth += 2;
                        result = { type: 'great_success', change: 2, message: '💎 재력 대성공!! 벼락부자가 되었습니다 (+2강)!' };
                    } else if (rand >= 98.99 && rand < 99.99) {
                        u.character.wealth -= 1;
                        result = { type: 'fail', change: -1, message: '📉 투자 손실... 자산이 줄었습니다 (-1강).' };
                    } else if (rand >= 99.99) {
                        u.character.wealth = 0;
                        result = { type: 'catastrophe', change: 0, message: '🚨 0.01% 대파산!! 전재산을 날려 0강(빈민)으로 초기화되었습니다!' };
                    }
                }
                break;
            }
            case 'iq': {
                if (rand < 1.0) {
                    u.character.iq += 1;
                    result = { type: 'success', change: 1, message: '🧠 지능 향상 성공 (+1 IQ)!' };
                } else if (rand < 2.0) {
                    u.character.iq += 2;
                    result = { type: 'great_success', change: 2, message: '💡 번뜩이는 영감 폭발 (+2 IQ)!' };
                } else if (rand >= 99.0 && u.character.iq > 0) {
                    u.character.iq -= 1;
                    result = { type: 'fail', change: -1, message: '😵 뇌정지가 왔습니다 (-1 IQ).' };
                }
                break;
            }
            case 'stamina': {
                if (rand < 3.0) {
                    u.character.stamina += 1;
                    result = { type: 'success', change: 1, message: '💪 체력 강화 성공! 피지컬이 상승했습니다.' };
                } else if (rand >= 99.5 && u.character.stamina > 0) {
                    u.character.stamina -= 1;
                    result = { type: 'fail', change: -1, message: '🩹 무리한 운동으로 근육통이 왔습니다 (-1강).' };
                }
                break;
            }
            case 'personality': {
                if (rand < 2.0) {
                    u.character.personality += 1;
                    result = { type: 'success', change: 1, message: '🍀 성격 수양 성공! 인성이 깊어졌습니다.' };
                } else if (rand < 3.0) {
                    u.character.personality += 2;
                    result = { type: 'great_success', change: 2, message: '🕊️ 성격 대성공!! 해탈의 경지에 다가섭니다 (+2강)!' };
                } else if (rand >= 99.0 && u.character.personality > 0) {
                    u.character.personality -= 1;
                    result = { type: 'fail', change: -1, message: '💢 욱하는 마음에 인성이 깎였습니다 (-1강).' };
                }
                break;
            }
            default:
                return callback({ success: false, message: '알 수 없는 스탯입니다.' });
        }

        // 최고 달성 기록(maxStats) 갱신 -> 거쳐간 칭호 영구 언락 보장
        ensureCharacterDefaults(u.character);
        u.character.enhanceTokens = currentTokens;
        u.character.lastTokenRefill = newLastRefill;
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
        const cleanMsg = String(message).trim().slice(0, 60);
        if (cleanMsg.length === 0) return;

        p.chatText = cleanMsg;
        io.emit('playerChat', {
            id: socket.id,
            name: p.name,
            kingdom: p.character?.kingdom || 'silla',
            message: cleanMsg
        });

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
    console.log(`🌟 인생온라인: 삼국지 200x200 오픈월드 서버 가동 중 (포트 ${PORT})`);
});