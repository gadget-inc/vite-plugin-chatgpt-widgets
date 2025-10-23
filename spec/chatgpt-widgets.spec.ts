import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chatGPTWidgetPlugin, generateWidgetEntrypointHTML, getWidgetHTML } from "../src/index.js";
import type { ViteDevServer } from "vite";
import * as fs from "fs";
import * as path from "path";

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
      expect(html).toContain('<script type="module" src="virtual:chatgpt-widget-entrypoint-TestWidget.js"></script>');
    });

    it("should use virtual: protocol for the script src", () => {
      const html = generateWidgetEntrypointHTML("MyWidget");
      expect(html).toContain('src="virtual:chatgpt-widget-entrypoint-MyWidget.js"');
    });

    it("should properly escape widget names in titles", () => {
      const html = generateWidgetEntrypointHTML("My-Complex_Widget123");
      expect(html).toContain("<title>My-Complex_Widget123 Widget</title>");
    });
  });

  describe("chatGPTWidgetPlugin - resolveId hook", () => {
    it("should resolve virtual HTML entrypoints", () => {
      const plugin = chatGPTWidgetPlugin();

      const result = (plugin as any).resolveId("virtual:chatgpt-widget-html-Test.html");
      expect(result).toBe("virtual:chatgpt-widget-html-Test.html");
    });

    it("should resolve virtual JS entrypoints with null byte prefix", () => {
      const plugin = chatGPTWidgetPlugin();

      const result = (plugin as any).resolveId("virtual:chatgpt-widget-entrypoint-Test.js");
      expect(result).toBe("\0virtual:chatgpt-widget-entrypoint-Test.js");
    });

    it("should return null for non-virtual modules", () => {
      const plugin = chatGPTWidgetPlugin();

      const result = (plugin as any).resolveId("some-other-module");
      expect(result).toBeNull();
    });

    it("should not resolve partial matches", () => {
      const plugin = chatGPTWidgetPlugin();

      expect((plugin as any).resolveId("virtual:chatgpt-widget")).toBeNull();
      expect((plugin as any).resolveId("chatgpt-widget-html-Test.html")).toBeNull();
      expect((plugin as any).resolveId("virtual:chatgpt-widget-entrypoint-Test.css")).toBeNull();
    });
  });

  describe("chatGPTWidgetPlugin - load hook", () => {
    it("should load virtual HTML files using generateWidgetEntrypointHTML", async () => {
      const plugin = chatGPTWidgetPlugin();

      const result = await (plugin as any).load("virtual:chatgpt-widget-html-TestWidget.html");

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
      expect(await (plugin as any).load("virtual:chatgpt-widget-entrypoint-Test.js")).toBeNull();
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

  describe("chatGPTWidgetPlugin - config hook optimizeDeps", () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
      // Save original cwd
      originalCwd = process.cwd();
      // Create a temporary directory for testing
      tempDir = path.join(process.cwd(), "spec", "fixtures", "temp-test-dir");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    });

    afterEach(() => {
      // Restore original cwd
      process.chdir(originalCwd);
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should include @gadgetinc/react-chatgpt-apps in optimizeDeps when package exists", () => {
      const plugin = chatGPTWidgetPlugin();

      // Create a mock node_modules/@gadgetinc/react-chatgpt-apps directory
      const nodeModulesDir = path.join(tempDir, "node_modules", "@gadgetinc", "react-chatgpt-apps");
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, "package.json"), JSON.stringify({ name: "@gadgetinc/react-chatgpt-apps" }));

      // Call config hook with temp directory as root
      const result = (plugin as any).config({ root: tempDir });

      expect(result).toBeDefined();
      expect(result.optimizeDeps).toBeDefined();
      expect(result.optimizeDeps.include).toEqual(["@gadgetinc/react-chatgpt-apps"]);
    });

    it("should not include @gadgetinc/react-chatgpt-apps in optimizeDeps when package does not exist", () => {
      const plugin = chatGPTWidgetPlugin();

      // Call config hook with temp directory (no node_modules created)
      const result = (plugin as any).config({ root: tempDir });

      expect(result).toBeDefined();
      expect(result.optimizeDeps).toBeDefined();
      expect(result.optimizeDeps.include).toEqual([]);
    });

    it("should use process.cwd() when no root is provided", () => {
      const plugin = chatGPTWidgetPlugin();

      // Change to temp directory
      process.chdir(tempDir);

      // Create node_modules in temp directory
      const nodeModulesDir = path.join(tempDir, "node_modules", "@gadgetinc", "react-chatgpt-apps");
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, "package.json"), JSON.stringify({ name: "@gadgetinc/react-chatgpt-apps" }));

      // Call config hook without root (should use process.cwd())
      const result = (plugin as any).config({});

      expect(result).toBeDefined();
      expect(result.optimizeDeps).toBeDefined();
      expect(result.optimizeDeps.include).toEqual(["@gadgetinc/react-chatgpt-apps"]);
    });

    it("should return empty array when node_modules exists but package is not installed", () => {
      const plugin = chatGPTWidgetPlugin();

      // Create node_modules but without the specific package
      const nodeModulesDir = path.join(tempDir, "node_modules");
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      // Add some other package
      const otherPackageDir = path.join(nodeModulesDir, "some-other-package");
      fs.mkdirSync(otherPackageDir);
      fs.writeFileSync(path.join(otherPackageDir, "package.json"), JSON.stringify({ name: "some-other-package" }));

      const result = (plugin as any).config({ root: tempDir });

      expect(result).toBeDefined();
      expect(result.optimizeDeps).toBeDefined();
      expect(result.optimizeDeps.include).toEqual([]);
    });

    it("should handle scoped package directory structure correctly", () => {
      const plugin = chatGPTWidgetPlugin();

      // Create the full scoped package structure: node_modules/@gadgetinc/react-chatgpt-apps
      const scopeDir = path.join(tempDir, "node_modules", "@gadgetinc");
      fs.mkdirSync(scopeDir, { recursive: true });

      // Create the package directory
      const packageDir = path.join(scopeDir, "react-chatgpt-apps");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name: "@gadgetinc/react-chatgpt-apps" }));

      const result = (plugin as any).config({ root: tempDir });

      expect(result).toBeDefined();
      expect(result.optimizeDeps).toBeDefined();
      expect(result.optimizeDeps.include).toEqual(["@gadgetinc/react-chatgpt-apps"]);
    });

    it("should work with nested project structures", () => {
      const plugin = chatGPTWidgetPlugin();

      // Create a nested project structure
      const nestedProjectDir = path.join(tempDir, "apps", "my-app");
      fs.mkdirSync(nestedProjectDir, { recursive: true });

      // Create node_modules in the nested directory
      const nodeModulesDir = path.join(nestedProjectDir, "node_modules", "@gadgetinc", "react-chatgpt-apps");
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, "package.json"), JSON.stringify({ name: "@gadgetinc/react-chatgpt-apps" }));

      const result = (plugin as any).config({ root: nestedProjectDir });

      expect(result).toBeDefined();
      expect(result.optimizeDeps).toBeDefined();
      expect(result.optimizeDeps.include).toEqual(["@gadgetinc/react-chatgpt-apps"]);
    });
  });
});
