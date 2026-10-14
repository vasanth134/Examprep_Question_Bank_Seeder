import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load exclusively from this app's own .env file
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4500),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  CONTROL_DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables in .env:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
