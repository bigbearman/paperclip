export interface ParsedIntent {
  action: string;
  params: Record<string, string>;
}

interface IntentPattern {
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}

const PATTERNS: IntentPattern[] = [
  {
    pattern: /^(tạo|create)\s+task\s+(.+)/i,
    action: "task.create",
    extract: (m) => ({ title: m[2]!.trim() }),
  },
  {
    pattern: /^assign\s+(\S+)\s+(cho|to)\s+(.+)/i,
    action: "task.assign",
    extract: (m) => ({ taskId: m[1]!, agentName: m[3]!.trim() }),
  },
  {
    pattern: /^(list|danh sách)\s+tasks?/i,
    action: "task.list",
    extract: () => ({}),
  },
  {
    pattern: /^status$/i,
    action: "status",
    extract: () => ({}),
  },
];

export function parseIntent(text: string): ParsedIntent | null {
  for (const { pattern, action, extract } of PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { action, params: extract(match) };
    }
  }
  return null;
}
