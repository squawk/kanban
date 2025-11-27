import { requireAuth, generateMFASecret } from "~/lib/auth";
import QRCode from "qrcode";

// GET /api/auth/mfa/setup - Generate MFA secret and QR code
export async function loader({ request }: { request: Request }) {
  try {
    const { userId, email } = await requireAuth(request);

    // Generate secret and QR code
    const { secret, qrCode } = generateMFASecret(userId, email!);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrCode);

    return new Response(
      JSON.stringify({
        secret,
        qrCodeDataUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("MFA setup error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate MFA setup" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
