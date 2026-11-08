const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20
    },
    password: {
        type: String,
        required: true
    },
    nickname: {
        type: String,
        required: true,
        trim: true,
        maxlength: 10
    },
    // 계정 분실 대비 보안 질문 & 답변
    securityQuestion: {
        type: String,
        default: '내가 가장 소중하게 생각하는 것은?'
    },
    securityAnswer: {
        type: String,
        default: ''
    },
    // 캐릭터 인생 스탯 & 삼국지 무관 데이터
    character: {
        gender: {
            type: String,
            enum: ['male', 'female'],
            default: 'male'
        },
        // 소속 국가 (고구려, 백제, 신라)
        kingdom: {
            type: String,
            enum: ['goguryeo', 'baekje', 'silla'],
            default: 'silla'
        },

        // 6대 스탯
        education: { type: Number, default: 0, min: 0 },    // 학력 (오른팔 - 주술/학식)
        appearance: { type: Number, default: 0, min: 0 },   // 외모 (오른다리 - 공속/이속)
        wealth: { type: Number, default: 0, min: 0 },       // 재력 (왼팔 - 제작할인/금화보너스)
        iq: { type: Number, default: 100, min: 0 },         // 지능 (머리 - 치명타/명중, 기본 100)
        stamina: { type: Number, default: 0, min: 0 },      // 체력 (몸통 - 최대HP/방어/공격력)
        personality: { type: Number, default: 0, min: 0 },  // 성격 (왼다리 - 흡혈/생존력)

        // [개선 1] 거쳐간 모든 칭호를 언제든 다시 쓸 수 있도록 최고 달성 스탯 영구 기록
        maxStats: {
            education: { type: Number, default: 0 },
            appearance: { type: Number, default: 0 },
            wealth: { type: Number, default: 0 },
            iq: { type: Number, default: 100 },
            stamina: { type: Number, default: 0 },
            personality: { type: Number, default: 0 }
        },

        // 유저가 직접 선택한 머리 위 칭호 문자열 (빈 문자열이면 titleStat 기준 자동 표시)
        customTitle: {
            type: String,
            default: ''
        },
        // 역사 인물 퀴즈 등으로 획득한 특별 칭호 목록
        unlockedSpecialTitles: {
            type: [String],
            default: []
        },

        // 기존 호환용 칭호 카테고리 & 기운 발산 색상
        titleStat: {
            type: String,
            enum: ['education', 'appearance', 'wealth', 'iq', 'stamina', 'personality'],
            default: 'education'
        },
        auraColor: {
            type: String,
            enum: ['red', 'yellow', 'blue', 'green'],
            default: 'red'
        },

        // 전투 레벨, 체력, 재화, 재료
        level: { type: Number, default: 1, min: 1 },
        exp: { type: Number, default: 0, min: 0 },
        hp: { type: Number, default: 120 },
        maxHp: { type: Number, default: 120 },
        gold: { type: Number, default: 150, min: 0 },
        materials: {
            iron: { type: Number, default: 5, min: 0 },
            leather: { type: Number, default: 5, min: 0 }
        },

        // 주무기 & 보조무기 (최대 2개 장착 후 실시간 스왑)
        weapons: {
            slot1: { type: String, default: 'spear' },
            slot2: { type: String, default: 'sword' },
            activeSlot: { type: Number, default: 1 },
            owned: { type: [String], default: ['spear'] }
        },

        // 방어구 (0: 수련복, 1: 가죽갑주, 2: 청동갑주, 3: 강철찰갑, 4: 대장군 신물갑주)
        armor: {
            helmet: { type: Number, default: 0, min: 0, max: 4 },
            body: { type: Number, default: 0, min: 0, max: 4 },
            boots: { type: Number, default: 0, min: 0, max: 4 }
        },

        // 역사 인물 열전 완료 목록
        metNpcs: {
            type: [String],
            default: []
        },

        // 기회 시스템 (1분당 1충전, 최대 120개)
        enhanceTokens: { type: Number, default: 120, max: 120 },
        lastTokenRefill: { type: Date, default: Date.now },
        color: { type: String, default: '#3b82f6' }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 빠른 랭킹 조회를 위한 복합 인덱스
userSchema.index({ "character.wealth": -1, "character.education": -1, updatedAt: 1 });

module.exports = mongoose.model('User', userSchema);