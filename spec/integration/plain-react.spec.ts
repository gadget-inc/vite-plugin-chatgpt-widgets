import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import * as path from "path";
import * as fs from "fs/promises";
import { getWidgets, getWidgetHTML } from "../../src/index.js";
import { FIXTURE_PLAIN_REACT_DIR, WIDGETS_PLAIN_REACT_DIR, BUILD_PLAIN_REACT_DIR, MANIFEST_PLAIN_REACT_PATH } from "../fixtureDirs.js";

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
      expect(html).toContain("https://example.com/@id/virtual:chatgpt-widget-entrypoint-CounterWidget.js");
    });

    it("should generate HTML for both plain React widgets", async () => {
      const { content: counterHtml } = await getWidgetHTML("CounterWidget", { devServer });
      const { content: greetingHtml } = await getWidgetHTML("GreetingWidget", { devServer });

      expect(counterHtml).toContain("CounterWidget Widget");
      expect(greetingHtml).toContain("GreetingWidget Widget");

      expect(counterHtml).toContain("/@id/virtual:chatgpt-widget-entrypoint-CounterWidget.js");
      expect(greetingHtml).toContain("/@id/virtual:chatgpt-widget-entrypoint-GreetingWidget.js");
    });

    it("should include all plain React widgets in getWidgets result", async () => {
      const widgets = await getWidgets(WIDGETS_PLAIN_REACT_DIR, { devServer });

      for (const widget of widgets) {
        expect(widget.name).toBeTruthy();
        expect(widget.filePath).toBeTruthy();
        expect(widget.content).toContain("<!DOCTYPE html>");
        expect(widget.content).toContain(`<title>${widget.name} Widget</title>`);
        expect(widget.content).toContain("https://example.com/@id/virtual:chatgpt-widget-entrypoint-");
      }
    });

    it("should have Tailwind CSS file for plain React widgets", async () => {
      // Verify the styles.css file exists and contains Tailwind directives
      const cssPath = path.join(WIDGETS_PLAIN_REACT_DIR, "styles.css");

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

    it("should have Tailwind utilities in plain React widget component source", async () => {
      // Read the CounterWidget component source code
      const widgetPath = path.join(WIDGETS_PLAIN_REACT_DIR, "CounterWidget.tsx");

      const widgetCode = await fs.readFile(widgetPath, "utf-8");

      // Verify the component imports CSS
      expect(widgetCode).toContain('import "./styles.css"');

      // Verify Tailwind classes are present in the component
      expect(widgetCode).toContain("bg-indigo");
      expect(widgetCode).toContain("rounded");
      expect(widgetCode).toContain("shadow");
    });
  });

  describe("Production Mode", () => {
    beforeAll(async () => {
      // Clean any previous build
      try {
        await fs.rm(BUILD_PLAIN_REACT_DIR, { recursive: true, force: true });
      } catch (error) {
        // Ignore if directory doesn't exist
      }

      // Run Vite build
      const execa = (await import("execa")).default;
      await execa("npx", ["vite", "build", "--config", "vite.config.ts"], {
        cwd: FIXTURE_PLAIN_REACT_DIR,
      });
    });

    it("should have widget entries in the manifest for plain React project", async () => {
      const manifestContent = await fs.readFile(MANIFEST_PLAIN_REACT_PATH, "utf-8");
      const manifest = JSON.parse(manifestContent);

      expect(manifest).toHaveProperty("virtual:chatgpt-widget-html-CounterWidget.html");
      expect(manifest).toHaveProperty("virtual:chatgpt-widget-html-GreetingWidget.html");

      expect(manifest["virtual:chatgpt-widget-html-CounterWidget.html"].file).toBeTruthy();
      expect(manifest["virtual:chatgpt-widget-html-GreetingWidget.html"].file).toBeTruthy();
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

      const widgetEntries = Object.entries(manifest).filter(([key]) => key.startsWith("virtual:chatgpt-widget-html-"));

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

    it("should include Tailwind CSS in plain React production build", async () => {
      const { content: html } = await getWidgetHTML("CounterWidget", {
        manifestPath: MANIFEST_PLAIN_REACT_PATH,
      });

      // Verify CSS link exists
      const cssLinkMatch = html.match(/<link[^>]+href="([^"]+\.css)"/);
      expect(cssLinkMatch).toBeTruthy();

      const cssUrl = cssLinkMatch![1];
      const cssPath = cssUrl.replace("https://example.com/", "");
      const fullCssPath = path.join(BUILD_PLAIN_REACT_DIR, cssPath);

      // Verify the CSS file exists
      const cssExists = await fs
        .stat(fullCssPath)
        .then(() => true)
        .catch(() => false);
      expect(cssExists).toBe(true);

      // Read and verify CSS content
      const cssContent = await fs.readFile(fullCssPath, "utf-8");

      // Verify Tailwind CSS is present
      expect(cssContent).toContain("bg-indigo"); // indigo theme colors
      expect(cssContent).toContain("rounded"); // border radius utilities
      expect(cssContent).toContain("shadow"); // shadow utilities
      expect(cssContent.length).toBeGreaterThan(1000);
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

  describe("HMR Tests", () => {
    let devServer: ViteDevServer;

    beforeAll(async () => {
      devServer = await createServer({
        root: FIXTURE_PLAIN_REACT_DIR,
        configFile: path.join(FIXTURE_PLAIN_REACT_DIR, "vite.config.ts"),
        server: {
          port: 5194,
        },
        logLevel: "warn",
      });
      await devServer.listen();
    });

    afterAll(async () => {
      await devServer?.close();
    });

    it("should connect Vite client and accept HMR updates", async () => {
      const { content: html } = await getWidgetHTML("CounterWidget", { devServer });

      const tempHtmlPath = path.join(BUILD_PLAIN_REACT_DIR, "test-widget-hmr.html");
      // Replace absolute URLs and also make relative module imports absolute
      let localHtml = html.replace(/https:\/\/example\.com\//g, "http://localhost:5194/");
      // Make relative imports like /@react-refresh absolute too
      localHtml = localHtml.replace(/from\s+"\/(@[^"]+)"/g, 'from "http://localhost:5194/$1"');
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

      const port = 5195;
      await new Promise<void>((resolve) => {
        server.listen(port, resolve);
      });

      const widgetPath = path.join(WIDGETS_PLAIN_REACT_DIR, "CounterWidget.tsx");
      let originalContent: string;

      try {
        const { chromium } = await import("playwright");
        const browser = await chromium.launch();
        const page = await browser.newPage();

        const consoleMessages: string[] = [];
        const consoleErrors: string[] = [];

        page.on("console", (msg: { type: () => string; text: () => string }) => {
          const text = msg.text();
          consoleMessages.push(text);
          if (msg.type() === "error") {
            consoleErrors.push(text);
          }
        });

        await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        // Verify initial content is visible
        const initialHeading = await page.textContent("h1");
        expect(initialHeading).toBe("Counter Widget");

        // Check that Vite client connected (look for Vite-related messages)
        const hasViteConnection = consoleMessages.some((msg) => msg.includes("[vite]") || msg.includes("connected"));
        expect(hasViteConnection).toBe(true);

        // Read original content
        originalContent = await fs.readFile(widgetPath, "utf-8");

        // Modify the component to change the heading
        const modifiedContent = originalContent.replace(
          '<h1 className="text-4xl font-bold text-indigo-900 mb-3">Counter Widget</h1>',
          '<h1 className="text-4xl font-bold text-indigo-900 mb-3">Counter Widget (HMR Updated)</h1>'
        );
        await fs.writeFile(widgetPath, modifiedContent);

        // Wait for HMR update to be applied
        // The page should update automatically without full reload
        await page.waitForFunction(
          () => {
            const heading = document.querySelector("h1");
            return heading?.textContent === "Counter Widget (HMR Updated)";
          },
          { timeout: 5000 }
        );

        // Verify the update appeared
        const updatedHeading = await page.textContent("h1");
        expect(updatedHeading).toBe("Counter Widget (HMR Updated)");

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
    }, 10000);
  });
});
