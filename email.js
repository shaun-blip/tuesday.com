// ===== tuesday.com - Email Notification Service =====
const nodemailer = require('nodemailer');

let transporter = null;

function initTransporter() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.log('Email notifications disabled (GMAIL_USER/GMAIL_APP_PASSWORD not set)');
        return;
    }
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    console.log('Email notifications enabled via Gmail');
}

const baseStyle = `
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    max-width: 560px; margin: 0 auto; padding: 24px;
    background: #f6f7fb; border-radius: 8px;
`;
const headerStyle = `
    background: #292f4c; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;
    font-size: 18px; font-weight: 600;
`;
const bodyStyle = `
    background: white; padding: 24px; border-radius: 0 0 8px 8px;
    border: 1px solid #e6e9ef; border-top: none;
`;
const btnStyle = `
    display: inline-block; padding: 10px 24px; background: #0073ea;
    color: white; text-decoration: none; border-radius: 4px; font-weight: 600;
`;

function wrap(title, body) {
    return `<div style="${baseStyle}">
        <div style="${headerStyle}">🔵 tuesday.com — ${title}</div>
        <div style="${bodyStyle}">${body}</div>
        <p style="text-align:center;color:#676879;font-size:12px;margin-top:12px;">
            This is an automated notification from tuesday.com
        </p>
    </div>`;
}

async function sendAssignmentEmail(toEmail, assigneeName, itemTitle, assignerName) {
    if (!transporter) return;
    const html = wrap('New Assignment', `
        <p>Hi <strong>${assigneeName}</strong>,</p>
        <p><strong>${assignerName}</strong> assigned you to:</p>
        <h3 style="color:#0073ea;margin:16px 0;">${itemTitle}</h3>
        <p>Log in to view and manage this item.</p>
    `);
    try {
        await transporter.sendMail({
            from: `"tuesday.com" <${process.env.GMAIL_USER}>`,
            to: toEmail,
            subject: `You've been assigned to "${itemTitle}"`,
            html
        });
    } catch (e) { console.error('Email error:', e.message); }
}

async function sendUpdateEmail(toEmail, recipientName, itemTitle, authorName, updateText) {
    if (!transporter) return;
    const preview = updateText.length > 200 ? updateText.substring(0, 200) + '...' : updateText;
    const html = wrap('New Update', `
        <p>Hi <strong>${recipientName}</strong>,</p>
        <p><strong>${authorName}</strong> posted an update on:</p>
        <h3 style="color:#0073ea;margin:16px 0;">${itemTitle}</h3>
        <div style="background:#f6f7fb;padding:12px 16px;border-radius:4px;border-left:3px solid #0073ea;margin:16px 0;">
            ${preview}
        </div>
        <p>Log in to see the full update and reply.</p>
    `);
    try {
        await transporter.sendMail({
            from: `"tuesday.com" <${process.env.GMAIL_USER}>`,
            to: toEmail,
            subject: `${authorName} posted on "${itemTitle}"`,
            html
        });
    } catch (e) { console.error('Email error:', e.message); }
}

async function sendMentionEmail(toEmail, recipientName, itemTitle, authorName, updateText) {
    if (!transporter) return;
    const preview = updateText.length > 200 ? updateText.substring(0, 200) + '...' : updateText;
    const html = wrap('You Were Mentioned', `
        <p>Hi <strong>${recipientName}</strong>,</p>
        <p><strong>${authorName}</strong> mentioned you in an update on:</p>
        <h3 style="color:#0073ea;margin:16px 0;">${itemTitle}</h3>
        <div style="background:#f6f7fb;padding:12px 16px;border-radius:4px;border-left:3px solid #ff158a;margin:16px 0;">
            ${preview}
        </div>
        <p>Log in to see the full update and reply.</p>
    `);
    try {
        await transporter.sendMail({
            from: `"tuesday.com" <${process.env.GMAIL_USER}>`,
            to: toEmail,
            subject: `${authorName} mentioned you on "${itemTitle}"`,
            html
        });
    } catch (e) { console.error('Email error:', e.message); }
}

module.exports = { initTransporter, sendAssignmentEmail, sendUpdateEmail, sendMentionEmail };
