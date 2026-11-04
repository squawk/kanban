/**
 * Generate the ES256 key pair the Worker uses to sign Realtime tokens.
 *
 *   npx tsx scripts/gen-realtime-key.ts
 *
 * 1. Supabase dashboard → Project Settings → JWT Keys → "Create standby key" →
 *    import the PRIVATE JWK printed below, then "Rotate keys" so it's in use. This is
 *    safe because the app doesn't use Supabase Auth, so nothing else depends on the
 *    current key.
 * 2. npx wrangler secret put SUPABASE_JWT_PRIVATE_KEY   (paste the same JSON, one line)
 */
import crypto from "crypto";

const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" }) as Record<string, string>;
const kid = crypto.randomUUID();
const full = { ...jwk, kid, alg: "ES256", use: "sig", key_ops: ["sign", "verify"] };

console.log("Private JWK (import into Supabase AND set as SUPABASE_JWT_PRIVATE_KEY). Keep it secret:\n");
console.log(JSON.stringify(full));
