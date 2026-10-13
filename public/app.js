// ExamPrep Developer Question Seeder Studio Client Logic

let state = {
  tenants: [],
  selectedTenantId: null,
  taxonomy: {
    classes: [],
    subjects: [],
    chapters: [],
    users: [],
  },
  selectedFile: null,
  questions: [], // Candidate questions in studio
  apiKey: localStorage.getItem("examprep_gemini_api_key") || "",
  hasEnvKey: false,
};

// ── DOM Elements ─────────────────────────────────────────────────────
const selectTenant = document.getElementById("selectTenant");
const selectSubject = document.getElementById("selectSubject");
const selectChapter = document.getElementById("selectChapter");
const selectClass = document.getElementById("selectClass");
const selectAuthor = document.getElementById("selectAuthor");

const dropzone = document.getElementById("dropzone");
const pdfFileInput = document.getElementById("pdfFileInput");
const btnExtract = document.getElementById("btnExtract");
const extractionLoader = document.getElementById("extractionLoader");
const selectAiModel = document.getElementById("selectAiModel");
const defaultMarks = document.getElementById("defaultMarks");
const defaultNegativeMarks = document.getElementById("defaultNegativeMarks");

const reviewSection = document.getElementById("reviewSection");
const questionsContainer = document.getElementById("questionsContainer");
const statTotalCount = document.getElementById("statTotalCount");
const statValidCount = document.getElementById("statValidCount");
const statIssueCount = document.getElementById("statIssueCount");
const searchInput = document.getElementById("searchInput");
const filterType = document.getElementById("filterType");
const btnAddBlankQuestion = document.getElementById("btnAddBlankQuestion");
const btnClearAllQuestions = document.getElementById("btnClearAllQuestions");

const btnSeedDatabase = document.getElementById("btnSeedDatabase");
const badgeSeedCount = document.getElementById("badgeSeedCount");

// Modals
const settingsModal = document.getElementById("settingsModal");
const btnSettingsModal = document.getElementById("btnSettingsModal");
const btnCloseSettingsModal = document.getElementById("btnCloseSettingsModal");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const inputGeminiApiKey = document.getElementById("inputGeminiApiKey");
const envKeyStatus = document.getElementById("envKeyStatus");

const jsonModal = document.getElementById("jsonModal");
const btnPasteJson = document.getElementById("btnPasteJson");
const btnCloseJsonModal = document.getElementById("btnCloseJsonModal");
const btnApplyRawJson = document.getElementById("btnApplyRawJson");
const btnLoadSamplePhysics = document.getElementById("btnLoadSamplePhysics");
const rawJsonInput = document.getElementById("rawJsonInput");

const seedModal = document.getElementById("seedModal");
const btnCloseSeedModal = document.getElementById("btnCloseSeedModal");
const btnCancelSeed = document.getElementById("btnCancelSeed");
const btnConfirmSeed = document.getElementById("btnConfirmSeed");
const seedStatusBox = document.getElementById("seedStatusBox");
const seedSuccessAlert = document.getElementById("seedSuccessAlert");
const seedStatusMessage = document.getElementById("seedStatusMessage");
const seedSuccessText = document.getElementById("seedSuccessText");

// ── Initialization ───────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) window.lucide.createIcons();
  inputGeminiApiKey.value = state.apiKey;

  await checkConfig();
  await loadTenants();
  setupEventListeners();
});

async function checkConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    state.hasEnvKey = data.hasGeminiEnvKey;
    if (state.hasEnvKey) {
      envKeyStatus.innerHTML =
        '<span style="color: #34d399;">✓ Server environment key found (GEMINI_API_KEY in .env)</span>';
    } else {
      envKeyStatus.innerHTML =
        '<span style="color: #fbbf24;">⚠ No GEMINI_API_KEY detected in backend .env. Please enter your API key above.</span>';
    }
    if (data.defaultModel && selectAiModel) {
      selectAiModel.value = data.defaultModel;
    }
  } catch (err) {
    console.error("Config check failed", err);
  }
}

