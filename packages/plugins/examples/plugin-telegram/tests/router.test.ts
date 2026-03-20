import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../src/router.js";

describe("Router", () => {
  it("routes /start to start handler", async () => {
    const startHandler = vi.fn();
    const router = createRouter({ start: startHandler });

    await router.handle({ chatId: "123", messageId: 1, text: "/start", companyId: "co-1" });

    expect(startHandler).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "123", text: "/start", args: "" })
    );
  });

  it("routes /task create foo to task handler with args", async () => {
    const taskHandler = vi.fn();
    const router = createRouter({ task: taskHandler });

    await router.handle({ chatId: "123", messageId: 1, text: "/task create fix login bug", companyId: "co-1" });

    expect(taskHandler).toHaveBeenCalledWith(
      expect.objectContaining({ args: "create fix login bug" })
    );
  });

  it("routes plain text to onText callback", async () => {
    const onText = vi.fn();
    const router = createRouter({}, onText);

    await router.handle({ chatId: "123", messageId: 1, text: "hello world", companyId: "co-1" });

    expect(onText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello world" })
    );
  });

  it("calls onUnknownCommand for unregistered commands", async () => {
    const onUnknown = vi.fn();
    const router = createRouter({}, undefined, onUnknown);

    await router.handle({ chatId: "123", messageId: 1, text: "/foobar", companyId: "co-1" });

    expect(onUnknown).toHaveBeenCalled();
  });
});
