import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AppLogo from "@/components/AppLogo";

interface LoginScreenProps {
  onLogin: (user: { phoneNumber: string; userType: string; token: string }) => void;
  userType: "driver" | "passenger";
}

const LoginScreen = ({ onLogin, userType }: LoginScreenProps) => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"info" | "error" | "success">("info");
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

  const handleSkipForNow = () => {
    const fallbackPhone = phone.trim() || (userType === "driver" ? "driver-demo" : "passenger-demo");
    const token = `demo-${userType}-${Date.now()}`;

    localStorage.setItem("authToken", token);
    localStorage.setItem("userType", userType);
    localStorage.setItem("phoneNumber", fallbackPhone);

    setStatus("OTP skipped for now. Entering the app directly.");
    setStatusType("success");

    onLogin({
      phoneNumber: fallbackPhone,
      userType,
      token,
    });
  };

  const handleSendOtp = async () => {
    if (!phone) return;
    
    setIsLoading(true);
    setStatus(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, userType }),
      });

      const data = await response.json();

      if (data.success) {
        setIsOtpSent(true);
        setOtp("");
        setStatus(data.message);
        setStatusType("success");
      } else {
        setStatus(data.message || "Failed to send OTP");
        setStatusType("error");
      }
    } catch (error) {
      setStatus("Network error. Please try again.");
      setStatusType("error");
      console.error("Error sending OTP:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    if (otp.length !== 6) return;

    setIsLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, otp }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus("OTP verified successfully!");
        setStatusType("success");
        
        // Register/Login the user
        const authResponse = await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phone, userType }),
        });

        const authData = await authResponse.json();
        
        if (authData.success) {
          // Store token in localStorage
          localStorage.setItem("authToken", authData.token);
          localStorage.setItem("userType", userType);
          localStorage.setItem("phoneNumber", phone);
          
          // Call onLogin callback
          onLogin({
            phoneNumber: phone,
            userType,
            token: authData.token,
          });
        }
      } else {
        setStatus(data.message || "Failed to verify OTP");
        setStatusType("error");
      }
    } catch (error) {
      setStatus("Network error. Please try again.");
      setStatusType("error");
      console.error("Error verifying OTP:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col h-full px-8 py-6"
    >
      <div className="mb-12 mt-4">
        <AppLogo />
      </div>

      <div className="space-y-2 mb-10">
        <h2 className="text-2xl font-extrabold text-foreground">Welcome back</h2>
        <p className="text-muted-foreground text-sm">
          Sign in as a {userType} to continue your safe journey
        </p>
      </div>

      <div className="space-y-4 flex-1">
        <Button
          type="button"
          className="w-full py-4 rounded-2xl text-sm font-semibold"
          onClick={handleSkipForNow}
        >
          Skip OTP for now and continue
        </Button>

        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Phone number</label>
          <div className="flex gap-2">
            <Input
              type="tel"
              inputMode="tel"
              placeholder="Enter your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isOtpSent || isLoading}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              className="text-xs font-semibold px-3"
              disabled={!phone || isLoading}
              onClick={handleSendOtp}
              loading={isLoading}
            >
              {isLoading ? "Sending..." : "Get OTP"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Use international format like +15551234567 so the OTP reaches the registered SIM.
          </p>
        </div>

        {isOtpSent && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Enter 6-digit code</label>
              <InputOTP maxLength={6} value={otp} onChange={(value) => setOtp(value)} autoFocus disabled={isLoading}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              className="w-full py-4 rounded-2xl text-sm font-semibold"
              disabled={otp.length !== 6 || isLoading}
              onClick={handleContinue}
            >
              {isLoading ? "Verifying..." : "Verify OTP"}
            </Button>

            <Button
              variant="link"
              className="w-full text-xs text-muted-foreground"
              onClick={() => {
                setIsOtpSent(false);
                setOtp("");
                setStatus(null);
              }}
              disabled={isLoading}
            >
              Use a different number
            </Button>
          </>
        )}

        {status && (
          <div
            className={`p-3 rounded-lg text-xs text-center ${
              statusType === "success"
                ? "bg-green-100 text-green-800"
                : statusType === "error"
                ? "bg-red-100 text-red-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {status}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground pb-10">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </p>
    </motion.div>
  );
};

export default LoginScreen;
