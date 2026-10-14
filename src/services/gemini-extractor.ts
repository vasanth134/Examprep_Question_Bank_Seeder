import type { QuestionCandidate, QuestionType, BoundingBoxCoordinates } from "../shared/types";
import { pdfRasterizerService } from "./pdf-rasterizer";
import { assetStorageService } from "./asset-storage";

export interface ExtractionOptions {
  apiKey?: string;
  model?: string;
  defaultMarks?: number;
  defaultNegativeMarks?: number;
  tenantId?: string;
}

export class GeminiExtractorService {
  /**
   * Extract exam questions from a PDF buffer using Gemini Multimodal API with
   * 2D spatial bounding box detection for diagrams, graphs, circuits, and visual options,
   * followed by automated high-res image cropping and asset storage.
   */
  async extractQuestionsFromPdf(
    pdfBuffer: Buffer,
    options: ExtractionOptions = {}
  ): Promise<QuestionCandidate[]> {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Gemini API Key is required. Please set GEMINI_API_KEY in your environment or provide it in the UI settings."
      );
    }

    const rawModel = options.model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const model = rawModel.replace(/^models\//, "");
    const base64Data = pdfBuffer.toString("base64");

    const systemPrompt = `You are an expert academic curriculum parser and exam digitization specialist.
Your task is to analyze the provided examination or question bank document (PDF) and extract every single question into a structured JSON array.

Extraction Rules:
1. MATHEMATICAL & SCIENTIFIC FORMULAS:
   - Convert all inline mathematical, physics, and chemical equations into valid standard LaTeX.
   - Use '$...$' for inline math and '$$...$$' for block math equations.
   - Example: "$E = mc^2$", "$\\frac{d}{dx}[\\sin(x)] = \\cos(x)$", "$H_2SO_4$".
   - CRITICAL JSON ESCAPING: In the JSON output, all LaTeX backslashes MUST be escaped with a double backslash '\\\\' (e.g., write "\\\\frac{a}{b}", "\\\\sqrt{x}", "\\\\alpha", "\\\\theta", "\\\\times", "\\\\pm" — NOT unescaped "\\frac" or "\\sqrt"). This is essential so the JSON parses without bad escaped character errors.
   
2. DIAGRAMS, GRAPHS, FIGURES & SCHEMATICS (IMAGE EXTRACTION):
   - CRITICAL REQUIREMENT FOR DIAGRAMS & GRAPHS:
     You MUST detect all visual diagrams, graphs, circuits, coordinate grids, ray diagrams, geometry figures, and schematics appearing in:
     a) The question statement (e.g. given figures, coordinate grid templates, experimental apparatus).
     b) The answer key / solution / marking scheme (e.g. solved graphs with plotted lines and shaded regions, proof diagrams, ray diagrams in solutions).
   - For diagrams in the question statement (e.g., Figure 1.1 coordinate grid reference on Page 1):
     - Set "imageBox": Normalized bounding box coordinates [ymin, xmin, ymax, xmax] (integers 0 to 1000) of that diagram.
     - Set "pageNumber": The 1-based page number where that question diagram appears (e.g. page 1).
   - For diagrams in the answer key / solution (e.g., Figure 1.2 solved graph with shaded triangular region on Page 2):
     - Set "explanationImageBox": Normalized bounding box coordinates [ymin, xmin, ymax, xmax] (integers 0 to 1000) of that solution diagram.
     - Set "explanationPageNumber": The 1-based page number where that solution diagram appears (e.g. page 2).
   - If a question has only a solution diagram (no separate question diagram), populate both "imageBox" and "explanationImageBox" with that diagram so it is displayed prominently.
   - If an option contains an image, populate "imageBox" and "pageNumber" for that option item.
   - If neither the question nor its solution has any visual diagram, set "imageBox": null.

3. QUESTION TYPES:
   - "mcq": Standard single-choice question with 2-5 options.
   - "multi_correct": Question where more than one option can be correct.
   - "numerical": Question where the answer is a numerical value or range (no options).
   - "assertion_reason": Assertion-Reasoning format question.
   - "subjective": Long answer, short answer, or descriptive question.

4. OPTIONS:
   - For MCQ / Multi-correct / Assertion-Reason:
     - Extract options into an array of objects: { "text": "...", "isCorrect": boolean, "orderIndex": 0 }.
     - Strip option label prefixes such as "(A)", "A.", "1.", "(a)" from the option text.

5. ANSWER KEYS & SOLUTIONS:
   - Search the document for an answer key or solution appendix (often located at the end of the paper).
   - If an answer key is found, set "isCorrect": true for the correct option(s) and populate "explanation" if solutions exist.
   - For numerical questions, set "correctAnswer" to the numerical answer.
   - If no answer key is present in the document, mark the most logically probable option or leave options with isCorrect=false for developer review.

6. CLEANUP & WORKSHEET SCAFFOLDING:
   - Do NOT include paper headers, exam metadata, student fill-in headers (e.g., "Student Name: [Your Name]", "Roll No.:", "Class & Section:", "Date:", "Time Allowed:"), or page numbers.
   - Do NOT dump worksheet fill-in templates or student checklists into the question text (e.g., omit "Step 1: Complete Coordinate Tables", "Table A: ... [ ]", "Step 3: Student Response Checklist: State: 1. Point of Intersection x = ___").
   - Extract ONLY the core, self-contained academic question statement (e.g. "Draw the graphs of the following pair of linear equations on the coordinate plane: Equation (1): $x - y + 1 = 0$, Equation (2): $3x + 2y - 12 = 0$. Determine the coordinates of the vertices of the triangle formed by these lines and the x-axis, shade the triangular region, and calculate the area of the shaded triangle.").

OUTPUT FORMAT:
Respond ONLY with a valid JSON array of objects. Do not include markdown code block wrappers or extra text.
Schema for each question item:
[
  {
    "type": "mcq" | "multi_correct" | "numerical" | "assertion_reason" | "subjective",
    "text": "Clean core question statement with LaTeX formulas if any (omit student worksheets / checklists)",
    "topic": "Topic name if identifiable or empty string",
    "difficulty": "easy" | "medium" | "hard",
    "marks": 5,
    "negativeMarks": 0,
    "explanation": "Detailed step-by-step solution if available in document",
    "correctAnswer": "Intersection: (2, 3); Vertices: A(2, 3), B(-1, 0), C(4, 0); Area = 7.5 sq. units",
    "pageNumber": 1,
    "imageBox": { "ymin": 700, "xmin": 200, "ymax": 950, "xmax": 800 } or null,
    "explanationPageNumber": 2,
    "explanationImageBox": { "ymin": 680, "xmin": 210, "ymax": 890, "xmax": 790 } or null,
    "options": [
      { 
        "text": "First option text with LaTeX if any", 
        "isCorrect": false, 
        "orderIndex": 0,
        "pageNumber": 1,
        "imageBox": null
      }
    ]
  }
]`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data,
              },
            },
            {
              text: "Extract all questions, math formulas in LaTeX, answer keys, explanations, and precise diagram/figure bounding boxes from this exam document following the system instructions strictly. Output JSON array only.",
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr: any;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        parsedErr = null;
      }
      const message =
        parsedErr?.error?.message || `Gemini API request failed with status ${response.status}: ${errText}`;
      throw new Error(message);
    }

    const data: any = await response.json();
    const rawContent =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    const questions = this.parseAndValidateQuestions(rawContent, options);

    // Crop and save detected diagram images
    return await this.enrichQuestionsWithCroppedImages(pdfBuffer, questions, options);
  }

  /**
   * For questions and options that have image bounding boxes, render PDF pages,
   * crop the regions with Sharp, upload them via AssetStorageService, and attach imageUrls.
   */
  async enrichQuestionsWithCroppedImages(
    pdfBuffer: Buffer,
    questions: QuestionCandidate[],
    options: ExtractionOptions = {}
  ): Promise<QuestionCandidate[]> {
    // Find all pages that need cropping
    const pagesNeeded = new Set<number>();
    for (const q of questions) {
      if (q.imageBox && q.pageNumber) {
        pagesNeeded.add(q.pageNumber);
      }
      if (q.explanationImageBox && q.explanationPageNumber) {
        pagesNeeded.add(q.explanationPageNumber);
      }
      if (q.options) {
        for (const opt of q.options) {
          if (opt.imageBox && opt.pageNumber) {
            pagesNeeded.add(opt.pageNumber);
          }
        }
      }
    }

    if (pagesNeeded.size === 0) {
      return questions;
    }

    const maxPage = Math.max(...Array.from(pagesNeeded));
    console.log(`[GeminiExtractor] Detected diagrams on ${pagesNeeded.size} pages. Rasterizing PDF up to page ${maxPage}...`);

    let renderedPages;
    try {
      renderedPages = await pdfRasterizerService.renderPdfPages(pdfBuffer, {
        scale: 2.0, // High-DPI render for crisp academic diagrams
        maxPages: maxPage,
      });
    } catch (err: any) {
      console.warn(`[GeminiExtractor] Failed to rasterize PDF for image extraction: ${err.message}`);
      return questions;
    }

    const pageMap = new Map<number, { buffer: Buffer; width: number; height: number }>();
    for (const p of renderedPages) {
      pageMap.set(p.pageNumber, {
        buffer: p.imageBuffer,
        width: p.width,
        height: p.height,
      });
    }

    const tenantId = options.tenantId || "default";

    // Crop question and solution images
    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];

      // 1. Crop primary question diagram if present
      if (q.imageBox && q.pageNumber && pageMap.has(q.pageNumber)) {
        try {
          const pageData = pageMap.get(q.pageNumber)!;
          const croppedBuffer = await pdfRasterizerService.cropRegion(
            pageData.buffer,
            pageData.width,
            pageData.height,
            q.imageBox
          );

          const upload = await assetStorageService.saveImage(croppedBuffer, {
            tenantId,
            filenamePrefix: `q_${qIdx + 1}`,
          });

          q.imageUrl = upload.url;
        } catch (cropErr: any) {
          console.warn(`[GeminiExtractor] Failed to crop question image for Q#${qIdx + 1}:`, cropErr.message);
        }
      }

      // 2. Crop explanation / solution diagram if present (e.g. solved graphs, ray diagrams)
      if (q.explanationImageBox && q.explanationPageNumber && pageMap.has(q.explanationPageNumber)) {
        try {
          const pageData = pageMap.get(q.explanationPageNumber)!;
          const croppedBuffer = await pdfRasterizerService.cropRegion(
            pageData.buffer,
            pageData.width,
            pageData.height,
            q.explanationImageBox
          );

          const upload = await assetStorageService.saveImage(croppedBuffer, {
            tenantId,
            filenamePrefix: `q_${qIdx + 1}_solution`,
          });

          q.explanationImageUrl = upload.url;

          // If question does not have its own separate given diagram, link this solved diagram to question.imageUrl
          if (!q.imageUrl) {
            q.imageUrl = upload.url;
          }
        } catch (cropErr: any) {
          console.warn(`[GeminiExtractor] Failed to crop explanation image for Q#${qIdx + 1}:`, cropErr.message);
        }
      }

      // 3. Crop option images if present
      if (q.options) {
        for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
          const opt = q.options[optIdx];
          const pageNum = opt.pageNumber || q.pageNumber;
          if (opt.imageBox && pageNum && pageMap.has(pageNum)) {
            try {
              const pageData = pageMap.get(pageNum)!;
              const croppedBuffer = await pdfRasterizerService.cropRegion(
                pageData.buffer,
                pageData.width,
                pageData.height,
                opt.imageBox
              );

              const upload = await assetStorageService.saveImage(croppedBuffer, {
                tenantId,
                filenamePrefix: `q_${qIdx + 1}_opt_${optIdx + 1}`,
              });

              opt.imageUrl = upload.url;
            } catch (cropErr: any) {
              console.warn(
                `[GeminiExtractor] Failed to crop option image for Q#${qIdx + 1} Opt#${optIdx + 1}:`,
                cropErr.message
              );
            }
          }
        }
      }
    }

    return questions;
  }

  /**
   * Parse extracted raw JSON text into validated candidate questions
   */
  parseAndValidateQuestions(
    rawText: string,
    options: ExtractionOptions = {}
  ): QuestionCandidate[] {
    let cleanJson = rawText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: any[];
    try {
      parsed = JSON.parse(cleanJson);
    } catch (firstErr) {
      // 1. If JSON is wrapped with any extraneous narrative or markdown, extract innermost array/object bounds
      const firstBracket = cleanJson.indexOf("[");
      const firstBrace = cleanJson.indexOf("{");
      let startIdx = -1;
      if (firstBracket !== -1 && firstBrace !== -1) {
        startIdx = Math.min(firstBracket, firstBrace);
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
      } else if (firstBrace !== -1) {
        startIdx = firstBrace;
      }

      const lastBracket = cleanJson.lastIndexOf("]");
      const lastBrace = cleanJson.lastIndexOf("}");
      const endIdx = Math.max(lastBracket, lastBrace);

      let candidate = cleanJson;
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        candidate = cleanJson.substring(startIdx, endIdx + 1);
      }

      // 2. Repair unescaped LaTeX backslashes, bad unicode escapes, and literal control characters
      const repaired = repairJsonString(candidate);

      try {
        parsed = JSON.parse(repaired);
      } catch (secondErr: any) {
        throw new Error(`Failed to parse extracted JSON from AI response: ${secondErr.message}`);
      }
    }

    if (!Array.isArray(parsed)) {
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).questions)) {
        parsed = (parsed as any).questions;
      } else {
        parsed = [parsed];
      }
    }

    return parsed.map((item, index) => {
      const tempId = `cand_${Date.now()}_${index + 1}`;
      const type: QuestionType = [
        "mcq",
        "multi_correct",
        "numerical",
        "assertion_reason",
        "subjective",
      ].includes(item.type)
        ? item.type
        : "mcq";

      const difficulty = ["easy", "medium", "hard"].includes(item.difficulty)
        ? item.difficulty
        : "medium";

      const marks = typeof item.marks === "number" ? item.marks : (options.defaultMarks ?? 4);
      const negativeMarks =
        typeof item.negativeMarks === "number"
          ? item.negativeMarks
          : (options.defaultNegativeMarks ?? 0);

      const normalizeBoundingBox = (b: any): BoundingBoxCoordinates | undefined => {
        if (!b) return undefined;
        // 1. Array format [ymin, xmin, ymax, xmax] (standard Gemini vision detection)
        if (Array.isArray(b) && b.length >= 4) {
          const [ymin, xmin, ymax, xmax] = b.map(Number);
          if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax) && ymax > ymin && xmax > xmin) {
            return { ymin, xmin, ymax, xmax };
          }
        }
        // 2. { box_2d: [ymin, xmin, ymax, xmax] } (Gemini native object detection format)
        if (b.box_2d && Array.isArray(b.box_2d) && b.box_2d.length >= 4) {
          const [ymin, xmin, ymax, xmax] = b.box_2d.map(Number);
          if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax) && ymax > ymin && xmax > xmin) {
            return { ymin, xmin, ymax, xmax };
          }
        }
        // 3. Object with ymin, xmin, ymax, xmax
        if (
          typeof b.ymin === "number" &&
          typeof b.xmin === "number" &&
          typeof b.ymax === "number" &&
          typeof b.xmax === "number" &&
          b.ymax > b.ymin &&
          b.xmax > b.xmin
        ) {
          return { ymin: b.ymin, xmin: b.xmin, ymax: b.ymax, xmax: b.xmax };
        }
        // 4. Object with top, left, bottom, right
        if (
          typeof b.top === "number" &&
          typeof b.left === "number" &&
          typeof b.bottom === "number" &&
          typeof b.right === "number" &&
          b.bottom > b.top &&
          b.right > b.left
        ) {
          return { ymin: b.top, xmin: b.left, ymax: b.bottom, xmax: b.right };
        }
        return undefined;
      };

      const qBox = normalizeBoundingBox(item.imageBox);
      const qPage = typeof item.pageNumber === "number" ? item.pageNumber : undefined;

      const expBox = normalizeBoundingBox(item.explanationImageBox);
      const expPage = typeof item.explanationPageNumber === "number" ? item.explanationPageNumber : undefined;

      let cleanText = String(item.text || "").trim();
      // Clean up inadvertent worksheet templates or student checklists
      cleanText = cleanText
        .replace(/\n*\s*\*{0,2}Step\s+\d+:\s*(?:Complete\s+the\s+Coordinate\s+Tables|Coordinate\s+Grid\s+Reference|Student\s+Response\s+Checklist)[\s\S]*$/i, "")
        .trim();

      const optionsList = Array.isArray(item.options)
        ? item.options.map((opt: any, oIdx: number) => {
            const optBox = normalizeBoundingBox(opt.imageBox);
            const optPage = typeof opt.pageNumber === "number" ? opt.pageNumber : qPage;
            return {
              id: `opt_${tempId}_${oIdx}`,
              text: String(opt.text || "").trim(),
              isCorrect: Boolean(opt.isCorrect),
              orderIndex: typeof opt.orderIndex === "number" ? opt.orderIndex : oIdx,
              imageUrl: opt.imageUrl ? String(opt.imageUrl) : undefined,
              imageBox: optBox,
              pageNumber: optPage,
            };
          })
        : [];

      // Run health checks on candidate
      const validationErrors: string[] = [];
      if (!cleanText) {
        validationErrors.push("Question statement text is missing");
      }

      if (type === "mcq" || type === "assertion_reason") {
        if (optionsList.length < 2) {
          validationErrors.push("MCQ must have at least 2 options");
        }
        const correctCount = optionsList.filter((o: { isCorrect: boolean }) => o.isCorrect).length;
        if (correctCount === 0) {
          validationErrors.push("No correct answer marked");
        } else if (correctCount > 1 && type === "mcq") {
          validationErrors.push("Multiple options marked correct for single-choice MCQ");
        }
      } else if (type === "multi_correct") {
        if (optionsList.length < 2) {
          validationErrors.push("Multi-correct question must have at least 2 options");
        }
        const correctCount = optionsList.filter((o: { isCorrect: boolean }) => o.isCorrect).length;
        if (correctCount === 0) {
          validationErrors.push("No correct options marked");
        }
      } else if (type === "numerical") {
        if (!item.correctAnswer && !cleanText.includes("=")) {
          validationErrors.push("Correct numerical answer is not specified");
        }
      }

      return {
        tempId,
        type,
        text: cleanText,
        topic: item.topic ? String(item.topic).trim() : undefined,
        difficulty,
        marks,
        negativeMarks,
        explanation: item.explanation ? String(item.explanation).trim() : undefined,
        explanationImageUrl: item.explanationImageUrl ? String(item.explanationImageUrl) : undefined,
        explanationImageBox: expBox,
        explanationPageNumber: expPage,
        correctAnswer: item.correctAnswer ? String(item.correctAnswer).trim() : undefined,
        options: optionsList,
        imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
        imageBox: qBox,
        pageNumber: qPage,
        isValid: validationErrors.length === 0,
        validationErrors,
      };
    });
  }
}

