import { z } from "zod";

export const QuestionTypeSchema = z.enum([
  "mcq",
  "multi_correct",
  "numerical",
  "assertion_reason",
  "subjective",
]);

export const QuestionDifficultySchema = z.enum(["easy", "medium", "hard"]);

export const OptionCandidateSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  isCorrect: z.boolean(),
  orderIndex: z.number().int().default(0),
  imageUrl: z.string().optional(),
  pageNumber: z.number().int().optional(),
});

export const QuestionCandidateSchema = z.object({
  id: z.string().optional(),
  tempId: z.string(),
  type: QuestionTypeSchema,
  text: z.string().min(1, "Question text cannot be blank"),
  topic: z.string().optional(),
  difficulty: QuestionDifficultySchema.default("medium"),
  marks: z.number().default(4),
  negativeMarks: z.number().default(0),
  explanation: z.string().optional(),
  explanationImageUrl: z.string().optional(),
  explanationPageNumber: z.number().int().optional(),
  correctAnswer: z.string().optional(),
  options: z.array(OptionCandidateSchema).default([]),
  imageUrl: z.string().optional(),
  pageNumber: z.number().int().optional(),
});

export const SeedPayloadSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  classId: z.string().nullable().optional(),
  subjectId: z.string().min(1, "Subject ID is required"),
  chapterId: z.string().nullable().optional(),
  createdBy: z.string().min(1, "Created by user ID is required"),
  questions: z.array(QuestionCandidateSchema).min(1, "At least one question is required for seeding"),
});

export type SeedPayloadValidated = z.infer<typeof SeedPayloadSchema>;
