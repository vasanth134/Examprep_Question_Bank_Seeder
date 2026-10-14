import path from "node:path";
import dotenv from "dotenv";

// Environment is loaded exclusively by src/server/config/env.ts

import { getControlPool, resolveTenant } from "../../../../examprep-backend/src/db/tenant-registry";
import { runWithTenant } from "../../../../examprep-backend/src/db/tenant-context";
import { db } from "../../../../examprep-backend/src/db/index";
import {
  questions,
  questionOptions,
  subjects,
  chapters,
  classes,
  users,
} from "../../../../examprep-backend/src/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import type {
  TenantInfo,
  TaxonomyData,
  SeedPayload,
  SeedResult,
  QuestionCandidate,
} from "../shared/types";

export class TenantSeederService {
  /**
   * Fetch active tenants registered in the control plane database
   */
  async getTenants(): Promise<TenantInfo[]> {
    try {
      const pool = getControlPool();
      const { rows } = await pool.query<{
        id: string;
        name: string;
        slug: string;
        status: string;
      }>(
        `SELECT id, name, slug, status
         FROM control.tenants
         WHERE status = 'active'
         ORDER BY name ASC`
      );
      return rows;
    } catch (err: any) {
      console.warn(
        "[TenantSeeder] Failed to query control plane tenants, checking fallback:",
        err.message
      );
      // Fallback if running single-tenant local DB
      if (process.env.DEMO_TENANT) {
        return [
          {
            id: process.env.DEMO_TENANT,
            name: "Default Demo Tenant",
            slug: "demoschool",
            status: "active",
          },
        ];
      }
      throw new Error(`Unable to load tenants: ${err.message}`);
    }
  }

  /**
   * Fetch taxonomy (classes, subjects, chapters, author users) for a specific tenant
   */
  async getTaxonomy(tenantId: string): Promise<TaxonomyData> {
    const connection = await resolveTenant(tenantId);
    if (!connection) {
      throw new Error(`Tenant '${tenantId}' not found or inactive`);
    }

    return await runWithTenant(
      { tenantId, databaseName: connection.databaseName },
      async () => {
        const [classesList, subjectsList, chaptersList, usersList] =
          await Promise.all([
            db
              .select({
                id: classes.id,
                name: classes.name,
              })
              .from(classes)
              .orderBy(asc(classes.name)),

            db
              .select({
                id: subjects.id,
                name: subjects.name,
              })
              .from(subjects)
              .orderBy(asc(subjects.name)),

            db
              .select({
                id: chapters.id,
                subjectId: chapters.subjectId,
                name: chapters.name,
                orderIndex: chapters.orderIndex,
              })
              .from(chapters)
              .orderBy(asc(chapters.orderIndex), asc(chapters.name)),

            db
              .select({
                id: users.id,
                name: users.name,
                email: users.email,
                role: users.role,
              })
              .from(users)
              .where(inArray(users.role, ["ADMIN", "TEACHER", "OWNER"]))
              .orderBy(asc(users.name)),
          ]);

        return {
          classes: classesList,
          subjects: subjectsList,
          chapters: chaptersList,
          users: usersList,
        };
      }
    );
  }

  /**
   * Seed verified questions and their options into the tenant's Question Bank inside a transaction
   */
  async seedQuestions(payload: SeedPayload): Promise<SeedResult> {
    const { tenantId, subjectId, chapterId, classId, createdBy, questions: candidates } =
      payload;

    if (!candidates || candidates.length === 0) {
      throw new Error("No questions provided to seed");
    }

    if (!subjectId) {
      throw new Error("Target subject is required for seeding questions");
    }

    if (!createdBy) {
      throw new Error("A creator/author user ID is required");
    }

    const connection = await resolveTenant(tenantId);
    if (!connection) {
      throw new Error(`Tenant '${tenantId}' not found or inactive`);
    }

    return await runWithTenant(
      { tenantId, databaseName: connection.databaseName },
      async () => {
        return await db.transaction(async (tx) => {
          const insertedQuestionIds: string[] = [];

          for (let i = 0; i < candidates.length; i++) {
            const q = candidates[i];

            // 1. Insert question record
            const [insertedQuestion] = await tx
              .insert(questions)
              .values({
                type: q.type,
                text: q.text.trim(),
                imageUrl: q.imageUrl || null,
                subjectId,
                chapterId: chapterId || null,
                classId: classId || null,
                topic: q.topic?.trim() || null,
                difficulty: q.difficulty || "medium",
                marks: Number(q.marks) || 4,
                negativeMarks: Number(q.negativeMarks) || 0,
                explanation: q.explanation?.trim() || null,
                correctAnswer: q.correctAnswer?.trim() || null,
                approvalStatus: "approved", // Seeded questions are approved and immediately available
                createdBy,
                orderIndex: i,
              })
              .returning({ id: questions.id });

            if (!insertedQuestion) {
              throw new Error(`Failed to insert question at index ${i}`);
            }

            insertedQuestionIds.push(insertedQuestion.id);

            // 2. Insert options for MCQ / Multi-correct / Assertion-Reason questions
            if (
              ["mcq", "multi_correct", "assertion_reason"].includes(q.type) &&
              q.options &&
              q.options.length > 0
            ) {
              const optionValues = q.options.map((opt, optIndex) => ({
                questionId: insertedQuestion.id,
                text: opt.text.trim(),
                imageUrl: opt.imageUrl || null,
                isCorrect: Boolean(opt.isCorrect),
                orderIndex: typeof opt.orderIndex === "number" ? opt.orderIndex : optIndex,
              }));

              await tx.insert(questionOptions).values(optionValues);
            }
          }

          return {
            success: true,
            insertedCount: insertedQuestionIds.length,
            questionIds: insertedQuestionIds,
            message: `Successfully seeded ${insertedQuestionIds.length} questions into tenant database`,
          };
        });
      }
    );
  }
}

export const tenantSeederService = new TenantSeederService();
