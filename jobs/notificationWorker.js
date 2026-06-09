const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let isInitialized = false;

const initializeFirebase = () => {
    if (isInitialized) return;

    try {
        const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }
            isInitialized = true;
            console.log('Firebase initialized for notification worker');
        } else {
            console.warn('Firebase service account file not found');
        }
    } catch (error) {
        console.error('Firebase initialization error in notification worker:', error);
    }
};

const processScheduledNotifications = async () => {
    try {
        const ScheduledNotification = require('../models/ScheduledNotification');

        const now = new Date();

        const pendingNotifications = await ScheduledNotification.find({
            status: 'pending',
            scheduledTime: { $lte: now }
        });

        if (pendingNotifications.length === 0) {
            console.log(`[${new Date().toISOString()}] No pending notifications to send`);
            return;
        }

        console.log(`[${new Date().toISOString()}] Found ${pendingNotifications.length} notifications to send`);

        for (const notification of pendingNotifications) {
            try {
                let topic = 'all';
                if (notification.std && notification.std !== 'all') {
                    topic = `std_${notification.std}`;
                }

                const message = {
                    notification: {
                        title: notification.title,
                        body: notification.body
                    },
                    topic: topic,
                    android: {
                        notification: {
                            sound: 'default',
                            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                        }
                    },
                    data: {
                        title: notification.title,
                        body: notification.body
                    }
                };

                const response = await admin.messaging().send(message);

                // Mark as sent
                notification.status = 'sent';
                notification.sentAt = new Date();
                notification.fcmMessageId = response;
                await notification.save();

                console.log(`✓ Notification sent: ${notification._id} | Topic: ${topic} | FCM ID: ${response}`);
            } catch (err) {
                console.error(`✗ Failed to send notification ${notification._id}:`, err.message);

                // Mark as failed
                notification.status = 'failed';
                notification.errorMessage = err.message;
                await notification.save();
            }
        }
    } catch (err) {
        console.error('Error in notification worker:', err);
    }
};

const startWorker = (intervalMs = 60000) => {
    initializeFirebase();

    console.log(`Starting notification worker (checking every ${intervalMs}ms)...`);

    // Run immediately on start
    processScheduledNotifications();

    // Then run at intervals
    setInterval(processScheduledNotifications, intervalMs);
};

module.exports = {
    processScheduledNotifications,
    startWorker
};
