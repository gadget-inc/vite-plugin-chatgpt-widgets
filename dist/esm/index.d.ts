import type { Plugin as VitePlugin, ViteDevServer } from "vite";
interface ChatGPTWidgetPluginOptions {
    /** Directory containing widget component files. Defaults to "web/chatgpt-widgets" */
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
/**
 * Returns all widget files in the given directory, and their file contents
 **/
export declare function getWidgets(widgetsDir: string, viteHandle: ViteHandle): Promise<WidgetInfo[]>;
/**
 * Generates HTML content for a widget to be served via MCP
 *
 * In production: Reads the built HTML file using Vite's manifest.json to find the actual built file path
 * In development: Uses Vite's pluginContainer to load raw HTML, then transformIndexHtml to process it
 *
 * The Vite plugin is the source of truth for the HTML structure.
 */
export declare function getWidgetHTML(widgetName: string, viteHandle: ViteHandle): Promise<{
    content: string;
    source: WidgetInfo["source"];
}>;
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
export declare function generateWidgetEntrypointHTML(widgetName: string): string;
type ChatGPTWidgetPlugin = VitePlugin & {
    pluginOptions: ChatGPTWidgetPluginOptions;
};
export declare function chatGPTWidgetPlugin(options?: ChatGPTWidgetPluginOptions): ChatGPTWidgetPlugin;
export {};
