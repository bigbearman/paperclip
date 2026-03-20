import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

describe("manifest", () => {
  it("has correct plugin id", () => {
    expect(manifest.id).toBe("paperclip-telegram");
  });

  it("declares webhooks.receive capability", () => {
    expect(manifest.capabilities).toContain("webhooks.receive");
  });

  it("declares telegram-inbound webhook endpoint", () => {
    expect(manifest.webhooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ endpointKey: "telegram-inbound" }),
      ])
    );
  });

  it("requires companyId, botToken, and allowedChatIds in config", () => {
    expect(manifest.instanceConfigSchema?.required).toEqual(
      expect.arrayContaining(["companyId", "botToken", "allowedChatIds"])
    );
  });
});
