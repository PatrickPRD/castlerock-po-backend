# Programme Timeline Builder System — Full Technical Description

## Overview

This is a **construction programme template builder** embedded within an admin form. It lets a user define a list of named stages, each with a start week and duration in weeks, then visualises them as an interactive Gantt-style timeline chart. Templates are stored in a database, reusable, and can be duplicated or deleted. The whole UI is server-rendered (EJS + Bootstrap 5), with a single inline `<script>` block handling all interactivity — no frameworks.

---

## 1. Database Schema (MySQL)

```sql
CREATE TABLE programme_templates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE programme_template_stages (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  programme_template_id   INT NOT NULL,
  stage_name              VARCHAR(150) NOT NULL,
  week_start              INT UNSIGNED NOT NULL,   -- 0-based (week 0, week 1, ...)
  duration_weeks          INT UNSIGNED NOT NULL,   -- must be > 0
  sort_order              INT UNSIGNED NOT NULL DEFAULT 0,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stage_template
    FOREIGN KEY (programme_template_id) REFERENCES programme_templates(id)
    ON DELETE CASCADE,
  INDEX idx_stage_template (programme_template_id),
  INDEX idx_stage_sort (programme_template_id, sort_order)
);
```

- One template → many stages (1:N), cascade delete.
- Stages are ordered by `sort_order ASC, week_start ASC, id ASC`.
- `week_start` is zero-based (W0 = first week). `week_end = week_start + duration_weeks - 1`.
- Total programme duration = `MAX(week_start + duration_weeks)` across all stages.

---

## 2. HTTP Routes

All routes require `super_admin` role (via middleware).

```
GET    /programs                  → list all templates
GET    /programs/new              → render create form
POST   /programs                  → create template (form POST)
GET    /programs/:id/edit         → render edit form
PUT    /programs/:id              → update template (form POST with ?_method=PUT)
POST   /programs/:id/duplicate    → duplicate template (JSON response)
DELETE /programs/:id              → delete template (returns 204)
```

The form uses a hidden `_method=PUT` override pattern for updates (method-override middleware).

---

## 3. Repository Layer (`programmeTemplateRepository.js`)

All functions accept an optional `connection` parameter (defaults to pool), enabling transactions.

```javascript
listTemplates(connection)
// SELECT all templates + LEFT JOIN stage summary (stage_count, MAX(week_start+duration_weeks) AS total_weeks)

getTemplateById(id, connection)
// SELECT single template + stage summary; returns null if not found

getTemplateByName(name, connection)
// SELECT by exact name; used for uniqueness checks

getTemplateByNameExcludingId(name, excludedId, connection)
// SELECT by name excluding self; used on updates

createTemplate({ name, description }, connection)
// INSERT; returns insertId

updateTemplate(id, { name, description }, connection)
// UPDATE; returns affectedRows

deleteTemplate(id, connection)
// DELETE; returns affectedRows (cascade removes stages)

getTemplateStages(templateId, connection)
// SELECT all stages ORDER BY sort_order, week_start, id
// Returns: [{ id, programme_template_id, stage_name, week_start, duration_weeks, sort_order }]

replaceTemplateStages(templateId, stages, connection)
// DELETE all stages for template, then INSERT each stage
// stages format: [{ stageName, weekStart, durationWeeks, sortOrder }]
```

---

## 4. Service Layer (`programmeTemplateService.js`)

**Custom Error Class:**
```javascript
class ProgrammeTemplateError extends Error {
  constructor(message, status = 400, code = 'PROGRAMME_TEMPLATE_ERROR')
  // status: HTTP status code; code: machine-readable string
}
```

### Core Functions

**`parseProgrammeStages(value)`**  
Accepts a JSON string or array. Validates and normalises:
- Each stage needs a non-empty `stageName` (also accepts `stage_name` / `name`)
- `weekStart` must be integer ≥ 0 (also accepts `week_start`)
- `durationWeeks` must be integer > 0 (also accepts `duration_weeks`)
- Stage names must be unique (case-insensitive)
- Returns `{ stages: [...normalizedStages], error: string | null }`

