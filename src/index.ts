import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import type { Plugin as VitePlugin, ResolvedConfig, ViteDevServer } from "vite";

interface ChatGPTWidgetPluginOptions {
  /** Directory containing widget component files. Defaults to "web/chatgpt" */
  widgetsDir?: string;
  /**
   * Base URL for widget assets. Required if Vite's base config is not an absolute URL.
   * Should include protocol and domain (e.g., "https://example.com/").
   * Used to generate fully qualified URLs for assets in sandboxed iframes.
   */
  baseUrl?: string;
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
  source: "manifest" | "dev-server";
}

export interface DevelopmentViteBuild {
  /** Vite development server for widget assets. Required in development for transforms. */
  devServer: ViteDevServer;
}

/**
 * Details of where a production Vite build is located
 */
export interface ProductionViteBuild {
  /** Path to the Vite manifest.json file from a production build. */
  manifestPath: string;
}

export type ViteHandle = DevelopmentViteBuild | ProductionViteBuild;

const ROOT_WIDGET_NAME = "root";
const PLUGIN_NAME = "vite-chatgpt-widget";

/**
 * Checks if a URL is absolute (contains a protocol and domain)
 */
function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transforms HTML to use absolute URLs for script and link tags
 */
function transformHtmlWithAbsoluteUrls(html: string, baseUrl: string): string {
  // Ensure baseUrl ends with /
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  // Transform script src attributes
  html = html.replace(
    /(<script[^>]+src=["'])\/([^"']+)(["'])/g,
    (_match, prefix, path, suffix) => `${prefix}${normalizedBase}${path}${suffix}`
  );

  // Transform link href attributes (for modulepreload, stylesheets, etc.)
  html = html.replace(
    /(<link[^>]+href=["'])\/([^"']+)(["'])/g,
    (_match, prefix, path, suffix) => `${prefix}${normalizedBase}${path}${suffix}`
  );

  return html;
}

/**
 * Returns all widget files in the given directory, and their file contents
 **/