async function loadTenants() {
  try {
    const res = await fetch("/api/tenants");
    const json = await res.json();
    if (json.success && Array.isArray(json.tenants)) {
      state.tenants = json.tenants;
      selectTenant.innerHTML = '<option value="" disabled selected>Select a school...</option>';
      state.tenants.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.slug})`;
        selectTenant.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Failed to load tenants", err);
    selectTenant.innerHTML = '<option value="" disabled>Error loading tenants</option>';
  }
}

async function loadTaxonomy(tenantId) {
  selectSubject.disabled = true;
  selectChapter.disabled = true;
  selectClass.disabled = true;
  selectAuthor.disabled = true;

  selectSubject.innerHTML = '<option value="" disabled selected>Loading subjects...</option>';
  selectAuthor.innerHTML = '<option value="" disabled selected>Loading authors...</option>';

  try {
    const res = await fetch(`/api/taxonomy?tenantId=${encodeURIComponent(tenantId)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.taxonomy = json.data;

    // Populate Subjects
    selectSubject.innerHTML = '<option value="" disabled selected>Select subject...</option>';
    state.taxonomy.subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      selectSubject.appendChild(opt);
    });
    selectSubject.disabled = false;

    // Populate Classes
    selectClass.innerHTML = '<option value="">No class assigned</option>';
    state.taxonomy.classes.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      selectClass.appendChild(opt);
    });
    selectClass.disabled = false;

    // Populate Authors (Admins/Teachers)
    selectAuthor.innerHTML = '<option value="" disabled selected>Select author...</option>';
    state.taxonomy.users.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = `${u.name} (${u.role})`;
      selectAuthor.appendChild(opt);
    });
    if (state.taxonomy.users.length > 0) {
      selectAuthor.value = state.taxonomy.users[0].id;
    }
    selectAuthor.disabled = false;
  } catch (err) {
    alert(`Failed to load taxonomy for selected tenant: ${err.message}`);
  }
}

function updateChaptersForSubject(subjectId) {
  selectChapter.innerHTML = '<option value="">No chapter / General</option>';
  const subjectChapters = state.taxonomy.chapters.filter((c) => c.subjectId === subjectId);
  subjectChapters.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    selectChapter.appendChild(opt);
  });
  selectChapter.disabled = false;
}

// ── Event Handlers ───────────────────────────────────────────────────
function setupEventListeners() {
  // Tenant select change
  selectTenant.addEventListener("change", (e) => {
    state.selectedTenantId = e.target.value;
    loadTaxonomy(state.selectedTenantId);
  });

  // Subject select change
  selectSubject.addEventListener("change", (e) => {
    updateChaptersForSubject(e.target.value);
  });

  // Drag & drop handlers
  dropzone.addEventListener("click", () => pdfFileInput.click());
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  pdfFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  // Extract button
  btnExtract.addEventListener("click", runExtraction);

  // Filter & search
  searchInput.addEventListener("input", renderQuestions);
  filterType.addEventListener("change", renderQuestions);

  // Toolbar actions
  btnAddBlankQuestion.addEventListener("click", addBlankQuestion);
  btnClearAllQuestions.addEventListener("click", () => {
    if (confirm("Clear all extracted questions from review?")) {
      state.questions = [];
      renderQuestions();
    }
  });

  // Settings Modal
  btnSettingsModal.addEventListener("click", () => settingsModal.classList.remove("hidden"));
  btnCloseSettingsModal.addEventListener("click", () => settingsModal.classList.add("hidden"));
  btnSaveSettings.addEventListener("click", () => {
    const val = inputGeminiApiKey.value.trim();
    state.apiKey = val;
    localStorage.setItem("examprep_gemini_api_key", val);
    settingsModal.classList.add("hidden");
  });

  // JSON Paste Modal
  btnPasteJson.addEventListener("click", () => jsonModal.classList.remove("hidden"));
  btnCloseJsonModal.addEventListener("click", () => jsonModal.classList.add("hidden"));
  btnApplyRawJson.addEventListener("click", handleApplyRawJson);
  btnLoadSamplePhysics.addEventListener("click", loadSamplePhysicsQuestions);

  // Seeding Modal
  btnSeedDatabase.addEventListener("click", openSeedModal);
  btnCloseSeedModal.addEventListener("click", () => seedModal.classList.add("hidden"));
  btnCancelSeed.addEventListener("click", () => seedModal.classList.add("hidden"));
  btnConfirmSeed.addEventListener("click", executeDatabaseSeeding);
}

