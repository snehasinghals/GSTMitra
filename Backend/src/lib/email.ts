import nodemailer, { type Transporter } from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

function getCleanEnv(val?: string): string {
  if (!val) return "";
  return val.trim().replace(/^["']|["']$/g, "");
}

const smtpHost = getCleanEnv(process.env.SMTP_HOST) || "smtp-relay.brevo.com";
const smtpPort = parseInt(getCleanEnv(process.env.SMTP_PORT) || "587", 10);
const smtpUser = getCleanEnv(process.env.SMTP_USER);
const smtpPass = getCleanEnv(process.env.SMTP_PASS);
const emailFrom = getCleanEnv(process.env.EMAIL_FROM) || "noreply@gstmitra.in";
const appUrl = getCleanEnv(process.env.APP_URL) || "http://localhost:3000";

let transporter: Transporter | null = null;

export function getEmailTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }
  return transporter;
}

export interface SendOtpEmailOptions {
  to: string;
  name?: string;
  code: string;
  purpose: "SIGNUP" | "LOGIN" | "RESET_PASSWORD";
}

export async function sendOtpEmail({ to, name, code, purpose }: SendOtpEmailOptions) {
  try {
    const mailer = getEmailTransporter();
    const fallbackName = to.split("@")[0] || "User";
    const displayName = (name && name.trim().length > 0 && name.trim() !== "12") ? name.trim() : fallbackName;
    const title =
      purpose === "SIGNUP"
        ? "Verify Your Email Address"
        : purpose === "RESET_PASSWORD"
        ? "Reset Your Password"
        : "Login Verification Code";
    const actionText =
      purpose === "SIGNUP"
        ? "complete your GSTMitra account registration"
        : purpose === "RESET_PASSWORD"
        ? "reset your GSTMitra account password"
        : "sign in to your GSTMitra account";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px; text-align: center;">
              <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; background-color: #2563eb; color: #ffffff; font-weight: 800; font-size: 20px; border-radius: 10px; margin-bottom: 10px;">
                GM
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">GSTMitra</h1>
              <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 13px;">Simple & Stress-Free GST for Small Businesses</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="font-size: 19px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">
                Hello ${displayName},
              </h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                Use the verification code below to ${actionText}:
              </p>

              <!-- Big OTP Box -->
              <div style="text-align: center; margin: 28px 0; background-color: #f1f5f9; border: 2px dashed #93c5fd; border-radius: 14px; padding: 24px 16px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 1px;">
                  Your 6-Digit Verification Code
                </p>
                <div style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #0f172a; letter-spacing: 10px; padding: 6px 0;">
                  ${code}
                </div>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #64748b;">
                  Valid for <strong>10 minutes</strong> · One-time use only
                </p>
              </div>

              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
                  <strong>Security Note:</strong> Never share this code with anyone. GSTMitra team will never call or message you asking for your verification code.
                </p>
              </div>

              <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 0;">
                If you didn't request this verification code, please ignore this email. Your account remains secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} GSTMitra · Plain & Simple GST Solutions.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const info = await mailer.sendMail({
      from: `"GSTMitra" <${emailFrom}>`,
      to,
      subject: `${code} is your GSTMitra verification code`,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email] Failed to send OTP email to ${to}:`, err.message || err);
    return { success: false, error: err.message };
  }
}

export interface SendSignupEmailOptions {
  to: string;
  name: string;
  businessName: string;
}

export async function sendSignupWelcomeEmail({ to, name, businessName }: SendSignupEmailOptions) {
  try {
    const mailer = getEmailTransporter();
    const loginUrl = `${appUrl}/login`;
    const fallbackName = to.split("@")[0] || "User";
    const displayName = (name && name.trim().length > 0 && name.trim() !== "12") ? name.trim() : fallbackName;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to GSTMitra</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1d4ed8; padding: 32px; text-align: center;">
              <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; background-color: #ffffff; color: #1d4ed8; font-weight: 800; font-size: 20px; border-radius: 10px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                GM
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">GSTMitra</h1>
              <p style="color: #bfdbfe; margin: 4px 0 0 0; font-size: 13px;">Simple & Stress-Free GST for Small Businesses</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">
                Welcome, ${displayName}! 🎉
              </h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                Your GSTMitra account for <strong>${businessName}</strong> has been created and verified successfully. You are now all set to manage sales, track purchases, audit taxes, and file GST returns in plain language without fear.
              </p>

              <!-- Account Details Card -->
              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px; border-left: 4px solid #2563eb;">
                <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase;">Account Overview</p>
                <p style="margin: 0 0 4px 0; font-size: 14px; color: #1e293b;"><strong>Registered Email:</strong> ${to}</p>
                <p style="margin: 0; font-size: 14px; color: #1e293b;"><strong>Business Name:</strong> ${businessName}</p>
              </div>

              <!-- Action Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 32px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
                  Go to Dashboard
                </a>
              </div>

              <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
                Need help or have questions? Check out our built-in <strong>Beginner Guidance</strong> or <strong>GST Dictionary</strong> right in your dashboard.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} GSTMitra · Plain & Simple GST Solutions. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const info = await mailer.sendMail({
      from: `"GSTMitra" <${emailFrom}>`,
      to,
      subject: `🎉 Welcome to GSTMitra, ${displayName}! Your Account is Ready`,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email] Failed to send signup welcome email to ${to}:`, err.message || err);
    return { success: false, error: err.message };
  }
}

