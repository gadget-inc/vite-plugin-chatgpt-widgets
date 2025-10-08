## Development

This repository uses a [pnpm workspace](https://pnpm.io/workspaces) to manage the plugin and test fixtures together.

### Setup

```bash
# Install all dependencies (root + all test fixtures)
pnpm install

# Run tests
pnpm test

# Build the plugin
pnpm build
```

### Workspace Structure

The workspace includes:

- **Root package** (`vite-plugin-chatgpt-widgets`) - The plugin itself
- **Test fixtures** in `spec/fixtures/`:
  - `test-project` - Basic React widgets
  - `test-project-with-root` - Widgets with a root layout component
  - `test-project-react-router` - Widgets integrated with React Router v7 in framework mode

When you run `pnpm install` at the root, it automatically installs dependencies for all fixture projects. You can also run commands for specific fixtures:

```bash
# Build a specific fixture
pnpm --filter test-project-react-router build

# Run commands in a specific fixture
pnpm --filter test-project dev
```
