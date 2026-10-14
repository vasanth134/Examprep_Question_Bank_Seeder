import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { tenantSeederService } from "../../services/tenant-seeder";
import { geminiExtractorService } from "../../services/gemini-extractor";
import { assetStorageService } from "../../services/asset-storage";
import { env } from "../config/env";
import { validateBody } from "../middlewares/error.middleware";
import { SeedPayloadSchema } from "../../shared/schemas";
import { SeedPayload } from "../../shared/types";

export const apiRouter = Router();

// Configure multer for PDF uploads (in-memory buffer)
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

/**
 * Health check
 */
apiRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ExamPrep Standalone Question Seeder API",
    port: env.PORT,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Configuration info (check if backend has GEMINI_API_KEY set)
 */
apiRouter.get("/config", (_req: Request, res: Response) => {
  res.json({
    hasGeminiEnvKey: Boolean(env.GEMINI_API_KEY),
    defaultModel: env.GEMINI_MODEL,
  });
});

/**
 * List all active tenants
 */
apiRouter.get("/tenants", async (_req: Request, res: Response, next: NextFunction) => {
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
apiRouter.get("/taxonomy", async (req: Request, res: Response, next: NextFunction) => {
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
 * Upload PDF and extract questions using Gemini Multimodal Vision API
 */
apiRouter.post(
  "/extract",
  uploadPdf.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "PDF file is required in 'file' field" });
        return;
      }

      const apiKey = (req.body.apiKey as string) || env.GEMINI_API_KEY;
      const model = (req.body.model as string) || env.GEMINI_MODEL;
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
apiRouter.post(
  "/upload-image",
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
 * Parse raw JSON or text questions directly
 */
apiRouter.post("/extract-text", async (req: Request, res: Response, next: NextFunction) => {
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
apiRouter.post(
  "/seed",
  validateBody(SeedPayloadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload: SeedPayload = req.body;
      const result = await tenantSeederService.seedQuestions(payload);
      res.json(result);
    } catch (err: any) {
      next(err);
    }
  }
);