**`getProgrammeDurationWeeks(stages)`**  
Returns `MAX(weekStart + durationWeeks)` across all stages.

**`listProgrammeTemplates()`**  
Returns all templates with summary stats (`stageCount`, `totalWeeks`). No stage detail.

**`listProgrammeTemplatesWithStages()`**  
Returns all templates with full stage arrays attached.

**`getProgrammeTemplateById(templateId)`**  
Returns one template with its stages. Throws `ProgrammeTemplateError(404)` if not found.

**`createProgrammeTemplate({ name, description, programmeData })`**  
Validates name (unique), parses stages, creates template + stages in a single DB transaction. Returns the created template object including `programmeDurationWeeks`.

**`updateProgrammeTemplate(templateId, { name, description, programmeData })`**  
Validates template exists, name unique (excluding self), replaces stages in transaction. Returns updated template.

**`deleteProgrammeTemplate(templateId)`**  
Validates template exists. Deletes (cascade removes stages). Returns `{ id, name }`.

**`duplicateProgrammeTemplate(templateId)`**  
Fetches source template + stages in a transaction, generates a copy name (`"SourceName-[copy]"`, `"SourceName-[copy] 2"`, etc.), creates new template + cloned stages in same transaction. Returns duplicated template + `sourceTemplateId`, `sourceName`.

**`generateTemplateCopyName(sourceName, connection)`**  
Loops checking DB for `"Name-[copy]"`, `"Name-[copy] 2"`, `"Name-[copy] 3"`, etc. until a free name is found.

---

## 5. Controller Layer (`webController.js`)

**`getProgramsPage`** → renders `admin/programs` with `programTemplates` array.

**`getNewProgramForm`** → renders `admin/program-form` with:
```javascript
{
  title, pageHeading, submitLabel: 'Save Program',
  formAction: '/programs',
  isEditMode: false,
  programTemplate: { id: null, name: '', description: '' },
  programmeStages: []
}
```

**`getEditProgramForm`** → validates `:id`, fetches from service, renders `admin/program-form` with:
```javascript
{
  title: `Edit Program: ${name}`,
  formAction: `/programs/${id}?_method=PUT`,
  isEditMode: true,
  programTemplate: { id, name, description },
  programmeStages: template.stages   // full stage array from DB
}
```

**`createProgram`** → calls `createProgrammeTemplate()`. Responds with `301` redirect (or JSON `201` if `Accept: application/json`). Writes audit log `PROGRAM_TEMPLATE_CREATED`.

**`updateProgram`** → calls `updateProgrammeTemplate()`. Redirects to `/programs` (or JSON `200`). Audit: `PROGRAM_TEMPLATE_UPDATED`.

**`duplicateProgram`** → calls `duplicateProgrammeTemplate()`. Returns JSON `{ success, templateId, name, redirectUrl }`. Audit: `PROGRAM_TEMPLATE_DUPLICATED`.

**`deleteProgram`** → calls `deleteProgrammeTemplate()`. Returns `204 No Content`. Audit: `PROGRAM_TEMPLATE_DELETED`.

All errors caught, typed via `ProgrammeTemplateError.status`. Flash messages for form flows; JSON errors for fetch-based routes.

---

## 6. EJS View (`admin/program-form.ejs`)

The form contains two parallel UI components that stay in sync:

### A) Stage Table
Shown but visually hidden — acts as the data source.
- Bootstrap table with class `programme-builder-table`
- `<tbody id="editPageProgrammeRows">` — rows injected by JS
- Each row (class `programme-stage-row`, `draggable="true"`) has:
  - A drag handle cell (`⋮⋮`, class `js-programme-drag-handle`)
  - `<input class="js-programme-stage-name">` — stage name
  - `<input type="number" class="js-programme-week-start" min="0">` — start week
  - `<input type="number" class="js-programme-duration" min="1">` — duration weeks
  - A finish label (`<span class="js-programme-finish">`) — computed display e.g. "W2 to W5"
  - A "Remove" button (`js-remove-programme-row`)

