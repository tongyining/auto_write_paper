// workflows/paper-generation/config.js
module.exports = {
    DEGREE_CONFIG: {
        correspondence: {
            label: '函授',
            minWords: 10000,
            maxWords: 15000,
            chapters: 5,
            wordsPerChapter: 3000,
            isPostgraduate: false,
            degreeName: '函授'
        },
        undergraduate: {
            label: '本科',
            minWords: 10000,
            maxWords: 15000,
            chapters: 5,
            wordsPerChapter: 3000,
            isPostgraduate: false,
            degreeName: '本科'
        },
        postgraduate: {
            label: '硕士',
            minWords: 35000,
            maxWords: 45000,
            chapters: 7,
            wordsPerChapter: 7000,
            isPostgraduate: true,
            degreeName: '硕士'
        }
    }
};