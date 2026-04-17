import twilio from "twilio";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const otpProvider = (process.env.OTP_PROVIDER || "twilio").toLowerCase();
const smsMode = (process.env.SMS_MODE || "direct").toLowerCase();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const hasPlaceholderCredentials =
  !accountSid ||
  !authToken ||
  !twilioPhoneNumber ||
  /x{6,}/i.test(accountSid) ||
  authToken.includes("your_auth_token_here") ||
  twilioPhoneNumber === "+1234567890";
const hasTwilioConfig =
  Boolean(accountSid && authToken && twilioPhoneNumber) &&
  !hasPlaceholderCredentials;
const hasSmsConfig = hasTwilioConfig;

if (otpProvider === "mock" || !hasSmsConfig) {
  console.warn(
    "⚠️ Twilio credentials not configured. Using mock mode for testing.",
  );
}

const client = hasSmsConfig ? twilio(accountSid, authToken) : null;

const asErrorMessage = (error) => {
  if (!error) {
    return "Unknown SMS error";
  }

  if (typeof error === "object") {
    const twilioError = error;
    const baseMessage =
      typeof twilioError.message === "string" && twilioError.message.trim()
        ? twilioError.message.trim()
        : "Unknown SMS error";
    const codeText =
      typeof twilioError.code === "number" ||
      typeof twilioError.code === "string"
        ? ` (Twilio code: ${twilioError.code})`
        : "";

    return `${baseMessage}${codeText}`;
  }

  return error instanceof Error ? error.message : "Unknown SMS error";
};

export const sendOtpViaSms = async (phoneNumber, otp) => {
  const body = `SafeRide Security Code: ${otp}\n\nEnter this code to verify your ${phoneNumber} account. Valid for 10 minutes.`;

  if (!client) {
    console.log(`[MOCK] Would send OTP "${otp}" to ${phoneNumber}`);
    return { success: true, sid: "mock-otp-message" };
  }

  try {
    const message = await client.messages.create({
      body,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });
    return { success: true, sid: message.sid };
  } catch (error) {
    return { success: false, error: asErrorMessage(error) };
  }
};

export const sendSms = async (phoneNumber, body) => {
  if (!client) {
    console.log(`[MOCK] Would send SMS to ${phoneNumber}: ${body}`);
    return { success: true, sid: "mock-message" };
  }

  if (smsMode !== "direct") {
    return {
      success: false,
      error:
        "SOS SMS is configured for Twilio Direct Messages API only. Set SMS_MODE=direct.",
    };
  }

  if (!hasTwilioConfig) {
    return {
      success: false,
      error:
        "SOS SMS requires a valid Twilio SMS-capable TWILIO_PHONE_NUMBER for Direct Messages API.",
    };
  }

  try {
    const message = await client.messages.create({
      body,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });
    console.log(`✅ SOS SMS sent to ${phoneNumber}. SID=${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    const errorMessage = asErrorMessage(error);
    console.error(`❌ SOS SMS failed for ${phoneNumber}: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
};

export const getOtpProvider = () => otpProvider;

export default { sendOtpViaSms, sendSms, getOtpProvider };
