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

### 3. Serve Widgets in Your Application

#### Development Mode (with Vite Dev Server)

```typescript
import { getWidgetHTML } from "vite-plugin-chatgpt-widgets";

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
const widgets = await getWidgets("web/chatgpt-widgets", { manifestPath: "dist/.vite/manifest.json" });

for (const widget of widgets) {
  // ...
}
```

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

### `getWidgets(widgetsDir, viteHandle)`

Get the HTML content for a widget.

**Parameters:**

- `widgetsDir` (string): The path to the directory on disk with your widget components
- `viteOrOptions` (ViteDevServer | ProductionViteBuild): A reference to a Vite context we can use for getting widget content.
  - In dev: Pass the Vite dev server instance
  - In prod: Pass a `{ manifestPath: "path/to/.vite/manifest.json" }` where your production build has happened

## Architecture

The plugin and helpers run in different contexts:

- **Plugin context**: Runs during Vite build, creates virtual modules and adds them as entrypoints
- **Application context**: The helper functions run in your app (e.g., MCP server) to serve the widgets

They communicate via:

- **Dev mode**: Direct access to Vite's dev server plugin container
- **Production**: Vite's `manifest.json` file maps virtual module IDs to built file paths