export async function getWidgets(widgetsDir: string, viteHandle: ViteHandle): Promise<WidgetInfo[]> {
  const widgetsDirPath = path.resolve(process.cwd(), widgetsDir);

  if (!(await exists(widgetsDirPath))) {
    return [];
  }

  const files = await listWidgetFiles(widgetsDirPath);
  const widgets: WidgetInfo[] = [];

  for (const file of files) {
    const { content, source } = await getWidgetHTML(file.name, viteHandle);
    widgets.push({
      name: file.name,
      filePath: path.join(widgetsDirPath, file.path),
      content,
      source,
    });
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
export async function getWidgetHTML(
  widgetName: string,
  viteHandle: ViteHandle
): Promise<{ content: string; source: WidgetInfo["source"] }> {
  // Check if this is a ViteDevServer (has pluginContainer)
  const isViteDevServer = viteHandle && "devServer" in viteHandle;

  let html: string;
  let source: WidgetInfo["source"];

  if (isViteDevServer) {
    const vite = viteHandle.devServer;
    const virtualModuleId = `virtual:chatgpt-widget-html-${widgetName}.html`;

    // Step 1: Use plugin container to resolve and load the raw HTML from our plugin
    const resolved = await vite.pluginContainer.resolveId(virtualModuleId);
    if (!resolved) {
      throw new Error(`Failed to resolve virtual module: ${virtualModuleId}`);
    }

    const loaded = await vite.pluginContainer.load(resolved.id);
    if (!loaded || (typeof loaded === "string" ? !loaded : !loaded.code)) {
      throw new Error(`Vite returned no content for widget '${widgetName}'. ` + `Make sure the widget file exists in web/chatgpt/`);
    }

    const rawHtml = typeof loaded === "string" ? loaded : loaded.code;
    source = "dev-server";

    // Step 2: Transform the HTML through Vite's HTML transformation pipeline
    // This will process script tags, apply plugins, rewrite asset URLs, etc.
    // Pass the virtual module ID as the URL so Vite knows the context
    const transformedHtml = await vite.transformIndexHtml(virtualModuleId, rawHtml);

    // rewrite src="virtual:chatgpt-widget-entrypoint-${widgetName}.js" to src="/@id/virtual:chatgpt-widget-entrypoint-${widgetName}.js"
    html = transformedHtml.replace(/src="virtual:chatgpt-widget-entrypoint-/g, `src="/@id/virtual:chatgpt-widget-entrypoint-`);

    const plugin = vite.config.plugins.find((plugin) => plugin.name === PLUGIN_NAME) as ChatGPTWidgetPlugin;
    // Get explicit baseUrl from the plugin in the plugin options
    const explicitBaseUrl = plugin.pluginOptions.baseUrl;

    // Determine the effective base URL for transforming asset links
    let effectiveBaseUrl: string | undefined;

    if (explicitBaseUrl) {
      if (!isAbsoluteUrl(explicitBaseUrl)) {
        throw new Error(
          `The passed chatGPTWidgetPlugin base URL "${explicitBaseUrl}" is not an absolute URL. ` +
            `Please provide a URL with protocol and domain (e.g., "https://example.com/").`
        );
      }
      // Use the explicit baseUrl provided
      effectiveBaseUrl = explicitBaseUrl;
    } else if (vite.config.base) {
      if (!isAbsoluteUrl(vite.config.base)) {
        throw new Error(
          `The Vite base URL "${vite.config.base}" is not an absolute URL. ` +
            `Please set Vite's 'base' config to an absolute URL (e.g., "https://example.com/").`
        );
      }
      // Use the Vite base if it's absolute
      effectiveBaseUrl = vite.config.base;
    }

    // Validate that we have an absolute base URL for sandboxed iframes
    if (!effectiveBaseUrl) {
      throw new Error(
        `Widget HTML requires an absolute base URL for sandboxed iframes. ` +
          `Either set Vite's 'base' config to an absolute URL (e.g., "https://example.com/"), ` +
          `or provide a 'baseUrl' option when calling getWidgetHTML/getWidgets. ` +
          `Current Vite base: ${vite.config.base || "(not set)"}, provided baseUrl: ${explicitBaseUrl || "(not set)"}`
      );
    }

    // Transform the HTML with absolute URLs
    html = transformHtmlWithAbsoluteUrls(html, effectiveBaseUrl);
  } else {
    // Production: Read the built HTML file using Vite's manifest
    const manifestPath = path.resolve(process.cwd(), viteHandle.manifestPath ?? "dist/.vite/manifest.json");

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
    const virtualModuleId = `virtual:chatgpt-widget-html-${widgetName}.html`;
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

    // Read the built HTML file
    html = await fs.readFile(builtHtmlPath, "utf-8");
    source = "manifest";
  }

  return { content: html, source };
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
 * // In web/chatgpt/MyWidget.tsx
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
  const jsEntrypoint = `virtual:chatgpt-widget-entrypoint-${widgetName}.js`;

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

type ChatGPTWidgetPlugin = VitePlugin & { pluginOptions: ChatGPTWidgetPluginOptions };

export function chatGPTWidgetPlugin(options: ChatGPTWidgetPluginOptions = {}): ChatGPTWidgetPlugin {
  const widgetsDir = options.widgetsDir || "web/chatgpt";
  let config: ResolvedConfig;
  let viteRoot: string;

  return {
    name: PLUGIN_NAME,

    config(config) {
      // Store the root for use in the options hook
      viteRoot = config.root || process.cwd();

      // Conditionally include @gadgetinc/react-chatgpt-apps in optimizeDeps if it's installed
      const gadgetPackage = "@gadgetinc/react-chatgpt-apps";
      const packagePath = path.resolve(viteRoot, "node_modules", gadgetPackage);
      const hasGadgetPackage = fsSync.existsSync(packagePath);

      return {
        optimizeDeps: {
          include: hasGadgetPackage ? [gadgetPackage] : [],
        },
      };
    },

    configResolved(resolvedConfig: ResolvedConfig) {
      config = resolvedConfig;

      // Validate that either plugin baseUrl or Vite's base is absolute
      const pluginBaseUrl = options.baseUrl;
      const viteBase = config.base;

      const hasAbsolutePluginBaseUrl = pluginBaseUrl && isAbsoluteUrl(pluginBaseUrl);
      const hasAbsoluteViteBase = viteBase && isAbsoluteUrl(viteBase);

      if (!hasAbsolutePluginBaseUrl && !hasAbsoluteViteBase) {
        throw new Error(
          `vite-chatgpt-widget plugin requires an absolute base URL for sandboxed iframes. ` +
            `Either set Vite's 'base' config to an absolute URL (e.g., base: "https://example.com/"), ` +
            `or provide a 'baseUrl' option to the plugin (e.g., chatGPTWidgetPlugin({ baseUrl: "https://example.com" })). ` +
            `Current Vite base: ${viteBase || "(not set)"}, plugin baseUrl: ${pluginBaseUrl || "(not set)"}`
        );
      }
    },

    async options(options) {
      // Add widget virtual entrypoints to rollup input during build
      // Use the root from the config hook
      const widgetsDirPath = path.resolve(viteRoot || process.cwd(), widgetsDir);

      // Check if the directory exists, if not, return early
      if (!(await exists(widgetsDirPath))) {
        return options;
      }

      const files = await listWidgetFiles(widgetsDirPath);
      const widgetEntries: Record<string, string> = {};

      for (const file of files) {
        widgetEntries[`chatgpt-widget-${file.name}`] = `virtual:chatgpt-widget-html-${file.name}.html`;
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
      if (id.startsWith("virtual:chatgpt-widget-html-") && id.endsWith(".html")) {
        return id;
      }
      // Handle virtual JS entrypoint resolution
      if (id.startsWith("virtual:chatgpt-widget-entrypoint-") && id.endsWith(".js")) {
        return "\0" + id;
      }
      return null;
    },

    async load(id) {
      // Handle virtual HTML files
      if (id.startsWith("virtual:chatgpt-widget-html-") && id.endsWith(".html")) {
        const widgetName = id.replace("virtual:chatgpt-widget-html-", "").replace(".html", "");
        return generateWidgetEntrypointHTML(widgetName);
      }

      // Handle virtual JS entrypoints
      if (id.startsWith("\0virtual:chatgpt-widget-entrypoint-") && id.endsWith(".js")) {
        const widgetName = id.replace("\0virtual:chatgpt-widget-entrypoint-", "").replace(".js", "");

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

        // Check if a root layout component exists
        let rootFile = "";
        for (const ext of possibleExtensions) {
          const candidatePath = path.join(widgetsDirPath, `root${ext}`);
          if (await exists(candidatePath)) {
            rootFile = `/${widgetsDir}/root${ext}`;
            break;
          }
        }

        // Check if React Router is present (for HMR runtime injection)
        const hasReactRouter = config.plugins.some((plugin) => plugin.name === "react-router" || plugin.name.includes("react-router"));

        // In dev mode with React Router, inject the HMR runtime import
        // Note: @vitejs/plugin-react preamble is handled in the HTML
        let hmrRuntimeSetup = "";
        if (config.command === "serve" && hasReactRouter) {
          hmrRuntimeSetup = `import "virtual:react-router/inject-hmr-runtime";\n`;
        }

        // Generate the entrypoint with or without root layout wrapper
        if (rootFile) {
          return `
${hmrRuntimeSetup}import React from 'react';
import { createRoot } from 'react-dom/client';
import RootLayout from '${rootFile}';
import Widget from '${widgetFile}';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(React.createElement(RootLayout, null, React.createElement(Widget)));
          `.trim();
        } else {
          return `
${hmrRuntimeSetup}import React from 'react';
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
      }

      return null;
    },

    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // Only transform our widget HTML files
        if (!ctx.filename || !ctx.filename.includes("chatgpt-widget-")) {
          return html;
        }

        // In dev mode, inject preamble for React Fast Refresh
        if (config.command === "serve") {
          const hasViteReact = config.plugins.some((plugin) => plugin.name === "vite:react-babel" || plugin.name === "vite:react-refresh");
          const hasReactRouter = config.plugins.some((plugin) => plugin.name === "react-router" || plugin.name.includes("react-router"));

          if (hasReactRouter) {
            // For React Router widgets, inject polyfills for the global variables
            // that the React Router HMR runtime expects but won't exist in standalone widgets
            html = html.replace(
              /<head>/,
              `<head>
    <script>
      // React Router HMR polyfills for standalone widgets
      // These globals are normally set up by HydratedRouter but we need them for HMR
      if (typeof window !== 'undefined') {
        // Minimal polyfill for the data router - just enough to not crash HMR
        window.__reactRouterDataRouter = {
          revalidate: async () => { /* no-op for standalone widgets */ },
          createRoutesForHMR: () => [],
          _internalSetRoutes: () => { /* no-op */ }
        };
        window.__reactRouterManifest = { routes: {} };
        window.__reactRouterRouteModules = {};
        window.__reactRouterContext = { ssr: false, isSpaMode: true };
        window.__reactRouterHdrActive = false;
        window.__reactRouterRouteModuleUpdates = new Map();
      }
    </script>`
            );
          } else if (hasViteReact) {
            // Only inject for plain React (not React Router)
            html = html.replace(
              /<head>/,
              `<head>
    <script>
      // React refresh preamble for @vitejs/plugin-react
      // These must be defined before React components load
      if (typeof window !== 'undefined') {
        window.__vite_plugin_react_preamble_installed__ = true;
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
      }
    </script>`
            );
          }
        }

        return html;
      },
    },

    pluginOptions: options,
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

const listWidgetFiles = async (widgetsDir: string) => {
  const widgetsDirPath = path.resolve(process.cwd(), widgetsDir);
  const files = await fs.readdir(widgetsDirPath);
  const results: {
    path: string;
    name: string;
  }[] = [];

  for (const file of files) {
    const ext = path.extname(file);
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      const name = path.basename(file, ext);
      // Skip root.tsx as it's a layout wrapper, not a widget
      if (name.toLowerCase() === ROOT_WIDGET_NAME) {
        continue;
      }

      results.push({ path: path.join(widgetsDirPath, file), name });
    }
  }

  return results;
};
