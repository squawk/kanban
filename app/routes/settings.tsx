import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { apiFetch } from "~/lib/api";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    checkMFAStatus();
  }, []);

  const checkMFAStatus = async () => {
    try {
      const response = await apiFetch("/api/auth/mfa/status");
      if (response.ok) {
        const data = await response.json();
        setMfaEnabled(data.mfaEnabled);
      }
    } catch (error) {
      console.error("Error checking MFA status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableMFA = async () => {
    setError("");
    setActionLoading(true);

    try {
      // Get QR code
      const response = await apiFetch("/api/auth/mfa/setup");
      if (response.ok) {
        const data = await response.json();
        setQrCodeUrl(data.qrCodeDataUrl);
        setSecret(data.secret);
        setShowMFASetup(true);
      } else {
        setError("Failed to generate QR code");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setActionLoading(true);

    try {
      const response = await apiFetch("/api/auth/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code: verificationCode }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess("Two-factor authentication enabled!");
        setMfaEnabled(true);
        setShowMFASetup(false);
        setVerificationCode("");
      } else {
        setError(data.error || "Failed to enable MFA");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    const code = prompt("Enter your authentication code to disable 2FA:");
    if (!code) return;

    setError("");
    setActionLoading(true);

    try {
      const response = await apiFetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess("Two-factor authentication disabled");
        setMfaEnabled(false);
      } else {
        setError(data.error || "Failed to disable MFA");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="bg-card border-b-2 border-border px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm">
              Back to Board
            </Button>
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-card rounded-lg shadow-lg border-2 border-border p-6 mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Two-Factor Authentication
            </h2>

            {success && (
              <div className="bg-green-500/10 text-green-700 dark:text-green-400 text-sm p-4 rounded-lg border border-green-500/20 mb-4">
                {success}
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-lg border border-destructive/20 mb-4">
                {error}
              </div>
            )}

            {!showMFASetup && (
              <div>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg mb-4">
                  <div>
                    <p className="font-medium text-foreground">
                      Status: {mfaEnabled ? "Enabled" : "Disabled"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {mfaEnabled
                        ? "Your account is protected with 2FA"
                        : "Add an extra layer of security to your account"}
                    </p>
                  </div>
                  <div
                    className={`h-3 w-3 rounded-full ${
                      mfaEnabled ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                </div>

                {!mfaEnabled && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Two-factor authentication adds an extra layer of security to your
                      account. You'll need to enter a code from your authenticator app
                      when signing in.
                    </p>
                    <Button
                      onClick={handleEnableMFA}
                      disabled={actionLoading}
                      className="w-full"
                    >
                      Enable Two-Factor Authentication
                    </Button>
                  </div>
                )}

                {mfaEnabled && (
                  <Button
                    onClick={handleDisableMFA}
                    disabled={actionLoading}
                    variant="destructive"
                    className="w-full"
                  >
                    Disable Two-Factor Authentication
                  </Button>
                )}
              </div>
            )}

            {showMFASetup && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Scan QR Code
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Scan this QR code with your authenticator app (Google Authenticator,
                    Authy, 1Password, etc.)
                  </p>
                  {qrCodeUrl && (
                    <div className="flex justify-center mb-4">
                      <img src={qrCodeUrl} alt="QR Code" className="border-2 border-border rounded-lg" />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mb-4">
                    Can't scan? Enter this code manually: <code className="bg-muted px-2 py-1 rounded">{secret}</code>
                  </p>
                </div>

                <form onSubmit={handleVerifyAndEnable} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verificationCode">Verification Code</Label>
                    <Input
                      id="verificationCode"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      required
                      maxLength={6}
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter the code shown in your authenticator app
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowMFASetup(false);
                        setVerificationCode("");
                        setError("");
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={actionLoading}
                      className="flex-1"
                    >
                      {actionLoading ? "Verifying..." : "Enable 2FA"}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
