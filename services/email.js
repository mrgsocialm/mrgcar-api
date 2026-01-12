/**
 * Email Service using Resend API
 * 
 * Environment Variables:
 *   RESEND_API_KEY  - Required: Your Resend API key
 *   EMAIL_FROM      - Optional: Sender address (must be valid email format)
 *                     Format: "email@example.com" or "Name <email@example.com>"
 *                     Default: "MRGCar <onboarding@resend.dev>"
 *   EMAIL_REPLY_TO  - Optional: Reply-to address
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API_URL = 'https://api.resend.com/emails';

// Email format regex: matches "email@domain.com" or "Name <email@domain.com>"
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_WITH_NAME_REGEX = /^.+\s*<[^\s@]+@[^\s@]+\.[^\s@]+>$/;

/**
 * Validates and normalizes the FROM address
 * @param {string} fromValue - Value from .env
 * @returns {string} - Valid FROM address
 */
function getValidFromAddress(fromValue) {
  const fallback = 'MRGCar <onboarding@resend.dev>';

  if (!fromValue || typeof fromValue !== 'string') {
    console.warn(`⚠️ EMAIL_FROM not set, using fallback: ${fallback}`);
    return fallback;
  }

  const trimmed = fromValue.trim();

  // Check if it's a valid format
  if (EMAIL_REGEX.test(trimmed) || EMAIL_WITH_NAME_REGEX.test(trimmed)) {
    return trimmed;
  }

  console.error(`❌ Invalid EMAIL_FROM format: "${trimmed}"`);
  console.error(`   Expected: "email@example.com" or "Name <email@example.com>"`);
  console.error(`   Using fallback: ${fallback}`);
  return fallback;
}

// Read and validate configuration at startup
const EMAIL_FROM = getValidFromAddress(process.env.EMAIL_FROM);
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || null;

// Startup logging
console.log('📧 Email Service Configuration:');
console.log(`   FROM: "${EMAIL_FROM}"`);
console.log(`   REPLY_TO: "${EMAIL_REPLY_TO || '(not set)'}"`);
console.log(`   API Key: ${RESEND_API_KEY ? '✓ Set' : '✗ Missing!'}`);

/**
 * Send an email using Resend API
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @param {string} [options.replyTo] - Override reply-to address (optional)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!RESEND_API_KEY) {
    console.error('❌ FATAL: RESEND_API_KEY is not defined!');
    return { success: false, error: 'Email service not configured' };
  }

  // Build request payload
  const payload = {
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };

  // Add optional fields
  if (text) payload.text = text;
  if (replyTo || EMAIL_REPLY_TO) {
    payload.reply_to = replyTo || EMAIL_REPLY_TO;
  }

  console.log(`📧 Sending email to: ${payload.to.join(', ')}`);
  console.log(`   From: ${payload.from}`);
  console.log(`   Subject: ${subject}`);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ Email sent successfully! ID: ${data.id}`);
      return { success: true, id: data.id };
    } else {
      console.error('❌ Resend API Error:', JSON.stringify(data, null, 2));
      return { success: false, error: data.message || 'Resend API rejected request' };
    }
  } catch (error) {
    console.error('❌ Network/Fetch Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset code email
 * @param {string} email - Recipient email
 * @param {string} code - 6-digit verification code
 * @param {string} [userName] - User's name (optional)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendPasswordResetEmail(email, code, userName = 'Değerli Kullanıcımız') {
  const subject = 'MRGCar - Şifre Sıfırlama Kodu';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Şifre Sıfırlama</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🚗 MRGCar</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Şifre Sıfırlama Talebi</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 32px 24px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">
        Merhaba <strong>${userName}</strong>,
      </p>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        MRGCar hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki kodu kullanarak şifrenizi yenileyebilirsiniz:
      </p>
      
      <!-- Code Box -->
      <div style="background: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center; margin: 0 0 24px;">
        <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Doğrulama Kodu</p>
        <div style="font-size: 36px; font-weight: 700; color: #3b82f6; letter-spacing: 8px; font-family: 'Courier New', monospace;">
          ${code}
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin: 12px 0 0;">
          Bu kod 10 dakika içinde geçerliliğini yitirecektir.
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Eğer bu talebi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz. Hesabınız güvende.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      
      <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
        Bu email otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © 2024 MRGCar. Tüm hakları saklıdır.
      </p>
    </div>
  </div>
</body>
</html>
    `;

  const text = `
MRGCar - Şifre Sıfırlama

Merhaba ${userName},

MRGCar hesabınız için şifre sıfırlama talebinde bulundunuz.

Doğrulama Kodunuz: ${code}

Bu kod 10 dakika içinde geçerliliğini yitirecektir.

Eğer bu talebi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.

© 2024 MRGCar
    `;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send a support request email to admin (mrgsocial@gmail.com)
 * @param {string} userEmail - The user's email address
 * @param {string} userName - The user's name (optional)
 * @param {string} message - The support message/problem description
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendSupportEmail(userEmail, userName, message) {
  const adminEmail = 'mrgsocial@gmail.com';
  const subject = `Destek Talebi: ${userName || userEmail}`;
  const fromName = userName || 'Kullanıcı';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #333; border-bottom: 2px solid #E53935; padding-bottom: 10px;">Yeni Destek Talebi</h2>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Gönderen:</strong> ${fromName}</p>
        <p style="margin: 5px 0;"><strong>E-posta:</strong> ${userEmail}</p>
        <p style="margin: 5px 0;"><strong>Tarih:</strong> ${new Date().toLocaleString('tr-TR')}</p>
      </div>

      <div style="padding: 10px 0;">
        <h3 style="color: #555;">Mesaj:</h3>
        <p style="white-space: pre-wrap; color: #333; line-height: 1.5; font-size: 16px;">${message}</p>
      </div>
      
      <div style="margin-top: 30px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
        <p>Bu e-posta MRGCar uygulamasından gönderilmiştir.</p>
      </div>
    </div>
  `;

  const text = `
    YENİ DESTEK TALEBİ
    ==================
    Gönderen: ${fromName} (${userEmail})
    Tarih: ${new Date().toLocaleString('tr-TR')}

    Mesaj:
    ${message}
  `;

  // We set replyTo to the user's email so replying to this email goes to the user
  return sendEmail({
    to: adminEmail,
    subject,
    html,
    text,
    replyTo: userEmail
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendSupportEmail,
  // Export for testing
  getValidFromAddress,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
};
