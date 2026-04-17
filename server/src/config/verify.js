import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const hasVerifyConfig = Boolean(accountSid && authToken && verifyServiceSid);
const verifyClient = hasVerifyConfig ? twilio(accountSid, authToken) : null;

if (!hasVerifyConfig) {
  console.warn("⚠️ Twilio Verify is not fully configured. Missing Account SID, Auth Token, or Verify Service SID.");
}

export const sendOtpViaVerify = async (phoneNumber) => {
  try {
    if (!verifyClient) return false;

    const result = await verifyClient.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return result.status === "pending";
  } catch (error) {
    console.error(`❌ Error sending Verify OTP to ${phoneNumber}:`, error.message);
    return false;
  }
};

export const checkOtpViaVerify = async (phoneNumber, otp) => {
  try {
    if (!verifyClient) return { approved: false, status: "missing_config" };

    const result = await verifyClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code: otp });

    return {
      approved: result.status === "approved",
      status: result.status,
    };
  } catch (error) {
    console.error(`❌ Error verifying OTP via Twilio Verify for ${phoneNumber}:`, error.message);
    return { approved: false, status: "failed" };
  }
};

export const isVerifyConfigured = () => hasVerifyConfig;

export default {
  sendOtpViaVerify,
  checkOtpViaVerify,
  isVerifyConfigured,
};
