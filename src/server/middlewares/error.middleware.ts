import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export class AppError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = new AppError("Validation failed", 400, result.error.format());
      return next(err);
    }
    req.body = result.data;
    next();
  };
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  console.error(`[Error] ${statusCode} - ${message}`, err.details || err.stack || err);

  res.status(statusCode).json({
    success: false,
    error: message,
    details: err.details || undefined,
  });
}
