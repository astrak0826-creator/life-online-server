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
    .then(() => console.log('🍃 MongoDB Atlas 인생 육성 DB 연결 완료!'))
    .catch(err => console.error('❌ DB 연결 에러:', err));

const MAX_TOKENS = 120;
const REFILL_INTERVAL_MS = 60 * 1000; // 1분당 1개 충전

// 토큰 자동 계산 헬퍼 함수
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
                enhanceTokens: MAX_TOKENS,
                lastTokenRefill: new Date()
            }
        });

        await user.save();
        res.status(201).json({ message: '회원가입 완료! 로그인해주세요.' });
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
                education: c.education || 0,
                appearance: c.appearance || 0,
                wealth: c.wealth || 0,
                iq: c.iq || 100,
                stamina: c.stamina || 0,
                personality: c.personality || 0,
                totalScore
            };
        }).sort((a, b) => b.totalScore - a.totalScore).slice(0, 50).map((item, idx) => ({ rank: idx + 1, ...item }));

        res.json({ rankings: rankingList });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '랭킹 로드 실패' });
    }
});

// ================= [월드 및 소켓 통신] =================
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;

const OBSTACLES = [
    // 상단 중앙: 구릿빛노루 기숙사 대형 마법 벽난로
    { x: 9, y: 1, type: 'fireplace' }, { x: 10, y: 1, type: 'fireplace' },

    // 상단 좌우: 고딕 아치 창문 & 서가
    { x: 2, y: 1, type: 'window' }, { x: 3, y: 1, type: 'window' },
    { x: 16, y: 1, type: 'window' }, { x: 17, y: 1, type: 'window' },
    { x: 6, y: 1, type: 'bookshelf' }, { x: 13, y: 1, type: 'bookshelf' },

    // 3명의 마법사 NPC 고루 배치
    { x: 4, y: 3, type: 'npc_helicopter' },  // 헬리콥터 (좌측 구역)
    { x: 15, y: 3, type: 'npc_nong' },       // 농 잊을리 (우측 구역)
    { x: 10, y: 11, type: 'npc_haerin' },    // 해린이언니 (하단 중앙 구역)

    // 기숙사 내부 기둥 및 마법 연구 테이블
    { x: 3, y: 7, type: 'pillar' }, { x: 16, y: 7, type: 'pillar' },
    { x: 3, y: 11, type: 'table' }, { x: 16, y: 11, type: 'table' }
];
const players = {};

