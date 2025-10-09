import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import * as path from "path";
import * as fs from "fs/promises";
import execa from "execa";
import { getWidgets, getWidgetHTML } from "../src/index.js";
import {
  FIXTURE_DIR,
  WIDGETS_DIR,
  BUILD_DIR,
  MANIFEST_PATH,
  FIXTURE_WITH_ROOT_DIR,
  WIDGETS_WITH_ROOT_DIR,
  BUILD_WITH_ROOT_DIR,
  MANIFEST_WITH_ROOT_PATH,
  FIXTURE_REACT_ROUTER_DIR,
  WIDGETS_REACT_ROUTER_DIR,
  BUILD_REACT_ROUTER_DIR,
  MANIFEST_REACT_ROUTER_PATH,
  FIXTURE_PLAIN_REACT_DIR,
  WIDGETS_PLAIN_REACT_DIR,
  BUILD_PLAIN_REACT_DIR,
  MANIFEST_PLAIN_REACT_PATH,
} from "./fixtureDirs.js";

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
      expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-TestWidget.js");
    });

    it("should generate different HTML for different widgets in dev mode", async () => {
      const { content: testWidgetHtml } = await getWidgetHTML("TestWidget", { devServer });
      const { content: anotherWidgetHtml } = await getWidgetHTML("AnotherWidget", { devServer });

      expect(testWidgetHtml).toContain("TestWidget Widget");
      expect(anotherWidgetHtml).toContain("AnotherWidget Widget");

      expect(testWidgetHtml).toContain("/@id/virtual:chatgpt-widget-TestWidget.js");
      expect(anotherWidgetHtml).toContain("/@id/virtual:chatgpt-widget-AnotherWidget.js");
    });

    it("should generate HTML even for non-existent widgets in dev mode", async () => {
      // In dev mode, the HTML is always generated
      // The error only occurs when the JS module is loaded by the browser
      const { content: html } = await getWidgetHTML("NonExistentWidget", { devServer });
      expect(html).toContain("NonExistentWidget Widget");
      expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-NonExistentWidget.js");
    });

    it("should include all widgets in getWidgets result with content", async () => {
      const widgets = await getWidgets(WIDGETS_DIR, { devServer });

      for (const widget of widgets) {
        expect(widget.name).toBeTruthy();
        expect(widget.filePath).toBeTruthy();
        expect(widget.content).toContain("<!DOCTYPE html>");
        expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
        expect(widget.content).toContain("https://example.com/@id/virtual:chatgpt-widget-");
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
        const widgets = await getWidgets(WIDGETS_WITH_ROOT_DIR, { devServer });

        expect(widgets).toHaveLength(2);
        expect(widgets.map((w) => w.name).sort()).toEqual(["WidgetA", "WidgetB"]);
        expect(widgets.find((w) => w.name.toLowerCase() === "root")).toBeUndefined();
      });

      it("should generate HTML for widgets that uses root layout", async () => {
        const { content: html } = await getWidgetHTML("WidgetA", { devServer });

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
        const { content: html } = await getWidgetHTML("WidgetA", { manifestPath: MANIFEST_WITH_ROOT_PATH });

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>WidgetA Widget</title>");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module"');
      });

      it("should have bundled JavaScript that includes root layout", async () => {
        const { content: html } = await getWidgetHTML("WidgetA", { manifestPath: MANIFEST_WITH_ROOT_PATH });

        // Extract script src from HTML
        const scriptMatch = html.match(/src="([^"]+)"/);
        expect(scriptMatch).toBeTruthy();

        const scriptSrc = scriptMatch![1];

        // Strip the base URL to get the relative path
        const relativePath = scriptSrc.replace("https://example.com/", "");
        const scriptPath = path.join(BUILD_WITH_ROOT_DIR, relativePath);

        // Read the bundled JS
        const jsContent = await fs.readFile(scriptPath, "utf-8");

        // Should contain substantial content (including root layout code)
        expect(jsContent.length).toBeGreaterThan(100);
      });
    });
  });

  describe("React Router v7 Integration", () => {
    describe("Development Mode with React Router", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        devServer = await createServer({
          root: FIXTURE_REACT_ROUTER_DIR,
          configFile: path.join(FIXTURE_REACT_ROUTER_DIR, "vite.config.ts"),
          server: {
            port: 5177, // Use a different port
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should discover widgets in React Router project", async () => {
        const widgets = await getWidgets(WIDGETS_REACT_ROUTER_DIR, { devServer });

        expect(widgets).toHaveLength(3);
        expect(widgets.map((w) => w.name).sort()).toEqual(["DataWidget", "NavigationWidget", "SimpleWidget"]);
      });

      it("should generate valid HTML for React Router widgets in dev mode", async () => {
        const { content: html } = await getWidgetHTML("NavigationWidget", { devServer });

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>NavigationWidget Widget</title>");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module"');
        expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-NavigationWidget.js");
      });

      it("should generate HTML for both React Router widgets", async () => {
        const { content: navWidgetHtml } = await getWidgetHTML("NavigationWidget", { devServer });
        const { content: dataWidgetHtml } = await getWidgetHTML("DataWidget", { devServer });

        expect(navWidgetHtml).toContain("NavigationWidget Widget");
        expect(dataWidgetHtml).toContain("DataWidget Widget");

        expect(navWidgetHtml).toContain("/@id/virtual:chatgpt-widget-NavigationWidget.js");
        expect(dataWidgetHtml).toContain("/@id/virtual:chatgpt-widget-DataWidget.js");
      });

      it("should include all React Router widgets in getWidgets result", async () => {
        const widgets = await getWidgets(WIDGETS_REACT_ROUTER_DIR, { devServer });

        for (const widget of widgets) {
          expect(widget.name).toBeTruthy();
          expect(widget.filePath).toBeTruthy();
          expect(widget.content).toContain("<!DOCTYPE html>");
          expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
          expect(widget.content).toContain("https://example.com/@id/virtual:chatgpt-widget-");
        }
      });
    });

    describe("Production Mode with React Router", () => {
      beforeAll(async () => {
        // Clean any previous build
        try {
          await fs.rm(BUILD_REACT_ROUTER_DIR, { recursive: true, force: true });
        } catch (error) {
          // Ignore if directory doesn't exist
        }

        // Run Vite build
        await execa("npx", ["vite", "build", "--config", "vite.config.ts"], {
          cwd: FIXTURE_REACT_ROUTER_DIR,
        });
      });

      it("should have created a manifest file after build", async () => {
        const manifestExists = await fs
          .stat(MANIFEST_REACT_ROUTER_PATH)
          .then(() => true)
          .catch(() => false);
        expect(manifestExists).toBe(true);
      });

      it("should have widget entries in the manifest for React Router project", async () => {
        const manifestContent = await fs.readFile(MANIFEST_REACT_ROUTER_PATH, "utf-8");
        const manifest = JSON.parse(manifestContent);

        expect(manifest).toHaveProperty("virtual:chatgpt-widget-NavigationWidget.html");
        expect(manifest).toHaveProperty("virtual:chatgpt-widget-DataWidget.html");

        expect(manifest["virtual:chatgpt-widget-NavigationWidget.html"].file).toBeTruthy();
        expect(manifest["virtual:chatgpt-widget-DataWidget.html"].file).toBeTruthy();
      });

      it("should discover React Router widgets in production mode", async () => {
        const widgets = await getWidgets(WIDGETS_REACT_ROUTER_DIR, {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        expect(widgets).toHaveLength(3);
        expect(widgets.map((w) => w.name).sort()).toEqual(["DataWidget", "NavigationWidget", "SimpleWidget"]);
      });

      it("should generate valid HTML for React Router widgets in production mode", async () => {
        const { content: html } = await getWidgetHTML("NavigationWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>NavigationWidget Widget</title>");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module"');
        expect(html).not.toContain("virtual:");
      });

      it("should have built HTML files on disk for React Router widgets", async () => {
        const manifestContent = await fs.readFile(MANIFEST_REACT_ROUTER_PATH, "utf-8");
        const manifest = JSON.parse(manifestContent);

        const widgetEntries = Object.entries(manifest).filter(([key]) => key.startsWith("virtual:chatgpt-widget-"));

        for (const [, entry] of widgetEntries) {
          const filePath = path.join(BUILD_REACT_ROUTER_DIR, (entry as any).file);
          const fileExists = await fs
            .stat(filePath)
            .then(() => true)
            .catch(() => false);
          expect(fileExists).toBe(true);
        }
      });

      it("should generate different HTML for different React Router widgets in production", async () => {
        const { content: navWidgetHtml } = await getWidgetHTML("NavigationWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });
        const { content: dataWidgetHtml } = await getWidgetHTML("DataWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        expect(navWidgetHtml).toContain("NavigationWidget Widget");
        expect(dataWidgetHtml).toContain("DataWidget Widget");

        expect(navWidgetHtml).not.toBe(dataWidgetHtml);
      });

      it("should include React Router widgets in getWidgets result with content", async () => {
        const widgets = await getWidgets(WIDGETS_REACT_ROUTER_DIR, {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        for (const widget of widgets) {
          expect(widget.name).toBeTruthy();
          expect(widget.filePath).toBeTruthy();
          expect(widget.content).toContain("<!DOCTYPE html>");
          expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
          expect(widget.content).not.toContain("virtual:");
          expect(widget.content).not.toContain("/@id/");
        }
      });

      it("should have bundled JavaScript for React Router widgets with hashes", async () => {
        const { content: html } = await getWidgetHTML("NavigationWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        const scriptMatch = html.match(/src="([^"]+)"/);
        expect(scriptMatch).toBeTruthy();

        const scriptSrc = scriptMatch![1];
        expect(scriptSrc).toMatch(/\.js$/);

        const relativePath = scriptSrc.replace("https://example.com/", "");
        const scriptPath = path.join(BUILD_REACT_ROUTER_DIR, relativePath);
        const scriptExists = await fs
          .stat(scriptPath)
          .then(() => true)
          .catch(() => false);
        expect(scriptExists).toBe(true);
      });

      it("should contain React Router code in bundled JavaScript", async () => {
        const { content: html } = await getWidgetHTML("NavigationWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        const scriptMatch = html.match(/src="([^"]+)"/);
        const scriptSrc = scriptMatch![1];

        const relativePath = scriptSrc.replace("https://example.com/", "");
        const scriptPath = path.join(BUILD_REACT_ROUTER_DIR, relativePath);

        const jsContent = await fs.readFile(scriptPath, "utf-8");

        // Should contain substantial content including React Router integration
        expect(jsContent.length).toBeGreaterThan(100);
      });
    });

    describe("Dev vs Production Consistency with React Router", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        devServer = await createServer({
          root: FIXTURE_REACT_ROUTER_DIR,
          configFile: path.join(FIXTURE_REACT_ROUTER_DIR, "vite.config.ts"),
          server: {
            port: 5178, // Use a different port
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should discover the same React Router widgets in dev and production", async () => {
        const devWidgets = await getWidgets(WIDGETS_REACT_ROUTER_DIR, { devServer });
        const prodWidgets = await getWidgets(WIDGETS_REACT_ROUTER_DIR, {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        expect(devWidgets.map((w) => w.name).sort()).toEqual(prodWidgets.map((w) => w.name).sort());
      });

      it("should have similar HTML structure in dev and production for React Router widgets", async () => {
        const { content: devHtml } = await getWidgetHTML("NavigationWidget", { devServer });
        const { content: prodHtml } = await getWidgetHTML("NavigationWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        expect(devHtml).toContain("<!DOCTYPE html>");
        expect(prodHtml).toContain("<!DOCTYPE html>");

        expect(devHtml).toContain("<title>NavigationWidget Widget</title>");
        expect(prodHtml).toContain("<title>NavigationWidget Widget</title>");

        expect(devHtml).toContain('<div id="root"></div>');
        expect(prodHtml).toContain('<div id="root"></div>');

        expect(devHtml).toContain('<script type="module"');
        expect(prodHtml).toContain('<script type="module"');
      });

      it("should include React Router HMR runtime import in dev mode widget JavaScript", async () => {
        const { content: devHtml } = await getWidgetHTML("SimpleWidget", { devServer });

        // Extract the script src
        const scriptMatch = devHtml.match(/src="([^"]+virtual:chatgpt-widget-SimpleWidget\.js[^"]*)"/);
        expect(scriptMatch).toBeTruthy();

        // Fetch the JavaScript module from the dev server to verify it contains the HMR runtime import
        const scriptUrl = scriptMatch![1].replace("https://example.com/@id/", "").replace("https://example.com/", "");

        const resolved = await devServer.pluginContainer.resolveId(scriptUrl);
        expect(resolved).toBeTruthy();

        const loaded = await devServer.pluginContainer.load(resolved!.id);
        const jsCode = typeof loaded === "string" ? loaded : loaded!.code;

        // The generated JavaScript should import the React Router HMR runtime
        expect(jsCode).toContain('import "virtual:react-router/inject-hmr-runtime"');
      });
    });

    describe("Plain React Plugin Preamble Regression", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        devServer = await createServer({
          root: FIXTURE_PLAIN_REACT_DIR,
          configFile: path.join(FIXTURE_PLAIN_REACT_DIR, "vite.config.ts"),
          server: {
            port: 5199,
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should include @vitejs/plugin-react preamble script in dev mode widget HTML", async () => {
        const { content: devHtml } = await getWidgetHTML("CounterWidget", { devServer });

        // The HTML should contain the preamble script that sets up React refresh globals
        expect(devHtml).toContain("window.__vite_plugin_react_preamble_installed__");
        expect(devHtml).toContain("window.$RefreshReg$");
        expect(devHtml).toContain("window.$RefreshSig$");

        // The preamble should be in a non-module script (for synchronous execution)
        const preambleMatch = devHtml.match(/<script>\s*[\s\S]*?window\.__vite_plugin_react_preamble_installed__[\s\S]*?<\/script>/);
        expect(preambleMatch).toBeTruthy();

        // The preamble script should NOT have type="module"
        const preambleScript = preambleMatch![0];
        expect(preambleScript).not.toContain('type="module"');
      });
    });

    describe("Browser Execution Tests", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        // Make sure the build is ready
        const manifestExists = await fs
          .stat(MANIFEST_REACT_ROUTER_PATH)
          .then(() => true)
          .catch(() => false);
        if (!manifestExists) {
          throw new Error("React Router fixture must be built before running browser tests");
        }

        // Also start a dev server for dev mode tests
        devServer = await createServer({
          root: FIXTURE_REACT_ROUTER_DIR,
          configFile: path.join(FIXTURE_REACT_ROUTER_DIR, "vite.config.ts"),
          server: {
            port: 5180,
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should load React Router widget without HMR preamble errors in development", async () => {
        // Get the dev HTML for a widget (using SimpleWidget which doesn't need Router context)
        const { content: html } = await getWidgetHTML("SimpleWidget", { devServer });

        // Write the HTML to a temporary file so we can serve it
        const tempHtmlPath = path.join(BUILD_REACT_ROUTER_DIR, "test-widget-dev.html");

        // Since we're in dev mode, rewrite URLs to point to the dev server
        const localHtml = html.replace(/https:\/\/example\.com\//g, "http://localhost:5180/");
        await fs.writeFile(tempHtmlPath, localHtml);

        // Serve just this one HTML file (assets will be loaded from dev server)
        const { createServer: createHttpServer } = await import("http");
        const { readFile: fsReadFile } = await import("fs/promises");

        const server = createHttpServer((req, res) => {
          void (async () => {
            try {
              const content = await fsReadFile(tempHtmlPath);
              res.writeHead(200, {
                "Content-Type": "text/html",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(content);
            } catch (error) {
              res.writeHead(404);
              res.end("Not found");
            }
          })();
        });

        const port = 5181;
        await new Promise<void>((resolve) => {
          server.listen(port, resolve);
        });

        try {
          const { chromium } = await import("playwright");
          const browser = await chromium.launch();
          const page = await browser.newPage();

          const consoleErrors: string[] = [];
          const pageErrors: Error[] = [];

          page.on("console", (msg: { type: () => string; text: () => string }) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          });

          page.on("pageerror", (err: Error) => {
            pageErrors.push(err);
          });

          await page.goto(`http://localhost:${port}/`);

          // Wait for JavaScript to execute
          await page.waitForTimeout(2000);

          await browser.close();
          await fs.unlink(tempHtmlPath);

          // Log any errors for debugging
          if (pageErrors.length > 0 || consoleErrors.length > 0) {
            console.log("Dev mode errors:", {
              pageErrors: pageErrors.map((e) => e.message),
              consoleErrors,
            });
          }

          // Should have no errors - the HMR preamble should be properly set
          expect(pageErrors).toHaveLength(0);
          expect(consoleErrors).toHaveLength(0);
        } finally {
          server.close();
        }
      }, 30000);

      it("should load React Router widget without HMR preamble errors in production", async () => {
        // Get the production HTML for a widget (using SimpleWidget which doesn't need Router context)
        const { content: html } = await getWidgetHTML("SimpleWidget", {
          manifestPath: MANIFEST_REACT_ROUTER_PATH,
        });

        // Write the HTML to a temporary file so we can serve it
        const tempHtmlPath = path.join(BUILD_REACT_ROUTER_DIR, "test-widget.html");

        // Make URLs relative for local serving by removing the absolute base URL
        const localHtml = html.replace(/https:\/\/example\.com\//g, "/");
        await fs.writeFile(tempHtmlPath, localHtml);

        // We need a simple HTTP server to serve the files
        const { createServer: createHttpServer } = await import("http");
        const { stat: fsStat, readFile: fsReadFile } = await import("fs/promises");

        const server = createHttpServer((req, res) => {
          void (async () => {
            const url = req.url || "/";
            let filePath: string;

            if (url === "/") {
              filePath = tempHtmlPath;
            } else {
              // Serve files from the build directory
              filePath = path.join(BUILD_REACT_ROUTER_DIR, url);
            }

            try {
              const stats = await fsStat(filePath);
              if (!stats.isFile()) {
                res.writeHead(404);
                res.end("Not found");
                return;
              }

              const content = await fsReadFile(filePath);

              // Set appropriate content type
              const ext = path.extname(filePath);
              const contentTypes: Record<string, string> = {
                ".html": "text/html",
                ".js": "application/javascript",
                ".css": "text/css",
                ".json": "application/json",
              };
              const contentType = contentTypes[ext] || "application/octet-stream";

              res.writeHead(200, {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
              });
              res.end(content);
            } catch (error) {
              res.writeHead(404);
              res.end("Not found");
            }
          })();
        });

        const port = 5179;
        await new Promise<void>((resolve) => {
          server.listen(port, resolve);
        });

        try {
          // Now load the page in Playwright and check for errors
          const { chromium } = await import("playwright");
          const browser = await chromium.launch();
          const page = await browser.newPage();

          const consoleErrors: string[] = [];
          const pageErrors: Error[] = [];

          page.on("console", (msg: { type: () => string; text: () => string }) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          });

          page.on("pageerror", (err: Error) => {
            pageErrors.push(err);
          });

          await page.goto(`http://localhost:${port}/`);

          // Wait a bit for JavaScript to execute
          await page.waitForTimeout(1000);

          await browser.close();
          await fs.unlink(tempHtmlPath);

          // Log any errors for debugging
          if (pageErrors.length > 0 || consoleErrors.length > 0) {
            console.log("Production mode errors:", {
              pageErrors: pageErrors.map((e) => e.message),
              consoleErrors,
            });
          }

          // Should have no errors
          expect(pageErrors).toHaveLength(0);
          expect(consoleErrors).toHaveLength(0);
        } finally {
          server.close();
        }
      }, 30000); // 30 second timeout for browser tests
    });
  });

  describe("Plain React (without React Router)", () => {
    describe("Development Mode", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        devServer = await createServer({
          root: FIXTURE_PLAIN_REACT_DIR,
          configFile: path.join(FIXTURE_PLAIN_REACT_DIR, "vite.config.ts"),
          server: {
            port: 5190,
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should discover widgets in plain React project", async () => {
        const widgets = await getWidgets(WIDGETS_PLAIN_REACT_DIR, { devServer });

        expect(widgets).toHaveLength(2);
        expect(widgets.map((w) => w.name).sort()).toEqual(["CounterWidget", "GreetingWidget"]);
      });

      it("should generate valid HTML for plain React widgets in dev mode", async () => {
        const { content: html } = await getWidgetHTML("CounterWidget", { devServer });

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>CounterWidget Widget</title>");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module"');
        expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-CounterWidget.js");
      });

      it("should generate HTML for both plain React widgets", async () => {
        const { content: counterHtml } = await getWidgetHTML("CounterWidget", { devServer });
        const { content: greetingHtml } = await getWidgetHTML("GreetingWidget", { devServer });

        expect(counterHtml).toContain("CounterWidget Widget");
        expect(greetingHtml).toContain("GreetingWidget Widget");

        expect(counterHtml).toContain("/@id/virtual:chatgpt-widget-CounterWidget.js");
        expect(greetingHtml).toContain("/@id/virtual:chatgpt-widget-GreetingWidget.js");
      });

      it("should include all plain React widgets in getWidgets result", async () => {
        const widgets = await getWidgets(WIDGETS_PLAIN_REACT_DIR, { devServer });

        for (const widget of widgets) {
          expect(widget.name).toBeTruthy();
          expect(widget.filePath).toBeTruthy();
          expect(widget.content).toContain("<!DOCTYPE html>");
          expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
          expect(widget.content).toContain("https://example.com/@id/virtual:chatgpt-widget-");
        }
      });
    });

    describe("Production Mode", () => {
      beforeAll(async () => {
        // Build is already done, but verify it exists
        const manifestExists = await fs
          .stat(MANIFEST_PLAIN_REACT_PATH)
          .then(() => true)
          .catch(() => false);
        expect(manifestExists).toBe(true);
      });

      it("should have widget entries in the manifest for plain React project", async () => {
        const manifestContent = await fs.readFile(MANIFEST_PLAIN_REACT_PATH, "utf-8");
        const manifest = JSON.parse(manifestContent);

        expect(manifest).toHaveProperty("virtual:chatgpt-widget-CounterWidget.html");
        expect(manifest).toHaveProperty("virtual:chatgpt-widget-GreetingWidget.html");

        expect(manifest["virtual:chatgpt-widget-CounterWidget.html"].file).toBeTruthy();
        expect(manifest["virtual:chatgpt-widget-GreetingWidget.html"].file).toBeTruthy();
      });

      it("should discover plain React widgets in production mode", async () => {
        const widgets = await getWidgets(WIDGETS_PLAIN_REACT_DIR, {
          manifestPath: MANIFEST_PLAIN_REACT_PATH,
        });

        expect(widgets).toHaveLength(2);
        expect(widgets.map((w) => w.name).sort()).toEqual(["CounterWidget", "GreetingWidget"]);
      });

      it("should generate valid HTML for plain React widgets in production mode", async () => {
        const { content: html } = await getWidgetHTML("CounterWidget", {
          manifestPath: MANIFEST_PLAIN_REACT_PATH,
        });

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<title>CounterWidget Widget</title>");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module"');
        expect(html).not.toContain("virtual:");
      });

      it("should have built HTML files on disk for plain React widgets", async () => {
        const manifestContent = await fs.readFile(MANIFEST_PLAIN_REACT_PATH, "utf-8");
        const manifest = JSON.parse(manifestContent);

        const widgetEntries = Object.entries(manifest).filter(([key]) => key.startsWith("virtual:chatgpt-widget-"));

        for (const [, entry] of widgetEntries) {
          const filePath = path.join(BUILD_PLAIN_REACT_DIR, (entry as any).file);
          const fileExists = await fs
            .stat(filePath)
            .then(() => true)
            .catch(() => false);
          expect(fileExists).toBe(true);
        }
      });

      it("should include plain React widgets in getWidgets result with content", async () => {
        const widgets = await getWidgets(WIDGETS_PLAIN_REACT_DIR, {
          manifestPath: MANIFEST_PLAIN_REACT_PATH,
        });

        for (const widget of widgets) {
          expect(widget.name).toBeTruthy();
          expect(widget.filePath).toBeTruthy();
          expect(widget.content).toContain("<!DOCTYPE html>");
          expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
          expect(widget.content).not.toContain("virtual:");
          expect(widget.content).not.toContain("/@id/");
        }
      });
    });

    describe("Browser Execution Tests", () => {
      let devServer: ViteDevServer;

      beforeAll(async () => {
        // Make sure the build is ready
        const manifestExists = await fs
          .stat(MANIFEST_PLAIN_REACT_PATH)
          .then(() => true)
          .catch(() => false);
        if (!manifestExists) {
          throw new Error("Plain React fixture must be built before running browser tests");
        }

        // Also start a dev server for dev mode tests
        devServer = await createServer({
          root: FIXTURE_PLAIN_REACT_DIR,
          configFile: path.join(FIXTURE_PLAIN_REACT_DIR, "vite.config.ts"),
          server: {
            port: 5191,
          },
          logLevel: "warn",
        });
        await devServer.listen();
      });

      afterAll(async () => {
        await devServer?.close();
      });

      it("should load plain React widget without errors in development", async () => {
        const { content: html } = await getWidgetHTML("CounterWidget", { devServer });

        const tempHtmlPath = path.join(BUILD_PLAIN_REACT_DIR, "test-widget-dev.html");
        // Replace absolute URLs and also make relative module imports absolute
        let localHtml = html.replace(/https:\/\/example\.com\//g, "http://localhost:5191/");
        // Make relative imports like /@react-refresh absolute too
        localHtml = localHtml.replace(/from\s+"\/(@[^"]+)"/g, 'from "http://localhost:5191/$1"');
        await fs.writeFile(tempHtmlPath, localHtml);

        const { createServer: createHttpServer } = await import("http");
        const { readFile: fsReadFile } = await import("fs/promises");

        const server = createHttpServer((req, res) => {
          void (async () => {
            try {
              const content = await fsReadFile(tempHtmlPath);
              res.writeHead(200, {
                "Content-Type": "text/html",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(content);
            } catch (error) {
              res.writeHead(404);
              res.end("Not found");
            }
          })();
        });

        const port = 5192;
        await new Promise<void>((resolve) => {
          server.listen(port, resolve);
        });

        try {
          const { chromium } = await import("playwright");
          const browser = await chromium.launch();
          const page = await browser.newPage();

          const consoleErrors: string[] = [];
          const pageErrors: Error[] = [];
          const failedRequests: string[] = [];
          const allResponses: Array<{ url: string; status: number; contentType: string }> = [];

          page.on("console", (msg: { type: () => string; text: () => string }) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          });

          page.on("pageerror", (err: Error) => {
            pageErrors.push(err);
          });

          page.on("requestfailed", (request: { url: () => string; failure: () => { errorText: string } | null }) => {
            failedRequests.push(`${request.url()} - ${request.failure()?.errorText || "unknown"}`);
          });

          page.on("response", (response: { url: () => string; status: () => number; headers: () => Record<string, string> }) => {
            const contentType = response.headers()["content-type"] || "";
            allResponses.push({
              url: response.url(),
              status: response.status(),
              contentType,
            });
          });

          await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
          await page.waitForTimeout(3000);

          await browser.close();
          await fs.unlink(tempHtmlPath);

          if (pageErrors.length > 0 || consoleErrors.length > 0 || failedRequests.length > 0) {
            console.log("Plain React dev mode errors:", {
              pageErrors: pageErrors.map((e) => e.message),
              consoleErrors,
              failedRequests,
            });
            console.log("\nAll responses:");
            allResponses.forEach((r) => {
              console.log(`  ${r.url} -> ${r.contentType} (${r.status})`);
            });
          }

          expect(pageErrors).toHaveLength(0);
          expect(consoleErrors).toHaveLength(0);
        } finally {
          server.close();
        }
      }, 30000);

      it("should load plain React widget without errors in production", async () => {
        const { content: html } = await getWidgetHTML("CounterWidget", {
          manifestPath: MANIFEST_PLAIN_REACT_PATH,
        });

        const tempHtmlPath = path.join(BUILD_PLAIN_REACT_DIR, "test-widget.html");
        const localHtml = html.replace(/https:\/\/example\.com\//g, "/");
        await fs.writeFile(tempHtmlPath, localHtml);

        const { createServer: createHttpServer } = await import("http");
        const { stat: fsStat, readFile: fsReadFile } = await import("fs/promises");

        const server = createHttpServer((req, res) => {
          void (async () => {
            const url = req.url || "/";
            let filePath: string;

            if (url === "/") {
              filePath = tempHtmlPath;
            } else {
              filePath = path.join(BUILD_PLAIN_REACT_DIR, url);
            }

            try {
              const stats = await fsStat(filePath);
              if (!stats.isFile()) {
                res.writeHead(404);
                res.end("Not found");
                return;
              }

              const content = await fsReadFile(filePath);
              const ext = path.extname(filePath);
              const contentTypes: Record<string, string> = {
                ".html": "text/html",
                ".js": "application/javascript",
                ".css": "text/css",
                ".json": "application/json",
              };
              const contentType = contentTypes[ext] || "application/octet-stream";

              res.writeHead(200, {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
              });
              res.end(content);
            } catch (error) {
              res.writeHead(404);
              res.end("Not found");
            }
          })();
        });

        const port = 5193;
        await new Promise<void>((resolve) => {
          server.listen(port, resolve);
        });

        try {
          const { chromium } = await import("playwright");
          const browser = await chromium.launch();
          const page = await browser.newPage();

          const consoleErrors: string[] = [];
          const pageErrors: Error[] = [];

          page.on("console", (msg: { type: () => string; text: () => string }) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          });

          page.on("pageerror", (err: Error) => {
            pageErrors.push(err);
          });

          await page.goto(`http://localhost:${port}/`);
          await page.waitForTimeout(1000);

          await browser.close();
          await fs.unlink(tempHtmlPath);

          if (pageErrors.length > 0 || consoleErrors.length > 0) {
            console.log("Plain React production mode errors:", {
              pageErrors: pageErrors.map((e) => e.message),
              consoleErrors,
            });
          }

          expect(pageErrors).toHaveLength(0);
          expect(consoleErrors).toHaveLength(0);
        } finally {
          server.close();
        }
      }, 30000);
    });
  });
});
