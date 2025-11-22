/**
 * Security utilities for the Kanban application
 * Implements defense-in-depth security controls
 */

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 },  // 5 attempts per 15 min
  api: { windowMs: 60 * 1000, maxRequests: 100 },  // 100 requests per minute
  openai: { windowMs: 60 * 1000, maxRequests: 10 },  // 10 AI generations per minute
};

/**
 * Check rate limit for a given key and limit type
 * Returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(key: string, limitType: keyof typeof RATE_LIMITS): { allowed: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[limitType];
  const now = Date.now();
  const storeKey = `${limitType}:${key}`;

  const entry = rateLimitStore.get(storeKey);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(storeKey, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Create a rate limit error response
 */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      }
    }
  );
}

/**
 * Get client IP from request (handles proxies)
 */
export function getClientIP(request: Request): string {
  // Check common proxy headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback - in production this would come from the connection
  return "unknown";
}

/**
 * Security headers to add to all responses
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // CSP - adjust based on your needs
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",  // unsafe-inline needed for React
    "style-src 'self' 'unsafe-inline'",   // unsafe-inline needed for Tailwind
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.openai.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

/**
 * Add security headers to a response
 */
export function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Validate input length to prevent DoS via large payloads
 */
export function validateInputLength(value: string | undefined, maxLength: number, fieldName: string): string | null {
  if (!value) return null;
  if (value.length > maxLength) {
    return `${fieldName} must be ${maxLength} characters or less`;
  }
  return null;
}

/**
 * Input length limits
 */
export const INPUT_LIMITS = {
  email: 255,
  password: 128,
  name: 100,
  cardTitle: 200,
  cardNotes: 10000,
  commentContent: 5000,
  columnTitle: 100,
  tagName: 50,
} as const;

/**
 * Sanitize error messages for client responses
 * Prevents information leakage
 */
export function sanitizeError(error: unknown): string {
  if (process.env.NODE_ENV !== "production") {
    return error instanceof Error ? error.message : "An unexpected error occurred";
  }
  // In production, never expose internal error details
  return "An unexpected error occurred";
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= INPUT_LIMITS.email;
}

/**
 * Password strength validation
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (password.length > INPUT_LIMITS.password) {
    return { valid: false, error: `Password must be ${INPUT_LIMITS.password} characters or less` };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number" };
  }
  return { valid: true };
}

// Cleanup old rate limit entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
