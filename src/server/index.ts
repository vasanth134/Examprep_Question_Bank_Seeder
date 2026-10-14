import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { apiRouter } from "./routes/api.routes";
import { errorHandler } from "./middlewares/error.middleware";

export function createApp() {
  const app = express();

  // Core Middlewares
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Serve static assets and uploads
  const uploadsDir = path.resolve(process.cwd(), "public/uploads");
  app.use("/uploads", express.static(uploadsDir));

  // Mount API Router
  app.use("/api", apiRouter);

  // Serve frontend client in production (or fallback to public)
  const clientDist = path.resolve(__dirname, "../../dist/client");
  const fallbackPublic = path.resolve(process.cwd(), "public");

  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    const indexPath = path.resolve(clientDist, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.sendFile(path.resolve(fallbackPublic, "index.html"));
      }
    });
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export function startServer() {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Question Bank Seeder Backend Running`);
    console.log(`📍 URL:  http://localhost:${env.PORT}`);
    console.log(`🌐 Mode: ${env.NODE_ENV}`);
    console.log(`======================================================\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nReceived termination signal. Shutting down gracefully...");
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

if (require.main === module) {
  startServer();
}
