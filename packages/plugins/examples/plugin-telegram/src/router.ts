import type { CommandContext, CommandHandler } from "./types.js";

interface RouterInput {
  chatId: string;
  messageId: number;
  text: string;
  companyId: string;
}

export function createRouter(
  commands: Record<string, CommandHandler>,
  onText?: CommandHandler,
  onUnknownCommand?: CommandHandler,
) {
  return {
    async handle(input: RouterInput): Promise<void> {
      const { chatId, messageId, text, companyId } = input;

      if (text.startsWith("/")) {
        const spaceIdx = text.indexOf(" ");
        const command = (spaceIdx === -1 ? text : text.slice(0, spaceIdx))
          .slice(1)
          .replace(/@\S+/, "");
        const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();

        const ctx: CommandContext = { chatId, text, args, messageId, companyId };
        const handler = commands[command];

        if (handler) {
          await handler(ctx);
        } else if (onUnknownCommand) {
          await onUnknownCommand(ctx);
        }
      } else if (onText) {
        await onText({ chatId, text, args: text, messageId, companyId });
      }
    },
  };
}
