import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const otpProvider = (process.env.OTP_PROVIDER || "twilio").toLowerCase();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const useMockProvider = otpProvider === "mock";
const hasTwilioConfig = Boolean(accountSid && authToken && twilioPhoneNumber);
const isProbablyTwilioNumber = (value) => {
  const normalized = String(value || "").trim();
  return /^\+[1-9]\d{7,14}$/.test(normalized);
};

if (useMockProvider) {
  console.warn("⚠️ OTP_PROVIDER=mock. Using mock OTP mode for testing.");
} else if (otpProvider === "verify") {
  console.log("ℹ️ OTP_PROVIDER=verify. Twilio Verify flow enabled.");
} else if (!hasTwilioConfig) {
  console.warn(
    "⚠️ Twilio credentials not configured. Using mock mode for testing.",
  );
}

const client =
  !useMockProvider && hasTwilioConfig ? twilio(accountSid, authToken) : null;

/**
 * Send OTP via SMS using Twilio
 * @param {string} phoneNumber - Recipient's phone number
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>} - Success status
 */
export const sendOtpViaSms = async (phoneNumber, otp) => {
  try {
    if (!client) {
      console.log(`[MOCK] Would send OTP "${otp}" to ${phoneNumber}`);
      return true;
    }

    const message = await client.messages.create({
      body: `SafeRide Security Code: ${otp}\n\nEnter this code to verify your ${phoneNumber} account. Valid for 10 minutes.`,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`✅ SMS sent to ${phoneNumber} with SID: ${message.sid}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error.message);
    return false;
  }
};

export const sendSms = async (phoneNumber, body) => {
  try {
    if (!client) {
      console.log(`[MOCK] Would send SMS to ${phoneNumber}: ${body}`);
      return { success: true, sid: "mock-message" };
    }

    if (!isProbablyTwilioNumber(twilioPhoneNumber)) {
      return {
        success: false,
        error:
          "TWILIO_PHONE_NUMBER must be a Twilio-owned SMS-capable number in E.164 format, for example +14155552671.",
      };
    }

    const message = await client.messages.create({
      body,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`✅ SMS sent to ${phoneNumber} with SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error.message);
    return { success: false, error: error.message };
  }
};

export const getOtpProvider = () => otpProvider;

export default { sendOtpViaSms, sendSms, getOtpProvider };
