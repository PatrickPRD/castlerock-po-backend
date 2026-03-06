
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

## Backup
All new systems must work with previously created backup system and must follow its principles
All new systems must be included in the backup system if they store any data
Users must never be backed up 

## DB
All schema changes must be made through migrations. Migrations must be idempotent and handle existing data gracefully.
The system must be resilient to migration failures and support rollbacks.
The system must check the DB state before applying migrations and skip already applied ones.

## Thinking Process
Before generating code:
1. Understand existing patterns
2. Check for similar implementations
3. Reuse abstractions
4. Minimize new code

## UI
Use Bootstrap 5 for all UI components. Follow existing styles and patterns.
Use existing components where possible. Avoid introducing new UI libraries or frameworks.
Use Modal for all forms and dialogs. Follow existing modal patterns.
Use Modal for all CRUD operations. Follow existing modal patterns.
Use exising toastings components where possible. Avoid introducing new UI libraries or frameworks.

## Audit
Can we make that all new systems are automatically included in the audit system.

## Inline Tag Input System — Mandatory Standard for All Tag UI Across This App

You are helping develop a web application. This document defines the ONLY approved
pattern for any tag input, label selector, category picker, multi-select chip UI,
or any feature where a user adds/removes multiple string values to a field.

This pattern MUST be applied universally. Do not deviate, do not suggest alternatives
(react-select, downshift, tagify, choices.js, etc.), and do not use native HTML
elements like <select multiple> for this purpose. When in doubt, use this system.

---

### SCOPE — WHERE THIS APPLIES

Apply this pattern to every instance of the following across the entire codebase:
  - Photo / media tagging fields
  - Blog post or article tag inputs
  - Product category or label selectors
  - User skill or interest pickers
  - Search filter chips
  - Recipient / mention fields (e.g. @user inputs)
  - Any form field that accepts multiple freeform or predefined string values

If you are writing a new component, page, form, or feature and it involves
selecting or entering multiple values — use this system. No exceptions.

---

### COMPONENT ANATOMY

The tag input consists of three layers:
1. TAG FIELD — a flex container (div) that holds chips + a ghost input inline
2. CHIPS — pill elements rendered inside the field, one per confirmed tag
3. DROPDOWN — an absolutely-positioned suggestion list anchored below the field

HTML structure must always follow this exact pattern:
  <div class="tag-field" role="group" aria-label="{context} tags">
    <!-- .chip elements injected here by JS, before the input -->
    <input
      type="text"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      aria-expanded="false"
    >
    <div class="dropdown" role="listbox"></div>
  </div>

Never use <form>, <select>, <datalist>, or any third-party component library
widget as a substitute for this structure.

---

### DATA MODEL

Each tag is a plain object: { label: string, type: string }