export const geminiExtractorService = new GeminiExtractorService();

/**
 * Common LaTeX command prefixes that begin with letters that are otherwise
 * standard single-character JSON escape sequences (\f, \t, \b, \r, \n).
 * When an LLM fails to double-escape these LaTeX commands in a JSON string,
 * treating them as standard JSON escapes destroys the LaTeX or causes parse failures.
 */
const LATEX_ESCAPE_COMMANDS: Record<string, string[]> = {
  f: ["rac", "orall", "lat"], // \frac, \forall, \flat
  t: ["ext", "heta", "imes", "au", "an", "ilde", "herefore", "riangle", "op"], // \text, \theta, \times, \tau, \tan, etc.
  b: ["eta", "ar", "inom", "ullet", "egin", "ig", "f", "old", "mod", "ot"], // \beta, \bar, \binom, \bullet, \begin, etc.
  r: ["ight", "ho", "ightarrow", "angle", "oot", "eal"], // \right, \rho, \rightarrow, etc.
  n: ["u", "eq", "abla", "eg", "otin", "atural"], // \nu, \neq, \nabla, \neg, etc.
};

/**
 * Repairs malformed JSON strings emitted by LLMs, specifically addressing:
 * - Unescaped backslashes in LaTeX equations (e.g., \sqrt, \alpha, \frac, \times)
 * - Invalid unicode escape sequences (e.g., \uparrow, \unit)
 * - Raw control characters (newlines, tabs, carriage returns) inside string literals
 * - Trailing commas before closing brackets or braces
 */