function handleFileSelected(file) {
  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    alert("Please select a valid PDF file");
    return;
  }
  state.selectedFile = file;
  dropzone.querySelector(".dropzone-text").innerHTML = `Selected: <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  btnExtract.disabled = false;
}

// ── Extraction Logic ─────────────────────────────────────────────────
async function runExtraction() {
  if (!state.selectedFile) return;

  const keyToUse = state.apiKey || (state.hasEnvKey ? "" : "");
  if (!keyToUse && !state.hasEnvKey) {
    settingsModal.classList.remove("hidden");
    alert("Please enter a Google Gemini API Key in the settings modal first.");
    return;
  }

  extractionLoader.classList.remove("hidden");
  btnExtract.disabled = true;

  const formData = new FormData();
  formData.append("file", state.selectedFile);
  formData.append("apiKey", state.apiKey);
  formData.append("model", selectAiModel.value);
  formData.append("defaultMarks", defaultMarks.value);
  formData.append("defaultNegativeMarks", defaultNegativeMarks.value);
  formData.append("tenantId", state.selectedTenantId || "default");

  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || "Extraction failed");
    }

    state.questions = json.questions;
    reviewSection.classList.remove("hidden");
    renderQuestions();
    reviewSection.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    alert(`AI Extraction Error: ${err.message}`);
  } finally {
    extractionLoader.classList.add("hidden");
    btnExtract.disabled = false;
  }
}

// ── Render Questions Studio ──────────────────────────────────────────
function renderQuestions() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const typeFilter = filterType.value;

  const filtered = state.questions.filter((q) => {
    const matchesSearch =
      q.text.toLowerCase().includes(searchTerm) ||
      (q.explanation && q.explanation.toLowerCase().includes(searchTerm)) ||
      (q.options && q.options.some((o) => o.text.toLowerCase().includes(searchTerm)));

    const matchesType = typeFilter === "all" || q.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Calculate health
  const total = state.questions.length;
  let validCount = 0;
  let issueCount = 0;

  state.questions.forEach((q) => {
    validateQuestion(q);
    if (q.isValid) validCount++;
    else issueCount++;
  });

  statTotalCount.textContent = total;
  statValidCount.textContent = validCount;
  statIssueCount.textContent = issueCount;

  badgeSeedCount.textContent = total;
  btnSeedDatabase.disabled = total === 0;

  questionsContainer.innerHTML = "";

  if (filtered.length === 0) {
    questionsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #94a3b8;">
        No questions match the current filter or search criteria.
      </div>
    `;
    return;
  }

  filtered.forEach((q, displayIdx) => {
    const card = createQuestionCardElement(q, displayIdx + 1);
    questionsContainer.appendChild(card);
  });

  // Re-run KaTeX math typesetter
  renderAllMath();
  if (window.lucide) window.lucide.createIcons();
}

function validateQuestion(q) {
  const errors = [];
  if (!q.text || !q.text.trim()) errors.push("Question statement is empty");

  if (["mcq", "assertion_reason"].includes(q.type)) {
    if (!q.options || q.options.length < 2) errors.push("Needs at least 2 options");
    const correct = (q.options || []).filter((o) => o.isCorrect).length;
    if (correct === 0) errors.push("No correct option marked");
    if (correct > 1 && q.type === "mcq") errors.push("Only 1 correct option allowed for MCQ");
  } else if (q.type === "multi_correct") {
    if (!q.options || q.options.length < 2) errors.push("Needs at least 2 options");
    const correct = (q.options || []).filter((o) => o.isCorrect).length;
    if (correct === 0) errors.push("No correct options marked");
  } else if (q.type === "numerical") {
    if (!q.correctAnswer) errors.push("Numerical answer required");
  }

  q.validationErrors = errors;
  q.isValid = errors.length === 0;
}

