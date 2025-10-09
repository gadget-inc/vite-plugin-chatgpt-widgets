#!/usr/bin/env node

/**
 * Debug script to serve a widget in a browser for manual testing
 * Usage: node debug-widget.mjs [fixture-name] [widget-name]
 * 
 * Examples:
 *   node debug-widget.mjs test-project-react-router SimpleWidget
 *   node debug-widget.mjs test-project-plain-react CounterWidget
 *   node debug-widget.mjs test-project TestWidget
 */

import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import * as path from "path";
import * as fs from "fs/promises";
import { fileURLToPath } from "url";
import { getWidgetHTML } from "./dist/esm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixtureName = process.argv[2] || "test-project-react-router";
const widgetName = process.argv[3] || "SimpleWidget";

const fixtureDir = path.join(__dirname, "spec", "fixtures", fixtureName);
const viteConfigPath = path.join(fixtureDir, "vite.config.ts");

// Port configuration
const VITE_PORT = 5299;
const HTTP_PORT = 5300;

console.log(`
🔧 Debug Widget Server
======================
Fixture: ${fixtureName}
Widget: ${widgetName}
Vite Port: ${VITE_PORT}
HTTP Port: ${HTTP_PORT}
`);

async function main() {
    // Check if fixture exists
    try {
        await fs.stat(fixtureDir);
    } catch (error) {
        console.error(`❌ Fixture directory not found: ${fixtureDir}`);
        console.error(`Available fixtures in spec/fixtures/:`);
        const fixtures = await fs.readdir(path.join(__dirname, "spec", "fixtures"));
        fixtures.forEach((f) => console.error(`  - ${f}`));
        process.exit(1);
    }

    // Start Vite dev server
    console.log(`Starting Vite dev server...`);
    const devServer = await createViteServer({
        root: fixtureDir,
        configFile: viteConfigPath,
        server: {
            port: VITE_PORT,
        },
        logLevel: "info",
    });

    await devServer.listen();
    console.log(`✓ Vite dev server running at http://localhost:${VITE_PORT}`);

    // Generate widget HTML
    console.log(`\nGenerating widget HTML for: ${widgetName}`);
    const { content: html } = await getWidgetHTML(widgetName, { devServer });

    // Replace absolute URLs to point to our Vite dev server
    let localHtml = html.replace(/https:\/\/example\.com\//g, `http://localhost:${VITE_PORT}/`);
    // Make relative imports absolute too
    localHtml = localHtml.replace(/from\s+"\/(@[^"]+)"/g, `from "http://localhost:${VITE_PORT}/$1"`);

    // Write to temp file
    const tempHtmlPath = path.join(__dirname, `debug-${widgetName}.html`);
    await fs.writeFile(tempHtmlPath, localHtml);
    console.log(`✓ Widget HTML written to: ${tempHtmlPath}`);

    // Create simple HTTP server to serve the HTML
    const server = createHttpServer(async (req, res) => {
        try {
            const content = await fs.readFile(tempHtmlPath, "utf-8");
            res.writeHead(200, {
                "Content-Type": "text/html",
                "Access-Control-Allow-Origin": "*",
            });
            res.end(content);
        } catch (error) {
            res.writeHead(500);
            res.end("Error loading widget");
        }
    });

    server.listen(HTTP_PORT, () => {
        console.log(`\n✓ Widget server running at: http://localhost:${HTTP_PORT}`);
        console.log(`\n🌐 Open this URL in your browser to debug the widget`);
        console.log(`   http://localhost:${HTTP_PORT}\n`);
        console.log(`Press Ctrl+C to stop\n`);
    });

    // Cleanup on exit
    process.on("SIGINT", async () => {
        console.log("\n\nShutting down...");
        server.close();
        await devServer.close();
        await fs.unlink(tempHtmlPath).catch(() => { });
        process.exit(0);
    });
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});

