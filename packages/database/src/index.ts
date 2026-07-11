import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AuthenticatedAccount,
  ParsedQuickAddResult,
  SessionRecord,
  TimelineEntry
} from "@life-os/shared";

import { getPool } from "./client.js";

type TimelineQueryRow = {
  id: string;
  entry_type: "event" | "measurement";
  title: string;
  occurred_at: string;
  details: Record<string, unknown> | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AuthContext = {
  userId: string;
  workspaceId: string;
};

type UserLoginRow = {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
};

type AccountRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  role: string;
};

type SessionRow = AccountRow & {
  session_id: string;
  expires_at: string;
};

type CreateWorkspaceBootstrapInput = {
  email: string;
  displayName: string;
  passwordHash: string;
  workspaceName: string;
};

type CreateSessionInput = {
  userId: string;
  workspaceId: string;
  tokenHash: string;
  expiresAt: string;
};

type CreateSessionResult = {
  sessionId: string;
  expiresAt: string;
};

type MembershipUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
};

type WorkspaceUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: string;
};

function toAuthenticatedAccount(row: AccountRow): AuthenticatedAccount {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name ?? row.email,
    workspaceId: row.workspace_id,
    workspaceSlug: row.workspace_slug,
    workspaceName: row.workspace_name,
    role: row.role
  };
}

function slugifyWorkspaceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "workspace";
}

async function buildUniqueWorkspaceSlug(baseSlug: string): Promise<string> {
  const pool = getPool();

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const result = await pool.query<{ slug: string }>(
      "SELECT slug FROM workspaces WHERE slug = $1 LIMIT 1",
      [candidate]
    );

    if (result.rowCount === 0) {
      return candidate;
    }
  }

  throw new Error("Unable to allocate workspace slug");
}

