import { describe, it, expect } from "vitest";
import { chatGPTWidgetPlugin, generateWidgetEntrypointHTML, getWidgetHTML } from "../src/index.js";
import type { ViteDevServer } from "vite";

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

  describe("getWidgetHTML - error conditions for broken plugin configs", () => {
    /**
     * Helper to create a minimal mock ViteDevServer with the specified configuration
     */
    function createMockDevServer(baseConfig: string | undefined, pluginBaseUrl: string | undefined): ViteDevServer {
      const plugin = chatGPTWidgetPlugin(pluginBaseUrl ? { baseUrl: pluginBaseUrl } : {});

      return {
        config: {
          base: baseConfig,
          plugins: [plugin],
        },
        pluginContainer: {
          async resolveId(id: string) {
            return { id };
          },
          async load(_id: string) {
            // Return minimal HTML for testing
            return `<!DOCTYPE html><html><body><div id="root"></div></body></html>`;
          },
        },
        async transformIndexHtml(url: string, html: string) {
          // Return the HTML with a minimal transformation (add a script tag)
          return html.replace("</body>", `<script type="module" src="/assets/test.js"></script></body>`);
        },
      } as unknown as ViteDevServer;
    }

    it("should throw error when plugin baseUrl is not absolute", async () => {
      const devServer = createMockDevServer(undefined, "/relative/path");

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        'The passed chatGPTWidgetPlugin base URL "/relative/path" is not an absolute URL'
      );

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        'Please provide a URL with protocol and domain (e.g., "https://example.com/").'
      );
    });

    it("should throw error when Vite base config is not absolute and no plugin baseUrl is provided", async () => {
      const devServer = createMockDevServer("/relative/base/", undefined);

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        'The Vite base URL "/relative/base/" is not an absolute URL'
      );

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        "Please set Vite's 'base' config to an absolute URL (e.g., \"https://example.com/\")."
      );
    });

    it("should throw error when neither plugin baseUrl nor Vite base is set", async () => {
      const devServer = createMockDevServer(undefined, undefined);

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        "Widget HTML requires an absolute base URL for sandboxed iframes"
      );

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow("Either set Vite's 'base' config to an absolute URL");

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow("or provide a 'baseUrl' option");
    });

    it("should throw error when Vite base is default '/' and no plugin baseUrl is provided", async () => {
      const devServer = createMockDevServer("/", undefined);

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow('The Vite base URL "/" is not an absolute URL');
    });

    it("should throw error when plugin baseUrl is empty string", async () => {
      const devServer = createMockDevServer(undefined, "");

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        "Widget HTML requires an absolute base URL for sandboxed iframes"
      );
    });

    it("should throw error when plugin baseUrl has no protocol", async () => {
      const devServer = createMockDevServer(undefined, "example.com/base/");

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        'The passed chatGPTWidgetPlugin base URL "example.com/base/" is not an absolute URL'
      );
    });

    it("should throw error when Vite base has no protocol", async () => {
      const devServer = createMockDevServer("example.com/base/", undefined);

      await expect(getWidgetHTML("TestWidget", { devServer })).rejects.toThrow(
        'The Vite base URL "example.com/base/" is not an absolute URL'
      );
    });

    it("should succeed when plugin baseUrl is absolute (overrides non-absolute Vite base)", async () => {
      const devServer = createMockDevServer("/relative/", "https://example.com/");

      // Should not throw - the absolute plugin baseUrl takes precedence
      const result = await getWidgetHTML("TestWidget", { devServer });
      expect(result.content).toContain("<!DOCTYPE html>");
      expect(result.content).toContain("https://example.com/");
    });

    it("should succeed when Vite base is absolute and no plugin baseUrl is provided", async () => {
      const devServer = createMockDevServer("https://example.com/", undefined);

      // Should not throw - Vite base is absolute
      const result = await getWidgetHTML("TestWidget", { devServer });
      expect(result.content).toContain("<!DOCTYPE html>");
      expect(result.content).toContain("https://example.com/");
    });

    it("should succeed when both plugin baseUrl and Vite base are absolute (plugin takes precedence)", async () => {
      const devServer = createMockDevServer("https://vite-config.com/", "https://plugin-option.com/");

      // Should not throw - plugin baseUrl takes precedence
      const result = await getWidgetHTML("TestWidget", { devServer });
      expect(result.content).toContain("<!DOCTYPE html>");
      // Plugin baseUrl should be used, not Vite base
      expect(result.content).toContain("https://plugin-option.com/");
      expect(result.content).not.toContain("https://vite-config.com/");
    });
  });
});
