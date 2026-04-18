import twilio from "twilio";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const hasVerifyConfig = Boolean(accountSid && authToken && verifyServiceSid);
const verifyClient = hasVerifyConfig ? twilio(accountSid, authToken) : null;

const asErrorMessage = (error) => {
  if (!error) {
    return "Unknown Twilio Verify error";
  }

  if (error instanceof Error) {
    return error.message || "Unknown Twilio Verify error";
  }

  if (typeof error === "object" && typeof error.message === "string") {
    return error.message;
  }

  return String(error);
};

if (!hasVerifyConfig) {
  console.warn(
    "⚠️ Twilio Verify is not fully configured. Missing Account SID, Auth Token, or Verify Service SID.",
  );
}

export const sendOtpViaVerify = async (phoneNumber) => {
  try {
    if (!verifyClient) {
      return {
        success: false,
        error:
          "Twilio Verify is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID.",
      };
    }

    const result = await verifyClient.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return {
      success: result.status === "pending",
      status: result.status,
    };
  } catch (error) {
    const message = asErrorMessage(error);
    console.error(`❌ Error sending Verify OTP to ${phoneNumber}:`, message);
    return {
      success: false,
      error: message,
    };
  }
};

export const checkOtpViaVerify = async (phoneNumber, otp) => {
  try {
    if (!verifyClient) {
      return {
        approved: false,
        status: "missing_config",
        error:
          "Twilio Verify is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID.",
      };
    }

    const result = await verifyClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code: otp });

    return {
      approved: result.status === "approved",
      status: result.status,
    };
  } catch (error) {
    const message = asErrorMessage(error);
    console.error(
      `❌ Error verifying OTP via Twilio Verify for ${phoneNumber}:`,
      message,
    );
    return { approved: false, status: "failed", error: message };
  }
};

export const isVerifyConfigured = () => hasVerifyConfig;

export default {
  sendOtpViaVerify,
  checkOtpViaVerify,
  isVerifyConfigured,
};