export function repairJsonString(jsonStr: string): string {
  let result = "";
  let inString = false;
  let i = 0;

  while (i < jsonStr.length) {
    const ch = jsonStr[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
      i++;
    } else {
      if (ch === '"') {
        inString = false;
        result += ch;
        i++;
      } else if (ch === "\\") {
        const next = jsonStr[i + 1];
        if (next === undefined) {
          result += "\\\\";
          i++;
        } else if (next === '"' || next === "\\" || next === "/") {
          result += ch + next;
          i += 2;
        } else if (LATEX_ESCAPE_COMMANDS[next]) {
          const remaining = jsonStr.slice(i + 2);
          const isLatex = LATEX_ESCAPE_COMMANDS[next].some((prefix) => remaining.startsWith(prefix));
          if (isLatex) {
            result += "\\\\";
            i++;
          } else {
            result += ch + next;
            i += 2;
          }
        } else if (next === "b" || next === "f" || next === "n" || next === "r" || next === "t") {
          result += ch + next;
          i += 2;
        } else if (next === "u") {
          const hex = jsonStr.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += ch + next + hex;
            i += 6;
          } else {
            result += "\\\\";
            i++;
          }
        } else {
          result += "\\\\";
          i++;
        }
      } else if (ch === "\n") {
        result += "\\n";
        i++;
      } else if (ch === "\r") {
        result += "\\r";
        i++;
      } else if (ch === "\t") {
        result += "\\t";
        i++;
      } else {
        result += ch;
        i++;
      }
    }
  }

  // Remove trailing commas before closing braces or brackets
  return result.replace(/,\s*([}\]])/g, "$1");
}