function isTileBlocked(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return true;
    if (OBSTACLES.some(obs => obs.x === x && obs.y === y)) return true;
    for (const id in players) {
        if (players[id].x === x && players[id].y === y) return true;
    }
    return false;
}

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
        gender: 'male', education: 0, appearance: 0, wealth: 0, iq: 100, stamina: 0, personality: 0,
        enhanceTokens: MAX_TOKENS, lastTokenRefill: new Date() 
    };
    const tokenState = resolveTokens(char);

    if (dbUser) {
        dbUser.character.enhanceTokens = tokenState.tokens;
        dbUser.character.lastTokenRefill = tokenState.lastRefill;
        await dbUser.save();
    }

    let spawnX = 2, spawnY = 7;
    while (isTileBlocked(spawnX, spawnY)) {
        spawnX = Math.floor(Math.random() * (MAP_WIDTH - 4)) + 2;
        spawnY = Math.floor(Math.random() * (MAP_HEIGHT - 4)) + 2;
    }

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
        chatTimer: null
    };

    socket.emit('init', {
        myId: socket.id,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        obstacles: OBSTACLES,
        players: players
    });

    socket.broadcast.emit('playerJoined', players[socket.id]);

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

        if (!isTileBlocked(targetX, targetY)) {
            p.x = targetX;
            p.y = targetY;
        }

        io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, dir: p.dir });
    });

    // 6대 스탯 강화 소켓 이벤트
    socket.on('tryEnhanceStat', async (statType, callback) => {
        const p = players[socket.id];
        if (!p) return callback({ success: false, message: '플레이어 정보 없음' });

        const u = await User.findById(userId);
        if (!u) return callback({ success: false, message: '유저 계정 미확인' });

        const tokenState = resolveTokens(u.character);
        if (tokenState.tokens < 1) {
            return callback({
                success: false,
                noTokens: true,
                tokens: tokenState.tokens,
                lastRefill: tokenState.lastRefill.getTime(),
                message: '토큰이 부족합니다. (1분당 1개 충전)'
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
            // 1. 학력: 성공 1% (+1), 유지 99%
            case 'education': {
                if (rand < 1.0) {
                    u.character.education += 1;
                    result = { type: 'success', change: 1, message: '🎉 학력 강화 성공! 학위가 올랐습니다.' };
                }
                break;
            }

            // 2. 외모: 성공 1% (+1), 유지 98%, 실패 1% (-1) [0강 보호]
            case 'appearance': {
                if (rand < 1.0) {
                    u.character.appearance += 1;
                    result = { type: 'success', change: 1, message: '✨ 외모 관리 성공! 아우라가 달라졌습니다.' };
                } else if (rand >= 99.0 && u.character.appearance > 0) {
                    u.character.appearance -= 1;
                    result = { type: 'fail', change: -1, message: '💦 관리 소홀... 외모가 조금 서운해졌습니다.' };
                }
                break;
            }

            // 3. 재력: 성공 1% (+1), 대성공 0.9% (+2), 유지 97%, 실패 1% (-1), 대실패 0.1% (0강 초기화) [0강 보호]
            case 'wealth': {
                if (u.character.wealth === 0) {
                    if (rand < 1.0) {
                        u.character.wealth += 1;
                        result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 소득이 늘었습니다.' };
                    } else if (rand < 2.0) {
                        u.character.wealth += 2;
                        result = { type: 'great_success', change: 2, message: '💎 재력 대성공!! 투자 대박 (+2강)!' };
                    }
                } else {
                    if (rand < 1.0) {
                        u.character.wealth += 1;
                        result = { type: 'success', change: 1, message: '💰 재력 강화 성공! 자산이 증식되었습니다.' };
                    } else if (rand < 1.9) {
                        u.character.wealth += 2;
                        result = { type: 'great_success', change: 2, message: '💎 재력 대성공!! 벼락부자가 되었습니다 (+2강)!' };
                    } else if (rand >= 98.9 && rand < 99.9) {
                        u.character.wealth -= 1;
                        result = { type: 'fail', change: -1, message: '📉 투자 손실... 자산이 줄었습니다 (-1강).' };
                    } else if (rand >= 99.9) {
                        u.character.wealth = 0;
                        result = { type: 'catastrophe', change: 0, message: '🚨 0.1% 대폭망!! 전재산을 날려 0강(빈민)으로 초기화되었습니다!' };
                    }
                }
                break;
            }

            // 4. 지능: 기본값 IQ100 / 성공 1% (+1), 대성공 1% (+2), 유지 97%, 실패 1% (-1) [IQ 0 보호]
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

            // 5. 체력: 성공 3% (+1), 유지 96.5%, 실패 0.5% (-1) [0강 보호]
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

            // 6. 성격: 성공 2% (+1), 대성공 1% (+2), 유지 96%, 실패 1% (-1) [0강 보호]
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

        // DB 저장
        u.character.enhanceTokens = currentTokens;
        u.character.lastTokenRefill = newLastRefill;
        await u.save();

        p.character = u.character;
        p.enhanceTokens = currentTokens;
        p.lastTokenRefill = newLastRefill.getTime();

        // 전체 플레이어에게 스탯 갱신 브로드캐스트
        io.emit('playerStatUpdated', {
            id: socket.id,
            character: u.character
        });

        // 초고강 달성 시 전체 서버 공지
        if (result.type.includes('success')) {
            const currentVal = u.character[statType];
            if (currentVal >= 20) {
                io.emit('serverAnnouncement', `[대경축] ${p.name} 님께서 [${statType.toUpperCase()} ${currentVal}단계]에 도달하셨습니다!`);
            }
        }

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
    console.log(`🌟 인생 육성 RPG 서버 가동 중: 포트 ${PORT}`);
});