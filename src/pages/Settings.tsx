import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Sun, Moon, Palette, Check, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const COLOR_SCHEMES = [
  { id: "indigo", label: "Indigo", hue: 245, sat: 58, light: "51", darkLight: "60" },
  { id: "blue", label: "Ocean Blue", hue: 210, sat: 70, light: "50", darkLight: "55" },
  { id: "emerald", label: "Emerald", hue: 155, sat: 60, light: "40", darkLight: "50" },
  { id: "rose", label: "Rose", hue: 350, sat: 65, light: "50", darkLight: "55" },
  { id: "amber", label: "Amber", hue: 35, sat: 85, light: "50", darkLight: "55" },
  { id: "violet", label: "Violet", hue: 270, sat: 60, light: "50", darkLight: "60" },
  { id: "teal", label: "Teal", hue: 175, sat: 55, light: "40", darkLight: "50" },
  { id: "crimson", label: "Crimson", hue: 0, sat: 72, light: "48", darkLight: "50" },
] as const;

function applyColorScheme(scheme: typeof COLOR_SCHEMES[number], isDark: boolean) {
  const root = document.documentElement;
  const h = scheme.hue;
  const s = scheme.sat;
  const l = isDark ? scheme.darkLight : scheme.light;

  root.style.setProperty("--primary", `${h} ${s}% ${l}%`);
  root.style.setProperty("--ring", `${h} ${s}% ${l}%`);
  root.style.setProperty("--accent", isDark ? `${h} 40% 20%` : `${h} ${s}% 95%`);
  root.style.setProperty("--accent-foreground", isDark ? `${h} ${s}% 75%` : `${h} ${s}% 40%`);
  root.style.setProperty("--sidebar-primary", `${h} ${s}% ${l}%`);
  root.style.setProperty("--sidebar-primary-foreground", `0 0% 100%`);
  root.style.setProperty("--sidebar-accent", isDark ? `${h} 30% 18%` : `${h} ${s}% 96%`);
  root.style.setProperty("--sidebar-accent-foreground", isDark ? `${h} ${s}% 75%` : `${h} ${s}% 40%`);
  root.style.setProperty("--sidebar-ring", `${h} ${s}% ${l}%`);
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [activeScheme, setActiveScheme] = useState<string>(() => {
    return localStorage.getItem("syncup-color-scheme") || "indigo";
  });

  useEffect(() => {
    const scheme = COLOR_SCHEMES.find((s) => s.id === activeScheme);
    if (scheme) applyColorScheme(scheme, isDark);
  }, [activeScheme, isDark]);

  const handleSchemeChange = (schemeId: string) => {
    setActiveScheme(schemeId);
    localStorage.setItem("syncup-color-scheme", schemeId);
    toast({ title: "Color scheme updated" });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your SyncUp experience.</p>
      </motion.div>

      {/* Appearance */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Appearance
            </CardTitle>
            <CardDescription>Switch between light and dark mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode" className="cursor-pointer">Dark Mode</Label>
              <Switch id="dark-mode" checked={isDark} onCheckedChange={toggleTheme} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Color Scheme */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Color Scheme
            </CardTitle>
            <CardDescription>Choose your preferred accent color for the entire app.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {COLOR_SCHEMES.map((scheme) => {
                const isActive = activeScheme === scheme.id;
                const bgColor = `hsl(${scheme.hue}, ${scheme.sat}%, ${isDark ? scheme.darkLight : scheme.light}%)`;
                return (
                  <button
                    key={scheme.id}
                    onClick={() => handleSchemeChange(scheme.id)}
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 hover:scale-105 ${
                      isActive
                        ? "border-primary shadow-md"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center transition-transform"
                      style={{ backgroundColor: bgColor }}
                    >
                      {isActive && <Check className="h-5 w-5 text-white" />}
                    </div>
                    <span className="text-xs font-medium">{scheme.label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your account settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{user?.email}</p>
                <p className="text-sm text-muted-foreground">Signed in</p>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
