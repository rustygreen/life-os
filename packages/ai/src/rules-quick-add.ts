import type { ParsedQuickAddResult } from "@life-os/shared";

const poundsPattern = /(?<value>\d+(?:\.\d+)?)\s?(?<unit>lb|lbs|pounds?)\b/i;
const oilChangePattern = /oil change(?: on (?<asset>.+?))?(?: at (?<miles>\d+(?:,\d+)?) miles?)?/i;
const furnaceFilterPattern = /changed? (?:the )?furnace filter/i;

export function parseQuickAddRules(input: string): ParsedQuickAddResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  const capturedAt = new Date().toISOString();

  const weightMatch = text.match(poundsPattern);
  if (weightMatch?.groups?.value) {
    return {
      kind: "measurement",
      confidence: 0.96,
      capturedAt,
      measurement: {
        metric: "body.weight",
        valueNumeric: Number(weightMatch.groups.value),
        unit: "lbs",
        measuredAt: capturedAt,
        summary: `${weightMatch.groups.value} lbs`
      },
      metadata: {
        parser: "rules-v1"
      }
    };
  }

  const oilChangeMatch = text.match(oilChangePattern);
  if (oilChangeMatch) {
    const assetName = oilChangeMatch.groups?.asset?.trim();
    const miles = oilChangeMatch.groups?.miles
      ? Number(oilChangeMatch.groups.miles.replaceAll(",", ""))
      : undefined;

    return {
      kind: "event",
      confidence: 0.9,
      capturedAt,
      event: {
        eventType: "vehicle.oil_changed",
        title: assetName ? `Oil change on ${assetName}` : "Oil change",
        occurredAt: capturedAt,
        summary: assetName ? `Oil change on ${assetName}` : "Oil change",
        metadata: {
          assetName,
          odometerMiles: miles
        }
      },
      metadata: {
        parser: "rules-v1"
      }
    };
  }

  if (furnaceFilterPattern.test(lower)) {
    return {
      kind: "event",
      confidence: 0.88,
      capturedAt,
      event: {
        eventType: "maintenance.filter_changed",
        title: "Changed furnace filter",
        occurredAt: capturedAt,
        summary: "Changed furnace filter"
      },
      metadata: {
        parser: "rules-v1"
      }
    };
  }

  return {
    kind: "event",
    confidence: 0.4,
    capturedAt,
    event: {
      eventType: "life.note_recorded",
      title: text,
      occurredAt: capturedAt,
      summary: text
    },
    metadata: {
      parser: "rules-v1",
      needsReview: true
    }
  };
}
