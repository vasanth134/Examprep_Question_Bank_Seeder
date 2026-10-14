export type QuestionType =
  | "mcq"
  | "multi_correct"
  | "numerical"
  | "assertion_reason"
  | "subjective";

export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface BoundingBoxCoordinates {
  ymin: number; // 0 to 1000
  xmin: number; // 0 to 1000
  ymax: number; // 0 to 1000
  xmax: number; // 0 to 1000
}

export interface OptionCandidate {
  id?: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
  imageUrl?: string;
  imageBox?: BoundingBoxCoordinates;
  pageNumber?: number;
}

export interface QuestionCandidate {
  id?: string;
  tempId: string;
  type: QuestionType;
  text: string;
  topic?: string;
  difficulty: QuestionDifficulty;
  marks: number;
  negativeMarks: number;
  explanation?: string;
  explanationImageUrl?: string;
  explanationImageBox?: BoundingBoxCoordinates;
  explanationPageNumber?: number;
  correctAnswer?: string;
  options: OptionCandidate[];
  imageUrl?: string;
  imageBox?: BoundingBoxCoordinates;
  pageNumber?: number;
  isValid?: boolean;
  validationErrors?: string[];
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface ClassItem {
  id: string;
  name: string;
}

export interface SubjectItem {
  id: string;
  name: string;
}

export interface ChapterItem {
  id: string;
  subjectId: string;
  name: string;
  orderIndex: number;
}

export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface TaxonomyData {
  classes: ClassItem[];
  subjects: SubjectItem[];
  chapters: ChapterItem[];
  users: UserItem[];
}

export interface SeedPayload {
  tenantId: string;
  classId?: string | null;
  subjectId: string;
  chapterId?: string | null;
  createdBy: string;
  questions: QuestionCandidate[];
}

export interface SeedResult {
  success: boolean;
  insertedCount: number;
  questionIds: string[];
  message: string;
}
