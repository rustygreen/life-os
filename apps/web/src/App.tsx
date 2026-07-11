import { FormEvent, useEffect, useState } from "react";

type AuthenticatedAccount = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: string;
};

type TimelineItem = {
  id: string;
  entryType: "event" | "measurement";
  title: string;
  occurredAt: string;
  details: Record<string, unknown> | null;
};

type WorkspaceUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: string;
};

type RegistrationInfo = {
  selfRegistrationEnabled: boolean;
  bootstrapRequired: boolean;
  canSelfRegister: boolean;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const authTokenStorageKey = "life-os-auth-token";

type AuthMode = "register" | "login";

export function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [token, setToken] = useState<string | null>(
    () => window.localStorage.getItem(authTokenStorageKey)
  );
  const [account, setAccount] = useState<AuthenticatedAccount | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [input, setInput] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState<string>("Create your account to start recording data.");
  const [submitting, setSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [registrationInfo, setRegistrationInfo] = useState<RegistrationInfo | null>(null);
  const [adminSelfRegistrationEnabled, setAdminSelfRegistrationEnabled] = useState<boolean | null>(null);
  const [adminUsers, setAdminUsers] = useState<WorkspaceUser[]>([]);
  const [adminUserEmail, setAdminUserEmail] = useState("");
  const [adminUserPassword, setAdminUserPassword] = useState("");
  const [adminUserDisplayName, setAdminUserDisplayName] = useState("");
  const [adminUserRole, setAdminUserRole] = useState<"member" | "owner">("member");
  const [adminSaving, setAdminSaving] = useState(false);

  const saveToken = (nextToken: string | null) => {
    setToken(nextToken);
    if (nextToken) {
      window.localStorage.setItem(authTokenStorageKey, nextToken);
      return;
    }

    window.localStorage.removeItem(authTokenStorageKey);
  };

  const authorizedHeaders = token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};

  const loadTimeline = async () => {
    if (!token) {
      setTimeline([]);
      setStatus("Create your account to start recording data.");
      return;
    }

    setStatus("Loading timeline...");
    const response = await fetch(`${apiBaseUrl}/v1/timeline`, {
      headers: authorizedHeaders
    });

    if (response.status === 401) {
      saveToken(null);
      setAccount(null);
      setTimeline([]);
      setStatus("Your session expired. Please sign in again.");
      return;
    }

    const payload = (await response.json()) as { items: TimelineItem[] };
    setTimeline(payload.items);
    setStatus(payload.items.length === 0 ? "No timeline items yet." : "");
  };

  const loadRegistrationInfo = async () => {
    const response = await fetch(`${apiBaseUrl}/v1/auth/registration`);
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as RegistrationInfo;
    setRegistrationInfo(payload);
    if (!payload.canSelfRegister) {
      setAuthMode("login");
    }
  };

  const loadAdminSettings = async () => {
    if (!token || account?.role !== "owner") {
      return;
    }

    const [settingsResponse, usersResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/v1/admin/settings`, {
        headers: authorizedHeaders
      }),
      fetch(`${apiBaseUrl}/v1/admin/users`, {
        headers: authorizedHeaders
      })
    ]);

    if (settingsResponse.ok) {
      const settingsPayload = (await settingsResponse.json()) as { selfRegistrationEnabled: boolean };
      setAdminSelfRegistrationEnabled(settingsPayload.selfRegistrationEnabled);
    }

    if (usersResponse.ok) {
      const usersPayload = (await usersResponse.json()) as { users: WorkspaceUser[] };
      setAdminUsers(usersPayload.users);
    }
  };

  const loadSession = async (sessionToken: string) => {
    const response = await fetch(`${apiBaseUrl}/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    });

    if (!response.ok) {
      saveToken(null);
      setAccount(null);
      setTimeline([]);
      setStatus("Sign in to access your workspace.");
      return;
    }

    const payload = (await response.json()) as { account: AuthenticatedAccount };
    setAccount(payload.account);
    setStatus("");
  };

  useEffect(() => {
    void loadRegistrationInfo();
  }, []);

  useEffect(() => {
    if (!token) {
      setAccount(null);
      setTimeline([]);
      return;
    }

    void loadSession(token);
  }, [token]);

  useEffect(() => {
    if (!account || !token) {
      return;
    }

    void loadTimeline();
    if (account.role === "owner") {
      void loadAdminSettings();
    }
  }, [account, token]);

  const onAuthenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setAuthSubmitting(true);
    setStatus(authMode === "register" ? "Creating account..." : "Signing in...");

    const endpoint = authMode === "register" ? "/v1/auth/register" : "/v1/auth/login";
    const body =
      authMode === "register"
        ? { email, password, displayName, workspaceName }
        : { email, password };

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => null)) as
      | { token: string; account: AuthenticatedAccount }
      | { error?: string }
      | null;

    if (!response.ok || !payload || !("token" in payload)) {
      setStatus(payload && "error" in payload && payload.error ? payload.error : "Authentication failed.");
      setAuthSubmitting(false);
      return;
    }

    saveToken(payload.token);
    setAccount(payload.account);
    setPassword("");
    setStatus(authMode === "register" ? "Account created." : "Signed in.");
    setAuthSubmitting(false);
  };

  const onToggleSelfRegistration = async () => {
    if (!token || account?.role !== "owner" || adminSelfRegistrationEnabled === null) {
      return;
    }

    setAdminSaving(true);
    const response = await fetch(`${apiBaseUrl}/v1/admin/settings/self-registration`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authorizedHeaders
      },
      body: JSON.stringify({ enabled: !adminSelfRegistrationEnabled })
    });

    if (!response.ok) {
      setStatus("Failed to update self-registration setting.");
      setAdminSaving(false);
      return;
    }

    const payload = (await response.json()) as { selfRegistrationEnabled: boolean };
    setAdminSelfRegistrationEnabled(payload.selfRegistrationEnabled);
    setStatus(payload.selfRegistrationEnabled ? "Self registration enabled." : "Self registration disabled.");
    setAdminSaving(false);
    await loadRegistrationInfo();
  };

  const onAdminCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token || account?.role !== "owner") {
      return;
    }

    setAdminSaving(true);
    const response = await fetch(`${apiBaseUrl}/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorizedHeaders
      },
      body: JSON.stringify({
        email: adminUserEmail,
        password: adminUserPassword,
        displayName: adminUserDisplayName,
        role: adminUserRole
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | { user: WorkspaceUser }
      | { error?: string }
      | null;

    if (!response.ok || !payload || !("user" in payload)) {
      setStatus(payload && "error" in payload && payload.error ? payload.error : "Failed to create user.");
      setAdminSaving(false);
      return;
    }

    setAdminUsers((previous) => [...previous, payload.user]);
    setAdminUserEmail("");
    setAdminUserPassword("");
    setAdminUserDisplayName("");
    setAdminUserRole("member");
    setStatus("User created.");
    setAdminSaving(false);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!input.trim()) {
      return;
    }

    setSubmitting(true);
    setStatus("Recording...");

    const response = await fetch(`${apiBaseUrl}/v1/quick-add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorizedHeaders
      },
      body: JSON.stringify({ input })
    });

    if (response.status === 401) {
      saveToken(null);
      setAccount(null);
      setSubmitting(false);
      setStatus("Your session expired. Please sign in again.");
      return;
    }

    if (!response.ok) {
      setStatus("Quick Add failed.");
      setSubmitting(false);
      return;
    }

    setInput("");
    await loadTimeline();
    setStatus("Recorded.");
    setSubmitting(false);
  };

  const onLogout = async () => {
    if (!token) {
      return;
    }

    await fetch(`${apiBaseUrl}/v1/auth/logout`, {
      method: "POST",
      headers: authorizedHeaders
    }).catch(() => null);

    saveToken(null);
    setAccount(null);
    setTimeline([]);
    setStatus("Signed out.");
  };

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Life OS Foundation</p>
          <h1>Your personal system of record.</h1>
          <p className="lede">
            Capture life events in natural language, keep facts in PostgreSQL,
            and leave room for richer AI workflows later.
          </p>
          {account ? (
            <div className="identity-strip">
              <span>{account.displayName}</span>
              <span>{account.workspaceName}</span>
              <button type="button" onClick={onLogout}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
        <div className="hero-card">
          <div className="auth-mode-toggle" role="tablist" aria-label="Authentication mode">
            {registrationInfo?.canSelfRegister !== false ? (
              <button
                type="button"
                className={authMode === "register" ? "tab-active" : "tab"}
                onClick={() => setAuthMode("register")}
              >
                Register
              </button>
            ) : null}
            <button
              type="button"
              className={authMode === "login" ? "tab-active" : "tab"}
              onClick={() => setAuthMode("login")}
            >
              Sign in
            </button>
          </div>
          <form onSubmit={onAuthenticate} className="auth-form">
            {authMode === "register" && registrationInfo?.canSelfRegister !== false ? (
              <>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                />
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                />
              </>
            ) : null}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            <button type="submit" disabled={authSubmitting}>
              {authSubmitting
                ? "Working..."
                : authMode === "register" && registrationInfo?.canSelfRegister !== false
                  ? "Create account"
                  : "Sign in"}
            </button>
            {registrationInfo?.canSelfRegister === false ? (
              <p className="status">Self registration is disabled. Sign in with an account provided by an owner.</p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="panel-grid">
        <section className="panel accent">
          <h2>Quick Add</h2>
          <form onSubmit={onSubmit} className="quick-add-form">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                account
                  ? "Record something that happened..."
                  : "Sign in to enable Quick Add"
              }
              rows={4}
              disabled={!account || submitting}
            />
            <button type="submit" disabled={submitting || !account}>
              {submitting ? "Saving..." : "Capture"}
            </button>
          </form>
          {status ? <p className="status">{status}</p> : null}
        </section>

        <section className="panel">
          <h2>Timeline</h2>
          {timeline.length === 0 ? (
            <p className="status">{status}</p>
          ) : (
            <div className="timeline">
              {timeline.map((item) => (
                <article key={item.id} className="timeline-item">
                  <div className="timeline-meta">
                    <span>{item.entryType}</span>
                    <time dateTime={item.occurredAt}>
                      {new Date(item.occurredAt).toLocaleString()}
                    </time>
                  </div>
                  <h3>{item.title}</h3>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {account?.role === "owner" ? (
        <section className="panel admin-panel">
          <h2>Admin</h2>
          <div className="admin-section">
            <h3>Registration</h3>
            <p className="status">
              Self registration is currently {adminSelfRegistrationEnabled ? "enabled" : "disabled"}.
            </p>
            <button type="button" onClick={onToggleSelfRegistration} disabled={adminSaving || adminSelfRegistrationEnabled === null}>
              {adminSelfRegistrationEnabled ? "Disable self registration" : "Enable self registration"}
            </button>
          </div>

          <div className="admin-section">
            <h3>Create user</h3>
            <form onSubmit={onAdminCreateUser} className="auth-form">
              <input
                type="email"
                value={adminUserEmail}
                onChange={(event) => setAdminUserEmail(event.target.value)}
                placeholder="Email"
              />
              <input
                value={adminUserDisplayName}
                onChange={(event) => setAdminUserDisplayName(event.target.value)}
                placeholder="Display name"
              />
              <input
                type="password"
                value={adminUserPassword}
                onChange={(event) => setAdminUserPassword(event.target.value)}
                placeholder="Temporary password"
              />
              <select
                value={adminUserRole}
                onChange={(event) => setAdminUserRole(event.target.value as "member" | "owner")}
              >
                <option value="member">member</option>
                <option value="owner">owner</option>
              </select>
              <button type="submit" disabled={adminSaving}>Create user</button>
            </form>
          </div>

          <div className="admin-section">
            <h3>Workspace users</h3>
            {adminUsers.length === 0 ? (
              <p className="status">No users found.</p>
            ) : (
              <div className="timeline">
                {adminUsers.map((user) => (
                  <article key={user.id} className="timeline-item">
                    <div className="timeline-meta">
                      <span>{user.role}</span>
                      <time dateTime={user.joinedAt}>
                        {new Date(user.joinedAt).toLocaleString()}
                      </time>
                    </div>
                    <h3>{user.displayName}</h3>
                    <p className="status">{user.email}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
