import * as fs from "fs/promises";
import * as path from "path";
import type { Plugin as VitePlugin, ResolvedConfig, ViteDevServer } from "vite";

interface ChatGPTWidgetPluginOptions {
  /** Directory containing widget component files. Defaults to "web/chatgpt-widgets" */
  widgetsDir?: string;
}

/**
 * Widget Helpers for MCP Resource Registration
 *
 * This module provides utilities to discover and serve ChatGPT widget HTML.
 *
 * Architecture:
 * - The Vite plugin (src/vite-chatgpt-app-widget.ts) is the source of truth for HTML structure
 * - In development: We use Vite's pluginContainer to load raw HTML, then transformIndexHtml to process it
 *   This ensures proper asset URL rewriting and transformation through Vite's full HTML pipeline
 * - In production: We read the built HTML files that Vite has already processed with correct asset URLs
 *
 * This ensures that MCP resources always serve exactly what Vite would serve.
 */
export interface WidgetInfo {
  name: string;
  filePath: string;
  content: string;
}

/**
 * Details of where a production Vite build is located
 */
export interface ProductionViteBuild {
  /** Path to the Vite manifest.json file from a production build. */
  manifestPath: string;
}

export type ViteHandle = ViteDevServer | ProductionViteBuild;
/**
 * Returns all widget files in the given directory, and their file contents
 **/
export async function getWidgets(widgetsDir: string, viteHandle: ViteHandle): Promise<WidgetInfo[]> {
  const widgetsDirPath = path.resolve(process.cwd(), widgetsDir);

  if (!(await exists(widgetsDirPath))) {
    return [];
  }

  const files = await fs.readdir(widgetsDirPath);
  const widgets: WidgetInfo[] = [];

  for (const file of files) {
    const ext = path.extname(file);
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      const name = path.basename(file, ext);
      widgets.push({
        name,
        filePath: path.join(widgetsDirPath, file),
        content: await getWidgetHTML(name, viteHandle),
      });
    }
  }

  return widgets;
}

/**
 * Generates HTML content for a widget to be served via MCP
 *
 * In production: Reads the built HTML file using Vite's manifest.json to find the actual built file path
 * In development: Uses Vite's pluginContainer to load raw HTML, then transformIndexHtml to process it
 *
 * The Vite plugin is the source of truth for the HTML structure.
 */
