export type EventFactInput = {
  eventType: string;
  title: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type MeasurementFactInput = {
  metric: string;
  valueNumeric: number;
  unit: string;
  measuredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type ParsedQuickAddResult = {
  kind: "event" | "measurement";
  confidence: number;
  capturedAt: string;
  event?: EventFactInput;
  measurement?: MeasurementFactInput;
  metadata?: Record<string, unknown>;
};

export type TimelineEntry = {
  id: string;
  entryType: "event" | "measurement";
  title: string;
  occurredAt: string;
  details: Record<string, unknown> | null;
};

export type AuthenticatedAccount = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: string;
};

export type SessionRecord = AuthenticatedAccount & {
  sessionId: string;
  expiresAt: string;
};