function createQuestionCardElement(q, displayNum) {
  const card = document.createElement("div");
  card.className = `q-card ${q.isValid ? "" : "has-error"}`;
  card.id = `card_${q.tempId}`;

  // Header
  const header = `
    <div class="q-card-header">
      <div class="q-card-meta">
        <span class="q-number">#${displayNum}</span>
        <select class="q-type-select" data-action="change-type" data-id="${q.tempId}">
          <option value="mcq" ${q.type === "mcq" ? "selected" : ""}>MCQ (Single)</option>
          <option value="multi_correct" ${q.type === "multi_correct" ? "selected" : ""}>Multi-Correct</option>
          <option value="numerical" ${q.type === "numerical" ? "selected" : ""}>Numerical</option>
          <option value="assertion_reason" ${q.type === "assertion_reason" ? "selected" : ""}>Assertion-Reason</option>
          <option value="subjective" ${q.type === "subjective" ? "selected" : ""}>Subjective</option>
        </select>
        <select class="q-diff-select" data-action="change-diff" data-id="${q.tempId}">
          <option value="easy" ${q.difficulty === "easy" ? "selected" : ""}>Easy</option>
          <option value="medium" ${q.difficulty === "medium" ? "selected" : ""}>Medium</option>
          <option value="hard" ${q.difficulty === "hard" ? "selected" : ""}>Hard</option>
        </select>
      </div>
      <div class="q-card-actions">
        <button class="q-btn-delete" title="Delete Question" data-action="delete-q" data-id="${q.tempId}">
          <i data-lucide="trash-2" class="icon-sm"></i>
        </button>
      </div>
    </div>
  `;

  // Question Text and Math Preview
  const imageSection = `
    <div class="q-image-container ${q.imageUrl ? "has-image" : ""}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label class="form-label" style="margin-bottom: 0;">
          <i data-lucide="image" class="icon-sm" style="vertical-align: middle; margin-right: 4px;"></i>
          Question Diagram / Figure ${q.pageNumber ? `(Page ${q.pageNumber})` : ""}
        </label>
        <div>
          <input type="file" accept="image/*" class="hidden-input" id="file_q_${q.tempId}" data-action="upload-q-img" data-id="${q.tempId}" />
          <button class="btn-sm-img" onclick="document.getElementById('file_q_${q.tempId}').click()">
            <i data-lucide="upload" class="icon-sm"></i> ${q.imageUrl ? "Replace Diagram" : "Add Diagram"}
          </button>
          ${q.imageUrl ? `
            <button class="btn-sm-img btn-danger-img" data-action="remove-q-img" data-id="${q.tempId}">
              <i data-lucide="trash" class="icon-sm"></i> Remove
            </button>
          ` : ""}
        </div>
      </div>
      ${q.imageUrl ? `
        <div class="q-image-preview-row">
          <div class="q-image-thumb-wrapper">
            <a href="${escapeHtml(q.imageUrl)}" target="_blank" title="View Full Resolution">
              <img src="${escapeHtml(q.imageUrl)}" class="q-image-thumb" alt="Question Diagram" />
            </a>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const textSection = `
    <div class="q-text-section">
      <label class="form-label">Question Text (LaTeX in $...$)</label>
      <textarea class="q-textarea" data-action="edit-text" data-id="${q.tempId}">${escapeHtml(q.text)}</textarea>
      <div class="math-preview-box math-render-target" data-tex="${escapeHtml(q.text)}">${escapeHtml(q.text)}</div>
      ${imageSection}
    </div>
  `;

  // Options Section (for MCQ / Multi-correct / Assertion-Reason)
  let optionsSection = "";
  if (["mcq", "multi_correct", "assertion_reason"].includes(q.type)) {
    const optionsHtml = (q.options || [])
      .map(
        (opt, optIdx) => `
        <div class="q-option-row ${opt.isCorrect ? "is-correct-row" : ""}">
          <button
            class="q-option-correct-btn ${opt.isCorrect ? "active" : ""}"
            data-action="toggle-correct"
            data-qid="${q.tempId}"
            data-oidx="${optIdx}"
            title="Mark as correct answer"
          ></button>
          ${opt.imageUrl ? `
            <div class="opt-image-thumb-wrapper">
              <a href="${escapeHtml(opt.imageUrl)}" target="_blank">
                <img src="${escapeHtml(opt.imageUrl)}" class="opt-image-thumb" alt="Opt ${optIdx + 1}" />
              </a>
            </div>
          ` : ""}
          <input
            type="text"
            class="q-option-input"
            value="${escapeHtml(opt.text)}"
            data-action="edit-opt-text"
            data-qid="${q.tempId}"
            data-oidx="${optIdx}"
            placeholder="Option text..."
          />
          <div class="q-option-preview math-render-target" data-tex="${escapeHtml(opt.text)}">${escapeHtml(opt.text)}</div>
          <input type="file" accept="image/*" class="hidden-input" id="file_opt_${q.tempId}_${optIdx}" data-action="upload-opt-img" data-qid="${q.tempId}" data-oidx="${optIdx}" />
          <button class="opt-img-action-btn" title="${opt.imageUrl ? 'Replace option image' : 'Attach option image'}" onclick="document.getElementById('file_opt_${q.tempId}_${optIdx}').click()">
            <i data-lucide="image" class="icon-sm"></i>
          </button>
          ${opt.imageUrl ? `
            <button class="opt-img-action-btn" title="Remove option image" data-action="remove-opt-img" data-qid="${q.tempId}" data-oidx="${optIdx}">
              <i data-lucide="image-minus" class="icon-sm"></i>
            </button>
          ` : ""}
          <button class="q-option-del" data-action="delete-opt" data-qid="${q.tempId}" data-oidx="${optIdx}" title="Delete option">
            <i data-lucide="x" class="icon-sm"></i>
          </button>
        </div>
      `
      )
      .join("");

    optionsSection = `
      <div class="q-options-wrapper">
        <label class="form-label">Options (Click circle to set correct answer)</label>
        ${optionsHtml}
        <button class="q-add-opt-btn" data-action="add-opt" data-id="${q.tempId}">+ Add Option</button>
      </div>
    `;
  } else if (q.type === "numerical") {
    optionsSection = `
      <div class="form-group">
        <label class="form-label">Correct Numerical Answer</label>
        <input
          type="text"
          class="form-control"
          data-action="edit-numerical"
          data-id="${q.tempId}"
          value="${escapeHtml(q.correctAnswer || "")}"
          placeholder="e.g. 9.8 or 42"
        />
      </div>
    `;
  }

  // Explanation and Metadata
  const footerSection = `
    <div class="q-footer-grid">
      <div class="form-group">
        <label class="form-label">Explanation / Solution</label>
        <input
          type="text"
          class="form-control"
          data-action="edit-explanation"
          data-id="${q.tempId}"
          value="${escapeHtml(q.explanation || "")}"
          placeholder="Step-by-step solution..."
        />
      </div>
      <div class="form-group">
        <label class="form-label">Marks</label>
        <input
          type="number"
          class="form-control"
          data-action="edit-marks"
          data-id="${q.tempId}"
          value="${q.marks}"
        />
      </div>
      <div class="form-group">
        <label class="form-label">Negative Marks</label>
        <input
          type="number"
          class="form-control"
          data-action="edit-neg-marks"
          data-id="${q.tempId}"
          value="${q.negativeMarks}"
        />
      </div>
    </div>
  `;

  // Validation Warnings
  let errorBanner = "";
  if (!q.isValid && q.validationErrors && q.validationErrors.length > 0) {
    errorBanner = `
      <div class="error-banner">
        ⚠ ${q.validationErrors.join(" | ")}
      </div>
    `;
  }

  card.innerHTML = `${header}${textSection}${optionsSection}${footerSection}${errorBanner}`;

  // Attach card event delegation
  attachCardEvents(card, q);

  return card;
}

