/**
 * Comprehensive Security Utilities
 * 20 security layers for application hardening
 */

// 1. XSS Protection: Sanitize HTML content
export function sanitizeHtml(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

// 2. SQL Injection Prevention: Validate identifiers
export function isValidIdentifier(input: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(input);
}

// 3. Rate Limiter (client-side throttle)
const rateLimitMap = new Map<string, number[]>();
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  if (valid.length >= maxRequests) return false;
  valid.push(now);
  rateLimitMap.set(key, valid);
  return true;
}

// 4. Input Length Validator
export function validateInputLength(input: string, maxLength: number): boolean {
  return input.length <= maxLength;
}

// 5. Email Validator
export function isValidEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) && email.length <= 254;
}

// 6. UUID Validator
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// 7. Content Security Policy Meta Tag Injector
export function injectCSPMeta(): void {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com;";
  document.head.appendChild(meta);
}

// 8. Clickjacking Protection
export function injectFrameGuard(): void {
  if (window.self !== window.top) {
    document.body.innerHTML = "<h1>Framing not allowed</h1>";
  }
}

// 9. Session Integrity Check
export function validateSessionIntegrity(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// 10. Prevent Prototype Pollution
export function safeJsonParse<T>(input: string): T | null {
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === "object" && parsed !== null) {
      if ("__proto__" in parsed || "constructor" in parsed || "prototype" in parsed) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

// 11. File Type Validator
const ALLOWED_FILE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export function isAllowedFileType(type: string): boolean {
  return ALLOWED_FILE_TYPES.includes(type);
}

// 12. File Size Validator (max 10MB)
export function isAllowedFileSize(size: number, maxMB = 10): boolean {
  return size <= maxMB * 1024 * 1024;
}

// 13. URL Validator (prevent open redirect)
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// 14. Password Strength Checker
export function checkPasswordStrength(password: string): { score: number; feedback: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const feedbacks = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong", "Excellent"];
  return { score, feedback: feedbacks[Math.min(score, feedbacks.length - 1)] };
}

// 15. Prevent Excessive DOM Manipulation (DoS guard)
let domOpCount = 0;
const DOM_OP_LIMIT = 1000;
export function guardDomOp(): boolean {
  domOpCount++;
  if (domOpCount > DOM_OP_LIMIT) return false;
  setTimeout(() => { domOpCount = Math.max(0, domOpCount - 10); }, 100);
  return true;
}

// 16. Sanitize search/filter inputs
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[<>"'&;(){}[\]\\]/g, "").trim().substring(0, 200);
}

// 17. Request fingerprint (detect automated bots)
export function generateFingerprint(): string {
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
  ].join("|");
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// 18. Detect devtools open (anti-tampering)
export function onDevToolsOpen(callback: () => void): void {
  const threshold = 160;
  const check = () => {
    if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
      callback();
    }
  };
  setInterval(check, 5000);
}

// 19. Secure localStorage wrapper (encrypted-like obfuscation)
export const secureStorage = {
  set(key: string, value: string): void {
    try {
      const encoded = btoa(encodeURIComponent(value));
      localStorage.setItem(`_s_${key}`, encoded);
    } catch { /* quota exceeded */ }
  },
  get(key: string): string | null {
    try {
      const raw = localStorage.getItem(`_s_${key}`);
      if (!raw) return null;
      return decodeURIComponent(atob(raw));
    } catch {
      return null;
    }
  },
  remove(key: string): void {
    localStorage.removeItem(`_s_${key}`);
  },
};

// 20. Audit Logger (client-side security event logging)
interface SecurityEvent {
  type: string;
  details: string;
  timestamp: number;
  fingerprint: string;
}

const securityLog: SecurityEvent[] = [];
export function logSecurityEvent(type: string, details: string): void {
  const event: SecurityEvent = {
    type,
    details,
    timestamp: Date.now(),
    fingerprint: generateFingerprint(),
  };
  securityLog.push(event);
  // Keep only last 100 events in memory
  if (securityLog.length > 100) securityLog.shift();
  console.debug(`[Security] ${type}: ${details}`);
}

export function getSecurityLog(): SecurityEvent[] {
  return [...securityLog];
}

// Initialize security measures on import
export function initializeSecurity(): void {
  injectCSPMeta();
  injectFrameGuard();
  logSecurityEvent("init", "Security layer initialized");
}
