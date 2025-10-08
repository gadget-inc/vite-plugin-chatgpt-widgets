import * as path from "path";

export const FIXTURE_DIR = path.resolve(__dirname, "fixtures/test-project");
export const WIDGETS_DIR = path.join(FIXTURE_DIR, "web/chatgpt-widgets");
export const BUILD_DIR = path.join(FIXTURE_DIR, "dist");
export const MANIFEST_PATH = path.join(BUILD_DIR, ".vite/manifest.json");
export const FIXTURE_WITH_ROOT_DIR = path.resolve(__dirname, "fixtures/test-project-with-root");
export const WIDGETS_WITH_ROOT_DIR = path.join(FIXTURE_WITH_ROOT_DIR, "web/chatgpt-widgets");
export const BUILD_WITH_ROOT_DIR = path.join(FIXTURE_WITH_ROOT_DIR, "dist");
export const MANIFEST_WITH_ROOT_PATH = path.join(BUILD_WITH_ROOT_DIR, ".vite/manifest.json");
export const FIXTURE_REACT_ROUTER_DIR = path.resolve(__dirname, "fixtures/test-project-react-router");
export const WIDGETS_REACT_ROUTER_DIR = path.join(FIXTURE_REACT_ROUTER_DIR, "web/chatgpt-widgets");
export const BUILD_REACT_ROUTER_DIR = path.join(FIXTURE_REACT_ROUTER_DIR, "build/client");
export const MANIFEST_REACT_ROUTER_PATH = path.join(BUILD_REACT_ROUTER_DIR, ".vite/manifest.json");
