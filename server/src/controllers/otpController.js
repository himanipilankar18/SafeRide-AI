import { sendOtpViaSms, getOtpProvider } from "../config/twilio.js";
import { sendOtpViaVerify, checkOtpViaVerify, isVerifyConfigured } from "../config/verify.js";

// In-memory store for OTP (in production, use database)
const otpStore = new Map();
const exposeOtpInResponse = process.env.EXPOSE_OTP_IN_RESPONSE === "true";
const otpProvider = getOtpProvider();

/**
 * Generate a random 6-digit OTP
 * @returns {string} - 6-digit OTP
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const isValidE164 = (phoneNumber) => /^\+[1-9]\d{1,14}$/.test(phoneNumber);

/**
 * Send OTP to phone number
 * @param {string} phoneNumber - User's phone number
 * @param {string} userType - "driver" or "passenger"
 * @returns {Promise<{success: boolean, message: string, expiresIn: number}>}
 */
export const sendOtp = async (phoneNumber, userType = "passenger") => {
  try {
    // Validate phone number format for real SMS delivery
    if (!phoneNumber || !isValidE164(phoneNumber)) {
      return {
        success: false,
        message: "Invalid phone number. Use international format like +15551234567.",
      };
    }

    // Check if OTP was already sent recently (prevent spam)
    const existing = otpStore.get(phoneNumber);
    if (existing && Date.now() - existing.sentAt < 30000) {
      // 30 second throttle
      return {
        success: false,
        message: "Please wait 30 seconds before requesting a new OTP.",
      };
    }

    if (otpProvider === "verify") {
      if (!isVerifyConfigured()) {
        return {
          success: false,
          message: "Twilio Verify is not configured. Please set TWILIO_VERIFY_SERVICE_SID.",
        };
      }

      const verifySent = await sendOtpViaVerify(phoneNumber);
      if (!verifySent) {
        return {
          success: false,
          message: "Failed to send OTP via Twilio Verify. Please try again.",
        };
      }

      otpStore.set(phoneNumber, {
        sentAt: Date.now(),
        attempts: 0,
        userType,
      });

      return {
        success: true,
        message: `OTP sent to ${phoneNumber}. Valid for 10 minutes.`,
        expiresIn: 600,
      };
    }

    // Generate OTP
    const otp = generateOtp();
    const expiresIn = 10 * 60 * 1000; // 10 minutes
    const expiresAt = Date.now() + expiresIn;

    // Send via SMS
    const smsResult = await sendOtpViaSms(phoneNumber, otp);

    if (!smsResult.success) {
      return {
        success: false,
        message: smsResult.error || "Failed to send OTP. Please try again.",
      };
    }

    // Store OTP
    otpStore.set(phoneNumber, {
      otp,
      expiresAt,
      sentAt: Date.now(),
      attempts: 0,
      userType,
    });

    return {
      success: true,
      message: `OTP sent to ${phoneNumber}. Valid for 10 minutes.`,
      expiresIn: expiresIn / 1000, // in seconds
      ...(exposeOtpInResponse ? { demoOtp: otp } : {}),
    };
  } catch (error) {
    console.error("Error in sendOtp:", error);
    return {
      success: false,
      message: "An error occurred while sending OTP. Please try again.",
    };
  }
};

/**
 * Verify OTP
 * @param {string} phoneNumber - User's phone number
 * @param {string} otp - OTP entered by user
 * @returns {Promise<{success: boolean, message: string, userType?: string}>}
 */
export const verifyOtp = async (phoneNumber, otp) => {
  try {
    if (!phoneNumber || !otp) {
      return {
        success: false,
        message: "Phone number and OTP are required.",
      };
    }

    const stored = otpStore.get(phoneNumber);

    if (!stored) {
      return {
        success: false,
        message: "No OTP found for this phone number. Please request a new one.",
      };
    }

    if (otpProvider === "verify") {
      if (!stored) {
        return {
          success: false,
          message: "No OTP found for this phone number. Please request a new one.",
        };
      }

      const verifyResult = await checkOtpViaVerify(phoneNumber, otp);
      if (!verifyResult.approved) {
        stored.attempts += 1;
        if (stored.attempts >= 5) {
          otpStore.delete(phoneNumber);
          return {
            success: false,
            message: "Too many failed attempts. Please request a new OTP.",
          };
        }
        otpStore.set(phoneNumber, stored);
        return {
          success: false,
          message: `Invalid OTP. ${5 - stored.attempts} attempts remaining.`,
        };
      }

      const userType = stored.userType || "passenger";
      otpStore.delete(phoneNumber);
      return {
        success: true,
        message: "OTP verified successfully.",
        userType,
        phoneNumber,
      };
    }

    // Check if OTP has expired
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phoneNumber);
      return {
        success: false,
        message: "OTP has expired. Please request a new one.",
      };
    }

    // Check attempt count (max 5 attempts)
    if (stored.attempts >= 5) {
      otpStore.delete(phoneNumber);
      return {
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      };
    }

    // Verify OTP
    if (stored.otp !== otp) {
      stored.attempts += 1;
      otpStore.set(phoneNumber, stored);
      return {
        success: false,
        message: `Invalid OTP. ${5 - stored.attempts} attempts remaining.`,
      };
    }

    // OTP is valid
    const userType = stored.userType;
    otpStore.delete(phoneNumber);

    return {
      success: true,
      message: "OTP verified successfully.",
      userType,
      phoneNumber,
    };
  } catch (error) {
    console.error("Error in verifyOtp:", error);
    return {
      success: false,
      message: "An error occurred while verifying OTP.",
    };
  }
};

/**
 * Clear expired OTPs (cleanup)
 */
export const clearExpiredOtps = () => {
  const now = Date.now();
  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(phone);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(clearExpiredOtps, 5 * 60 * 1000);

export default {
  sendOtp,
  verifyOtp,
  clearExpiredOtps,
};
