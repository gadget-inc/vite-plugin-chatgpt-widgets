# AGENTS.md - Technical Overview for AI Coding Agents

## Purpose

This package provides a **Vite plugin** and **runtime helpers** for building and serving React widget components that can be embedded in ChatGPT's UI through the ChatGPT Apps SDK, which uses MCP (Model Context Protocol) resources. The widgets run in sandboxed iframes within ChatGPT's interface.

## Core Problem Being Solved

ChatGPT needs to display custom UI widgets from external applications, but faces these constraints:

1. **Sandboxed iframes**: Widgets load in iframes with restricted permissions
2. **Cross-origin assets**: The iframe domain differs from the asset host domain
3. **Dynamic vs static content**: Dev mode needs live reloading, production needs built artifacts
4. **Multiple entrypoints**: Each widget is a separate entrypoint that must be built independently

This plugin solves these problems by:

- Automatically creating virtual HTML entrypoints for each widget component
- Transforming all asset URLs to be fully qualified absolute URLs
- Providing helpers that work seamlessly in both dev and production modes
- Managing the build configuration to bundle widgets as separate chunks

## Architecture Overview

### Two Main Components

**1. Vite Plugin (`chatGPTWidgetPlugin`)**

- Scans a directory for React component files (`.tsx`, `.ts`, `.jsx`, `.js`)
- Creates virtual modules for each widget:
  - `virtual:chatgpt-widget-{name}.html` - HTML entrypoint
  - `virtual:chatgpt-widget-{name}.js` - JavaScript entrypoint that renders the React component
- Adds these as Rollup inputs during build
- Generates standalone HTML files with hashed assets

**2. Runtime Helpers (`getWidgets`, `getWidgetHTML`)**

- Retrieve widget HTML content for serving via MCP
- In **development**: Uses Vite's `pluginContainer` and `transformIndexHtml` to generate HTML on-the-fly
- In **production**: Reads pre-built HTML files from disk using Vite's manifest.json
- Transforms URLs to be fully qualified (absolute with protocol and domain)

### Directory Structure

```
your-project/
├── web/chatgpt-widgets/          # Widget components directory (configurable)
│   ├── root.tsx                  # Optional: Root layout wrapper for all widgets
│   ├── MyWidget.tsx              # Individual widget components
│   └── AnotherWidget.tsx
├── dist/                         # Production build output
│   ├── .vite/
│   │   └── manifest.json         # Vite manifest (required for production)
│   ├── virtual:chatgpt-widget-MyWidget.html      # Built HTML files
│   └── assets/
│       └── chatgpt-widget-MyWidget-{hash}.js     # Bundled JS with content hash
└── vite.config.ts                # Vite configuration
```

## Key Concepts

### Virtual Modules

The plugin creates **virtual modules** - files that don't exist on disk but are resolved by the plugin:

1. **Virtual HTML files** (`virtual:chatgpt-widget-{name}.html`):

   - Resolved and loaded by the plugin's `resolveId` and `load` hooks
   - Generate a minimal HTML document with a root div and script tag
   - Example: `virtual:chatgpt-widget-Hello.html`

2. **Virtual JS files** (`\0virtual:chatgpt-widget-{name}.js`):
   - Prefixed with `\0` to mark as virtual (Rollup convention)
   - Import the actual widget component and render it with React
   - Handle optional root layout wrapping
   - Example: `\0virtual:chatgpt-widget-Hello.js`

### Root Layout Pattern

If a file named `root.tsx` (or `.ts`, `.jsx`, `.js`) exists in the widgets directory:

- It's **not** treated as a widget itself
- It's automatically used to wrap **all** other widgets
- Must accept a `children` prop
- Use case: Common providers, styles, headers/footers

### Absolute URL Requirement

**Critical constraint**: ChatGPT's sandboxed iframes require all asset URLs to be absolute.

The plugin enforces this by:

1. Requiring either `vite.config.base` or `plugin.baseUrl` to be an absolute URL
2. Transforming all `/path/to/asset.js` URLs to `https://example.com/path/to/asset.js`
3. Throwing clear errors if absolute URLs are not configured

URL transformation happens in `transformHtmlWithAbsoluteUrls()`:

- Rewrites `<script src="/...">`
- Rewrites `<link href="/...">`
- Preserves already-absolute URLs
- Normalizes base URL to ensure trailing slash

### Development vs Production Modes

**Development Mode** (`getWidgets` with `{ devServer: ViteDevServer }`):

1. Calls `vite.pluginContainer.resolveId()` to resolve virtual module
2. Calls `vite.pluginContainer.load()` to get raw HTML from plugin
3. Calls `vite.transformIndexHtml()` to process through Vite's HTML pipeline
4. Rewrites `src="virtual:..."` to `src="/@id/virtual:..."` (dev server convention)
5. Applies `transformHtmlWithAbsoluteUrls()` to make all URLs absolute

**Production Mode** (`getWidgets` with `{ manifestPath: "..." }`):

1. Reads Vite's `manifest.json` to find built HTML file paths
2. Reads the pre-built HTML file from disk
3. No transformation needed - URLs were made absolute during build

### Typical MCP Server Integration

