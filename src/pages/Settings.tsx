import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Sun, Moon, Palette, Check, LogOut, Type, RectangleHorizontal, Maximize, Trash2 } from "lucide-react";
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

const FONT_SIZES = [
  { id: "small", label: "Small", scale: 0.875 },
  { id: "default", label: "Default", scale: 1 },
  { id: "large", label: "Large", scale: 1.125 },
  { id: "xl", label: "Extra Large", scale: 1.25 },
];

const RADIUS_OPTIONS = [
  { id: "none", label: "Sharp", value: "0" },
  { id: "sm", label: "Subtle", value: "0.375rem" },
  { id: "md", label: "Medium", value: "0.75rem" },
  { id: "lg", label: "Rounded", value: "1rem" },
  { id: "full", label: "Pill", value: "1.5rem" },
];

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

function applyFontSize(scale: number) {
  document.documentElement.style.fontSize = `${scale * 16}px`;
}

function applyRadius(value: string) {
  document.documentElement.style.setProperty("--radius", value);
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [activeScheme, setActiveScheme] = useState<string>(() =>
    localStorage.getItem("syncup-color-scheme") || "indigo"
  );
  const [fontSize, setFontSize] = useState<string>(() =>
    localStorage.getItem("syncup-font-size") || "default"
  );
  const [radius, setRadius] = useState<string>(() =>
    localStorage.getItem("syncup-radius") || "md"
  );
  const [contentWidth, setContentWidth] = useState<number>(() =>
    Number(localStorage.getItem("syncup-content-width")) || 672
  );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const scheme = COLOR_SCHEMES.find((s) => s.id === activeScheme);
    if (scheme) applyColorScheme(scheme, isDark);
  }, [activeScheme, isDark]);

  useEffect(() => {
    const size = FONT_SIZES.find((s) => s.id === fontSize);
    if (size) applyFontSize(size.scale);
  }, [fontSize]);

  useEffect(() => {
    const r = RADIUS_OPTIONS.find((o) => o.id === radius);
    if (r) applyRadius(r.value);
  }, [radius]);

  const handleSchemeChange = (schemeId: string) => {
    setActiveScheme(schemeId);
    localStorage.setItem("syncup-color-scheme", schemeId);
    toast({ title: "Color scheme updated" });
  };

  const handleFontSizeChange = (sizeId: string) => {
    setFontSize(sizeId);
    localStorage.setItem("syncup-font-size", sizeId);
    toast({ title: "Font size updated" });
  };

  const handleRadiusChange = (radiusId: string) => {
    setRadius(radiusId);
    localStorage.setItem("syncup-radius", radiusId);
    toast({ title: "Border style updated" });
  };

  const handleContentWidthChange = (values: number[]) => {
    const w = values[0];
    setContentWidth(w);
    localStorage.setItem("syncup-content-width", String(w));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleResetAll = () => {
    localStorage.removeItem("syncup-color-scheme");
    localStorage.removeItem("syncup-font-size");
    localStorage.removeItem("syncup-radius");
    localStorage.removeItem("syncup-content-width");
    setActiveScheme("indigo");
    setFontSize("default");
    setRadius("md");
    setContentWidth(672);
    applyFontSize(1);
    applyRadius("0.75rem");
    toast({ title: "All settings reset to defaults" });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast({ title: "Account deleted", description: "Your account and all data have been permanently removed." });
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete account", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">Settings</h1>
            <p className="text-muted-foreground mt-1">Customize your Synedify experience.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleResetAll} className="text-muted-foreground">
            Reset All
          </Button>
        </div>
      </motion.div>

      {/* Appearance */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
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

      {/* Font Size */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Font Size
            </CardTitle>
            <CardDescription>Adjust the text size across the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {FONT_SIZES.map((size) => (
                <button
                  key={size.id}
                  onClick={() => handleFontSizeChange(size.id)}
                  className={`px-3 py-2 rounded-lg border-2 text-center transition-all duration-200 ${
                    fontSize === size.id
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span
                    className="block"
                    style={{ fontSize: `${size.scale * 0.875}rem` }}
                  >
                    Aa
                  </span>
                  <span className="text-xs text-muted-foreground mt-1 block">{size.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Border Radius */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RectangleHorizontal className="h-5 w-5" />
              Border Style
            </CardTitle>
            <CardDescription>Change the roundness of buttons, cards, and inputs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleRadiusChange(opt.id)}
                  className={`flex flex-col items-center gap-2 p-3 border-2 transition-all duration-200 ${
                    radius === opt.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40"
                  }`}
                  style={{ borderRadius: opt.value }}
                >
                  <div
                    className="h-8 w-12 bg-primary/30 border border-primary/50"
                    style={{ borderRadius: opt.value }}
                  />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Content Width */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Maximize className="h-5 w-5" />
              Content Width
            </CardTitle>
            <CardDescription>Adjust how wide the main content area is.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Slider
              value={[contentWidth]}
              onValueChange={handleContentWidthChange}
              min={480}
              max={1024}
              step={32}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Compact</span>
              <span>{contentWidth}px</span>
              <span>Wide</span>
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

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-destructive">Delete Account</p>
                  <p className="text-sm text-muted-foreground">Permanently delete your account and all associated data.</p>
                </div>
                <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); setDeleteConfirm(""); }}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Your Account</DialogTitle>
                      <DialogDescription>
                        This action is <strong>permanent and irreversible</strong>. All your data including profile, posts, messages, 
                        organizations you created, and all associated content will be permanently erased.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <p className="text-sm text-muted-foreground">
                        Type <strong>DELETE</strong> to confirm account deletion.
                      </p>
                      <Input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder='Type "DELETE" to confirm'
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirm !== "DELETE" || deleting}
                      >
                        {deleting ? "Deleting..." : "Delete My Account Forever"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
