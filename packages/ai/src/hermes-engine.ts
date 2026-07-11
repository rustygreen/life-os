import type { ParsedQuickAddResult } from "@life-os/shared";

import { parseQuickAddRules } from "./rules-quick-add.js";

export type HermesEngine = {
  parseQuickAdd: (input: string) => Promise<ParsedQuickAddResult>;
};

export function createHermesEngine(): HermesEngine {
  return {
    async parseQuickAdd(input: string): Promise<ParsedQuickAddResult> {
      const parsed = parseQuickAddRules(input);
      return {
        ...parsed,
        metadata: {
          ...(parsed.metadata ?? {}),
          routedBy: "hermes",
          provider: "rules"
        }
      };
    }
  };
}
