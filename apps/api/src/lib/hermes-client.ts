import { z } from "zod";

import type { ParsedQuickAddResult } from "@life-os/shared";

import { parseQuickAdd } from "./parse-quick-add.js";

const hermesResponseSchema = z.object({
  parsed: z.object({
    kind: z.enum(["event", "measurement"]),
    confidence: z.number(),
    capturedAt: z.string(),
    event: z
      .object({
        eventType: z.string(),
        title: z.string(),
        occurredAt: z.string(),
        summary: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
      .optional(),
    measurement: z
      .object({
        metric: z.string(),
        valueNumeric: z.number(),
        unit: z.string(),
        measuredAt: z.string(),
        summary: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
});

export async function parseQuickAddWithHermes(input: string): Promise<ParsedQuickAddResult> {
  const mode = process.env.HERMES_MODE ?? "fallback";
  const hermesUrl = process.env.HERMES_URL;

  if (!hermesUrl) {
    return parseQuickAdd(input);
  }

  const endpoint = `${hermesUrl.replace(/\/$/, "")}/v1/parse-quick-add`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (process.env.HERMES_API_TOKEN) {
    headers["x-hermes-api-token"] = process.env.HERMES_API_TOKEN;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      if (mode === "required") {
        throw new Error(`Hermes returned ${response.status}`);
      }

      return parseQuickAdd(input);
    }

    const payload = hermesResponseSchema.parse(await response.json());
    const parsed = payload.parsed;
    const event = parsed.event
      ? {
          eventType: parsed.event.eventType,
          title: parsed.event.title,
          occurredAt: parsed.event.occurredAt,
          summary: parsed.event.summary,
          ...(parsed.event.metadata ? { metadata: parsed.event.metadata } : {})
        }
      : undefined;
    const measurement = parsed.measurement
      ? {
          metric: parsed.measurement.metric,
          valueNumeric: parsed.measurement.valueNumeric,
          unit: parsed.measurement.unit,
          measuredAt: parsed.measurement.measuredAt,
          summary: parsed.measurement.summary,
          ...(parsed.measurement.metadata ? { metadata: parsed.measurement.metadata } : {})
        }
      : undefined;

    return {
      kind: parsed.kind,
      confidence: parsed.confidence,
      capturedAt: parsed.capturedAt,
      ...(event ? { event } : {}),
      ...(measurement ? { measurement } : {}),
      ...(parsed.metadata ? { metadata: parsed.metadata } : {})
    };
  } catch (error) {
    if (mode === "required") {
      throw error;
    }

    return parseQuickAdd(input);
  }
}
