# Graph Report - .  (2026-10-13)

## Corpus Check
- Corpus is ~6,033 words - fits in a single context window. You may not need a graph.

## Summary
- 150 nodes · 186 edges · 8 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.5)
- Token cost: 1,200 input · 350 output

## Community Hubs (Navigation)
- Frontend UI State & DOM Elements
- Backend Server & Gemini Pipeline
- Client-side Extraction & Verification Studio
- Production Dependencies & Ecosystem
- Development Tooling & TypeScript Typings
- TypeScript Compilation & Path Aliases
- Project Metadata & NPM Scripts
- Studio Views & Workflows

## God Nodes (most connected - your core abstractions)
1. `setupEventListeners()` - 11 edges
2. `compilerOptions` - 10 edges
3. `renderQuestions()` - 9 edges
4. `attachCardEvents()` - 5 edges
5. `TenantSeederService` - 5 edges
6. `QuestionCandidate` - 5 edges
7. `validateQuestion()` - 4 edges
8. `createQuestionCardElement()` - 4 edges
9. `handleApplyRawJson()` - 4 edges
10. `GeminiExtractorService` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 0 thin omitted)

### Community 0 - "Frontend UI State & DOM Elements"
Cohesion: 0.04
Nodes (44): badgeSeedCount, btnAddBlankQuestion, btnApplyRawJson, btnCancelSeed, btnClearAllQuestions, btnCloseJsonModal, btnCloseSeedModal, btnCloseSettingsModal (+36 more)

### Community 1 - "Backend Server & Gemini Pipeline"
Cohesion: 0.12
Nodes (19): app, publicDir, upload, ExtractionOptions, GeminiExtractorService, backendEnvPath, TenantSeederService, ChapterItem (+11 more)

### Community 2 - "Client-side Extraction & Verification Studio"
Cohesion: 0.16
Nodes (17): addBlankQuestion(), attachCardEvents(), createQuestionCardElement(), escapeHtml(), executeDatabaseSeeding(), handleApplyRawJson(), handleFileSelected(), loadSamplePhysicsQuestions() (+9 more)

### Community 3 - "Production Dependencies & Ecosystem"
Cohesion: 0.13
Nodes (15): cors, dotenv, drizzle-orm, express, multer, dependencies, cors, dotenv (+7 more)

### Community 4 - "Development Tooling & TypeScript Typings"
Cohesion: 0.13
Nodes (15): devDependencies, tsx, @types/cors, @types/express, @types/multer, @types/node, @types/pg, typescript (+7 more)

### Community 5 - "TypeScript Compilation & Path Aliases"
Cohesion: 0.13
Nodes (14): ../../examprep-backend/node_modules/drizzle-orm, src/**/*, compilerOptions, baseUrl, esModuleInterop, module, moduleResolution, paths (+6 more)

### Community 6 - "Project Metadata & NPM Scripts"
Cohesion: 0.25
Nodes (7): description, main, name, scripts, dev, start, version

### Community 7 - "Studio Views & Workflows"
Cohesion: 0.50
Nodes (4): PDF Upload & Multimodal AI Extraction View, Question Bank Seeder Studio UI, Interactive Question Verification Studio, Tenant & Curriculum Setup Form

## Knowledge Gaps
- **88 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+83 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Production Dependencies & Ecosystem` to `Project Metadata & NPM Scripts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Development Tooling & TypeScript Typings` to `Project Metadata & NPM Scripts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `setupEventListeners()` (e.g. with `addBlankQuestion()` and `executeDatabaseSeeding()`) actually correct?**
  _`setupEventListeners()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _88 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI State & DOM Elements` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `Backend Server & Gemini Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.12169312169312169 - nodes in this community are weakly interconnected._
- **Should `Production Dependencies & Ecosystem` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._