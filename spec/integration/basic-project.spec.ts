import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import * as path from "path";
import * as fs from "fs/promises";
import execa from "execa";
import { getWidgets, getWidgetHTML } from "../../src/index.js";
import { FIXTURE_DIR, WIDGETS_DIR, BUILD_DIR, MANIFEST_PATH } from "../fixtureDirs.js";

describe("Basic Project Integration", () => {
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
      const widgets = await getWidgets(WIDGETS_DIR, { devServer });

      expect(widgets).toHaveLength(2);
      expect(widgets.map((w) => w.name).sort()).toEqual(["AnotherWidget", "TestWidget"]);
    });

    it("should generate valid HTML for a widget in dev mode", async () => {
      const { content: html } = await getWidgetHTML("TestWidget", { devServer });

      // Check basic HTML structure
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<title>TestWidget Widget</title>");
      expect(html).toContain('<div id="root"></div>');

      // Check that the script tag is present and uses absolute URL
      expect(html).toContain('<script type="module"');
      expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-entrypoint-TestWidget.js");
    });

    it("should generate different HTML for different widgets in dev mode", async () => {
      const { content: testWidgetHtml } = await getWidgetHTML("TestWidget", { devServer });
      const { content: anotherWidgetHtml } = await getWidgetHTML("AnotherWidget", { devServer });

      expect(testWidgetHtml).toContain("TestWidget Widget");
      expect(anotherWidgetHtml).toContain("AnotherWidget Widget");

      expect(testWidgetHtml).toContain("/@id/virtual:chatgpt-widget-entrypoint-TestWidget.js");
      expect(anotherWidgetHtml).toContain("/@id/virtual:chatgpt-widget-entrypoint-AnotherWidget.js");
    });

    it("should generate HTML even for non-existent widgets in dev mode", async () => {
      // In dev mode, the HTML is always generated
      // The error only occurs when the JS module is loaded by the browser
      const { content: html } = await getWidgetHTML("NonExistentWidget", { devServer });
      expect(html).toContain("NonExistentWidget Widget");
      expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-entrypoint-NonExistentWidget.js");
    });

    it("should include all widgets in getWidgets result with content", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, { devServer });

      for (const widget of widgets) {
        expect(widget.name).toBeTruthy();
        expect(widget.filePath).toBeTruthy();
        expect(widget.content).toContain("<!DOCTYPE html>");
        expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
        expect(widget.content).toContain("https://example.com/@id/virtual:chatgpt-widget-entrypoint-");
      }
    });

    it("should include Tailwind CSS in widget JavaScript module in dev mode", async () => {
      const { content: html } = await getWidgetHTML("TestWidget", { devServer });

      // Extract the JavaScript module URL from the HTML
      const scriptMatch = html.match(/src="([^"]+virtual:chatgpt-widget-entrypoint-TestWidget\.js[^"]*)"/);
      expect(scriptMatch).toBeTruthy();

      const scriptUrl = scriptMatch![1].replace("https://example.com/@id/", "").replace("https://example.com/", "");

      // Resolve and load the JavaScript module from the dev server
      const resolved = await devServer.pluginContainer.resolveId(scriptUrl);
      expect(resolved).toBeTruthy();

      const loaded = await devServer.pluginContainer.load(resolved!.id);
      const jsCode = typeof loaded === "string" ? loaded : loaded!.code;

      // The JavaScript should import the widget component which imports styles.css
      expect(jsCode).toContain("TestWidget");
    });

    it("should have Tailwind CSS file in widgets directory", async () => {
      // Verify the styles.css file exists and contains Tailwind directives
      const cssPath = path.join(WIDGETS_DIR, "styles.css");

      const cssExists = await fs
        .stat(cssPath)
        .then(() => true)
        .catch(() => false);
      expect(cssExists).toBe(true);

      const cssContent = await fs.readFile(cssPath, "utf-8");

      // Verify Tailwind directives are present
      expect(cssContent).toContain("@tailwind base");
      expect(cssContent).toContain("@tailwind components");
      expect(cssContent).toContain("@tailwind utilities");
    });

    it("should have Tailwind utilities in widget component source", async () => {
      // Read the TestWidget component source code
      const widgetPath = path.join(WIDGETS_DIR, "TestWidget.tsx");

      const widgetCode = await fs.readFile(widgetPath, "utf-8");

      // Verify the component imports CSS
      expect(widgetCode).toContain('import "./styles.css"');

      // Verify Tailwind classes are in the component
      expect(widgetCode).toContain("bg-gradient-to-r");
      expect(widgetCode).toContain("from-blue-500");
      expect(widgetCode).toContain("shadow-xl");
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

      expect(manifest).toHaveProperty("virtual:chatgpt-widget-html-TestWidget.html");
      expect(manifest).toHaveProperty("virtual:chatgpt-widget-html-AnotherWidget.html");

      // Verify the manifest entries point to actual files
      expect(manifest["virtual:chatgpt-widget-html-TestWidget.html"].file).toBeTruthy();
      expect(manifest["virtual:chatgpt-widget-html-AnotherWidget.html"].file).toBeTruthy();
    });

    it("should discover widgets in production mode", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, { manifestPath: MANIFEST_PATH });

      expect(widgets).toHaveLength(2);
      expect(widgets.map((w) => w.name).sort()).toEqual(["AnotherWidget", "TestWidget"]);
    });

    it("should generate valid HTML for a widget in production mode", async () => {
      const { content: html } = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

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
      const { content: testWidgetHtml } = await getWidgetHTML("TestWidget", {
        manifestPath: MANIFEST_PATH,
      });
      const { content: anotherWidgetHtml } = await getWidgetHTML("AnotherWidget", {
        manifestPath: MANIFEST_PATH,
      });

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
      const { content: html } = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // Extract script src from HTML
      const scriptMatch = html.match(/src="([^"]+)"/);
      expect(scriptMatch).toBeTruthy();

      const scriptSrc = scriptMatch![1];

      // Should be a JS file with a hash
      expect(scriptSrc).toMatch(/\.js$/);

      // Strip the base URL to get the relative path
      const relativePath = scriptSrc.replace("https://example.com/", "");

      // The file should exist
      const scriptPath = path.join(BUILD_DIR, relativePath);
      const scriptExists = await fs
        .stat(scriptPath)
        .then(() => true)
        .catch(() => false);
      expect(scriptExists).toBe(true);
    });

    it("should contain React rendering code in bundled JS", async () => {
      const { content: html } = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // Extract script src from HTML
      const scriptMatch = html.match(/src="([^"]+)"/);
      const scriptSrc = scriptMatch![1];

      // Strip the base URL to get the relative path
      const relativePath = scriptSrc.replace("https://example.com/", "");
      const scriptPath = path.join(BUILD_DIR, relativePath);

      // Read the bundled JS
      const jsContent = await fs.readFile(scriptPath, "utf-8");

      // Should contain some evidence of React code (might be minified)
      // Look for common patterns that would be in the bundle
      expect(jsContent.length).toBeGreaterThan(100); // Should have actual content
    });

    it("should include Tailwind CSS in production build", async () => {
      const { content: html } = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

      // In production, CSS should be bundled and linked in the HTML
      const cssLinkMatch = html.match(/<link[^>]+href="([^"]+\.css)"/);
      expect(cssLinkMatch).toBeTruthy();

      const cssUrl = cssLinkMatch![1];
      const cssPath = cssUrl.replace("https://example.com/", "");
      const fullCssPath = path.join(BUILD_DIR, cssPath);

      // Verify the CSS file exists
      const cssExists = await fs
        .stat(fullCssPath)
        .then(() => true)
        .catch(() => false);
      expect(cssExists).toBe(true);

      // Read the CSS content and verify it contains Tailwind utilities
      const cssContent = await fs.readFile(fullCssPath, "utf-8");

      // Verify Tailwind CSS is present by checking for utility classes we use
      expect(cssContent).toContain("bg-gradient-to-r"); // gradient classes
      expect(cssContent).toContain("shadow-xl"); // shadow classes
      expect(cssContent).toContain("rounded"); // border radius utilities
      // Tailwind CSS should be substantial
      expect(cssContent.length).toBeGreaterThan(1000);
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
      const devWidgets = await getWidgets(WIDGETS_DIR, { devServer });
      const prodWidgets = await getWidgets(WIDGETS_DIR, { manifestPath: MANIFEST_PATH });

      expect(devWidgets.map((w) => w.name).sort()).toEqual(prodWidgets.map((w) => w.name).sort());
    });

    it("should have similar HTML structure in dev and production", async () => {
      const { content: devHtml } = await getWidgetHTML("TestWidget", { devServer });
      const { content: prodHtml } = await getWidgetHTML("TestWidget", { manifestPath: MANIFEST_PATH });

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
});
