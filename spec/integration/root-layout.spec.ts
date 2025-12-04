import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import * as path from "path";
import * as fs from "fs/promises";
import execa from "execa";
import { getWidgets, getWidgetHTML } from "../../src/index.js";
import { FIXTURE_WITH_ROOT_DIR, WIDGETS_WITH_ROOT_DIR, BUILD_WITH_ROOT_DIR, MANIFEST_WITH_ROOT_PATH } from "../fixtureDirs.js";

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

      expect(manifest).toHaveProperty("virtual:chatgpt-widget-html-WidgetA.html");
      expect(manifest).toHaveProperty("virtual:chatgpt-widget-html-WidgetB.html");
      expect(manifest).not.toHaveProperty("virtual:chatgpt-widget-html-root.html");
      expect(manifest).not.toHaveProperty("virtual:chatgpt-widget-html-Root.html");
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

  describe("Browser CSS Order Tests", () => {
    let devServer: ViteDevServer;

    beforeAll(async () => {
      devServer = await createServer({
        root: FIXTURE_WITH_ROOT_DIR,
        configFile: path.join(FIXTURE_WITH_ROOT_DIR, "vite.config.ts"),
        server: {
          port: 5177,
        },
        logLevel: "warn",
      });
      await devServer.listen();
    });

    afterAll(async () => {
      await devServer?.close();
    });

    it("should inject root layout styles before widget styles in the browser", async () => {
      const { content: html } = await getWidgetHTML("WidgetA", { devServer });

      // Write the HTML to a temp file for serving
      const tempHtmlPath = path.join(BUILD_WITH_ROOT_DIR, "test-css-order.html");
      // Replace absolute URLs to point to our dev server
      const localHtml = html.replace(/https:\/\/example\.com\//g, "http://localhost:5177/");
      await fs.writeFile(tempHtmlPath, localHtml);

      // Create a simple HTTP server to serve the HTML file
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
          } catch {
            res.writeHead(404);
            res.end("Not found");
          }
        })();
      });

      const port = 5178;
      await new Promise<void>((resolve) => {
        server.listen(port, resolve);
      });

      try {
        const { chromium } = await import("playwright");
        const browser = await chromium.launch();
        const page = await browser.newPage();

        await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
        // Wait for styles to be injected
        await page.waitForTimeout(2000);

        const html = await page.content();
        console.log(html);
        // Get all style tags from the document head, extracting their content
        const styleContents = await page.evaluate(() => {
          const styles = document.querySelectorAll("head style");
          return Array.from(styles).map((style) => style.textContent || "");
        });

        await browser.close();

        // Find which style tag contains root styles vs widget styles
        let rootStyleIndex = -1;
        let widgetStyleIndex = -1;

        for (let i = 0; i < styleContents.length; i++) {
          const content = styleContents[i];
          if (content.includes(".root-layout") && rootStyleIndex === -1) {
            rootStyleIndex = i;
          }
          if (content.includes(".widget-a") && widgetStyleIndex === -1) {
            widgetStyleIndex = i;
          }
        }

        // Verify both styles were found
        expect(rootStyleIndex).toBeGreaterThan(-1);
        expect(widgetStyleIndex).toBeGreaterThan(-1);

        // Root layout styles should be injected BEFORE widget styles
        // This ensures proper CSS cascade - widget styles can override root styles
        expect(rootStyleIndex).toBeLessThan(widgetStyleIndex);
      } finally {
        server.close();
        await fs.unlink(tempHtmlPath).catch(() => {
          // ignore
        });
      }
    });
  });
});
