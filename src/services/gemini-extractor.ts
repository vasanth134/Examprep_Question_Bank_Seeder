import type { QuestionCandidate, QuestionType, BoundingBoxCoordinates } from "../types";
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
   
2. DIAGRAMS, GRAPHS, FIGURES & SCHEMATICS (IMAGE EXTRACTION):
   - Whenever a question contains a diagram, circuit, ray diagram, graph, experimental setup, or geometric figure, you MUST detect it.
   - Specify "pageNumber": 1-based page number where the diagram appears.
   - Specify "imageBox": Normalized bounding box coordinates [ymin, xmin, ymax, xmax] where each value is an integer from 0 to 1000 representing the exact boundary of the diagram/figure on that page.
     Format: { "ymin": number, "xmin": number, "ymax": number, "xmax": number }
   - If an individual option itself contains or represents an image/diagram (e.g. Option A is a graph, Option B is a circuit), populate "pageNumber" and "imageBox" for that option item as well.
   - If a question or option has no visual diagram/figure, set "imageBox": null.

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

6. CLEANUP:
   - Do NOT include paper headers, general instructions (e.g. "Time allowed: 3 hours"), page numbers, or exam rules as questions.
   - Only return true academic questions.

OUTPUT FORMAT:
Respond ONLY with a valid JSON array of objects. Do not include markdown code block wrappers or extra text.
Schema for each question item:
[
  {
    "type": "mcq" | "multi_correct" | "numerical" | "assertion_reason" | "subjective",
    "text": "Question statement with LaTeX formulas if any",
    "topic": "Topic name if identifiable or empty string",
    "difficulty": "easy" | "medium" | "hard",
    "marks": 4,
    "negativeMarks": 0,
    "explanation": "Detailed step-by-step solution if available in document",
    "correctAnswer": "5.4",
    "pageNumber": 1,
    "imageBox": { "ymin": 120, "xmin": 300, "ymax": 380, "xmax": 750 } or null,
    "options": [
      { 
        "text": "First option text with LaTeX if any", 
        "isCorrect": false, 
        "orderIndex": 0,
        "pageNumber": 1,
        "imageBox": null
      },
      { 
        "text": "Second option text with LaTeX if any", 
        "isCorrect": true, 
        "orderIndex": 1,
        "pageNumber": 1,
        "imageBox": { "ymin": 400, "xmin": 100, "ymax": 520, "xmax": 450 } or null
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

    // Crop question images
    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];
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

      // Crop option images
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
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).questions)) {
          parsed = (parsed as any).questions;
        } else {
          parsed = [parsed];
        }
      }
    } catch (e: any) {
      throw new Error(`Failed to parse extracted JSON from AI response: ${e.message}`);
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

      const isValidBox = (b: any): b is BoundingBoxCoordinates =>
        b &&
        typeof b.ymin === "number" &&
        typeof b.xmin === "number" &&
        typeof b.ymax === "number" &&
        typeof b.xmax === "number" &&
        b.ymax > b.ymin &&
        b.xmax > b.xmin;

      const qBox = isValidBox(item.imageBox) ? item.imageBox : undefined;
      const qPage = typeof item.pageNumber === "number" ? item.pageNumber : undefined;

      const optionsList = Array.isArray(item.options)
        ? item.options.map((opt: any, oIdx: number) => {
            const optBox = isValidBox(opt.imageBox) ? opt.imageBox : undefined;
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
      if (!item.text || !item.text.trim()) {
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
        if (!item.correctAnswer && !item.text.includes("=")) {
          validationErrors.push("Correct numerical answer is not specified");
        }
      }

      return {
        tempId,
        type,
        text: String(item.text || "").trim(),
        topic: item.topic ? String(item.topic).trim() : undefined,
        difficulty,
        marks,
        negativeMarks,
        explanation: item.explanation ? String(item.explanation).trim() : undefined,
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
