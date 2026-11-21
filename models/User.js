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
    // 캐릭터 인생 스탯 및 커스텀 데이터
    character: {
        gender: {
            type: String,
            enum: ['male', 'female'],
            default: 'male'
        },
        // 6대 스탯 + 기본 지팡이 호환 필드(0~30강)
        education: { type: Number, default: 0, min: 0 },     // 학력 (오른팔 -> 망치: 10 해금 / 50 블랙홀 / 100 운석 강하)
        appearance: { type: Number, default: 0, min: 0 },    // 외모 (오른다리 -> 활: 10 해금 / 50 삼삼구샷 / 100 비연 곡예사격)
        wealth: { type: Number, default: 0, min: 0 },        // 재력 (왼팔 -> 쌍수: 10 해금 / 50 새비지 블로우 / 100 환영 순보)
        iq: { type: Number, default: 100, min: 0 },          // 지능 (머리, 기본 100 -> 지팡이: 150 1+1 / 200 차원 도약 포격)
        stamina: { type: Number, default: 0, min: 0 },       // 체력 (몸통 -> 대검: 10 해금 / 50 GG / 100 패왕 돌진베기)
        personality: { type: Number, default: 0, min: 0 },   // 성격 (왼다리 -> 태극구: 10 해금 / 50 음양양의 / 100 무위 축지)
        wand: { type: Number, default: 0, min: 0, max: 30 }, // 지팡이 강화단계 (하위 호환용)

        // 현재 장착 중인 무기 (6종 + 기존 chakram 데이터 마이그레이션 호환)
        equippedWeapon: {
            type: String,
            enum: ['wand', 'greatsword', 'hammer', 'bow', 'daggers', 'taijiorb', 'chakram'],
            default: 'wand'
        },

        // 6종 무기별 개별 강화 단계 (0~30강, 장착 무기 단계당 전투력 +10)
        weapons: {
            wand: { type: Number, default: 0, min: 0, max: 30 },
            greatsword: { type: Number, default: 0, min: 0, max: 30 },
            hammer: { type: Number, default: 0, min: 0, max: 30 },
            bow: { type: Number, default: 0, min: 0, max: 30 },
            daggers: { type: Number, default: 0, min: 0, max: 30 },
            taijiorb: { type: Number, default: 0, min: 0, max: 30 },
            chakram: { type: Number, default: 0, min: 0, max: 30 } // 기존 DB 이관용
        },

        // 대사부 NPC를 통해 전수받은 무기 이력 (실제 사용/장착은 실시간 스탯 기준으로 검사)
        unlockedWeapons: {
            wand: { type: Boolean, default: true },
            greatsword: { type: Boolean, default: false },
            hammer: { type: Boolean, default: false },
            bow: { type: Boolean, default: false },
            daggers: { type: Boolean, default: false },
            taijiorb: { type: Boolean, default: false },
            chakram: { type: Boolean, default: false } // 기존 DB 이관용
        },

        // 칭호 해금 이력 보존용 역대 최고 달성 기록
        maxStats: {
            education: { type: Number, default: 0 },
            appearance: { type: Number, default: 0 },
            wealth: { type: Number, default: 0 },
            iq: { type: Number, default: 100 },
            stamina: { type: Number, default: 0 },
            personality: { type: Number, default: 0 },
            wand: { type: Number, default: 0 },
            greatsword: { type: Number, default: 0 },
            hammer: { type: Number, default: 0 },
            bow: { type: Number, default: 0 },
            daggers: { type: Number, default: 0 },
            taijiorb: { type: Number, default: 0 },
            chakram: { type: Number, default: 0 }
        },

        // 유저 커스텀 설정: 머리 위 표시 칭호 & 스페이스바 기운 색상
        customTitle: {
            type: String,
            default: ''
        },
        titleStat: {
            type: String,
            enum: [
                'education', 'appearance', 'wealth', 'iq', 'stamina', 'personality',
                'wand', 'greatsword', 'hammer', 'bow', 'daggers', 'taijiorb', 'chakram'
            ],
            default: 'education'
        },
        auraColor: {
            type: String,
            enum: ['red', 'yellow', 'blue', 'green'],
            default: 'red'
        },

        // 해린이언니 커스터마이징 외형 (48x48 압축 PNG/WebP DataURL, 빈 문자열이면 기본 외형)
        customAvatar: {
            type: String,
            default: '',
            maxlength: 20480
        },

        // 기회 시스템 (1분당 1충전 + 몬스터 사냥 보상 획득, 최대 120개)
        enhanceTokens: { type: Number, default: 120, min: 0, max: 120 },
        lastTokenRefill: { type: Date, default: Date.now },

        // 한국 시각(KST) 00:00 스탯 총합 100 초과 자연 하락 마지막 정산 날짜 ('YYYY-MM-DD')
        lastDecayDate: { type: String, default: '' },

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

// 빠른 랭킹 및 전투력 조회를 위한 복합 인덱스
userSchema.index({ "character.wand": -1, "character.wealth": -1, "character.education": -1, updatedAt: 1 });

module.exports = mongoose.model('User', userSchema);