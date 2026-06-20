const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

let isInitialized = false;
let smtpTransporter = null;
let lastBirthdayCheckTime = null;

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

const initializeSMTP = async () => {
    if (smtpTransporter) return smtpTransporter;

    try {
        const NotificationConfig = require('../models/NotificationConfig');
        const config = await NotificationConfig.findOne() || {};

        if (config.emailHost && config.emailUser && config.emailPassword) {
            smtpTransporter = nodemailer.createTransport({
                host: config.emailHost,
                port: parseInt(config.emailPort) || 587,
                secure: parseInt(config.emailPort) === 465,
                auth: {
                    user: config.emailUser,
                    pass: config.emailPassword
                }
            });
            console.log('SMTP transporter initialized for birthday emails');
            return smtpTransporter;
        }
    } catch (error) {
        console.error('Error initializing SMTP:', error);
    }
    return null;
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

const processBirthdayNotifications = async () => {
    try {
        const BirthdayNotificationConfig = require('../models/BirthdayNotificationConfig');
        const User = require('../models/User');
        const StudentProfile = require('../models/StudentProfile');

        const config = await BirthdayNotificationConfig.findOne();
        if (!config || (!config.enableBirthdayNotification && !config.enableBirthdayEmail)) {
            return;
        }

        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Check if current time is within the notification window (23:30 - 23:59 by default)
        // This is wider than the original 20-minute window to increase reliability
        const notificationHour = parseInt(process.env.BIRTHDAY_NOTIFICATION_HOUR) || 23;
        const notificationStartMinute = parseInt(process.env.BIRTHDAY_NOTIFICATION_START_MINUTE) || 30;

        const isNotificationWindow = hour === notificationHour && minute >= notificationStartMinute;

        if (!isNotificationWindow) {
            return;
        }

        // Check if we already processed birthdays today to avoid duplicate sends
        if (lastBirthdayCheckTime) {
            const lastCheckDate = lastBirthdayCheckTime.toDateString();
            const currentDate = now.toDateString();

            if (lastCheckDate === currentDate) {
                console.log(`[${now.toISOString()}] Birthday notifications already processed for today`);
                return; // Already processed today
            }
        }

        lastBirthdayCheckTime = now;

        console.log(`[${now.toISOString()}] Processing birthday notifications...`);

        // Get today's date (month-day for birthday comparison)
        const today = new Date();
        const todayMonth = today.getMonth();
        const todayDate = today.getDate();

        // Find students with birthdays today with their profile data
        const studentProfiles = await StudentProfile.find().select('userId std').lean();
        const userIds = studentProfiles.map(sp => sp.userId);
        const studentStdMap = {};
        studentProfiles.forEach(sp => {
            studentStdMap[sp.userId.toString()] = sp.std;
        });

        const birthdayStudents = await User.find({
            _id: { $in: userIds },
            dob: { $exists: true, $ne: null },
            isActive: true
        }).lean();

        const todayBirthdays = birthdayStudents.filter(user => {
            if (!user.dob) return false;
            const dob = new Date(user.dob);
            return dob.getMonth() === todayMonth && dob.getDate() === todayDate;
        });

        if (todayBirthdays.length === 0) {
            console.log(`[${now.toISOString()}] No birthdays today`);
            return;
        }

        console.log(`[${now.toISOString()}] Found ${todayBirthdays.length} birthday(s) to notify`);

        // Send notifications and emails
        const notificationResults = { success: 0, failed: 0 };
        for (const student of todayBirthdays) {
            try {
                let notificationSent = false;
                let emailSent = false;

                // Send push notification
                if (config.enableBirthdayNotification && config.birthdayNotificationTitle && config.birthdayNotificationBody) {
                    const title = config.birthdayNotificationTitle;
                    const body = config.birthdayNotificationBody.replace('{{studentName}}', student.firstName);

                    // Send to student-specific topic using userId
                    const studentTopic = `user_${student._id}`;

                    const message = {
                        notification: { title, body },
                        topic: studentTopic,
                        android: {
                            notification: {
                                sound: 'default',
                                clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                            }
                        },
                        data: { title, body }
                    };

                    try {
                        const response = await admin.messaging().send(message);
                        console.log(`✓ Birthday notification sent to ${student.firstName} (${student._id}) on topic ${studentTopic} | FCM: ${response}`);
                        notificationSent = true;
                    } catch (pushErr) {
                        console.error(`✗ Failed to send push notification to ${student.firstName}:`, pushErr.message);
                    }
                }

                // Send birthday email
                if (config.enableBirthdayEmail && config.birthdayEmailSubject && config.birthdayEmailTemplate && student.email) {
                    const emailSubject = config.birthdayEmailSubject.replace('{{studentName}}', student.firstName);
                    const emailBody = config.birthdayEmailTemplate.replace('{{studentName}}', student.firstName);

                    try {
                        const transporter = await initializeSMTP();
                        if (transporter) {
                            const mailOptions = {
                                from: `"${config.emailFromName || 'Padhaku'}" <${config.emailUser}>`,
                                to: student.email,
                                subject: emailSubject,
                                html: emailBody
                            };

                            await transporter.sendMail(mailOptions);
                            console.log(`✓ Birthday email sent to ${student.firstName} (${student.email})`);
                            emailSent = true;
                        } else {
                            console.warn(`⚠ SMTP not configured - skipping email for ${student.firstName}`);
                        }
                    } catch (emailErr) {
                        console.error(`✗ Failed to send email to ${student.firstName}:`, emailErr.message);
                    }
                }

                // Count as success if at least one notification method worked
                if (notificationSent || emailSent || (!config.enableBirthdayNotification && !config.enableBirthdayEmail)) {
                    notificationResults.success++;
                } else {
                    notificationResults.failed++;
                }
            } catch (err) {
                console.error(`✗ Error processing birthday for ${student.firstName}:`, err.message);
                notificationResults.failed++;
            }
        }

        console.log(`[${now.toISOString()}] Birthday notification summary - Success: ${notificationResults.success}, Failed: ${notificationResults.failed}`);
    } catch (err) {
        console.error('Error in birthday notification processor:', err);
    }
};

const startWorker = (intervalMs = 60000) => {
    initializeFirebase();

    const notificationHour = parseInt(process.env.BIRTHDAY_NOTIFICATION_HOUR) || 23;
    const notificationStartMinute = parseInt(process.env.BIRTHDAY_NOTIFICATION_START_MINUTE) || 30;

    console.log(`Starting notification worker (checking every ${intervalMs}ms)...`);
    console.log(`⏰ Birthday notification window: ${notificationHour}:${String(notificationStartMinute).padStart(2, '0')} - ${notificationHour}:59 (IST)`);
    console.log(`   To customize, set BIRTHDAY_NOTIFICATION_HOUR and BIRTHDAY_NOTIFICATION_START_MINUTE env vars`);

    // Run immediately on start
    processScheduledNotifications();
    processBirthdayNotifications();

    // Then run at intervals
    setInterval(processScheduledNotifications, intervalMs);
    setInterval(processBirthdayNotifications, intervalMs);
};

module.exports = {
    processScheduledNotifications,
    processBirthdayNotifications,
    startWorker
};
