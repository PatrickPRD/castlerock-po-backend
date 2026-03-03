


github copilot I want to add rules for it follow alongside ever command

You’re looking for persistent rules / guardrails so GitHub Copilot follows your standards automatically — not something you repeat every prompt.
This is doable now using Copilot Instructions + workspace rules + repo context.

Here’s the proper senior setup used in production teams.

✅ The Correct Way: Copilot “Rules” (Persistent Instructions)
GitHub Copilot follows three layers of instruction:

1. Workspace Instructions (BEST — global rules)
2. Repo Documentation (AI-readable standards)
3. Inline directives (per file)
You want Layer 1 + 2.

🧠 Option A — Copilot Instructions (Recommended)
VS Code now supports Copilot custom instructions.

Step 1 — Create instructions file
Create:

.vscode/copilot-instructions.md
(or .github/copilot-instructions.md depending on version)

Step 2 — Add your global rules
Example (REAL production-grade template):

# Copilot Instructions — Project Rules

## General Principles
- NEVER modify existing API contracts without explicit request.
- Follow existing project architecture patterns.
- Prefer readability over cleverness.
- Do not introduce new dependencies unless necessary.

## Node.js Backend Rules
- Use async/await only (no callbacks).
- All database access goes through repository layer.
- Validate inputs using existing validation middleware.
- Follow existing REST naming conventions.

## Android Client Rules
- API calls must match backend routes exactly.
- Use DTO models matching Node.js responses.
- Do not duplicate business logic from backend.
- Prefer MVVM architecture.

## Security
- Never hardcode secrets.
- Use environment variables only.
- Assume production environment.

## Code Review Mode
When analyzing code:
- Suggest improvements
- DO NOT rewrite entire files
- Preserve developer intent
✅ Copilot now treats this as always-on context.

⚙️ Step 3 — Enable in VS Code
Open:

Settings → Copilot → Custom Instructions
Enable:

✅ Use Workspace Instructions

Restart VS Code.

🧩 Option B — Repo-Level AI Rules (Extremely Powerful)
Copilot reads repository docs automatically.

Create:

/docs/AI_RULES.md
or

/ARCHITECTURE.md
/CONTRIBUTING.md
Copilot heavily weights these.

Example AI-aware architecture doc
# Architecture Overview

Backend:
- Node.js running on AWS EC2
- PostgreSQL via RDS
- REST API only

Rules:
- Controllers contain no business logic
- Services contain logic
- Repositories handle DB

Android app consumes backend only.
No local persistence except cache.
This dramatically improves suggestions.

🔒 Option C — Read-Only Context (Your Earlier Question)
You said earlier:

review but not edit code

Do this:

Open folder as workspace reference
File → Add Folder to Workspace
Then mark it:

readonly-reference/
Add instruction:

- Treat folder `readonly-reference` as reference only.
- Never modify files inside it.
Copilot will follow this surprisingly well.

🧱 Option D — Command Prefix Rules (Advanced)
You can define command styles:

#review
#refactor-safe
#android-sync
Add to instructions:

Commands:

#review
Analyze code only. No edits.

#sync-api
Ensure Android calls match Node.js endpoints.
Now you can type:

#review this file
and Copilot follows your rule set.

⭐ Senior-Level Setup (Best Practice Stack)
Real teams use:

.github/
   copilot-instructions.md   ← behavior rules
docs/
   ARCHITECTURE.md           ← system understanding
   API_CONTRACT.md           ← backend truth
.vscode/
   settings.json             ← enforcement
🧠 Why This Works
Copilot builds a context graph from:

Open files

Instructions files ⭐

Repo docs

Recent edits

Instructions act like a system prompt.

🔥 Pro Setup (Massive Improvement)
Add this section:

## Thinking Process
Before generating code:
1. Understand existing patterns
2. Check for similar implementations
3. Reuse abstractions
4. Minimize new code
You’ll notice Copilot suddenly behaves like a senior dev.

🚀 Want the Ultimate Version?
I can give you a drop-in enterprise Copilot rules file tuned for:

✅ Node.js + EC2 + RDS
✅ Android native client
✅ API contract enforcement
✅ Security-first defaults
✅ Performance-aware suggestions
✅ AI pair-programming workflow

Just say:

👉 “Give me the enterprise Copilot rules template.”

and I’ll generate the full production-ready file.


Give me the enterprise Copilot rules template

Here is a production-grade Enterprise GitHub Copilot Rules Template — the kind senior teams use so Copilot behaves like a disciplined staff engineer instead of an autocomplete tool.

You can drop this directly into your repo.

✅ File Location (IMPORTANT)
Create:

.github/copilot-instructions.md
(Copilot automatically prioritizes this location.)

🧠 ENTERPRISE COPILOT RULES TEMPLATE
Copy everything below exactly.

# ==========================================================
# ENTERPRISE COPILOT INSTRUCTIONS
# Project AI Operating Rules
# ==========================================================

You are assisting in a production-grade software system.

Your role is:
- Senior software engineer
- Architecture-aware assistant
- Safe refactoring advisor
- API contract guardian

