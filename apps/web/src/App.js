import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const authTokenStorageKey = "life-os-auth-token";
export function App() {
    const [authMode, setAuthMode] = useState("register");
    const [token, setToken] = useState(() => window.localStorage.getItem(authTokenStorageKey));
    const [account, setAccount] = useState(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [workspaceName, setWorkspaceName] = useState("");
    const [input, setInput] = useState("");
    const [timeline, setTimeline] = useState([]);
    const [status, setStatus] = useState("Create your account to start recording data.");
    const [submitting, setSubmitting] = useState(false);
    const [authSubmitting, setAuthSubmitting] = useState(false);
    const [registrationInfo, setRegistrationInfo] = useState(null);
    const [adminSelfRegistrationEnabled, setAdminSelfRegistrationEnabled] = useState(null);
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminUserEmail, setAdminUserEmail] = useState("");
    const [adminUserPassword, setAdminUserPassword] = useState("");
    const [adminUserDisplayName, setAdminUserDisplayName] = useState("");
    const [adminUserRole, setAdminUserRole] = useState("member");
    const [adminSaving, setAdminSaving] = useState(false);
    const saveToken = (nextToken) => {
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
        const payload = (await response.json());
        setTimeline(payload.items);
        setStatus(payload.items.length === 0 ? "No timeline items yet." : "");
    };
    const loadRegistrationInfo = async () => {
        const response = await fetch(`${apiBaseUrl}/v1/auth/registration`);
        if (!response.ok) {
            return;
        }
        const payload = (await response.json());
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
            const settingsPayload = (await settingsResponse.json());
            setAdminSelfRegistrationEnabled(settingsPayload.selfRegistrationEnabled);
        }
        if (usersResponse.ok) {
            const usersPayload = (await usersResponse.json());
            setAdminUsers(usersPayload.users);
        }
    };
    const loadSession = async (sessionToken) => {
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
        const payload = (await response.json());
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
    const onAuthenticate = async (event) => {
        event.preventDefault();
        setAuthSubmitting(true);
        setStatus(authMode === "register" ? "Creating account..." : "Signing in...");
        const endpoint = authMode === "register" ? "/v1/auth/register" : "/v1/auth/login";
        const body = authMode === "register"
            ? { email, password, displayName, workspaceName }
            : { email, password };
        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        const payload = (await response.json().catch(() => null));
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
        const payload = (await response.json());
        setAdminSelfRegistrationEnabled(payload.selfRegistrationEnabled);
        setStatus(payload.selfRegistrationEnabled ? "Self registration enabled." : "Self registration disabled.");
        setAdminSaving(false);
        await loadRegistrationInfo();
    };
    const onAdminCreateUser = async (event) => {
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
        const payload = (await response.json().catch(() => null));
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
    const onSubmit = async (event) => {
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
    return (_jsxs("main", { className: "shell", children: [_jsxs("section", { className: "hero", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Life OS Foundation" }), _jsx("h1", { children: "Your personal system of record." }), _jsx("p", { className: "lede", children: "Capture life events in natural language, keep facts in PostgreSQL, and leave room for richer AI workflows later." }), account ? (_jsxs("div", { className: "identity-strip", children: [_jsx("span", { children: account.displayName }), _jsx("span", { children: account.workspaceName }), _jsx("button", { type: "button", onClick: onLogout, children: "Sign out" })] })) : null] }), _jsxs("div", { className: "hero-card", children: [_jsxs("div", { className: "auth-mode-toggle", role: "tablist", "aria-label": "Authentication mode", children: [registrationInfo?.canSelfRegister !== false ? (_jsx("button", { type: "button", className: authMode === "register" ? "tab-active" : "tab", onClick: () => setAuthMode("register"), children: "Register" })) : null, _jsx("button", { type: "button", className: authMode === "login" ? "tab-active" : "tab", onClick: () => setAuthMode("login"), children: "Sign in" })] }), _jsxs("form", { onSubmit: onAuthenticate, className: "auth-form", children: [authMode === "register" && registrationInfo?.canSelfRegister !== false ? (_jsxs(_Fragment, { children: [_jsx("input", { value: displayName, onChange: (event) => setDisplayName(event.target.value), placeholder: "Your name" }), _jsx("input", { value: workspaceName, onChange: (event) => setWorkspaceName(event.target.value), placeholder: "Workspace name" })] })) : null, _jsx("input", { type: "email", value: email, onChange: (event) => setEmail(event.target.value), placeholder: "Email" }), _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password" }), _jsx("button", { type: "submit", disabled: authSubmitting, children: authSubmitting
                                            ? "Working..."
                                            : authMode === "register" && registrationInfo?.canSelfRegister !== false
                                                ? "Create account"
                                                : "Sign in" }), registrationInfo?.canSelfRegister === false ? (_jsx("p", { className: "status", children: "Self registration is disabled. Sign in with an account provided by an owner." })) : null] })] })] }), _jsxs("section", { className: "panel-grid", children: [_jsxs("section", { className: "panel accent", children: [_jsx("h2", { children: "Quick Add" }), _jsxs("form", { onSubmit: onSubmit, className: "quick-add-form", children: [_jsx("textarea", { value: input, onChange: (event) => setInput(event.target.value), placeholder: account
                                            ? "Record something that happened..."
                                            : "Sign in to enable Quick Add", rows: 4, disabled: !account || submitting }), _jsx("button", { type: "submit", disabled: submitting || !account, children: submitting ? "Saving..." : "Capture" })] }), status ? _jsx("p", { className: "status", children: status }) : null] }), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Timeline" }), timeline.length === 0 ? (_jsx("p", { className: "status", children: status })) : (_jsx("div", { className: "timeline", children: timeline.map((item) => (_jsxs("article", { className: "timeline-item", children: [_jsxs("div", { className: "timeline-meta", children: [_jsx("span", { children: item.entryType }), _jsx("time", { dateTime: item.occurredAt, children: new Date(item.occurredAt).toLocaleString() })] }), _jsx("h3", { children: item.title })] }, item.id))) }))] })] }), account?.role === "owner" ? (_jsxs("section", { className: "panel admin-panel", children: [_jsx("h2", { children: "Admin" }), _jsxs("div", { className: "admin-section", children: [_jsx("h3", { children: "Registration" }), _jsxs("p", { className: "status", children: ["Self registration is currently ", adminSelfRegistrationEnabled ? "enabled" : "disabled", "."] }), _jsx("button", { type: "button", onClick: onToggleSelfRegistration, disabled: adminSaving || adminSelfRegistrationEnabled === null, children: adminSelfRegistrationEnabled ? "Disable self registration" : "Enable self registration" })] }), _jsxs("div", { className: "admin-section", children: [_jsx("h3", { children: "Create user" }), _jsxs("form", { onSubmit: onAdminCreateUser, className: "auth-form", children: [_jsx("input", { type: "email", value: adminUserEmail, onChange: (event) => setAdminUserEmail(event.target.value), placeholder: "Email" }), _jsx("input", { value: adminUserDisplayName, onChange: (event) => setAdminUserDisplayName(event.target.value), placeholder: "Display name" }), _jsx("input", { type: "password", value: adminUserPassword, onChange: (event) => setAdminUserPassword(event.target.value), placeholder: "Temporary password" }), _jsxs("select", { value: adminUserRole, onChange: (event) => setAdminUserRole(event.target.value), children: [_jsx("option", { value: "member", children: "member" }), _jsx("option", { value: "owner", children: "owner" })] }), _jsx("button", { type: "submit", disabled: adminSaving, children: "Create user" })] })] }), _jsxs("div", { className: "admin-section", children: [_jsx("h3", { children: "Workspace users" }), adminUsers.length === 0 ? (_jsx("p", { className: "status", children: "No users found." })) : (_jsx("div", { className: "timeline", children: adminUsers.map((user) => (_jsxs("article", { className: "timeline-item", children: [_jsxs("div", { className: "timeline-meta", children: [_jsx("span", { children: user.role }), _jsx("time", { dateTime: user.joinedAt, children: new Date(user.joinedAt).toLocaleString() })] }), _jsx("h3", { children: user.displayName }), _jsx("p", { className: "status", children: user.email })] }, user.id))) }))] })] })) : null] }));
}
//# sourceMappingURL=App.js.map