import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { decodeIcsPayload, icsFileName } from "./src/lib/icsPayload";

function icsDevApi() {
  const handle: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/ics")) {
      next();
      return;
    }

    const parsed = new URL(url, "http://127.0.0.1");
    const ics = decodeIcsPayload(parsed.searchParams.get("d") ?? "");
    if (!ics) {
      res.statusCode = 400;
      res.end("Invalid calendar");
      return;
    }

    const file = icsFileName(parsed.searchParams.get("file") ?? "padel.ics");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${file}"`);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.end(ics);
  };

  return {
    name: "ics-dev-api",
    configureServer(server: { middlewares: { use: (fn: Connect.NextHandleFunction) => void } }) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server: {
      middlewares: { use: (fn: Connect.NextHandleFunction) => void };
    }) {
      server.middlewares.use(handle);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), icsDevApi()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
});
