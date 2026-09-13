import { mountApp } from "@arq/core";
import "@arq/core/styles.css";
import { createDesktopPlatform } from "./desktop-platform";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
mountApp(root, createDesktopPlatform());
