import { useState } from "react";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import synedifyLogo from "@/assets/synedify-logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";

type AuthView = "login" | "signup" | "forgot" | "magic";

export default function Auth() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AuthView>("login");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 h-64 w-64 rounded-full bg-primary-foreground blur-3xl" />
          <div className="absolute bottom-20 right-20 h-96 w-96 rounded-full bg-primary-foreground blur-3xl" />
        </div>
        <div className="relative z-10 text-center px-12">
         <img src={synedifyLogo} alt="Synedify logo" className="h-20 w-20 rounded-2xl mb-6 mx-auto" />
          <h1 className="text-4xl font-bold text-primary-foreground font-[family-name:var(--font-heading)] mb-4">
            Synedify
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            The collaboration platform for teams, clubs, and communities. Connect, organize, and thrive together.
          </p>
        </div>
      </div>

      {/* Right auth forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <img src={synedifyLogo} alt="Synedify logo" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold font-[family-name:var(--font-heading)]">Synedify</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {view === "login" && <LoginForm onSwitch={setView} />}
              {view === "signup" && <SignupForm onSwitch={setView} />}
              {view === "forgot" && <ForgotPasswordForm onSwitch={setView} />}
              {view === "magic" && <MagicLinkForm onSwitch={setView} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
