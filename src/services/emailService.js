const nodemailer = require('nodemailer');
const { buildPasswordActionEmail } = require('./emailTemplates/passwordActionEmail');
const { buildReportNotificationEmail } = require('./emailTemplates/reportNotificationEmail');

function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    } : undefined
  });
}

async function sendPasswordActionEmail({ email, name, actionUrl, purpose }) {
  const message = buildPasswordActionEmail({ name, actionUrl, purpose });
  const transport = createTransport();

  if (!transport) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Email preview] ${message.subject} for ${email}: ${actionUrl}`);
      return { previewUrl: actionUrl };
    }
    throw new Error('SMTP is not configured.');
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || 'IIG Workspace <nhannguyen14.dev@gmail.com>',
    to: email,
    ...message
  });
  return {};
}

async function sendReportNotification(payload) {
  const message=buildReportNotificationEmail(payload);const transport=createTransport();
  if(!transport){if(process.env.NODE_ENV!=='production'){console.log(`[Email preview] ${message.subject} for ${payload.email}: ${payload.actionUrl}`);return {previewUrl:payload.actionUrl};}throw new Error('SMTP is not configured.');}
  await transport.sendMail({from:process.env.SMTP_FROM||'IIG Workspace <nhannguyen14.dev@gmail.com>',to:payload.email,...message});return {};
}

module.exports = { sendPasswordActionEmail,sendReportNotification };