### B) Visual Chart
`<div id="editPageProgrammeChart">`
- Rebuilt from scratch on every change via `buildProgrammeChartHtml()`
- A CSS grid with `--programme-weeks` custom property controlling column count
- Header row: `W0`, `W1`, `W2`, ... spanning the grid
- For each stage: a label div (sticky left) + a track div (spanning the grid)
- The bar (`js-programme-chart-bar`) spans `grid-column: weekStart+1 / span durationWeeks`
- Two resize handles (`.programme-chart-handle-start`, `.programme-chart-handle-end`) for pointer dragging

### C) Hidden Input
`<input type="hidden" name="programmeData" id="editPageProgrammeData">`
- Holds the serialised JSON array submitted with the form
- Updated on every change: `hiddenInput.value = JSON.stringify(stages)`

### Server-side Data Seeding
```html
<div id="programTemplatePageData" class="d-none"
  data-template-id="<%= Number(programTemplate?.id || 0) %>"
  data-programme-stages='<%- JSON.stringify(programmeStages || []) %>'
></div>
```
The script reads `data-programme-stages` on page load to initialise the builder.

---

## 7. JavaScript Functions (inline `<script>`)

### State Variables
```javascript
let programmeDragState = null;         // active pointer drag operation
let programmeReorderDragIndex = -1;    // active drag-to-reorder from chart
```

### Utility Functions

**`escapeHtmlText(value)`** — escapes `& < > " '` before insertion into innerHTML.

**`normalizeProgrammeStages(stagesArray)`** — normalises array to `{ stage_name, week_start, duration_weeks, sort_order }`, filters invalid, sorts by `sort_order`.

**`getProgrammeRows()`** — `querySelectorAll('#editPageProgrammeRows .programme-stage-row')`.

**`getValidProgrammeRows()`** — filters rows with all three valid inputs.

**`readProgrammeStages(strict)`**
- Iterates all table rows in DOM order (DOM order = sort_order)
- Skips completely blank rows; in strict mode returns `null` + shows error on invalid data
- Returns `[{ stageName, weekStart, durationWeeks, sortOrder }]` or `null` on validation fail

**`getProgrammeDurationWeeks(stages)`** — max of `week_start + duration_weeks`.

**`getProgrammeSummaryLabel(stages)`** — e.g. `"5 stages / 12 weeks"` or `"No programme set"`.

### Chart Building & Rendering

**`buildProgrammeChartHtml(stages)`** — builds the full chart HTML as a string:
1. Computes `totalWeeks`
2. Generates `<div class="programme-chart-header">W{n}</div>` for each week
3. For each stage generates:
   - A label div with drag handle (`⋮⋮`), the stage name span (`js-programme-stage-name-display`, clickable to rename), and a delete `✕` button
   - A track div with the bar spanning the correct columns, and start/end resize handles
4. Wraps in `.programme-chart` > `.programme-chart-grid` with `--programme-weeks: N`
5. After setting innerHTML, attaches all event listeners (chart delete, chart drag-to-reorder, inline rename)

**`updateProgrammeStageFinish(row)`** — updates the `js-programme-finish` badge text to `"W{start} to W{start+duration-1}"`.

**`renderProgrammePreview()`** — the central refresh function:
1. Calls `readProgrammeStages(false)` to get current stage array
2. Updates summary badge, hidden input value
3. Re-renders chart HTML
4. Re-attaches all chart event listeners

### Row Management