function attachCardEvents(card, q) {
  // Change Type
  card.querySelector('[data-action="change-type"]').addEventListener("change", (e) => {
    q.type = e.target.value;
    if (["mcq", "multi_correct", "assertion_reason"].includes(q.type) && (!q.options || q.options.length === 0)) {
      q.options = [
        { text: "Option A", isCorrect: true, orderIndex: 0 },
        { text: "Option B", isCorrect: false, orderIndex: 1 },
      ];
    }
    renderQuestions();
  });

  // Change Difficulty
  card.querySelector('[data-action="change-diff"]').addEventListener("change", (e) => {
    q.difficulty = e.target.value;
  });

  // Delete Question
  card.querySelector('[data-action="delete-q"]').addEventListener("click", () => {
    state.questions = state.questions.filter((item) => item.tempId !== q.tempId);
    renderQuestions();
  });

  // Edit Question Text
  const textarea = card.querySelector('[data-action="edit-text"]');
  const previewBox = card.querySelector(".math-preview-box");
  textarea.addEventListener("input", (e) => {
    q.text = e.target.value;
    previewBox.textContent = q.text;
    renderMathInElement(previewBox);
    validateQuestion(q);
    updateStatsBar();
  });

  // Options events
  card.querySelectorAll('[data-action="toggle-correct"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const oIdx = Number(e.currentTarget.dataset.oidx);
      if (q.type === "mcq" || q.type === "assertion_reason") {
        q.options.forEach((opt, idx) => {
          opt.isCorrect = idx === oIdx;
        });
      } else {
        q.options[oIdx].isCorrect = !q.options[oIdx].isCorrect;
      }
      renderQuestions();
    });
  });

  card.querySelectorAll('[data-action="edit-opt-text"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const oIdx = Number(e.target.dataset.oidx);
      q.options[oIdx].text = e.target.value;
      const preview = e.target.nextElementSibling;
      if (preview) {
        preview.textContent = e.target.value;
        renderMathInElement(preview);
      }
    });
  });

  card.querySelectorAll('[data-action="delete-opt"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const oIdx = Number(e.currentTarget.dataset.oidx);
      q.options.splice(oIdx, 1);
      renderQuestions();
    });
  });

  const btnAddOpt = card.querySelector('[data-action="add-opt"]');
  if (btnAddOpt) {
    btnAddOpt.addEventListener("click", () => {
      q.options.push({
        text: `New option`,
        isCorrect: false,
        orderIndex: q.options.length,
      });
      renderQuestions();
    });
  }

  // Numerical Answer
  const numInput = card.querySelector('[data-action="edit-numerical"]');
  if (numInput) {
    numInput.addEventListener("input", (e) => {
      q.correctAnswer = e.target.value;
      validateQuestion(q);
      updateStatsBar();
    });
  }

  // Explanation
  card.querySelector('[data-action="edit-explanation"]').addEventListener("input", (e) => {
    q.explanation = e.target.value;
  });

  // Marks & Negative Marks
  card.querySelector('[data-action="edit-marks"]').addEventListener("input", (e) => {
    q.marks = Number(e.target.value) || 0;
  });
  card.querySelector('[data-action="edit-neg-marks"]').addEventListener("input", (e) => {
    q.negativeMarks = Number(e.target.value) || 0;
  });

  // Question Diagram Upload / Replace
  const qImgUpload = card.querySelector('[data-action="upload-q-img"]');
  if (qImgUpload) {
    qImgUpload.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);
      formData.append("tenantId", state.selectedTenantId || "default");
      formData.append("prefix", `q_${q.tempId}`);

      try {
        const res = await fetch("/api/upload-image", { method: "POST", body: formData });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Upload failed");

        q.imageUrl = json.url;
        renderQuestions();
      } catch (err) {
        alert("Failed to upload image: " + err.message);
      }
    });
  }

  // Remove Question Diagram
  const btnRemoveQImg = card.querySelector('[data-action="remove-q-img"]');
  if (btnRemoveQImg) {
    btnRemoveQImg.addEventListener("click", () => {
      delete q.imageUrl;
      renderQuestions();
    });
  }

  // Option Image Upload
  card.querySelectorAll('[data-action="upload-opt-img"]').forEach((input) => {
    input.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const oIdx = Number(e.target.dataset.oidx);

      const formData = new FormData();
      formData.append("image", file);
      formData.append("tenantId", state.selectedTenantId || "default");
      formData.append("prefix", `q_${q.tempId}_opt_${oIdx}`);

      try {
        const res = await fetch("/api/upload-image", { method: "POST", body: formData });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Upload failed");

        q.options[oIdx].imageUrl = json.url;
        renderQuestions();
      } catch (err) {
        alert("Failed to upload option image: " + err.message);
      }
    });
  });

  // Remove Option Image
  card.querySelectorAll('[data-action="remove-opt-img"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const oIdx = Number(e.currentTarget.dataset.oidx);
      delete q.options[oIdx].imageUrl;
      renderQuestions();
    });
  });
}

