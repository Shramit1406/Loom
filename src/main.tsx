import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
  document.body.classList.add("native-app-body");
}

createRoot(document.getElementById("root")!).render(<App />);
