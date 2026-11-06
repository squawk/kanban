import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { UserAvatar } from "~/components/UserAvatar";
import { ClientsAdmin } from "~/components/ClientsAdmin";
import { apiFetch } from "~/lib/api";
import type { ActivityEntry, CurrentUser } from "~/lib/types";
import { ArrowLeft, Briefcase, Check, Copy, Download, MailPlus, ScrollText, Settings, Users } from "lucide-react";

export function meta() {
  return [{ title: "Admin - Kanban Board" }];
}

type Tab = "users" | "invitations" | "signup" | "clients" | "audit";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  status: "active" | "pending" | "disabled";
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member";
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

interface SignupPolicy {
  mode: "open" | "domain" | "invite_only";
  allowedDomains: string[];
  requireApproval: boolean;
}

interface AuditEntry extends ActivityEntry {
  ipAddress: string | null;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

async function send(url: string, method: string, body?: unknown) {
  const res = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function Banner({ kind, children }: { kind: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "bg-destructive/10 text-destructive border-destructive/20",
    success: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    info: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  };
  return <div className={`text-sm p-3 rounded-lg border ${styles[kind]}`}>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  disabled: "bg-muted text-muted-foreground",
  accepted: "bg-green-500/10 text-green-700 dark:text-green-400",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

function Pill({ value }: { value: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[value] ?? "bg-muted"}`}>{value}</span>;
}

/* ------------------------------------------------------------------ Users */

function UsersTab({ me, onPendingCount }: { me: CurrentUser; onPendingCount: (n: number) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/users");
      const data: AdminUser[] = res.ok ? await res.json() : [];
      setUsers(data);
      onPendingCount(data.filter((u) => u.status === "pending").length);
    } finally {
      setLoading(false);
    }
  }, [onPendingCount]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (userId: string, method: "PATCH" | "DELETE", body: Record<string, unknown> = {}) => {
    setBusy(userId);
    setError("");
    try {
      await send("/api/admin/users", method, { userId, ...body });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = { pending: 0, active: 1, disabled: 2 };
    return users
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  }, [users, query]);

  if (loading) return <p className="text-muted-foreground">Loading users...</p>;

  return (
    <div className="space-y-4">
      <Input placeholder="Search users..." value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
      {error && <Banner kind="error">{error}</Banner>}
      <div className="overflow-x-auto rounded-lg border-2 border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 hidden md:table-cell">Last sign-in</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((u) => {
              const isMe = u.id === me.id;
              return (
                <tr key={u.id} className="bg-card">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar user={u} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {u.name}
                          {isMe && <span className="text-muted-foreground font-normal"> (you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.email}
                          {!u.emailVerified && " · unverified"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Role for ${u.name}`}
                      value={u.role}
                      disabled={isMe || busy === u.id}
                      onChange={(e) => run(u.id, "PATCH", { role: e.target.value })}
                      className="px-2 py-1 border-2 border-border rounded-md bg-card text-foreground text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Pill value={u.status} />
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{fmt(u.lastLoginAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {u.status === "pending" && (
                        <Button size="sm" disabled={busy === u.id} onClick={() => run(u.id, "PATCH", { approved: true })}>
                          Approve
                        </Button>
                      )}
                      {!isMe && u.status !== "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === u.id}
                          onClick={() => run(u.id, "PATCH", { disabled: u.status !== "disabled" })}
                        >
                          {u.status === "disabled" ? "Enable" : "Disable"}
                        </Button>
                      )}
                      {!isMe &&
                        (confirmDelete === u.id ? (
                          <>
                            <Button size="sm" variant="destructive" disabled={busy === u.id} onClick={() => run(u.id, "DELETE")}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(u.id)}
                            title={u.status === "pending" ? "Reject and remove" : "Delete user and their board"}
                          >
                            {u.status === "pending" ? "Reject" : "Delete"}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Disabling a user signs them out immediately and keeps their data. Deleting removes their account and their own board.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Invitations */

function InvitationsTab() {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ email: string; emailSent: boolean; inviteUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/invitations");
    if (res.ok) setInvites(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async (targetEmail: string, targetRole: "member" | "admin") => {
    setSubmitting(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const data = await send("/api/admin/invitations", "POST", { email: targetEmail, role: targetRole });
      setResult({ email: data.email, emailSent: data.emailSent, inviteUrl: data.inviteUrl });
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    setError("");
    try {
      await send("/api/admin/invitations", "DELETE", { id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          invite(email, role);
        }}
      >
        <div className="flex-1 min-w-[14rem] space-y-1">
          <label htmlFor="invite-email" className="text-sm font-medium text-foreground">
            Email address
          </label>
          <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
        </div>
        <div className="space-y-1">
          <label htmlFor="invite-role" className="text-sm font-medium text-foreground">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "admin")}
            className="h-10 px-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={submitting}>
          <MailPlus className="h-4 w-4 mr-2" />
          {submitting ? "Sending..." : "Send invite"}
        </Button>
      </form>

      {error && <Banner kind="error">{error}</Banner>}
      {result && (
        <Banner kind={result.emailSent ? "success" : "info"}>
          <p>
            {result.emailSent
              ? `Invitation emailed to ${result.email}.`
              : `Invitation created for ${result.email}, but email isn't configured — share this link with them:`}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 text-xs">{result.inviteUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(result.inviteUrl);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copied ? "Copied" : "Copy link"}</span>
            </Button>
          </div>
          <p className="mt-1 text-xs opacity-80">This link is shown once. Re-send the invite to generate a new one.</p>
        </Banner>
      )}

      <div className="overflow-x-auto rounded-lg border-2 border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 hidden md:table-cell">Invited</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invites.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground bg-card">
                  No invitations yet.
                </td>
              </tr>
            )}
            {invites.map((i) => (
              <tr key={i.id} className="bg-card">
                <td className="px-3 py-2 text-foreground">{i.email}</td>
                <td className="px-3 py-2 capitalize">{i.role}</td>
                <td className="px-3 py-2">
                  <Pill value={i.status} />
                </td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">
                  {fmt(i.createdAt)}
                  {i.invitedByName ? ` by ${i.invitedByName}` : ""}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {(i.status === "pending" || i.status === "expired") && (
                      <Button size="sm" variant="outline" disabled={submitting} onClick={() => invite(i.email, i.role)}>
                        Resend
                      </Button>
                    )}
                    {i.status === "pending" && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revoke(i.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Sign-up policy */

const MODE_OPTIONS: { value: SignupPolicy["mode"]; label: string; help: string }[] = [
  { value: "open", label: "Open", help: "Anyone can create an account." },
  { value: "domain", label: "Restricted to domains", help: "Only email addresses at the domains below can sign up." },
  { value: "invite_only", label: "Invite only (closed)", help: "Self sign-up is turned off. Only admins can add people by invitation." },
];

function SignupTab() {
  const [policy, setPolicy] = useState<SignupPolicy | null>(null);
  const [domainsText, setDomainsText] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setPolicy(data.signup);
        setDomainsText(data.signup.allowedDomains.join(", "));
        setEmailConfigured(data.emailConfigured);
      });
  }, []);

  if (!policy) return <p className="text-muted-foreground">Loading settings...</p>;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data = await send("/api/admin/settings", "PUT", { signup: { ...policy, allowedDomains: domainsText } });
      setPolicy(data.signup);
      setDomainsText(data.signup.allowedDomains.join(", "));
      setMessage({ kind: "success", text: "Sign-up settings saved." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      {!emailConfigured && (
        <Banner kind="info">
          Email isn't configured (SENDGRID_API_KEY), so verification, invitation, and notification emails won't be delivered.
          Invitations will show a link you can share manually.
        </Banner>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground mb-2">Who can sign up?</legend>
        {MODE_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-start gap-3 rounded-lg border-2 border-border bg-card p-3 cursor-pointer">
            <input
              type="radio"
              name="signup-mode"
              className="mt-1"
              checked={policy.mode === opt.value}
              onChange={() => setPolicy({ ...policy, mode: opt.value })}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">{opt.label}</span>
              <span className="block text-xs text-muted-foreground">{opt.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {policy.mode === "domain" && (
        <div className="space-y-1">
          <label htmlFor="domains" className="text-sm font-medium text-foreground">
            Allowed domains
          </label>
          <Input id="domains" value={domainsText} onChange={(e) => setDomainsText(e.target.value)} placeholder="acme.com, acme.co.uk" />
          <p className="text-xs text-muted-foreground">Comma-separated. Subdomains are included (eng.acme.com matches acme.com).</p>
        </div>
      )}

      {policy.mode !== "invite_only" && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={policy.requireApproval}
            onChange={(e) => setPolicy({ ...policy, requireApproval: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Require admin approval</span>
            <span className="block text-xs text-muted-foreground">
              New sign-ups wait in the Users tab until an admin approves them. Invited users never need approval.
            </span>
          </span>
        </label>
      )}

      {message && <Banner kind={message.kind}>{message.text}</Banner>}
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------- Audit log */

const AUDIT_CATEGORIES = [
  { value: "", label: "All events" },
  { value: "auth.", label: "Sign-ins" },
  { value: "user.", label: "Users" },
  { value: "invitation.", label: "Invitations" },
  { value: "settings.", label: "Settings" },
  { value: "board.", label: "Boards & sharing" },
  { value: "card.", label: "Cards" },
  { value: "comment.", label: "Comments" },
  { value: "column.", label: "Columns" },
];

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (category) p.set("action", category);
    if (appliedSearch) p.set("q", appliedSearch);
    return p;
  }, [category, appliedSearch]);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      const p = new URLSearchParams(params);
      if (before) p.set("before", before);
      try {
        const res = await apiFetch(`/api/admin/audit?${p}`);
        if (!res.ok) return;
        const data = await res.json();
        setEntries((prev) => (before ? [...prev, ...data.entries] : data.entries));
        setCursor(data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Event category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 px-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
        >
          {AUDIT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <Input placeholder="Search summary or actor..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button asChild variant="outline" className="ml-auto">
          <a href={`/api/admin/audit?${new URLSearchParams([...params, ["format", "csv"]])}`}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </a>
        </Button>
      </div>

      <ol className="divide-y divide-border rounded-lg border-2 border-border bg-card">
        {entries.length === 0 && !loading && <li className="px-4 py-6 text-center text-muted-foreground">No matching events.</li>}
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              aria-expanded={expanded === e.id}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-foreground">{e.summary}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(e.createdAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5">{e.action}</code>
                <span>{e.actorEmail ?? "system / email link"}</span>
                {e.ipAddress && <span>· {e.ipAddress}</span>}
              </div>
            </button>
            {expanded === e.id && (
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs text-foreground">
                {JSON.stringify({ entityType: e.entityType, entityId: e.entityId, boardId: e.boardId, ...e.metadata }, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {cursor && !loading && (
        <Button variant="outline" onClick={() => load(cursor)}>
          Load older events
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Page */

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "users", label: "Users", icon: Users },
  { id: "invitations", label: "Invitations", icon: MailPlus },
  { id: "signup", label: "Sign-up", icon: Settings },
  { id: "clients", label: "Clients", icon: Briefcase },
  { id: "audit", label: "Audit log", icon: ScrollText },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? tabParam! : "users";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) navigate("/login");
        else if (data.user.role !== "admin") navigate("/");
        else setMe(data.user);
      })
      .catch(() => navigate("/login"));
  }, [navigate]);

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-card border-b-2 border-border px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/" aria-label="Back to board">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-xl font-bold text-foreground">Admin</h1>
          </div>
          <span className="text-sm text-muted-foreground hidden sm:inline">{me.email}</span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div role="tablist" aria-label="Admin sections" className="flex gap-1 overflow-x-auto border-b-2 border-border">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setSearchParams({ tab: id })}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 -mb-[2px] border-b-2 text-sm font-medium transition-colors ${
                tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === "users" && pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === "users" && <UsersTab me={me} onPendingCount={setPendingCount} />}
          {tab === "invitations" && <InvitationsTab />}
          {tab === "signup" && <SignupTab />}
          {tab === "clients" && <ClientsAdmin />}
          {tab === "audit" && <AuditTab />}
        </div>
      </main>
    </div>
  );
}
