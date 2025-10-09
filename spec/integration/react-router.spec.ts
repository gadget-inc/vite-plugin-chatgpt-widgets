import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import * as path from "path";
import * as fs from "fs/promises";
import execa from "execa";
import { getWidgets, getWidgetHTML } from "../../src/index.js";
import { FIXTURE_REACT_ROUTER_DIR, WIDGETS_REACT_ROUTER_DIR, BUILD_REACT_ROUTER_DIR, MANIFEST_REACT_ROUTER_PATH } from "../fixtureDirs.js";

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

    it("should have Tailwind CSS file for React Router widgets", async () => {
      // Verify the styles.css file exists and contains Tailwind directives
      const cssPath = path.join(WIDGETS_REACT_ROUTER_DIR, "styles.css");

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

    it("should have Tailwind utilities in React Router widget component source", async () => {
      // Read the NavigationWidget component source code
      const widgetPath = path.join(WIDGETS_REACT_ROUTER_DIR, "NavigationWidget.tsx");

      const widgetCode = await fs.readFile(widgetPath, "utf-8");

      // Verify the component imports CSS
      expect(widgetCode).toContain('import "./styles.css"');

      // Verify Tailwind classes are present in the component
      expect(widgetCode).toContain("bg-teal");
      expect(widgetCode).toContain("rounded");
      expect(widgetCode).toContain("shadow");
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

    it("should include Tailwind CSS in React Router production build", async () => {
      const { content: html } = await getWidgetHTML("NavigationWidget", {
        manifestPath: MANIFEST_REACT_ROUTER_PATH,
      });

      // Verify CSS link exists
      const cssLinkMatch = html.match(/<link[^>]+href="([^"]+\.css)"/);
      expect(cssLinkMatch).toBeTruthy();

      const cssUrl = cssLinkMatch![1];
      const cssPath = cssUrl.replace("https://example.com/", "");
      const fullCssPath = path.join(BUILD_REACT_ROUTER_DIR, cssPath);

      // Verify the CSS file exists
      const cssExists = await fs
        .stat(fullCssPath)
        .then(() => true)
        .catch(() => false);
      expect(cssExists).toBe(true);

      // Read and verify CSS content
      const cssContent = await fs.readFile(fullCssPath, "utf-8");

      // Verify Tailwind CSS is present
      expect(cssContent).toContain("bg-teal"); // teal theme colors
      expect(cssContent).toContain("rounded"); // border radius utilities
      expect(cssContent).toContain("shadow"); // shadow utilities
      expect(cssContent.length).toBeGreaterThan(1000);
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

      // Fetch the JavaScript module from the dev server to verify it contains the React Router HMR runtime
      const scriptUrl = scriptMatch![1].replace("https://example.com/@id/", "").replace("https://example.com/", "");

      const resolved = await devServer.pluginContainer.resolveId(scriptUrl);
      expect(resolved).toBeTruthy();

      const loaded = await devServer.pluginContainer.load(resolved!.id);
      const jsCode = typeof loaded === "string" ? loaded : loaded!.code;

      // The generated JavaScript should import the React Router HMR runtime
      expect(jsCode).toContain('import "virtual:react-router/inject-hmr-runtime"');

      // Verify it's a proper React component entrypoint
      expect(jsCode).toContain("import React from 'react'");
      expect(jsCode).toContain("createRoot");
    });
  });

  describe("Plain React Plugin Preamble Regression", () => {
    let devServer: ViteDevServer;

    beforeAll(async () => {
      devServer = await createServer({
        root: path.join(path.dirname(FIXTURE_REACT_ROUTER_DIR), "test-project-plain-react"),
        configFile: path.join(path.dirname(FIXTURE_REACT_ROUTER_DIR), "test-project-plain-react", "vite.config.ts"),
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

  describe("HMR Tests", () => {
    let devServer: ViteDevServer;

    beforeAll(async () => {
      devServer = await createServer({
        root: FIXTURE_REACT_ROUTER_DIR,
        configFile: path.join(FIXTURE_REACT_ROUTER_DIR, "vite.config.ts"),
        server: {
          port: 5182,
        },
        logLevel: "warn",
      });
      await devServer.listen();
    });

    afterAll(async () => {
      await devServer?.close();
    });

    it("should connect Vite client and accept HMR updates for React Router widgets", async () => {
      const { content: html } = await getWidgetHTML("SimpleWidget", { devServer });

      const tempHtmlPath = path.join(BUILD_REACT_ROUTER_DIR, "test-widget-hmr.html");

      // Since we're in dev mode, rewrite URLs to point to the dev server
      let localHtml = html.replace(/https:\/\/example\.com\//g, "http://localhost:5182/");
      // Make relative imports like /@react-refresh absolute too
      localHtml = localHtml.replace(/from\s+"\/(@[^"]+)"/g, 'from "http://localhost:5182/$1"');
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

      const port = 5183;
      await new Promise<void>((resolve) => {
        server.listen(port, resolve);
      });

      const widgetPath = path.join(WIDGETS_REACT_ROUTER_DIR, "SimpleWidget.tsx");
      let originalContent: string;

      try {
        const { chromium } = await import("playwright");
        const browser = await chromium.launch();
        const page = await browser.newPage();

        const consoleMessages: string[] = [];
        const consoleErrors: string[] = [];
        const pageErrors: Error[] = [];

        page.on("console", (msg: { type: () => string; text: () => string }) => {
          const text = msg.text();
          consoleMessages.push(text);
          if (msg.type() === "error") {
            consoleErrors.push(text);
            console.log("Console error:", text);
          }
        });

        page.on("pageerror", (err: Error) => {
          pageErrors.push(err);
          console.log("Page error:", err.message);
          console.log("Stack:", err.stack);
        });

        await page.goto(`http://localhost:${port}/`);

        // Wait for JavaScript to execute
        await page.waitForTimeout(500);

        // Log any initial errors
        if (pageErrors.length > 0) {
          console.log(
            "Initial page errors:",
            pageErrors.map((e) => e.message)
          );
        }
        if (consoleErrors.length > 0) {
          console.log("Initial console errors:", consoleErrors);
        }

        // Verify initial content is visible
        const initialHeading = await page.textContent("h1");
        expect(initialHeading).toBe("Simple Widget");

        // Check that Vite client connected (look for Vite-related messages)
        const hasViteConnection = consoleMessages.some((msg) => msg.includes("[vite]") || msg.includes("connected"));
        console.log("Console messages during init:", consoleMessages.slice(0, 5));
        expect(hasViteConnection).toBe(true);

        // Read original content
        originalContent = await fs.readFile(widgetPath, "utf-8");

        // Modify the component to change the heading AND the paragraph text
        let modifiedContent = originalContent.replace(
          '<h1 className="text-4xl font-bold text-cyan-900 mb-3">Simple Widget</h1>',
          '<h1 className="text-4xl font-bold text-cyan-900 mb-3">Simple Widget (HMR Updated)</h1>'
        );
        modifiedContent = modifiedContent.replace(
          '<p className="text-cyan-700 mb-2">This is a simple widget for testing React Router HMR integration.</p>',
          '<p className="text-cyan-700 mb-2">HMR is working!</p>'
        );
        await fs.writeFile(widgetPath, modifiedContent);

        console.log("Modified component file, waiting for HMR update...");

        // Give Vite a moment to detect the file change
        await page.waitForTimeout(300);

        // Wait for HMR update to be applied
        // The page should update automatically without full reload
        try {
          await page.waitForFunction(
            () => {
              const para = document.querySelector(".text-cyan-700");
              return para?.textContent === "HMR is working!";
            },
            { timeout: 5000 }
          );
        } catch (error) {
          console.log("HMR update did not appear.");
          console.log("Current heading:", await page.textContent("h1"));
          console.log("Current paragraph:", await page.textContent(".text-cyan-700"));
          console.log("Recent console messages:", consoleMessages.slice(-10));
          console.log("Console errors:", consoleErrors);
          console.log(
            "Page errors:",
            pageErrors.map((e) => e.message)
          );
          throw error;
        }

        // Verify the updates appeared
        const updatedHeading = await page.textContent("h1");
        const updatedPara = await page.textContent(".text-cyan-700");
        expect(updatedHeading).toBe("Simple Widget (HMR Updated)");
        expect(updatedPara).toBe("HMR is working!");

        // Verify no console errors during HMR
        const filteredErrors = consoleErrors.filter((e) => !e.includes("Download the React DevTools"));
        if (filteredErrors.length > 0) {
          console.log("Console errors during HMR test:", filteredErrors);
        }
        expect(filteredErrors).toHaveLength(0);

        await browser.close();
      } finally {
        // Restore original content
        if (originalContent!) {
          await fs.writeFile(widgetPath, originalContent);
        }
        await fs.unlink(tempHtmlPath).catch(() => {
          /* ignore */
        });
        server.close();
      }
    }, 15000);
  });
});
