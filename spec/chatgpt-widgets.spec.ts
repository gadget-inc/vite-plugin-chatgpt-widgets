import { describe, it, expect } from "vitest";
import { chatGPTWidgetPlugin, generateWidgetEntrypointHTML } from "../src/index.js";

/**
 * Unit tests focusing on pure functions and important logic
 * Integration tests in integration.spec.ts provide coverage of actual behavior
 */
describe("vite-plugin-chatgpt-widgets", () => {
  describe("generateWidgetEntrypointHTML", () => {
    it("should generate correct HTML structure for a widget", () => {
      const html = generateWidgetEntrypointHTML("TestWidget");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<meta charset="UTF-8" />');
      expect(html).toContain("<title>TestWidget Widget</title>");
      expect(html).toContain('<div id="root"></div>');
      expect(html).toContain('<script type="module" src="virtual:chatgpt-widget-TestWidget.js"></script>');
    });

    it("should use virtual: protocol for the script src", () => {
      const html = generateWidgetEntrypointHTML("MyWidget");
      expect(html).toContain('src="virtual:chatgpt-widget-MyWidget.js"');
    });

    it("should properly escape widget names in titles", () => {
      const html = generateWidgetEntrypointHTML("My-Complex_Widget123");
      expect(html).toContain("<title>My-Complex_Widget123 Widget</title>");
    });
  });

  describe("chatGPTWidgetPlugin - resolveId hook", () => {
    it("should resolve virtual HTML entrypoints", () => {
      const plugin = chatGPTWidgetPlugin();

      const result = (plugin as any).resolveId("virtual:chatgpt-widget-Test.html");
      expect(result).toBe("virtual:chatgpt-widget-Test.html");
    });

    it("should resolve virtual JS entrypoints with null byte prefix", () => {
      const plugin = chatGPTWidgetPlugin();

      const result = (plugin as any).resolveId("virtual:chatgpt-widget-Test.js");
      expect(result).toBe("\0virtual:chatgpt-widget-Test.js");
    });

    it("should return null for non-virtual modules", () => {
      const plugin = chatGPTWidgetPlugin();

      const result = (plugin as any).resolveId("some-other-module");
      expect(result).toBeNull();
    });

    it("should not resolve partial matches", () => {
      const plugin = chatGPTWidgetPlugin();

      expect((plugin as any).resolveId("virtual:chatgpt-widget")).toBeNull();
      expect((plugin as any).resolveId("chatgpt-widget-Test.html")).toBeNull();
      expect((plugin as any).resolveId("virtual:chatgpt-widget-Test.css")).toBeNull();
    });
  });

  describe("chatGPTWidgetPlugin - load hook", () => {
    it("should load virtual HTML files using generateWidgetEntrypointHTML", async () => {
      const plugin = chatGPTWidgetPlugin();

      const result = await (plugin as any).load("virtual:chatgpt-widget-TestWidget.html");

      // Should use the same HTML generation function
      const expected = generateWidgetEntrypointHTML("TestWidget");
      expect(result).toBe(expected);
    });

    it("should return null for non-virtual modules", async () => {
      const plugin = chatGPTWidgetPlugin();

      const result = await (plugin as any).load("some-other-module");
      expect(result).toBeNull();
    });

    it("should not process virtual modules that don't match the pattern", async () => {
      const plugin = chatGPTWidgetPlugin();

      expect(await (plugin as any).load("virtual:other-module")).toBeNull();
      expect(await (plugin as any).load("virtual:chatgpt-widget-Test.css")).toBeNull();
    });
  });
});