export async function getWidgetHTML(widgetName: string, viteHandle?: ViteHandle): Promise<string> {
  // Check if this is a ViteDevServer (has pluginContainer)
  const isViteDevServer = viteHandle && "pluginContainer" in viteHandle;

  if (isViteDevServer) {
    const vite = viteHandle;
    const virtualModuleId = `virtual:chatgpt-widget-${widgetName}.html`;

    try {
      // Step 1: Use plugin container to resolve and load the raw HTML from our plugin
      const resolved = await vite.pluginContainer.resolveId(virtualModuleId);
      if (!resolved) {
        throw new Error(`Failed to resolve virtual module: ${virtualModuleId}`);
      }

      const loaded = await vite.pluginContainer.load(resolved.id);
      if (!loaded || (typeof loaded === "string" ? !loaded : !loaded.code)) {
        throw new Error(
          `Vite returned no content for widget '${widgetName}'. ` + `Make sure the widget file exists in web/chatgpt-widgets/`
        );
      }

      const rawHtml = typeof loaded === "string" ? loaded : loaded.code;

      // Step 2: Transform the HTML through Vite's HTML transformation pipeline
      // This will process script tags, apply plugins, rewrite asset URLs, etc.
      // Pass the virtual module ID as the URL so Vite knows the context
      const transformedHtml = await vite.transformIndexHtml(virtualModuleId, rawHtml);

      // rewrite src="virtual:chatgpt-widget-${widgetName}.js" to src="/@id/virtual:chatgpt-widget-${widgetName}.js"
      const finalHtml = transformedHtml.replace(/src="virtual:chatgpt-widget-/g, `src="/@id/virtual:chatgpt-widget-`);

      return finalHtml;
    } catch (error) {
      throw new Error(
        `Failed to load widget '${widgetName}' using Vite. ` + `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Production: Read the built HTML file using Vite's manifest
  const options = viteHandle as ProductionViteBuild;
  const manifestPath = path.resolve(process.cwd(), options.manifestPath || "dist/.vite/manifest.json");

  // Read the Vite manifest to verify the widget was built
  if (!(await exists(manifestPath))) {
    throw new Error(
      `Vite manifest not found at ${manifestPath}. ` +
        `Make sure to build with manifest enabled: { build: { manifest: true } } in vite.config.ts`
    );
  }

  const manifestContent = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent) as Record<string, { file: string }>;

  // Look for the widget HTML file in the manifest
  const virtualModuleId = `virtual:chatgpt-widget-${widgetName}.html`;
  const manifestEntry = manifest[virtualModuleId];

  if (!manifestEntry) {
    throw new Error(
      `Widget '${widgetName}' not found in Vite manifest. ` +
        `Available entries: ${Object.keys(manifest).join(", ")}. ` +
        `Make sure the widget exists and was included in the build.`
    );
  }

  // The built HTML file is in the dist root with the virtual module ID as its name
  // e.g., dist/virtual:chatgpt-widget-TestWidget.html
  const buildDir = path.dirname(path.dirname(manifestPath)); // Go up from .vite to dist
  const builtHtmlPath = path.join(buildDir, virtualModuleId);

  if (!(await exists(builtHtmlPath))) {
    throw new Error(
      `Built widget HTML not found at ${builtHtmlPath}. ` +
        `Expected HTML file to be generated during build. This may indicate a build issue.`
    );
  }

  // Read and return the built HTML file
  // Vite has already processed this and included all the correct asset URLs
  return await fs.readFile(builtHtmlPath, "utf-8");
}

/**
 * Vite plugin that creates virtual HTML entrypoints for each React component in the widgets directory.
 *
 * For each component file in the widgets directory (e.g., Foo.tsx), this plugin:
 * 1. Creates a virtual HTML file (virtual:chatgpt-widget-Foo.html)
 * 2. Creates a virtual JavaScript entrypoint that imports and renders the component
 * 3. Adds these entrypoints to the Rollup build configuration
 * 4. Produces standalone HTML files that can be embedded as widgets
 *
 * The component files should export a React component as their default export.
 *
 * @example
 * // In web/chatgpt-widgets/MyWidget.tsx
 * export default function MyWidget() {
 *   return <div>Hello World</div>;
 * }
 *
 * // After build, produces:
 * // dist/chatgpt-widget-MyWidget.html
 */
/**
 * Generates the HTML content for a widget entrypoint
 * This is exported so it can be reused by the MCP resource generator
 *
 * @param widgetName - The name of the widget
 */
export function generateWidgetEntrypointHTML(widgetName: string): string {
  // Always use the virtual: protocol here
  // In dev mode, the MCP helper will rewrite this to /@id/virtual: after HTML transformation
  // In build mode, Vite will resolve and bundle this appropriately
  const jsEntrypoint = `virtual:chatgpt-widget-${widgetName}.js`;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${widgetName} Widget</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${jsEntrypoint}"></script>
  </body>
</html>
  `.trim();
}

export function chatGPTWidgetPlugin(options: ChatGPTWidgetPluginOptions = {}): VitePlugin {
  const widgetsDir = options.widgetsDir || "web/chatgpt-widgets";
  let config: ResolvedConfig;
  let viteRoot: string;

  return {
    name: "vite-chatgpt-widget",

    config(config) {
      // Store the root for use in the options hook
      viteRoot = config.root || process.cwd();
      return null;
    },

    configResolved(resolvedConfig: ResolvedConfig) {
      config = resolvedConfig;
    },

    async options(options) {
      // Add widget virtual entrypoints to rollup input during build
      // Use the root from the config hook
      const widgetsDirPath = path.resolve(viteRoot || process.cwd(), widgetsDir);

      // Check if the directory exists, if not, return early
      if (!(await exists(widgetsDirPath))) {
        return options;
      }

      const files = await fs.readdir(widgetsDirPath);
      const widgetEntries: Record<string, string> = {};

      for (const file of files) {
        const ext = path.extname(file);
        if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
          const basename = path.basename(file, ext);
          widgetEntries[`chatgpt-widget-${basename}`] = `virtual:chatgpt-widget-${basename}.html`;
        }
      }

      // Add widget entries to existing input
      if (Object.keys(widgetEntries).length > 0) {
        const currentInput = options.input;

        if (typeof currentInput === "string") {
          options.input = { main: currentInput, ...widgetEntries };
        } else if (Array.isArray(currentInput)) {
          options.input = [...currentInput, ...Object.values(widgetEntries)];
        } else if (typeof currentInput === "object" && currentInput !== null) {
          options.input = { ...currentInput, ...widgetEntries };
        } else {
          options.input = widgetEntries;
        }
      }

      return options;
    },

    resolveId(id) {
      // Handle virtual HTML entrypoint resolution
      if (id.startsWith("virtual:chatgpt-widget-") && id.endsWith(".html")) {
        return id;
      }
      // Handle virtual JS entrypoint resolution
      if (id.startsWith("virtual:chatgpt-widget-") && id.endsWith(".js")) {
        return "\0" + id;
      }
      return null;
    },

    async load(id) {
      // Handle virtual HTML files
      if (id.startsWith("virtual:chatgpt-widget-") && id.endsWith(".html")) {
        const widgetName = id.replace("virtual:chatgpt-widget-", "").replace(".html", "");
        return generateWidgetEntrypointHTML(widgetName);
      }

      // Handle virtual JS entrypoints
      if (id.startsWith("\0virtual:chatgpt-widget-") && id.endsWith(".js")) {
        const widgetName = id.replace("\0virtual:chatgpt-widget-", "").replace(".js", "");

        // Find the actual widget file
        const widgetsDirPath = path.resolve(config.root, widgetsDir);
        const possibleExtensions = [".tsx", ".ts", ".jsx", ".js"];
        let widgetFile = "";

        for (const ext of possibleExtensions) {
          const candidatePath = path.join(widgetsDirPath, `${widgetName}${ext}`);
          if (await exists(candidatePath)) {
            widgetFile = `/${widgetsDir}/${widgetName}${ext}`;
            break;
          }
        }

        if (!widgetFile) {
          this.error(`Widget file not found for: ${widgetName}`);
          return;
        }

        return `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Widget from '${widgetFile}';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(React.createElement(Widget));
        `.trim();
      }

      return null;
    },
  };
}

const exists = async (path: string) => {
  try {
    await fs.stat(path);
    return true;
  } catch (error) {
    return false;
  }
};
