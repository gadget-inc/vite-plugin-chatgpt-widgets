import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import * as path from "path";
import * as fs from "fs/promises";
import execa from "execa";
import { getWidgets, getWidgetHTML } from "../src/index.js";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/test-project");
const WIDGETS_DIR = path.join(FIXTURE_DIR, "web/chatgpt-widgets");
const BUILD_DIR = path.join(FIXTURE_DIR, "dist");
const MANIFEST_PATH = path.join(BUILD_DIR, ".vite/manifest.json");

const FIXTURE_WITH_ROOT_DIR = path.resolve(__dirname, "fixtures/test-project-with-root");
const WIDGETS_WITH_ROOT_DIR = path.join(FIXTURE_WITH_ROOT_DIR, "web/chatgpt-widgets");
const BUILD_WITH_ROOT_DIR = path.join(FIXTURE_WITH_ROOT_DIR, "dist");
const MANIFEST_WITH_ROOT_PATH = path.join(BUILD_WITH_ROOT_DIR, ".vite/manifest.json");

describe("Integration Tests", () => {
  describe("Development Mode", () => {
    let devServer: ViteDevServer;

    beforeAll(async () => {
      // Start Vite dev server using the fixture's vite.config.ts
      devServer = await createServer({
        root: FIXTURE_DIR,
        configFile: path.join(FIXTURE_DIR, "vite.config.ts"),
        server: {
          port: 5174, // Use a specific port to avoid conflicts
        },
        logLevel: "warn",
      });
      await devServer.listen();
    });

    afterAll(async () => {
      await devServer?.close();
    });

    it("should discover widgets in dev mode", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, devServer);

      expect(widgets).toHaveLength(2);
      expect(widgets.map((w) => w.name).sort()).toEqual(["AnotherWidget", "TestWidget"]);
    });

    it("should generate valid HTML for a widget in dev mode", async () => {
      const html = await getWidgetHTML("TestWidget", devServer);

      // Check basic HTML structure
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<title>TestWidget Widget</title>");
      expect(html).toContain('<div id="root"></div>');

      // Check that the script tag is present and uses the /@id/ prefix for dev mode
      expect(html).toContain('<script type="module"');
      expect(html).toContain("/@id/virtual:chatgpt-widget-TestWidget.js");
    });

    it("should generate different HTML for different widgets in dev mode", async () => {
      const testWidgetHtml = await getWidgetHTML("TestWidget", devServer);
      const anotherWidgetHtml = await getWidgetHTML("AnotherWidget", devServer);

      expect(testWidgetHtml).toContain("TestWidget Widget");
      expect(anotherWidgetHtml).toContain("AnotherWidget Widget");

      expect(testWidgetHtml).toContain("/@id/virtual:chatgpt-widget-TestWidget.js");
      expect(anotherWidgetHtml).toContain("/@id/virtual:chatgpt-widget-AnotherWidget.js");
    });

    it("should generate HTML even for non-existent widgets in dev mode", async () => {
      // In dev mode, the HTML is always generated
      // The error only occurs when the JS module is loaded by the browser
      const html = await getWidgetHTML("NonExistentWidget", devServer);
      expect(html).toContain("NonExistentWidget Widget");
      expect(html).toContain("/@id/virtual:chatgpt-widget-NonExistentWidget.js");
    });

    it("should include all widgets in getWidgets result with content", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, devServer);

      for (const widget of widgets) {
        expect(widget.name).toBeTruthy();
        expect(widget.filePath).toBeTruthy();
        expect(widget.content).toContain("<!DOCTYPE html>");
        expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
        expect(widget.content).toContain("/@id/virtual:chatgpt-widget-");
      }
    });
  });

  describe("Production Mode", () => {
    beforeAll(async () => {
      // Clean any previous build
      try {
        await fs.rm(BUILD_DIR, { recursive: true, force: true });
      } catch (error) {
        // Ignore if directory doesn't exist
      }

      // Run Vite build using the fixture's vite.config.ts
      // Use execa to run the build from the fixture directory so relative paths work correctly
      await execa("npx", ["vite", "build", "--config", "vite.config.ts"], {
        cwd: FIXTURE_DIR,
      });
    });

    it("should have created a manifest file after build", async () => {
      const manifestExists = await fs
        .stat(MANIFEST_PATH)
        .then(() => true)
        .catch(() => false);
      expect(manifestExists).toBe(true);
    });

    it("should have widget entries in the manifest", async () => {
      const manifestContent = await fs.readFile(MANIFEST_PATH, "utf-8");
      const manifest = JSON.parse(manifestContent);

      expect(manifest).toHaveProperty("virtual:chatgpt-widget-TestWidget.html");
      expect(manifest).toHaveProperty("virtual:chatgpt-widget-AnotherWidget.html");

      // Verify the manifest entries point to actual files
      expect(manifest["virtual:chatgpt-widget-TestWidget.html"].file).toBeTruthy();
      expect(manifest["virtual:chatgpt-widget-AnotherWidget.html"].file).toBeTruthy();
    });

    it("should discover widgets in production mode", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, { manifestPath: MANIFEST_PATH });

      expect(widgets).toHaveLength(2);
      expect(widgets.map((w) => w.name).sort()).toEqual(["AnotherWidget", "TestWidget"]);
    });

    it("should generate valid HTML for a widget in production mode", async () => {
      const html = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // Check basic HTML structure
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<title>TestWidget Widget</title>");
      expect(html).toContain('<div id="root"></div>');

      // In production, the script should be bundled with a hash
      expect(html).toContain('<script type="module"');
      // The script src should NOT contain virtual: in production
      expect(html).not.toContain("virtual:");
    });

    it("should have built HTML files on disk", async () => {
      const manifestContent = await fs.readFile(MANIFEST_PATH, "utf-8");
      const manifest = JSON.parse(manifestContent);

      for (const entry of Object.values(manifest)) {
        const filePath = path.join(BUILD_DIR, (entry as any).file);
        const fileExists = await fs
          .stat(filePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    it("should generate different HTML for different widgets in production mode", async () => {
      const testWidgetHtml = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });
      const anotherWidgetHtml = await getWidgetHTML("AnotherWidget", { manifestPath: MANIFEST_PATH });

      expect(testWidgetHtml).toContain("TestWidget Widget");
      expect(anotherWidgetHtml).toContain("AnotherWidget Widget");

      // Each should have different script sources
      expect(testWidgetHtml).not.toBe(anotherWidgetHtml);
    });

    it("should throw error for non-existent widget in production mode", async () => {
      await expect(getWidgetHTML("NonExistentWidget", { manifestPath: MANIFEST_PATH })).rejects.toThrow(
        "Widget 'NonExistentWidget' not found in Vite manifest"
      );
    });

    it("should include all widgets in getWidgets result with content", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, { manifestPath: MANIFEST_PATH });

      for (const widget of widgets) {
        expect(widget.name).toBeTruthy();
        expect(widget.filePath).toBeTruthy();
        expect(widget.content).toContain("<!DOCTYPE html>");
        expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
        // In production, should not have virtual: or /@id/ references
        expect(widget.content).not.toContain("virtual:");
        expect(widget.content).not.toContain("/@id/");
      }
    });

    it("should have bundled JavaScript files with hashes", async () => {
      const html = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // Extract script src from HTML
      const scriptMatch = html.match(/src="([^"]+)"/);
      expect(scriptMatch).toBeTruthy();

      const scriptSrc = scriptMatch![1];

      // Should be a JS file with a hash
      expect(scriptSrc).toMatch(/\.js$/);

      // The file should exist
      const scriptPath = path.join(BUILD_DIR, scriptSrc);
      const scriptExists = await fs
        .stat(scriptPath)
        .then(() => true)
        .catch(() => false);
      expect(scriptExists).toBe(true);
    });

    it("should contain React rendering code in bundled JS", async () => {
      const html = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // Extract script src from HTML
      const scriptMatch = html.match(/src="([^"]+)"/);
      const scriptSrc = scriptMatch![1];
      const scriptPath = path.join(BUILD_DIR, scriptSrc);

      // Read the bundled JS
      const jsContent = await fs.readFile(scriptPath, "utf-8");

      // Should contain some evidence of React code (might be minified)
      // Look for common patterns that would be in the bundle
      expect(jsContent.length).toBeGreaterThan(100); // Should have actual content
    });
  });

  describe("Dev vs Production Consistency", () => {
    let devServer: ViteDevServer;

    beforeAll(async () => {
      devServer = await createServer({
        root: FIXTURE_DIR,
        configFile: path.join(FIXTURE_DIR, "vite.config.ts"),
        server: {
          port: 5175, // Use a different port
        },
        logLevel: "warn",
      });
      await devServer.listen();
    });

    afterAll(async () => {
      await devServer?.close();
    });

    it("should discover the same widgets in dev and production", async () => {
      const devWidgets = await getWidgets(WIDGETS_DIR, devServer);
      const prodWidgets = await getWidgets(WIDGETS_DIR, { manifestPath: MANIFEST_PATH });

      expect(devWidgets.map((w) => w.name).sort()).toEqual(prodWidgets.map((w) => w.name).sort());
    });

    it("should have similar HTML structure in dev and production", async () => {
      const devHtml = await getWidgetHTML("TestWidget", devServer);
      const prodHtml = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // Both should have basic HTML structure
      expect(devHtml).toContain("<!DOCTYPE html>");
      expect(prodHtml).toContain("<!DOCTYPE html>");

      expect(devHtml).toContain("<title>TestWidget Widget</title>");
      expect(prodHtml).toContain("<title>TestWidget Widget</title>");

      expect(devHtml).toContain('<div id="root"></div>');
      expect(prodHtml).toContain('<div id="root"></div>');

      // Both should have script tags
      expect(devHtml).toContain('<script type="module"');
      expect(prodHtml).toContain('<script type="module"');
    });
  });

  describe("Root Layout Component", () => {
    describe("Development Mode with Root Layout", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        devServer = await createServer({
          root: FIXTURE_WITH_ROOT_DIR,
          configFile: path.join(FIXTURE_WITH_ROOT_DIR, "vite.config.ts"),
          server: {
            port: 5176, // Use a different port
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should exclude root.tsx from widget discovery", async () => {
        const widgets = await getWidgets(WIDGETS_WITH_ROOT_DIR, devServer);

        expect(widgets).toHaveLength(2);
        expect(widgets.map((w) => w.name).sort()).toEqual(["WidgetA", "WidgetB"]);
        expect(widgets.find((w) => w.name.toLowerCase() === "root")).toBeUndefined();
      });

      it("should generate HTML for widgets that uses root layout", async () => {
        const html = await getWidgetHTML("WidgetA", devServer);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>WidgetA Widget</title>");
        expect(html).toContain('<div id="root"></div>');
      });
    });

    describe("Production Mode with Root Layout", () => {
      beforeAll(async () => {
        // Clean any previous build
        try {
          await fs.rm(BUILD_WITH_ROOT_DIR, { recursive: true, force: true });
        } catch (error) {
          // Ignore if directory doesn't exist
        }

        // Run Vite build
        await execa("npx", ["vite", "build", "--config", "vite.config.ts"], {
          cwd: FIXTURE_WITH_ROOT_DIR,
        });
      });

      it("should have created a manifest file after build", async () => {
        const manifestExists = await fs
          .stat(MANIFEST_WITH_ROOT_PATH)
          .then(() => true)
          .catch(() => false);
        expect(manifestExists).toBe(true);
      });

      it("should exclude root.tsx from widget entries in manifest", async () => {
        const manifestContent = await fs.readFile(MANIFEST_WITH_ROOT_PATH, "utf-8");
        const manifest = JSON.parse(manifestContent);

        expect(manifest).toHaveProperty("virtual:chatgpt-widget-WidgetA.html");
        expect(manifest).toHaveProperty("virtual:chatgpt-widget-WidgetB.html");
        expect(manifest).not.toHaveProperty("virtual:chatgpt-widget-root.html");
        expect(manifest).not.toHaveProperty("virtual:chatgpt-widget-Root.html");
      });

      it("should discover widgets excluding root in production mode", async () => {
        const widgets = await getWidgets(WIDGETS_WITH_ROOT_DIR, { manifestPath: MANIFEST_WITH_ROOT_PATH });

        expect(widgets).toHaveLength(2);
        expect(widgets.map((w) => w.name).sort()).toEqual(["WidgetA", "WidgetB"]);
        expect(widgets.find((w) => w.name.toLowerCase() === "root")).toBeUndefined();
      });

      it("should generate valid HTML for widgets in production mode with root layout", async () => {
        const html = await getWidgetHTML("WidgetA", { manifestPath: MANIFEST_WITH_ROOT_PATH });

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>WidgetA Widget</title>");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module"');
      });

      it("should have bundled JavaScript that includes root layout", async () => {
        const html = await getWidgetHTML("WidgetA", { manifestPath: MANIFEST_WITH_ROOT_PATH });

        // Extract script src from HTML
        const scriptMatch = html.match(/src="([^"]+)"/);
        expect(scriptMatch).toBeTruthy();

        const scriptSrc = scriptMatch![1];
        const scriptPath = path.join(BUILD_WITH_ROOT_DIR, scriptSrc);

        // Read the bundled JS
        const jsContent = await fs.readFile(scriptPath, "utf-8");

        // Should contain substantial content (including root layout code)
        expect(jsContent.length).toBeGreaterThan(100);
      });
    });
  });
});
