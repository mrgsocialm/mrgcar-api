/**
 * Email Service using Resend API
 * 
 * Setup:
 * 1. Sign up at https://resend.com
 * 2. Get API key from dashboard
 * 3. Add RESEND_API_KEY to .env file
 * 4. (Optional) Verify your domain for custom sender email
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API_URL = 'https://api.resend.com/emails';

// Default sender - change after domain verification
const DEFAULT_FROM = process.env.EMAIL_FROM || 'MRGCar <onboarding@resend.dev>';

/**
 * Send an email using Resend API
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.error('❌ FATAL: RESEND_API_KEY is not defined in environment variables!');
    return { success: false, error: 'Email service config missing' };
  }

  // Debug log to confirm key is loaded (masked)
  console.log(`📧 Attempting to send email to: ${to}`);
  console.log(`📨 Sender Address (FROM): ${DEFAULT_FROM}`);
  console.log(`🔑 Resend Key Status: ${RESEND_API_KEY.startsWith('re_') ? 'Valid Prefix (re_...)' : 'Invalid Prefix'}`);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [to],
        subject,
        html,
        text: text || undefined,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ Email sent successfully! ID: ${data.id}`);
      return { success: true, id: data.id };
    } else {
      console.error('❌ Resend API Error Response:', JSON.stringify(data, null, 2));
      return { success: false, error: data.message || 'Resend API rejected request' };
    }
  } catch (error) {
    console.error('❌ Network/Fetch Error:', error);
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

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
};