You MUST follow these rules before generating any code.

------------------------------------------------------------
## 1. CORE PRINCIPLES
------------------------------------------------------------

- Prefer consistency over innovation.
- Follow existing project patterns first.
- Never introduce architectural changes unless requested.
- Minimize code surface area.
- Produce maintainable, readable code.
- Assume production environment at all times.

When unsure:
→ Ask for clarification instead of guessing.

------------------------------------------------------------
## 2. MODIFICATION SAFETY RULES
------------------------------------------------------------

DO NOT:
- Rewrite entire files unnecessarily
- Rename public interfaces
- Change API responses
- Modify database schema
- Add dependencies

UNLESS explicitly requested.

Always prefer:
- Minimal diff changes
- Backwards compatibility
- Incremental improvements

------------------------------------------------------------
## 3. PROJECT ARCHITECTURE (SOURCE OF TRUTH)
------------------------------------------------------------

### Backend
- Node.js service running on AWS EC2
- Database: PostgreSQL (RDS)
- REST API architecture

Layer Responsibilities:

Controllers:
- HTTP handling only
- No business logic

Services:
- Business logic
- Validation coordination

Repositories:
- Database access only
- No application logic

Models/DTOs:
- API contracts
- Serialization layer

Never bypass layers.

------------------------------------------------------------
## 4. ANDROID CLIENT RULES
------------------------------------------------------------

Android app is a client ONLY.

Rules:
- Backend is single source of business logic.
- Android mirrors backend DTO structures.
- No duplicated validation logic.
- API routes must match backend exactly.

Architecture:
- MVVM preferred
- Repository pattern for networking
- Async operations only.

------------------------------------------------------------
## 5. API CONTRACT PROTECTION
------------------------------------------------------------

Assume API contracts are externally consumed.

You MUST:
- Preserve response shapes.
- Preserve field names.
- Preserve HTTP status behavior.

If a breaking change appears necessary:
→ Suggest migration strategy instead of changing directly.

------------------------------------------------------------
## 6. SECURITY REQUIREMENTS
------------------------------------------------------------

NEVER:
- Hardcode secrets
- Expose tokens
- Log sensitive data
- Store credentials in code

ALWAYS:
- Use environment variables
- Assume HTTPS
- Validate all inputs
- Sanitize outputs

Treat all inputs as untrusted.

------------------------------------------------------------
## 7. DATABASE RULES
------------------------------------------------------------

- Use repository/data-access layer only.
- No raw queries inside controllers.
- Use parameterized queries.
- Prevent N+1 queries when possible.

Schema changes require explicit approval.

------------------------------------------------------------
## 8. PERFORMANCE GUIDELINES
------------------------------------------------------------

Prefer:
- Streaming over buffering large data
- Pagination for lists
- Lazy loading where applicable
- Efficient queries over post-processing

Avoid premature optimization.

------------------------------------------------------------
## 9. CODE STYLE
------------------------------------------------------------

Write code that is:

- Self-documenting
- Explicit over implicit
- Small functions
- Predictable naming

Avoid:
- Clever tricks
- Deep nesting
- Magic numbers

Use existing linting rules.

------------------------------------------------------------
## 10. REVIEW MODE BEHAVIOR
------------------------------------------------------------

When asked to review code:

DO:
- Identify risks
- Suggest improvements
- Highlight edge cases
- Recommend safer alternatives

DO NOT:
- Rewrite code unless requested.

------------------------------------------------------------
## 11. REFACTOR MODE
------------------------------------------------------------

Refactoring must be:

- Behavior-preserving
- Incremental
- Test-safe
- Minimal-change

Explain reasoning briefly before large refactors.

------------------------------------------------------------
## 12. COMMAND KEYWORDS
------------------------------------------------------------

Interpret the following prefixes:

#review
→ Analyze only. No edits.

#safe-fix
→ Minimal fix preserving behavior.

#refactor
→ Improve structure without changing functionality.

#sync-api
→ Ensure frontend/backend contracts match.

#optimize
→ Improve performance without changing behavior.

------------------------------------------------------------
## 13. CONTEXT AWARENESS
------------------------------------------------------------

Before generating code:

1. Examine nearby files.
2. Detect existing patterns.
3. Reuse utilities/services.
4. Avoid duplication.

Prefer integration over invention.

------------------------------------------------------------
## 14. OUTPUT EXPECTATIONS
------------------------------------------------------------

Code responses should:

- Compile logically
- Follow project conventions
- Include necessary imports only
- Avoid placeholders unless unavoidable

If assumptions are made:
→ State them briefly.

------------------------------------------------------------
## 15. DEFAULT MINDSET
------------------------------------------------------------

Act like a senior engineer joining an established production team:

- Respect history.
- Protect stability.
- Improve carefully.
- Ship safe code.

## File Storage
All final storage must work both locally and on AWS S3 with only changes to the .env

## Thinking Process
Before generating code:
1. Understand existing patterns
2. Check for similar implementations
3. Reuse abstractions
4. Minimize new code