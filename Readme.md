# vite-plugin-chatgpt-widgets

A vite plugin for automatically bundling ChatGPT widget outputs within a vite project.

## Installation

```bash
npm install vite-plugin-chatgpt-widgets
# or
pnpm add vite-plugin-chatgpt-widgets
```

## Usage

### 1. Configure Vite

Add the plugin to your `vite.config.ts` and enable the build manifest:

```typescript
import { defineConfig } from "vite";
import { chatGPTWidgetPlugin } from "vite-plugin-chatgpt-widgets";

export default defineConfig({
  plugins: [
    chatGPTWidgetPlugin({
      widgetsDir: "web/chatgpt-widgets", // default: 'web/chatgpt-widgets'
      baseUrl: "https://example.com", // required because the chatgpt iframe is sandboxed and absolute URL links are required
    }),
  ],
  build: {
    manifest: true, // Required for production mode
  },
});
```

### 2. Create Widget Components

Create React components in your widgets directory:

```tsx
// web/chatgpt-widgets/MyWidget.tsx
export default function MyWidget() {
  return <div>Hello from ChatGPT Widget!</div>;
}
```

#### Optional: Root Layout Component

You can optionally create a root layout component that will wrap all widgets. If a file named `root.tsx` (or `root.ts`, `root.jsx`, `root.js`) exists in the widgets directory, it will automatically wrap all other widget components:

```tsx
// web/chatgpt-widgets/root.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="root-layout">
      <header>
        <h1>Common Header</h1>
      </header>
      <main>{children}</main>
      <footer>
        <p>Common Footer</p>
      </footer>
    </div>
  );
}
```

The root layout component:

- Must accept a `children` prop
- Will automatically wrap every widget component
- Is not exposed as a widget itself
- Is optional - if not present, widgets render without a wrapper

### 3. Serve Widgets in Your Application

#### Development Mode (with Vite Dev Server)

```typescript
import { getWidgets } from "vite-plugin-chatgpt-widgets";

// Pass the Vite dev server instance from wherever you can get it
const widgets = await getWidgets("web/chatgpt-widgets", viteDevServer);

// Register each widget on an MCP server as a resource for exposure to ChatGPT
for (const widget of widgets) {
  const resourceName = `widget-${widget.name.toLowerCase()}`;
  const resourceUri = `ui://widget/${widget.name}.html`;

  mcpServer.registerResource(
    resourceName,
    resourceUri,
    {
      title: widget.name,
      description: `ChatGPT widget for ${widget.name}`,
    },
    async () => {
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: "text/html+skybridge",
            text: widget.content,
          },
        ],
      };
    }
  );
}
```

#### Production Mode (reading from build manifest)

```typescript
import { getWidgetHTML } from "vite-plugin-chatgpt-widgets";

// Pass production options (or omit for defaults)
const widgets = await getWidgets("web/chatgpt-widgets", {
  manifestPath: "dist/.vite/manifest.json",
  baseUrl: "https://example.com", // required for sandbox-safe iframe links (see below)
});

for (const widget of widgets) {
  // ...
}
```

### Sandboxed iFrames & Fully Qualified URLs

When serving widgets in sandboxed iframes like ChatGPT's UI, asset links must be fully qualified URLs with protocol and domain. The plugin automatically handles this if:

1. **Vite's `base` config is an absolute URL**: If you've already configured Vite with `base: "https://example.com/"`, the plugin will use it automatically.

2. **Provide `baseUrl` option**: If Vite's `base` is relative (or not set), provide the `baseUrl` option to the plugin or the production build configuration:

```typescript
// Option 1: In Vite config (affects both dev and build)
export default defineConfig({
  plugins: [
    chatGPTWidgetPlugin({
      baseUrl: "https://example.com",
    }),
  ],
});

// Option 2: When calling getWidgets in production
const widgets = await getWidgets("web/chatgpt-widgets", {
  manifestPath: "dist/.vite/manifest.json",
  baseUrl: "https://example.com",
});
```

The plugin will transform relative asset URLs like `/assets/widget-abc123.js` to `https://example.com/assets/widget-abc123.js`. Note that:

- Only the entry `<script>` and `<link>` tags in the HTML are transformed
- ES module imports within JavaScript files remain relative (which is correct - the browser resolves them relative to the parent module's URL)

## How It Works

The plugin creates virtual modules for each widget component:

1. **Virtual HTML file**: `virtual:chatgpt-widget-{name}.html` - A standalone HTML page
2. **Virtual JS entrypoint**: `virtual:chatgpt-widget-{name}.js` - Imports and renders your React component

During build, these are added as entrypoints and bundled into separate HTML files with hashed asset names. The `getWidgetHTML` helper:

- **In dev mode**: Uses Vite's plugin container to load and transform the HTML in real-time
- **In production**: Reads the built HTML files using Vite's manifest.json to locate them

## API

### `chatGPTWidgetPlugin(options?)`

The Vite plugin.

**Options:**

- `widgetsDir` (string, optional): Directory containing widget components. Default: `'web/chatgpt-widgets'`
- `baseUrl` (string, optional): Base URL for widget assets. Required if Vite's `base` config is not an absolute URL and you need fully qualified URLs for sandboxed iframes. Should include protocol and domain (e.g., `"https://example.com"`). Note: Does not require trailing slash.

### `getWidgets(widgetsDir, viteHandle)`

Get the HTML content for a widget.

**Parameters:**

- `widgetsDir` (string): The path to the directory on disk with your widget components
- `viteHandle` (ViteDevServer | ProductionViteBuild): A reference to a Vite context we can use for getting widget content.
  - In dev: Pass the Vite dev server instance
  - In prod: Pass an object with:
    - `manifestPath` (string): Path to the Vite manifest.json file (e.g., `"dist/.vite/manifest.json"`)
    - `baseUrl` (string, optional): Base URL for assets if Vite's `base` is not absolute

## Architecture

The plugin and helpers run in different contexts:

- **Plugin context**: Runs during Vite build, creates virtual modules and adds them as entrypoints
- **Application context**: The helper functions run in your app (e.g., MCP server) to serve the widgets

They communicate via:

- **Dev mode**: Direct access to Vite's dev server plugin container
- **Production**: Vite's `manifest.json` file maps virtual module IDs to built file paths