**`createProgrammeStageRow(stage)`** — creates a `<tr>` with all inputs, attaches `input` event → `updateProgrammeStageFinish + renderProgrammePreview`, remove button, drag handlers.

**`getDefaultProgrammeStage()`** — returns `{ weekStart: lastStage.weekStart + lastStage.durationWeeks, durationWeeks: 1 }` (or `{ weekStart: 0, durationWeeks: 1 }` if no stages).

**`resetProgrammeRows(stages)`** — clears tbody, creates rows from normalised stages (or one default row if empty), calls `renderProgrammePreview()`.

**`reorderProgrammeRows(fromIndex, toIndex, dropPosition)`** — moves a `<tr>` from `fromIndex` to before/after `toIndex` in the table body, then calls `renderProgrammePreview()`.

### Inline Rename

**`enableInlineRename(stageIndex)`** — replaces the chart name `<span>` with a live `<input>`, syncs value back to the table row's `js-programme-stage-name` input on blur or Enter, then re-renders.

### Pointer Drag System (Resize + Move Bars)

**`startProgrammeDrag(event, type, stageIndex, barElement)`**  
Records `{ type, stageIndex, track, totalWeeks, initialWeekStart, initialDurationWeeks, pointerOffsetWeeks }` into `programmeDragState`. Adds `programme-chart-dragging` class to body. Calls `event.preventDefault()`.

**`handleProgrammePointerMove(event)`**  
On `pointermove`, calculates `hoveredWeek` from pointer X relative to track width. Computes new `weekStart`/`durationWeeks` based on drag type (`'move'`, `'resize-end'`, `'resize-start'`). Calls `syncProgrammeRowFromDrag()`.

**`stopProgrammePointerDrag()`**  
Clears `programmeDragState`, removes body class.

**`syncProgrammeRowFromDrag(stageIndex, nextWeekStart, nextDurationWeeks)`**  
Updates the table row inputs, calls `updateProgrammeStageFinish()` and `renderProgrammePreview()`, updates `programmeDragState.track` to the newly rendered track element.

**`getProgrammeWeekFromPointer(track, clientX, totalWeeks)`**  
`Math.floor((clientX - rect.left) / cellWidth)`

All three handlers attached to `document` (not the chart) to handle pointer leaving element bounds.

### Drag-To-Reorder Events

**From chart** (HTML5 Drag API on the `⋮⋮` handle):
- `dragstart` → sets `programmeReorderDragIndex`
- `dragover` on stage labels → shows orange top/bottom border indicator
- `drop` → calls `reorderProgrammeRows()`
- `dragend` → clears `programmeReorderDragIndex`

**From table rows** (HTML5 Drag API on `<tr>`):
- Each `<tr>` is `draggable="true"`, gets same drag/dragover/drop/dragleave handlers
- On drop: `insertBefore` the moving row above or below the target row, then `renderProgrammePreview()`

### Event Handlers

**"+ Add Stage" button:**
- If only one empty placeholder row exists, fills it with `stageName='Stage'` at the default position
- Otherwise appends a new row

**Form submit:**
- Calls `readProgrammeStages(true)` — stops submit and focuses the offending input if invalid
- Writes result as JSON to `#editPageProgrammeData`

**"Duplicate" button:**
- `fetch('/programs/{id}/duplicate', { method: 'POST', headers: { Accept: 'application/json' } })`
- On success → `showSuccess(name)` + `window.location.href = payload.redirectUrl`

**Initialisation:**
```javascript
resetProgrammeRows(initialProgrammeStages);
```

---

## 8. CSS Classes (Key Layout Rules)

