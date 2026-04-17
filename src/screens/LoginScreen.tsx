import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Sparkles } from "lucide-react";
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
      initial={{ opacity: 0, y: 20, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.99 }}
      transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex h-full flex-col overflow-hidden rounded-[2.35rem] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f7fb_42%,#eaf1f7_100%)] px-8 py-7"
    >
      <div className="pointer-events-none absolute -left-10 top-20 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-14 top-36 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative mb-9 mt-2 flex items-center justify-between">
        <AppLogo />
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          <ShieldCheck size={11} className="text-emerald-600" />
          Secure Login
        </div>
      </div>

      <div className="relative mb-8 text-left">
        <motion.div
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700"
        >
          <Sparkles size={11} />
          Verified Access
        </motion.div>

        <motion.h2
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-[2.15rem] font-black leading-tight tracking-[-0.02em] text-transparent bg-clip-text bg-[linear-gradient(110deg,#0f172a_0%,#0f172a_36%,#0f766e_72%,#10b981_100%)]"
        >
          Welcome Back
        </motion.h2>

        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-2 max-w-[290px] text-sm leading-relaxed text-slate-600"
        >
          Sign in as a {userType} to continue your protected SafeRide journey.
        </motion.p>
      </div>

      <div className="relative flex-1 space-y-4">
        <Button
          type="button"
          className="w-full rounded-2xl bg-[linear-gradient(96deg,#0a8f78_0%,#10b981_50%,#38d39f_100%)] py-4 text-sm font-bold text-white shadow-[0_16px_28px_-12px_rgba(16,185,129,0.55)]"
          onClick={handleSkipForNow}
        >
          Skip OTP for now and continue
        </Button>

        <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.3)] backdrop-blur">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700">Phone number</label>
          <div className="mt-2 flex gap-2">
            <Input
              type="tel"
              inputMode="tel"
              placeholder="Enter your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isOtpSent || isLoading}
              className="flex-1 rounded-xl border-slate-200 bg-white"
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-slate-200 px-3 text-xs font-semibold text-slate-700"
              disabled={!phone || isLoading}
              onClick={handleSendOtp}
              loading={isLoading}
            >
              {isLoading ? "Sending..." : "Get OTP"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Use international format like +15551234567 so the OTP reaches the registered SIM.
          </p>
        </div>

        {isOtpSent && (
          <motion.div
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.3)] backdrop-blur"
          >
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700">Enter 6-digit code</label>
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
              className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white"
              disabled={otp.length !== 6 || isLoading}
              onClick={handleContinue}
            >
              {isLoading ? "Verifying..." : "Verify OTP"}
            </Button>

            <Button
              variant="link"
              className="w-full text-xs text-slate-500"
              onClick={() => {
                setIsOtpSent(false);
                setOtp("");
                setStatus(null);
              }}
              disabled={isLoading}
            >
              Use a different number
            </Button>
          </motion.div>
        )}

        {status && (
          <div
            className={`rounded-xl p-3 text-center text-xs ${
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

      <p className="pb-8 text-center text-[11px] text-slate-500">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </p>
    </motion.div>
  );
};

export default LoginScreen;
