import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

// Load backend .env if available
const backendEnvPath = path.resolve(
  __dirname,
  "../../../../examprep-backend/config/.env"
);
dotenv.config({ path: backendEnvPath });

export interface UploadResult {
  url: string;
  key?: string;
  storage: "s3" | "local";
}

export class AssetStorageService {
  private localUploadsDir: string;

  constructor() {
    this.localUploadsDir = path.resolve(__dirname, "../../public/uploads");
  }

  /**
   * Ensure local uploads directory exists
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.localUploadsDir, { recursive: true });
    } catch (err: any) {
      console.error("[AssetStorageService] Failed to create local uploads directory:", err);
    }
  }

  /**
   * Save an image buffer either to S3 (if configured) or local static storage (as fallback)
   */
  async saveImage(
    buffer: Buffer,
    options: {
      tenantId?: string;
      filenamePrefix?: string;
      mimeType?: string;
      extension?: string;
    } = {}
  ): Promise<UploadResult> {
    const ext = options.extension || "webp";
    const mime = options.mimeType || "image/webp";
    const hash = crypto.randomBytes(8).toString("hex");
    const prefix = options.filenamePrefix ? `${options.filenamePrefix}_` : "diagram_";
    const filename = `${prefix}${Date.now()}_${hash}.${ext}`;
    const tenantFolder = options.tenantId || "default";

    // 1. Try S3 upload if AWS S3 environment variables are configured
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION || process.env.AWS_REGION;
    const hasAwsCreds = Boolean(
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    );

    if (s3Bucket && s3Region && hasAwsCreds) {
      try {
        const { putObjectBuffer, buildPublicObjectUrl } = await import(
          "../../../../examprep-backend/src/lib/s3-presign"
        );
        const s3Key = `tenants/${tenantFolder}/questions/${filename}`;

        await putObjectBuffer({
          bucket: s3Bucket,
          region: s3Region,
          key: s3Key,
          contentType: mime,
          body: buffer,
        });

        const publicUrl = buildPublicObjectUrl(
          s3Bucket,
          s3Region,
          s3Key,
          process.env.S3_PUBLIC_BASE_URL || null
        );

        return {
          url: publicUrl,
          key: s3Key,
          storage: "s3",
        };
      } catch (s3Error: any) {
        console.warn(
          `[AssetStorageService] S3 upload failed (${s3Error.message}), falling back to local static storage.`
        );
      }
    }

    // 2. Local static storage fallback
    await this.init();
    const tenantDir = path.join(this.localUploadsDir, tenantFolder);
    await fs.mkdir(tenantDir, { recursive: true });

    const localFilePath = path.join(tenantDir, filename);
    await fs.writeFile(localFilePath, buffer);

    const publicUrl = `/uploads/${tenantFolder}/${filename}`;
    return {
      url: publicUrl,
      storage: "local",
    };
  }
}

export const assetStorageService = new AssetStorageService();
