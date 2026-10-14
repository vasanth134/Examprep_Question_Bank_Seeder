import React from "react";
import { QuestionCandidate, QuestionType, QuestionDifficulty } from "@shared/types";
import { MathRenderer } from "./MathRenderer";
import { Trash2, Plus, Image as ImageIcon, CheckCircle, AlertCircle } from "lucide-react";

interface QuestionCardProps {
  question: QuestionCandidate;
  index: number;
  onUpdate: (updated: QuestionCandidate) => void;
  onDelete: (tempId: string) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  onUpdate,
  onDelete,
}) => {
  const handleTypeChange = (type: QuestionType) => {
    onUpdate({ ...question, type });
  };

  const handleDifficultyChange = (difficulty: QuestionDifficulty) => {
    onUpdate({ ...question, difficulty });
  };

  const handleOptionTextChange = (optIdx: number, text: string) => {
    const newOptions = [...question.options];
    newOptions[optIdx] = { ...newOptions[optIdx], text };
    onUpdate({ ...question, options: newOptions });
  };

  const handleToggleOptionCorrect = (optIdx: number) => {
    const isSingleChoice = question.type === "mcq" || question.type === "assertion_reason";
    const newOptions = question.options.map((opt, i) => {
      if (isSingleChoice) {
        return { ...opt, isCorrect: i === optIdx };
      } else {
        return i === optIdx ? { ...opt, isCorrect: !opt.isCorrect } : opt;
      }
    });
    onUpdate({ ...question, options: newOptions });
  };

  const handleAddOption = () => {
    const newOptions = [
      ...question.options,
      {
        text: `Option ${String.fromCharCode(65 + question.options.length)}`,
        isCorrect: false,
        orderIndex: question.options.length,
      },
    ];
    onUpdate({ ...question, options: newOptions });
  };

  const handleRemoveOption = (optIdx: number) => {
    const newOptions = question.options.filter((_, i) => i !== optIdx);
    onUpdate({ ...question, options: newOptions });
  };

  const hasCorrectAnswer =
    question.type === "numerical" || question.type === "subjective"
      ? Boolean(question.correctAnswer)
      : question.options.some((o) => o.isCorrect);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 transition-all hover:border-slate-300">
      {/* Header bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-800 text-base">Q{index + 1}</span>
          <select
            value={question.type}
            onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
            className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="mcq">Single Choice (MCQ)</option>
            <option value="multi_correct">Multiple Correct</option>
            <option value="numerical">Numerical</option>
            <option value="assertion_reason">Assertion & Reason</option>
            <option value="subjective">Subjective</option>
          </select>

          <select
            value={question.difficulty}
            onChange={(e) => handleDifficultyChange(e.target.value as QuestionDifficulty)}
            className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Marks:</span>
            <input
              type="number"
              value={question.marks}
              onChange={(e) => onUpdate({ ...question, marks: Number(e.target.value) || 0 })}
              className="w-14 text-center border border-slate-200 rounded-md py-0.5 text-xs font-semibold"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Neg:</span>
            <input
              type="number"
              value={question.negativeMarks}
              onChange={(e) => onUpdate({ ...question, negativeMarks: Number(e.target.value) || 0 })}
              className="w-14 text-center border border-slate-200 rounded-md py-0.5 text-xs font-semibold"
            />
          </div>

          <button
            onClick={() => onDelete(question.tempId)}
            className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
            title="Delete Question"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body content */}
      <div className="p-5 space-y-4">
        {/* Validation status badge */}
        {!hasCorrectAnswer && (
          <div className="flex items-center gap-2 p-2.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Missing answer key: Select the correct option or provide the numerical value below.</span>
          </div>
        )}

        {/* Question Statement */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
            Question Statement (LaTeX supported)
          </label>
          <textarea
            value={question.text}
            onChange={(e) => onUpdate({ ...question, text: e.target.value })}
            rows={3}
            className="w-full text-sm border border-slate-200 rounded-lg p-3 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Type question statement here ($x^2$ for inline, $$\frac{a}{b}$$ for display math)..."
          />
          {question.text && (
            <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Live Preview</div>
              <MathRenderer content={question.text} />
            </div>
          )}
        </div>

        {/* Diagram Image if present */}
        {question.imageUrl && (
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> Extracted Diagram
              </span>
              <button
                onClick={() => onUpdate({ ...question, imageUrl: undefined })}
                className="text-xs text-rose-600 hover:underline"
              >
                Remove Image
              </button>
            </div>
            <img
              src={question.imageUrl}
              alt="Question diagram"
              className="max-h-48 rounded object-contain bg-white border border-slate-200"
            />
          </div>
        )}

        {/* Options (for MCQ, Multi-correct, Assertion-reason) */}
        {question.type !== "numerical" && question.type !== "subjective" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Options
              </label>
              <button
                onClick={handleAddOption}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Option
              </button>
            </div>

            <div className="space-y-2">
              {question.options.map((opt, optIdx) => (
                <div
                  key={optIdx}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    opt.isCorrect
                      ? "bg-emerald-50/50 border-emerald-300"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleOptionCorrect(optIdx)}
                    className={`mt-1 flex items-center justify-center w-5 h-5 rounded transition-all ${
                      opt.isCorrect
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "border border-slate-300 text-transparent hover:border-emerald-500"
                    }`}
                    title={opt.isCorrect ? "Correct Option" : "Mark as Correct"}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleOptionTextChange(optIdx, e.target.value)}
                      className="w-full text-sm font-mono border-0 p-0 bg-transparent focus:ring-0 outline-none text-slate-800"
                      placeholder="Option text..."
                    />
                    {opt.text && (
                      <div className="text-xs text-slate-600">
                        <MathRenderer content={opt.text} />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleRemoveOption(optIdx)}
                    className="text-slate-300 hover:text-rose-500 p-1"
                    title="Remove Option"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Numerical / Subjective Answer Input */}
        {(question.type === "numerical" || question.type === "subjective") && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Correct Answer Key
            </label>
            <input
              type="text"
              value={question.correctAnswer || ""}
              onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. 42 or 9.8 m/s^2"
            />
          </div>
        )}

        {/* Step-by-Step Explanation */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
            Explanation / Solution Step
          </label>
          <textarea
            value={question.explanation || ""}
            onChange={(e) => onUpdate({ ...question, explanation: e.target.value })}
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-lg p-2.5 font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Detailed step-by-step mathematical reasoning..."
          />
          {question.explanationImageUrl && (
            <div className="mt-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-500" /> Solved Graph / Solution Diagram
                </span>
                <button
                  onClick={() => onUpdate({ ...question, explanationImageUrl: undefined })}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Remove
                </button>
              </div>
              <img
                src={question.explanationImageUrl}
                alt="Solution diagram"
                className="max-h-48 rounded object-contain bg-white border border-slate-200"
              />
            </div>
          )}
          {question.explanation && (
            <div className="mt-1.5 p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600">
              <MathRenderer content={question.explanation} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
