import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    verifyEmail();
  }, [token]);

  const verifyEmail = async () => {
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "Verification failed.");
        return;
      }

      setStatus("success");
      setMessage(data.message);
      setIsApproved(data.approved);
    } catch (err) {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg border-2 border-border p-8 text-center">
          {status === "loading" && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Verifying your email...
              </h1>
              <p className="text-muted-foreground">
                Please wait while we verify your email address.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-green-500"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Email Verified!
              </h1>
              <p className="text-muted-foreground mb-6">
                {message}
              </p>
              {isApproved ? (
                <Button asChild className="w-full">
                  <Link to="/login">Sign In</Link>
                </Button>
              ) : (
                <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm p-4 rounded-lg border border-amber-500/20">
                  Your account is pending admin approval. You'll receive an email once approved.
                </div>
              )}
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-destructive"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Verification Failed
              </h1>
              <p className="text-muted-foreground mb-6">
                {message}
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Back to Login</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