```typescript
// In your MCP server setup
import { getWidgets } from "vite-plugin-chatgpt-widgets";

// Determine mode and get widgets
const widgets =
  process.env.NODE_ENV === "production"
    ? await getWidgets("web/chatgpt-widgets", { manifestPath: "dist/.vite/manifest.json" })
    : await getWidgets("web/chatgpt-widgets", { devServer: viteDevServerInstance });

// Register each as an MCP resource
for (const widget of widgets) {
  mcpServer.registerResource(
    `widget-${widget.name}`,
    `ui://widget/${widget.name}.html`,
    {
      /* metadata */
    },
    async () => ({
      contents: [
        {
          uri: `ui://widget/${widget.name}.html`,
          mimeType: "text/html+skybridge",
          text: widget.content,
        },
      ],
    })
  );
}
```

### Widget Component Pattern

```tsx
// web/chatgpt-widgets/DataDisplay.tsx
export default function DataDisplay() {
  // Access tool output from ChatGPT
  const data = window.openai?.tool_output;

  return <div>{/* Render your UI */}</div>;
}
```

### Root Layout Pattern

```tsx
// web/chatgpt-widgets/root.tsx
import { ThemeProvider } from "./theme";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="widget-container">{children}</div>
    </ThemeProvider>
  );
}
```

## Critical Requirements

### For Plugin to Work

1. **Absolute base URL**: Either `vite.config.base` or `plugin.baseUrl` must be an absolute URL with protocol
2. **Build manifest enabled**: In production, must have `build.manifest: true` in Vite config
3. **CORS configured**: Dev server needs CORS enabled for cross-origin iframe requests
4. **Widgets directory exists**: Directory must exist and contain component files

### For Widgets to Load in ChatGPT

1. **HTML is served via MCP**: Widget HTML must be exposed as MCP resources
2. **Assets are accessible**: The asset URLs must be reachable from user's browser
3. **MIME type correct**: Use `text/html+skybridge` for MCP resource content
4. **React is available**: Widget JS expects React and ReactDOM to be bundled

## Testing Considerations

The package includes test fixtures in `spec/fixtures/` that demonstrate:

- Basic widget setup (`test-project`)
- Widgets with root layout (`test-project-with-root`)
- React Router integration (`test-project-react-router`)
- Plain React with @vitejs/plugin-react (`test-project-plain-react`)

When testing:

1. Build the fixture project
2. Verify manifest.json contains widget entries
3. Verify HTML files exist in dist
4. Call `getWidgets()` and check returned HTML content
5. Verify all URLs in HTML are absolute

## Key Files and Their Roles

- **`src/index.ts`**: Single source file containing all plugin and helper logic
- **`spec/integration.spec.ts`**: Integration tests that build fixtures and verify output
- **`spec/chatgpt-widgets.spec.ts`**: Unit tests for plugin functionality
- **`spec/fixtures/*/vite.config.ts`**: Example Vite configurations using the plugin
- **`dist/cjs/` and `dist/esm/`**: Dual CJS/ESM builds for compatibility

## Plugin Architecture Philosophy

1. **Plugin is source of truth**: The Vite plugin generates the canonical HTML structure
2. **Helpers use plugin output**: Runtime helpers never recreate HTML - they retrieve it from the plugin
3. **Dev mode uses Vite's pipeline**: Leverage Vite's existing HTML transformation for consistency
4. **Production reads artifacts**: No dynamic generation in prod - just read what was built
5. **Fail fast on misconfiguration**: Throw clear errors at config time, not runtime

## Future Agent Guidance

When modifying this package:

1. **Maintain the dual mode design**: Any changes must work in both dev and production
2. **Keep URL transformation consistent**: Both modes must produce identical URL structures
3. **Test with actual ChatGPT integration**: The sandboxed iframe has unique constraints
4. **Preserve the virtual module pattern**: This is core to how widgets are bundled separately
5. **Document baseUrl requirements clearly**: This is the #1 confusion point for users
6. **Consider React Router and SPA frameworks**: Test fixtures show these integration patterns

When debugging issues:

1. Check which mode (dev/prod) is being used
2. Verify baseUrl/base configuration is absolute
3. Inspect the generated HTML to see actual URLs
4. Check if CORS is enabled for dev server
5. Verify manifest.json contains expected entries
6. Look at Vite's resolved config to see effective settings

## Edge Cases and Gotchas

1. **Null-byte prefix**: Virtual JS modules use `\0` prefix (Rollup convention for virtual modules)
2. **Dev server URL rewriting**: `virtual:` becomes `/@id/virtual:` in dev mode
3. **Root layout detection**: Case-insensitive check for `root.*` filename
4. **Extension priority**: Plugin checks `.tsx`, `.ts`, `.jsx`, `.js` in that order
5. **Empty widgets directory**: Plugin gracefully handles missing directory (returns empty array)
6. **Manifest path resolution**: Uses `process.cwd()` not Vite root for manifest resolution
7. **HTML transformation timing**: In dev, transformation happens after Vite's HTML pipeline
8. **BaseUrl trailing slash**: Plugin normalizes baseUrl to ensure trailing slash for URL construction
9. **React Router HMR runtime**: Only injected in dev mode when React Router plugin is detected