async function getPrimaryAccountForUser(userId: string): Promise<AuthenticatedAccount> {
  const pool = getPool();
  const result = await pool.query<AccountRow>(
    `
      SELECT
        users.id AS user_id,
        users.email,
        users.display_name,
        workspaces.id AS workspace_id,
        workspaces.slug AS workspace_slug,
        workspaces.name AS workspace_name,
        memberships.role
      FROM memberships
      INNER JOIN users ON users.id = memberships.user_id
      INNER JOIN workspaces ON workspaces.id = memberships.workspace_id
      WHERE users.id = $1
      ORDER BY CASE WHEN memberships.role = 'owner' THEN 0 ELSE 1 END, workspaces.created_at ASC
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("No workspace membership found for user");
  }

  return toAuthenticatedAccount(row);
}

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.resolve(__dirname, "../migrations");
  const files = (await readdir(migrationsDir)).sort();

  for (const file of files) {
    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [file]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}

type QuickAddRecordInput = {
  input: string;
  parsed: ParsedQuickAddResult;
};

type CreateWorkspaceUserInput = {
  workspaceId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: "member" | "owner";
};

export function createLifeOsRepository() {
  const pool = getPool();

  return {
    async bootstrapAccount({
      email,
      displayName,
      passwordHash,
      workspaceName
    }: CreateWorkspaceBootstrapInput): Promise<AuthenticatedAccount> {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedDisplayName = displayName.trim();
      const normalizedWorkspaceName = workspaceName.trim();
      const baseSlug = slugifyWorkspaceName(normalizedWorkspaceName);
      const slug = await buildUniqueWorkspaceSlug(baseSlug);

      await pool.query("BEGIN");
      try {
        const existingUser = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
          [normalizedEmail]
        );

        if (existingUser.rowCount !== 0) {
          throw new Error("EMAIL_ALREADY_EXISTS");
        }

        const userResult = await pool.query<{ id: string }>(
          `
            INSERT INTO users (email, display_name, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id
          `,
          [normalizedEmail, normalizedDisplayName, passwordHash]
        );

        const userId = userResult.rows[0]?.id;
        if (!userId) {
          throw new Error("Failed to create user");
        }

        const workspaceResult = await pool.query<{ id: string }>(
          `
            INSERT INTO workspaces (slug, name, metadata)
            VALUES ($1, $2, $3::jsonb)
            RETURNING id
          `,
          [slug, normalizedWorkspaceName, JSON.stringify({ createdBy: userId })]
        );

        const workspaceId = workspaceResult.rows[0]?.id;
        if (!workspaceId) {
          throw new Error("Failed to create workspace");
        }

        await pool.query(
          `
            INSERT INTO memberships (workspace_id, user_id, role)
            VALUES ($1, $2, 'owner')
          `,
          [workspaceId, userId]
        );

        await pool.query("COMMIT");

        return {
          userId,
          email: normalizedEmail,
          displayName: normalizedDisplayName,
          workspaceId,
          workspaceSlug: slug,
          workspaceName: normalizedWorkspaceName,
          role: "owner"
        };
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    },

    async findUserForLogin(email: string): Promise<UserLoginRow | null> {
      const result = await pool.query<UserLoginRow>(
        `
          SELECT id, email, display_name, password_hash
          FROM users
          WHERE lower(email) = lower($1)
          LIMIT 1
        `,
        [email.trim().toLowerCase()]
      );

      return result.rows[0] ?? null;
    },

    async countUsers(): Promise<number> {
      const result = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
      return Number(result.rows[0]?.count ?? "0");
    },

    async isSelfRegistrationEnabled(): Promise<boolean> {
      const result = await pool.query<{ value: boolean }>(
        `
          SELECT (value::text)::boolean AS value
          FROM platform_settings
          WHERE key = 'self_registration_enabled'
          LIMIT 1
        `
      );

      const value = result.rows[0]?.value;
      return value ?? true;
    },

    async setSelfRegistrationEnabled(enabled: boolean): Promise<boolean> {
      const result = await pool.query<{ value: boolean }>(
        `
          INSERT INTO platform_settings (key, value, updated_at)
          VALUES ('self_registration_enabled', to_jsonb($1::boolean), NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
          RETURNING (value::text)::boolean AS value
        `,
        [enabled]
      );

      return result.rows[0]?.value ?? enabled;
    },

    async createUserInWorkspace({
      workspaceId,
      email,
      displayName,
      passwordHash,
      role
    }: CreateWorkspaceUserInput): Promise<WorkspaceUser> {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedDisplayName = displayName.trim();

      await pool.query("BEGIN");
      try {
        const existing = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
          [normalizedEmail]
        );

        if (existing.rowCount !== 0) {
          throw new Error("EMAIL_ALREADY_EXISTS");
        }

        const userInsert = await pool.query<{ id: string; email: string; display_name: string | null }>(
          `
            INSERT INTO users (email, display_name, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id, email, display_name
          `,
          [normalizedEmail, normalizedDisplayName, passwordHash]
        );

        const user = userInsert.rows[0];
        if (!user) {
          throw new Error("Failed to create user");
        }

        const membershipInsert = await pool.query<{ created_at: string }>(
          `
            INSERT INTO memberships (workspace_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING created_at
          `,
          [workspaceId, user.id, role]
        );

        await pool.query("COMMIT");

        return {
          id: user.id,
          email: user.email,
          displayName: user.display_name ?? user.email,
          role,
          joinedAt: membershipInsert.rows[0]?.created_at ?? new Date().toISOString()
        };
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    },

    async listWorkspaceUsers(workspaceId: string): Promise<WorkspaceUser[]> {
      const result = await pool.query<MembershipUserRow>(
        `
          SELECT
            users.id,
            users.email,
            users.display_name,
            memberships.role,
            memberships.created_at
          FROM memberships
          INNER JOIN users ON users.id = memberships.user_id
          WHERE memberships.workspace_id = $1
          ORDER BY memberships.created_at ASC
        `,
        [workspaceId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name ?? row.email,
        role: row.role,
        joinedAt: row.created_at
      }));
    },

    async createSession({
      userId,
      workspaceId,
      tokenHash,
      expiresAt
    }: CreateSessionInput): Promise<CreateSessionResult> {
      const result = await pool.query<{ id: string; expires_at: string }>(
        `
          INSERT INTO auth_sessions (user_id, workspace_id, token_hash, expires_at)
          VALUES ($1, $2, $3, $4)
          RETURNING id, expires_at
        `,
        [userId, workspaceId, tokenHash, expiresAt]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to create session");
      }

      return {
        sessionId: row.id,
        expiresAt: row.expires_at
      };
    },

    async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      const result = await pool.query<SessionRow>(
        `
          SELECT
            auth_sessions.id AS session_id,
            auth_sessions.expires_at,
            users.id AS user_id,
            users.email,
            users.display_name,
            workspaces.id AS workspace_id,
            workspaces.slug AS workspace_slug,
            workspaces.name AS workspace_name,
            memberships.role
          FROM auth_sessions
          INNER JOIN users ON users.id = auth_sessions.user_id
          INNER JOIN workspaces ON workspaces.id = auth_sessions.workspace_id
          INNER JOIN memberships
            ON memberships.user_id = users.id
            AND memberships.workspace_id = workspaces.id
          WHERE auth_sessions.token_hash = $1
            AND auth_sessions.revoked_at IS NULL
            AND auth_sessions.expires_at > NOW()
          LIMIT 1
        `,
        [tokenHash]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        ...toAuthenticatedAccount(row),
        sessionId: row.session_id,
        expiresAt: row.expires_at
      };
    },

    async revokeSession(sessionId: string): Promise<void> {
      await pool.query(
        `
          UPDATE auth_sessions
          SET revoked_at = NOW()
          WHERE id = $1
        `,
        [sessionId]
      );
    },

    async recordQuickAdd(context: AuthContext, { input, parsed }: QuickAddRecordInput) {
      const workspaceId = context.workspaceId;

      const captureResult = await pool.query<{ id: string }>(
        `
          INSERT INTO captures (workspace_id, raw_text, parsed_payload)
          VALUES ($1, $2, $3::jsonb)
          RETURNING id
        `,
        [workspaceId, input, JSON.stringify(parsed)]
      );

      const captureId = captureResult.rows[0]?.id;

      if (!captureId) {
        throw new Error("Failed to create capture record");
      }

      if (parsed.kind === "measurement" && parsed.measurement) {
        const measurementResult = await pool.query<{ id: string }>(
          `
            INSERT INTO measurements (
              workspace_id,
              capture_id,
              metric,
              value_numeric,
              unit,
              measured_at,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id
          `,
          [
            workspaceId,
            captureId,
            parsed.measurement.metric,
            parsed.measurement.valueNumeric,
            parsed.measurement.unit,
            parsed.measurement.measuredAt,
            JSON.stringify(parsed.measurement.metadata ?? {})
          ]
        );

        return {
          captureId,
          recordId: measurementResult.rows[0]?.id,
          kind: parsed.kind,
          parsed
        };
      }

      if (parsed.kind === "event" && parsed.event) {
        const eventResult = await pool.query<{ id: string }>(
          `
            INSERT INTO events (
              workspace_id,
              capture_id,
              event_type,
              title,
              occurred_at,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id
          `,
          [
            workspaceId,
            captureId,
            parsed.event.eventType,
            parsed.event.title,
            parsed.event.occurredAt,
            JSON.stringify(parsed.event.metadata ?? {})
          ]
        );

        return {
          captureId,
          recordId: eventResult.rows[0]?.id,
          kind: parsed.kind,
          parsed
        };
      }

      throw new Error("Parsed quick add result is incomplete");
    },

    async listTimelineEntries(context: AuthContext): Promise<TimelineEntry[]> {
      const workspaceId = context.workspaceId;

      const result = await pool.query<TimelineQueryRow>(
        `
          SELECT
            id,
            'event' AS entry_type,
            title,
            occurred_at,
            metadata AS details
          FROM events
          WHERE workspace_id = $1

          UNION ALL

          SELECT
            id,
            'measurement' AS entry_type,
            CONCAT(metric, ': ', value_numeric, ' ', unit) AS title,
            measured_at AS occurred_at,
            metadata AS details
          FROM measurements
          WHERE workspace_id = $1

          ORDER BY occurred_at DESC
          LIMIT 100
        `,
        [workspaceId]
      );

      return result.rows.map((row: TimelineQueryRow) => ({
        id: row.id,
        entryType: row.entry_type,
        title: row.title,
        occurredAt: row.occurred_at,
        details: row.details
      }));
    },

    async getPrimaryAccountForUser(userId: string): Promise<AuthenticatedAccount> {
      return getPrimaryAccountForUser(userId);
    }
  };
}
