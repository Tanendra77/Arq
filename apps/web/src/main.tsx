import { mountApp } from "@arq/core";
import "@arq/core/styles.css";
import { createWebPlatform } from "./web-platform";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
const app = mountApp(root, createWebPlatform());
// Exposed for Playwright and manual debugging only.
(window as unknown as { __arq: unknown }).__arq = app;
