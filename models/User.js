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
    // 캐릭터 인생 스탯 데이터
    character: {
        gender: {
            type: String,
            enum: ['male', 'female'],
            default: 'male'
        },
        // 6대 스탯
        education: { type: Number, default: 0, min: 0 },    // 학력 (오른팔)
        appearance: { type: Number, default: 0, min: 0 },   // 외모 (오른다리)
        wealth: { type: Number, default: 0, min: 0 },       // 재력 (왼팔)
        iq: { type: Number, default: 100, min: 0 },         // 지능 (머리, 기본 100)
        stamina: { type: Number, default: 0, min: 0 },      // 체력 (몸통)
        personality: { type: Number, default: 0, min: 0 },  // 성격 (왼다리)

        // 유저 커스텀 설정: 머리 위 표시 칭호 스탯 & 스페이스바 기운 색상
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