export interface SendLoginAlertOptions {
  to: string;
  name?: string;
  ip?: string;
  userAgent?: string;
}

export async function sendLoginAlertEmail({ to, name, ip, userAgent }: SendLoginAlertOptions) {
  try {
    const mailer = getEmailTransporter();
    const fallbackName = to.split("@")[0] || "User";
    const displayName = (name && name.trim().length > 0 && name.trim() !== "12") ? name.trim() : fallbackName;

    let displayIp = ip;
    if (!displayIp || displayIp === "::1" || displayIp === "127.0.0.1") {
      displayIp = "127.0.0.1 (Localhost)";
    }

    const loginTime = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Login Security Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px; text-align: center;">
              <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; background-color: #2563eb; color: #ffffff; font-weight: 800; font-size: 18px; border-radius: 10px; margin-bottom: 10px;">
                GM
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">GSTMitra Security Notice</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">
                Hello ${displayName},
              </h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                We detected a recent sign-in to your <strong>GSTMitra</strong> account.
              </p>

              <!-- Session Details Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase;">Login Details</p>
                <p style="margin: 0 0 6px 0; font-size: 14px; color: #1e293b;"><strong>Date & Time:</strong> ${loginTime} (IST)</p>
                <p style="margin: 0 0 6px 0; font-size: 14px; color: #1e293b;"><strong>Email Account:</strong> ${to}</p>
                <p style="margin: 0 0 6px 0; font-size: 14px; color: #1e293b;"><strong>IP Address:</strong> ${displayIp}</p>
                ${userAgent ? `<p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Device / Browser:</strong> ${userAgent.slice(0, 100)}</p>` : ""}
              </div>

              <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; color: #065f46; line-height: 1.5;">
                  <strong>Was this you?</strong> If you just signed in, you can safely disregard this email.
                </p>
              </div>

              <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; border-radius: 8px; padding: 14px 16px;">
                <p style="margin: 0; font-size: 13px; color: #9f1239; line-height: 1.5;">
                  <strong>Didn't sign in?</strong> If you did not initiate this login, please change your password immediately to protect your account.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} GSTMitra · Security & Privacy.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const info = await mailer.sendMail({
      from: `"GSTMitra Security" <${emailFrom}>`,
      to,
      subject: `🔐 GSTMitra Security Alert: Successful Login to your Account`,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email] Failed to send login alert email to ${to}:`, err.message || err);
    return { success: false, error: err.message };
  }
}

export interface SendPasswordChangedEmailOptions {
  to: string;
  name?: string;
  ip?: string;
}

export async function sendPasswordChangedEmail({ to, name, ip }: SendPasswordChangedEmailOptions) {
  try {
    const mailer = getEmailTransporter();
    const fallbackName = to.split("@")[0] || "User";
    const displayName = (name && name.trim().length > 0 && name.trim() !== "12") ? name.trim() : fallbackName;

    let displayIp = ip;
    if (!displayIp || displayIp === "::1" || displayIp === "127.0.0.1") {
      displayIp = "127.0.0.1 (Localhost)";
    }

    const changedTime = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Changed Successfully</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px; text-align: center;">
              <div style="display: inline-block; width: 40px; height: 40px; line-height: 40px; background-color: #2563eb; color: #ffffff; font-weight: 800; font-size: 18px; border-radius: 10px; margin-bottom: 10px;">
                GM
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">GSTMitra Security Notice</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">
                Hello ${displayName},
              </h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                Your <strong>GSTMitra</strong> account password was changed successfully.
              </p>

              <!-- Session Details Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase;">Activity Summary</p>
                <p style="margin: 0 0 6px 0; font-size: 14px; color: #1e293b;"><strong>Date & Time:</strong> ${changedTime} (IST)</p>
                <p style="margin: 0 0 6px 0; font-size: 14px; color: #1e293b;"><strong>Account:</strong> ${to}</p>
                <p style="margin: 0; font-size: 14px; color: #1e293b;"><strong>IP Address:</strong> ${displayIp}</p>
              </div>

              <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 13px; color: #065f46; line-height: 1.5;">
                  All other active sessions have been signed out. Please log in with your new password.
                </p>
              </div>

              <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; border-radius: 8px; padding: 14px 16px;">
                <p style="margin: 0; font-size: 13px; color: #9f1239; line-height: 1.5;">
                  <strong>Didn't make this change?</strong> If you did not request this password reset, please contact us immediately to secure your account.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} GSTMitra · Security & Privacy.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const info = await mailer.sendMail({
      from: `"GSTMitra Security" <${emailFrom}>`,
      to,
      subject: `🔒 GSTMitra Security Alert: Your Password Was Changed`,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email] Failed to send password changed email to ${to}:`, err.message || err);
    return { success: false, error: err.message };
  }
}