function updateStatsBar() {
  let valid = 0;
  let issues = 0;
  state.questions.forEach((q) => {
    if (q.isValid) valid++;
    else issues++;
  });
  statValidCount.textContent = valid;
  statIssueCount.textContent = issues;
}

function addBlankQuestion() {
  const tempId = `cand_blank_${Date.now()}`;
  state.questions.unshift({
    tempId,
    type: "mcq",
    text: "New Question Statement",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 0,
    options: [
      { text: "Option A", isCorrect: true, orderIndex: 0 },
      { text: "Option B", isCorrect: false, orderIndex: 1 },
      { text: "Option C", isCorrect: false, orderIndex: 2 },
      { text: "Option D", isCorrect: false, orderIndex: 3 },
    ],
    isValid: true,
  });
  reviewSection.classList.remove("hidden");
  renderQuestions();
}

// ── Math Rendering (KaTeX) ───────────────────────────────────────────
function renderAllMath() {
  if (!window.renderMathInElement) return;
  document.querySelectorAll(".math-render-target").forEach((el) => {
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
    });
  });
}

function renderMathInSingleElement(element) {
  if (!window.renderMathInElement) return;
  renderMathInElement(element, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
}

// ── JSON Paste & Sample Logic ────────────────────────────────────────
function handleApplyRawJson() {
  try {
    const raw = rawJsonInput.value.trim();
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.questions = Array.isArray(parsed) ? parsed : [parsed];
    state.questions.forEach((q, idx) => {
      q.tempId = q.tempId || `cand_json_${Date.now()}_${idx}`;
      q.difficulty = q.difficulty || "medium";
      q.marks = q.marks || 4;
      q.negativeMarks = q.negativeMarks || 0;
      validateQuestion(q);
    });
    jsonModal.classList.add("hidden");
    reviewSection.classList.remove("hidden");
    renderQuestions();
  } catch (err) {
    alert(`Invalid JSON format: ${err.message}`);
  }
}

function loadSamplePhysicsQuestions() {
  rawJsonInput.value = JSON.stringify(
    [
      {
        type: "mcq",
        text: "The kinetic energy of a particle of mass $m$ moving with velocity $v$ is given by $K = \\frac{1}{2}mv^2$. If the momentum is doubled, by what factor does the kinetic energy increase?",
        topic: "Mechanics",
        difficulty: "easy",
        marks: 4,
        negativeMarks: -1,
        explanation: "Since $K = \\frac{p^2}{2m}$, if momentum $p$ is doubled to $2p$, the new kinetic energy becomes $K' = \\frac{(2p)^2}{2m} = 4K$.",
        options: [
          { text: "2 times", isCorrect: false, orderIndex: 0 },
          { text: "4 times", isCorrect: true, orderIndex: 1 },
          { text: "8 times", isCorrect: false, orderIndex: 2 },
          { text: "Remains the same", isCorrect: false, orderIndex: 3 },
        ],
      },
      {
        type: "numerical",
        text: "A projectile is fired at an angle of $45^\\circ$ with initial speed $v_0 = 20\\text{ m/s}$. Taking $g = 10\\text{ m/s}^2$, find its maximum range $R = \\frac{v_0^2}{g}$ in meters.",
        topic: "Kinematics",
        difficulty: "medium",
        marks: 4,
        negativeMarks: 0,
        correctAnswer: "40",
        explanation: "Maximum range occurs at $45^\\circ$: $R = \\frac{20^2}{10} = \\frac{400}{10} = 40$ meters.",
        options: [],
      },
      {
        type: "multi_correct",
        text: "Which of the following physical quantities have the dimensions of $\\text{ML}^2\\text{T}^{-2}$?",
        topic: "Units and Dimensions",
        difficulty: "medium",
        marks: 4,
        negativeMarks: -1,
        explanation: "Work, Kinetic Energy, and Torque all share the dimension $[ML^2T^{-2}]$.",
        options: [
          { text: "Work done ($W = F \\cdot d$)", isCorrect: true, orderIndex: 0 },
          { text: "Torque ($\\tau = r \\times F$)", isCorrect: true, orderIndex: 1 },
          { text: "Power ($P = \\frac{W}{t}$)", isCorrect: false, orderIndex: 2 },
          { text: "Kinetic energy", isCorrect: true, orderIndex: 3 },
        ],
      },
    ],
    null,
    2
  );
}

// ── Database Seeding ─────────────────────────────────────────────────
function openSeedModal() {
  if (!state.selectedTenantId) {
    alert("Please select a target school / tenant in Step 1 first.");
    return;
  }
  if (!selectSubject.value) {
    alert("Please select a target Subject in Step 1 first.");
    return;
  }
  if (!selectAuthor.value) {
    alert("Please select an Author/Teacher in Step 1 first.");
    return;
  }
  if (state.questions.length === 0) {
    alert("No questions to seed.");
    return;
  }

  // Populate Summary
  const tenantObj = state.tenants.find((t) => t.id === state.selectedTenantId);
  document.getElementById("seedSchoolName").textContent = tenantObj ? tenantObj.name : state.selectedTenantId;
  document.getElementById("seedSubjectName").textContent =
    selectSubject.options[selectSubject.selectedIndex]?.text || "-";
  document.getElementById("seedChapterName").textContent =
    selectChapter.options[selectChapter.selectedIndex]?.text || "No Chapter";
  document.getElementById("seedClassName").textContent =
    selectClass.options[selectClass.selectedIndex]?.text || "No Class";
  document.getElementById("seedAuthorName").textContent =
    selectAuthor.options[selectAuthor.selectedIndex]?.text || "-";
  document.getElementById("seedQuestionCount").textContent = state.questions.length;

  seedStatusBox.classList.add("hidden");
  seedSuccessAlert.classList.add("hidden");
  btnConfirmSeed.disabled = false;
  btnCancelSeed.disabled = false;

  seedModal.classList.remove("hidden");
}

async function executeDatabaseSeeding() {
  btnConfirmSeed.disabled = true;
  btnCancelSeed.disabled = true;
  seedStatusBox.classList.remove("hidden");
  seedStatusMessage.textContent = `Seeding ${state.questions.length} questions into tenant database...`;

  const payload = {
    tenantId: state.selectedTenantId,
    subjectId: selectSubject.value,
    chapterId: selectChapter.value || null,
    classId: selectClass.value || null,
    createdBy: selectAuthor.value,
    questions: state.questions,
  };

  try {
    const res = await fetch("/api/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || "Failed to seed questions");
    }

    seedStatusBox.classList.add("hidden");
    seedSuccessAlert.classList.remove("hidden");
    seedSuccessText.textContent = `Successfully inserted ${json.insertedCount} questions. They are now visible in the Teacher Question Bank.`;

    btnCancelSeed.disabled = false;
    btnCancelSeed.textContent = "Done";
  } catch (err) {
    seedStatusBox.classList.add("hidden");
    alert(`Database Ingestion Error: ${err.message}`);
    btnConfirmSeed.disabled = false;
    btnCancelSeed.disabled = false;
  }
}

// ── Utility ──────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