```css
.programme-chart {
  overflow-x: auto;
  position: relative;
}

.programme-chart-grid {
  display: grid;
  /* label column (sticky) + 1 column per week */
  grid-template-columns: minmax(170px, 220px) repeat(var(--programme-weeks), minmax(44px, 1fr));
  gap: 0.65rem 0.85rem;
  align-items: center;
  min-width: max-content;
}

.programme-chart-spacer {
  position: sticky; left: 0; z-index: 4; background: #fff;
}

.programme-chart-stage-label {
  display: flex; align-items: center; gap: 6px;
  position: sticky; left: 0; z-index: 3;
  background: #fff;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.9rem;
  box-shadow: 0.5rem 0 0.75rem -0.75rem rgba(15,23,42,0.18); /* shadow to mask scrolled content */
}

.programme-chart-track {
  /* spans all week columns */
  grid-column: 2 / -1;
  display: grid;
  grid-template-columns: repeat(var(--programme-weeks), minmax(44px, 1fr));
  min-height: 3rem;
  background-image: repeating-linear-gradient(to right, ...); /* subtle week column dividers */
  border: 1px solid var(--bs-border-color);
  border-radius: 0.9rem;
}

.programme-chart-bar {
  /* positioned by grid-column in inline style */
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 0.7rem;
  background: linear-gradient(135deg, #0d6efd, #3d8bfd);
  color: #fff;
}

.programme-chart-bar-interactive {
  cursor: grab; touch-action: none; /* prevents scroll interfering with pointer drag */
}

.programme-chart-handle {
  position: absolute; top: 0.2rem; bottom: 0.2rem; width: 0.55rem;
  cursor: ew-resize;
  background: rgba(255,255,255,0.75);
}
.programme-chart-handle-start { left: 0.18rem; }
.programme-chart-handle-end   { right: 0.18rem; }

.programme-chart-empty-state {
  border: 1px dashed; border-radius: 0.85rem; padding: 1rem;
  text-align: center; color: var(--bs-secondary-color); background: var(--bs-light);
}
```

The `--programme-weeks` CSS custom property is set inline on the `.programme-chart` element and controls both the header column count and the track grid layout.

---

## 9. Data Flow Summary

```
Page load
  → Server renders form with programmeStages JSON in data-attribute
  → JS reads attribute → resetProgrammeRows() → table rows created → renderProgrammePreview() → chart built

User interaction (add/remove/input/drag)
  → readProgrammeStages(false) → current stage array
  → getProgrammeSummaryLabel() → update badge
  → JSON.stringify → update hidden input
  → buildProgrammeChartHtml() → rebuild chart DOM
  → Re-attach chart event listeners

Form submit
  → readProgrammeStages(true) → validate or abort
  → JSON.stringify → write to hidden input
  → Form POST to /programs or /programs/:id?_method=PUT

Server
  → parseProgrammeStages(req.body.programmeData) → validate
  → beginTransaction → createTemplate/updateTemplate + replaceTemplateStages → commit
  → Audit log → flash + redirect or JSON response
```

---

## 10. Key Design Decisions

- **Table is the source of truth**: the chart is purely a rendered view of the table rows. Every drag/resize/rename ultimately writes back to the table row inputs.
- **DOM order = sort order**: when the form is submitted, `readProgrammeStages()` iterates table rows in their current DOM order and assigns `sortOrder` by index — no separate sort_order field is tracked in the UI.
- **`replaceTemplateStages` on every save**: all stages are deleted and re-inserted on every update. No partial updates, no diff logic.
- **No framework**: all interactivity is vanilla JS inside one `<script>` block in the EJS template.
- **Security**: all user strings going into `innerHTML` must pass through `escapeHtmlText()` first. XSS-safe.
- **`touch-action: none`** on interactive bars is required to prevent mobile scroll interfering with pointer drag.

---

## 11. Integration Points

- **Unit Types**: The `unit_types` table has a `programme_template_id` column allowing unit types to reference a template OR store local stages (backward-compatible).
- **House Timeline**: `calculateHouseTargetCompletionDate()` uses the programme stages to compute expected completion dates.
- **Dashboard**: Queries join `programme_template_stages` or `unit_type_programme_stages` to show current week, expected stage, and percentage complete.

