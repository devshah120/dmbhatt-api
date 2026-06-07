const mongoose = require('mongoose');

const birthdayNotificationConfigSchema = new mongoose.Schema({
    enableBirthdayNotification: {
        type: Boolean,
        default: false
    },
    birthdayNotificationTitle: {
        type: String,
        default: 'Happy Birthday!'
    },
    birthdayNotificationBody: {
        type: String,
        default: 'Wishing you a wonderful birthday, {{studentName}}!'
    },
    enableBirthdayEmail: {
        type: Boolean,
        default: false
    },
    birthdayEmailSubject: {
        type: String,
        default: 'Happy Birthday, {{studentName}}!'
    },
    birthdayEmailTemplate: {
        type: String,
        default: '<h1>Happy Birthday {{studentName}}!</h1><p>Wishing you a wonderful day filled with joy and celebrations!</p>'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('BirthdayNotificationConfig', birthdayNotificationConfigSchema);
