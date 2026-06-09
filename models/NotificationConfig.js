const mongoose = require('mongoose');

const notificationConfigSchema = new mongoose.Schema({
    whatsappEnabled: {
        type: Boolean,
        default: false
    },
    whatsappApiKey: String,
    whatsappSenderId: String,
    whatsappTemplate: String,
    smsEnabled: {
        type: Boolean,
        default: false
    },
    smsApiKey: String,
    smsSenderId: String,
    smsTemplate: String,
    emailEnabled: {
        type: Boolean,
        default: false
    },
    emailHost: String,
    emailPort: String,
    emailUser: String,
    emailPassword: String,
    emailFromName: String,
    notifyOnNewStudent: {
        type: Boolean,
        default: true
    },
    notifyOnPayment: {
        type: Boolean,
        default: true
    },
    notifyOnPlanUpgrade: {
        type: Boolean,
        default: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('NotificationConfig', notificationConfigSchema);
