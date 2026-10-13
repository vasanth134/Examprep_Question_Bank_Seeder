import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import multer from "multer";
import { tenantSeederService } from "./services/tenant-seeder";
import { geminiExtractorService } from "./services/gemini-extractor";
import { assetStorageService } from "./services/asset-storage";
import type { SeedPayload } from "./types";

const app = express();
const port = Number(process.env.SEEDER_PORT) || 4500;

// Initialize asset storage directory
assetStorageService.init().catch(console.error);

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configure multer for PDF file uploads (in-memory buffer)
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are supported for extraction"));
    }
  },
});

// Configure multer for individual image uploads/replacements
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Serve frontend public directory
const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));

// ── API Routes ───────────────────────────────────────────────────────

/**
 * Health check
 */
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ExamPrep Standalone Question Seeder", port });
});

/**
 * Configuration info (check if backend has GEMINI_API_KEY set)
 */
app.get("/api/config", (_req: Request, res: Response) => {
  res.json({
    hasGeminiEnvKey: Boolean(process.env.GEMINI_API_KEY),
    defaultModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  });
});

/**
 * List all active tenants
 */
app.get("/api/tenants", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await tenantSeederService.getTenants();
    res.json({ success: true, tenants });
  } catch (err: any) {
    next(err);
  }
});

/**
 * Fetch taxonomy (subjects, chapters, classes, teachers) for a tenant
 */
app.get("/api/taxonomy", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      res.status(400).json({ success: false, error: "tenantId query parameter is required" });
      return;
    }

    const taxonomy = await tenantSeederService.getTaxonomy(tenantId);
    res.json({ success: true, data: taxonomy });
  } catch (err: any) {
    next(err);
  }
});

/**
 * Upload PDF and extract questions using Gemini Multimodal Vision API with diagram bounding-box detection & cropping
 */
app.post(
  "/api/extract",
  uploadPdf.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "PDF file is required in 'file' field" });
        return;
      }

      const apiKey = (req.body.apiKey as string) || process.env.GEMINI_API_KEY;
      const model = (req.body.model as string) || process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const defaultMarks = Number(req.body.defaultMarks) || 4;
      const defaultNegativeMarks = Number(req.body.defaultNegativeMarks) || 0;
      const tenantId = (req.body.tenantId as string) || "default";

      const questions = await geminiExtractorService.extractQuestionsFromPdf(
        req.file.buffer,
        {
          apiKey,
          model,
          defaultMarks,
          defaultNegativeMarks,
          tenantId,
        }
      );

      res.json({
        success: true,
        filename: req.file.originalname,
        count: questions.length,
        questions,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * Upload or replace a single question / option diagram image
 */
app.post(
  "/api/upload-image",
  uploadImage.single("image"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "Image file is required in 'image' field" });
        return;
      }

      const tenantId = (req.body.tenantId as string) || "default";
      const prefix = (req.body.prefix as string) || "manual";

      const result = await assetStorageService.saveImage(req.file.buffer, {
        tenantId,
        filenamePrefix: prefix,
        mimeType: req.file.mimetype,
        extension: req.file.mimetype.split("/")[1] || "webp",
      });

      res.json({
        success: true,
        url: result.url,
        storage: result.storage,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * Parse raw JSON or text questions directly (for manual paste/fallback)
 */
app.post("/api/extract-text", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rawText, defaultMarks, defaultNegativeMarks } = req.body;
    if (!rawText || typeof rawText !== "string") {
      res.status(400).json({ success: false, error: "rawText string is required" });
      return;
    }

    const questions = geminiExtractorService.parseAndValidateQuestions(rawText, {
      defaultMarks: Number(defaultMarks) || 4,
      defaultNegativeMarks: Number(defaultNegativeMarks) || 0,
    });

    res.json({
      success: true,
      count: questions.length,
      questions,
    });
  } catch (err: any) {
    next(err);
  }
});

/**
 * Seed verified questions into the tenant's database
 */
app.post("/api/seed", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload: SeedPayload = req.body;

    if (!payload.tenantId) {
      res.status(400).json({ success: false, error: "tenantId is required" });
      return;
    }
    if (!payload.subjectId) {
      res.status(400).json({ success: false, error: "subjectId is required" });
      return;
    }
    if (!payload.createdBy) {
      res.status(400).json({ success: false, error: "createdBy user ID is required" });
      return;
    }
    if (!payload.questions || !Array.isArray(payload.questions) || payload.questions.length === 0) {
      res.status(400).json({ success: false, error: "At least one question is required to seed" });
      return;
    }

    const result = await tenantSeederService.seedQuestions(payload);
    res.json(result);
  } catch (err: any) {
    next(err);
  }
});

// Fallback to index.html for single-page application routing
app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Seeder API Error]:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error occurred",
  });
});

app.listen(port, () => {
  console.log("\n=========================================================");
  console.log(` ExamPrep Developer Question Seeder Studio`);
  console.log(` Running locally at: http://localhost:${port}`);
  console.log("=========================================================\n");
});
