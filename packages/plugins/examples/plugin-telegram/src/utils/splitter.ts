const DEFAULT_LIMIT = 4096;

export function splitMessage(text: string, limit: number = DEFAULT_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const lastNewline = slice.lastIndexOf("\n");
    const splitAt = lastNewline > 0 ? lastNewline : limit;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt === lastNewline ? splitAt + 1 : splitAt);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