Tag types map to color tokens. Extend this list as needed for new domains,
but never remove or reassign existing entries:
  people → purple  (#a78bfa)
  place  → green   (#34d399)
  mood   → amber   (#fbbf24)
  object → blue    (#60a5fa)

When adding a new tag context to the app (e.g. "skills", "ingredients", "topics"):
  1. Define a new type key and color token in the shared TYPE_COLOR config
  2. Use that type when calling addTag()
  3. Do NOT invent a parallel chip/badge system with different colors or markup

The suggestions array is a flat list of { label, type } objects.
Define it as a named const at module/component level so it can be swapped
per context without changing the component logic.

Active state (tags[]) lives in JS memory only — never use the DOM as source
of truth. Re-render chips from the tags array on every mutation.

---

### CORE LOGIC RULES

These functions must exist in every implementation of this component.
Do not rename them. In framework components, they become methods or handlers
but must preserve the same behavior contract.

addTag(label, type):
  - Trim whitespace before processing
  - Reject empty strings silently
  - Reject duplicates — case-insensitive label comparison against existing tags[]
  - Push { label, type } to tags[]
  - Call renderChips()
  - Clear input.value
  - Call closeDropdown()
  - Refocus input

removeTag(index):
  - Splice tags[] at the given index
  - Call renderChips()
  - Refocus input

renderChips():
  - Remove all existing .chip elements (querySelectorAll(".chip").forEach remove)
  - For each tag in tags[], create a .chip div with data-type attribute
  - Include an × button inside each chip with aria-label="Remove {tag.label}"
  - Insert via field.insertBefore(chip, input) to keep chips before the cursor
  - Animate chip entrance: spring keyframe on transform scale + opacity

openDropdown(query):
  - Filter suggestions: case-insensitive substring match against query
  - Exclude labels already present in tags[]
  - Cap results at 8–10 items max
  - Group results by type with a plain-text group label header row
  - Highlight the matching substring using <mark> (no background, colored text)
  - Empty state when no matches: show 'Press Enter to add "{query}"'
  - If query is empty: call closeDropdown() instead

closeDropdown():
  - Hide dropdown (remove .open class or set display none)
  - Clear dropdown innerHTML
  - Reset activeIndex = -1
  - Reset filteredSuggestions = []

setActive(index):
  - Loop all .dropdown-item elements, strip active styles from all
  - Apply type-specific background + border-left color to the active item
  - Store index in activeIndex

---

### KEYBOARD CONTRACT

This keyboard behavior is mandatory on every tag input in the app.
Do not omit any of these bindings.

Key          Action
──────────── ──────────────────────────────────────────────────────────────
ArrowDown    Move activeIndex down (clamp at filteredSuggestions.length - 1)
ArrowUp      Move activeIndex up (clamp at -1, meaning no selection)
Enter        If activeIndex >= 0: addTag from filteredSuggestions[activeIndex]
             Else if input has value: addTag(value, "object") as free-form
, (comma)    preventDefault always; addTag current input value if non-empty
Tab          preventDefault if input has value; addTag current input value
Backspace    If input.value === "" and tags.length > 0: removeTag last tag
Escape       closeDropdown(); input.blur()

---

### FOCUS AND BLUR HANDLING

on input focus:
  - Add .focused class to .tag-field
  - Set aria-expanded="true" on input
  - If input.value has >= 1 character, re-open dropdown

on input blur:
  - Remove .focused class
  - Set aria-expanded="false" on input
  - Use setTimeout(closeDropdown, 150) — this delay is mandatory.
    Without it, mousedown on dropdown items fires after blur and the
    click is lost. Do not remove this delay.

Clicking anywhere on .tag-field background must delegate focus to the input.
Attach a click listener on .tag-field that calls input.focus() when
e.target === field.

---

### CSS RULES

.tag-field:
  display: flex;
  flex-wrap: wrap;       ← chips and input wrap to new lines naturally
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  min-height: 52px;
  border-radius: 14px;
  cursor: text;
  position: relative;   ← required for dropdown absolute positioning

.tag-field.focused:
  Apply border color change + box-shadow glow using the primary brand accent.

.chip:
  display: inline-flex;
  align-items: center;
  border-radius: 20px;
  Per-type background (low opacity ~12–15%), border (~28–30% opacity), text color.
  Animate in with spring keyframe: transform scale(0.7)→scale(1) + opacity 0→1

input (ghost input inside field):
  flex: 1;
  min-width: 140px;     ← prevents collapse on short lines; always keep this
  background: none;
  border: none;
  outline: none;
  caret-color: primary accent

.dropdown:
  position: absolute;
  top: calc(100% + 8px);
  left: 0; right: 0;
  z-index: 99;          ← never set below 50; adjust upward for modals/drawers
  Hidden by default; toggled with .open class (display: block)

.dropdown-item:
  border-left: 2px solid transparent;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  Active state: type-specific bg color + border-left color

mark inside .dropdown-item:
  background: none;
  color: type-specific accent;
  font-weight: 600;

Never use z-index below 50 for the dropdown. In pages with modals, sticky
headers, or drawers, increase z-index accordingly — do not "fix" stacking
issues by changing position on the field itself.

---

### SECURITY — ESCAPING RULE

Any user-provided string injected into innerHTML MUST be escaped first.
Always use an escHtml() helper. Minimum character replacements:
  & → &amp;
  < → &lt;
  > → &gt;
  " → &quot;

This applies to: tag labels in chips, query highlighting in dropdown items,
and the empty-state "Press Enter to add…" message.
Never skip this. Never use template literals with raw user input into innerHTML.

---

### SUGGESTIONS ARCHITECTURE

Vanilla JS:
  Export suggestions as a named const array per context/page.
  Import the right array into each page module.

React / Vue / Svelte:
  Accept suggestions as a required prop.
  The component itself is context-agnostic — the parent passes the list.
  Component signature should be: <TagInput suggestions={[]} onChange={fn} initialTags={[]} />

Async / API-backed suggestions:
  - Debounce the input handler at 250–300ms
  - Show a loading indicator row in the dropdown during fetch
  - On resolve: replace filteredSuggestions with API results
  - On error: show an error state row; do not break the component
  - Keep the same openDropdown(items) rendering pipeline

When adding a new tag input to a new page or feature:
  1. Define a suggestions array specific to that context
  2. Reuse the shared tag-field CSS classes — do not write new chip/pill styles
  3. Instantiate the JS logic from the shared module — do not copy-paste the logic

---

### ACCESSIBILITY — MANDATORY CHECKLIST

Every tag input shipped in this app must satisfy all of the following:
  - .tag-field has role="group" and a descriptive aria-label
  - input has aria-autocomplete="list" and aria-expanded (toggled on open/close)
  - .dropdown has role="listbox"
  - Each .dropdown-item has role="option" and aria-selected="true" when active
  - Each chip × button has aria-label="Remove {tag.label}"
  - A visually-hidden aria-live="polite" region announces additions and removals
    e.g. "golden hour added" / "Tokyo removed"

---

### ANTI-PATTERNS — NEVER DO THESE

- Do NOT use <select multiple> — it cannot render inline chips
- Do NOT use react-select, downshift, tagify, choices.js, or any external
  tag/multi-select library — this custom system is the approved pattern
- Do NOT store tag state in the DOM — always derive render from tags[]
- Do NOT skip the 150ms blur delay on closeDropdown — clicks will be missed
- Do NOT use input type="search" — browser adds a clear button that conflicts
- Do NOT set dropdown z-index below 50
- Do NOT allow duplicate tags — always check before pushing to tags[]
- Do NOT inject user strings into innerHTML without escHtml() escaping
- Do NOT write new CSS classes for chips, pills, badges, or tags —
  reuse the existing .chip system and extend via data-type only
- Do NOT build a parallel "badge" or "label" component that serves the same
  purpose — consolidate into this system instead

---

### WHEN REVIEWING OR REFACTORING CODE

If you encounter any of the following in the codebase, flag it and migrate
it to this system:
  - <select multiple> used for tag-like UI
  - Any third-party multi-select or tag library import
  - Custom pill/badge/chip components that duplicate this pattern
  - Tag inputs missing keyboard navigation
  - Tag inputs that store state in hidden inputs or the DOM
  - Inline chip UIs missing the 150ms blur guard
  - Any chip or pill UI that does not use the shared TYPE_COLOR tokens