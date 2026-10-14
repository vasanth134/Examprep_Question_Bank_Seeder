import React, { useState, useEffect } from "react";
import { TenantInfo, TaxonomyData, QuestionCandidate } from "@shared/types";
import { QuestionCard } from "./components/QuestionCard";
import {
  Upload,
  BookOpen,
  Database,
  Key,
  Check,
  AlertTriangle,
  FileText,
  Loader2,
  RefreshCw,
  PlusCircle,
} from "lucide-react";

export function App() {
  // Config & State
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyData | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");

  // AI Extraction state
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem("seeder_gemini_api_key") || "");
  const [model, setModel] = useState<string>("gemini-3.8-flash");
  const [hasBackendKey, setHasBackendKey] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionCandidate[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Load config and tenants on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setHasBackendKey(data.hasGeminiEnvKey);
        if (data.defaultModel) setModel(data.defaultModel);
      })
      .catch(console.error);

    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const res = await fetch("/api/tenants");
      const data = await res.json();
      if (data.success && data.tenants) {
        setTenants(data.tenants);
        if (data.tenants.length > 0) {
          setSelectedTenant(data.tenants[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch tenants:", err);
    }
  };

  // Fetch taxonomy when tenant changes
  useEffect(() => {
    if (!selectedTenant) return;
    fetch(`/api/taxonomy?tenantId=${selectedTenant}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setTaxonomy(data.data);
          if (data.data.classes.length > 0) setSelectedClass(data.data.classes[0].id);
          if (data.data.subjects.length > 0) setSelectedSubject(data.data.subjects[0].id);
          if (data.data.users.length > 0) setSelectedAuthor(data.data.users[0].id);
        }
      })
      .catch(console.error);
  }, [selectedTenant]);

  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  const extractFile = async (file: File) => {
    setIsExtracting(true);
    setStatusMessage({ type: "info", text: `Uploading and extracting questions from ${file.name}...` });

    const formData = new FormData();
    formData.append("file", file);
    if (apiKey) formData.append("apiKey", apiKey);
    formData.append("model", model);
    formData.append("tenantId", selectedTenant);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions);
        setStatusMessage({
          type: "success",
          text: `Successfully parsed ${data.count} questions from ${file.name}. Review and verify them below.`,
        });
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to extract questions." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastUploadedFile(file);
    await extractFile(file);
    // Reset file input target so the same file can be selected again if needed
    e.target.value = "";
  };

  const handleRetryExtraction = async () => {
    if (!lastUploadedFile || isExtracting) return;
    await extractFile(lastUploadedFile);
  };

  const handleAddBlankQuestion = () => {
    const newQ: QuestionCandidate = {
      tempId: `manual_${Date.now()}`,
      type: "mcq",
      text: "New sample question with math: $\\int x dx$",
      difficulty: "medium",
      marks: 4,
      negativeMarks: 1,
      options: [
        { text: "$\\frac{x^2}{2} + C$", isCorrect: true, orderIndex: 0 },
        { text: "$x^2 + C$", isCorrect: false, orderIndex: 1 },
      ],
    };
    setQuestions([newQ, ...questions]);
  };

  const handleUpdateQuestion = (updated: QuestionCandidate) => {
    setQuestions(questions.map((q) => (q.tempId === updated.tempId ? updated : q)));
  };

  const handleDeleteQuestion = (tempId: string) => {
    setQuestions(questions.filter((q) => q.tempId !== tempId));
  };

  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem("seeder_gemini_api_key", newKey);
  };

  const handleSeedDatabase = async () => {
    if (!selectedTenant || !selectedSubject || !selectedAuthor) {
      alert("Please ensure Tenant, Subject, and Author are selected.");
      return;
    }

    if (questions.length === 0) {
      alert("No questions to insert.");
      return;
    }

    setIsSeeding(true);
    setStatusMessage({ type: "info", text: "Transactionally seeding questions into tenant database..." });

    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant,
          classId: selectedClass || null,
          subjectId: selectedSubject,
          chapterId: selectedChapter || null,
          createdBy: selectedAuthor,
          questions,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: "success",
          text: `🎉 Successfully inserted ${data.insertedCount} questions into the database!`,
        });
        setQuestions([]);
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to seed database." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Seeding error" });
    } finally {
      setIsSeeding(false);
    }
  };

  const filteredChapters = taxonomy?.chapters.filter((c) => c.subjectId === selectedSubject) || [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Question Bank Seeder Studio</h1>
              <p className="text-xs text-slate-500">React + TypeScript + Node.js Production Architecture</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700">
              <Key className="w-3.5 h-3.5 text-slate-500" />
              <span>{hasBackendKey || apiKey ? "Gemini Key: Active" : "Gemini Key: Required"}</span>
            </div>

            <button
              onClick={handleSeedDatabase}
              disabled={isSeeding || questions.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all ${
                questions.length > 0 && !isSeeding
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              <span>Commit to Database ({questions.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Status notification banner */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
              statusMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : statusMessage.type === "error"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
            }`}
          >
            <div className="flex items-center gap-2.5 text-sm font-medium">
              {statusMessage.type === "success" ? (
                <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : statusMessage.type === "error" ? (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              ) : (
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            
            <div className="flex items-center gap-3">
              {statusMessage.type === "error" && lastUploadedFile && (
                <button
                  onClick={handleRetryExtraction}
                  disabled={isExtracting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? "animate-spin" : ""}`} />
                  <span>Retry Extraction ({lastUploadedFile.name})</span>
                </button>
              )}
              <button
                onClick={() => setStatusMessage(null)}
                className="text-xs font-semibold uppercase hover:underline opacity-70"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Setup & Filter Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tenant & Taxonomy setup */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" /> Target Database & Taxonomy
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Target Tenant</label>
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 font-medium"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Class / Grade</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50"
                  >
                    <option value="">None / All</option>
                    {taxonomy?.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 font-medium"
                  >
                    {taxonomy?.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Chapter</label>
                <select
                  value={selectedChapter}
                  onChange={(e) => setSelectedChapter(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50"
                >
                  <option value="">General / Unassigned</option>
                  {filteredChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Created By (Teacher/Admin)</label>
                <select
                  value={selectedAuthor}
                  onChange={(e) => setSelectedAuthor(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50"
                >
                  {taxonomy?.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* AI Multimodal Extraction Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-500" /> PDF Multimodal Extraction
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Model:</span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white font-medium"
                  >
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  </select>
                </div>
              </div>

              {/* Upload Drop Area */}
              <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/20">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={isExtracting}
                  className="hidden"
                />
                {isExtracting ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <span className="text-xs font-semibold text-slate-600">Processing PDF with Gemini Vision...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Click to upload question paper PDF</span>
                    <span className="text-xs text-slate-400">PDFs up to 30MB supported with automatic diagram extraction</span>
                  </div>
                )}
              </label>

              {lastUploadedFile && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden text-xs text-slate-700">
                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-semibold truncate">{lastUploadedFile.name}</span>
                    <span className="text-slate-400">({(lastUploadedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRetryExtraction}
                    disabled={isExtracting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 shrink-0 ml-3"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? "animate-spin" : ""}`} />
                    <span>{isExtracting ? "Extracting..." : "Re-extract / Retry"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={handleAddBlankQuestion}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-blue-600"
              >
                <PlusCircle className="w-4 h-4 text-blue-500" /> Add Blank Question Manually
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Gemini API Key override..."
                  value={apiKey}
                  onChange={(e) => handleSaveApiKey(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-52"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Verification Studio Workspace */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Verification Workspace ({questions.length} questions loaded)
            </h2>
            {questions.length > 0 && (
              <button
                onClick={() => setQuestions([])}
                className="text-xs text-slate-500 hover:text-rose-600 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {questions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-500 text-sm">
                No questions loaded yet. Upload a PDF exam paper above or add a blank question to begin.
              </p>
            </div>
          ) : (
            <div>
              {questions.map((q, idx) => (
                <QuestionCard
                  key={q.tempId}
                  question={q}
                  index={idx}
                  onUpdate={handleUpdateQuestion}
                  onDelete={handleDeleteQuestion}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
