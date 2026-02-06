# Metaformalism Copilot - Architecture

**Author**: Aditya Adiga

## Overview

Metaformalism Copilot is a dual-pane workspace for transforming insights and source material into personalized, context-sensitive formalisms. It extends the [Live Conversational Threads](https://www.lesswrong.com/posts/uueHkKrGmeEsKGHPR/live-conversational-threads-not-an-ai-notetaker-2) research by focusing on the insight → formalism workflow.

> **Note**: For the theoretical foundation and Live Theory philosophy, see [`BACKGROUND.md`](./BACKGROUND.md).

## Application Architecture

### Layout Structure

The application uses a two-panel layout with a central divider:

```
┌─────────────────────────────────────────────────────────┐
│              Metaformalism Copilot (Header)             │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│   Input Panel        │      Output Panel                │
│   (Left)             │      (Right)                     │
│                      │                                  │
│ ┌─────────────────┐  │  ┌────────────────────────────┐ │
│ │ Source Inputs   │  │  │                            │ │
│ │ - Text          │  │  │  Editable Output           │ │
│ │ - File Upload   │  │  │  (manual + AI editing)     │ │
│ └─────────────────┘  │  │                            │ │
│ ┌─────────────────┐  │  └────────────────────────────┘ │
│ │ Context         │  │  [Edit entire output...] ← Bar  │
│ │ - Directions    │  │                                  │
│ │ - Refinement    │  │                                  │
│ │ [Formalise]     │  │                                  │
│ └─────────────────┘  │                                  │
└──────────────────────┴──────────────────────────────────┘
```

### Component Hierarchy

```
app/page.tsx (Main Layout)
├── Header
├── InputPanel
│   ├── Source Inputs Section
│   │   ├── TextInput
│   │   └── FileUpload
│   └── Context Section
│       └── ContextInput
│           ├── RefinementButtons
│           └── RefinementPreview
└── OutputPanel
    ├── EditableOutput
    │   ├── Textarea (editable)
    │   └── InlineEditPopup (on text selection + ⌘K)
    └── WholeTextEditBar (floating at bottom)
```

## Feature Modules

### 1. Source Input (`features/source-input/`)

**Purpose**: Collect raw material to be formalized

**Components**:
- `TextInput.tsx` - Textarea for raw text input
- `FileUpload.tsx` - File upload with paper clip icon, supports .txt, .doc, .docx, .pdf

**State**: Local state per component (file list, text value)

### 2. Context Input (`features/context-input/`)

**Purpose**: Guide the formalization direction with theoretical context

**Components**:
- `ContextInput.tsx` - Main context textarea with refinement UI
- `RefinementButtons.tsx` - Quick actions (Elaborate, Shorten, Formalize, Clarify)
- `RefinementPreview.tsx` - Split view showing original vs refined text

**Flow**:
1. User types context description
2. Optionally clicks refinement button
3. Reviews original vs refined in split view
4. Clicks "Insert" to replace or "Cancel" to dismiss
5. Clicks "Formalise" to trigger formalization (backend TBD)

### 3. Output Editing (`features/output-editing/`)

**Purpose**: Display and edit formalized output

**Components**:
- `EditableOutput.tsx` - Main editable textarea with selection tracking
- `ai-bars/InlineEditPopup.tsx` - Popup for editing selected text
- `ai-bars/WholeTextEditBar.tsx` - Floating bar for editing entire output

**Editing Modes**:

**Inline editing**:
1. User selects text in output
2. "Edit with AI (⌘K)" button appears near selection
3. Click button or press ⌘K to show input popup
4. Type instruction, press Enter
5. Selected text is updated (backend TBD)

**Whole-output editing**:
1. When output has text, floating bar appears at bottom
2. User types instruction (e.g., "make it more concise")
3. Press Enter to apply to entire output (backend TBD)

## Panels

### InputPanel (`panels/InputPanel.tsx`)

Orchestrates the left panel layout:
- Top section: Source inputs (text + file upload)
- Bottom section: Context input
- Visual separation with bold border and section headers

### OutputPanel (`panels/OutputPanel.tsx`)

Orchestrates the right panel:
- Contains `EditableOutput` (textarea + inline editing)
- Contains `WholeTextEditBar` (conditional on text presence)
- Manages output state and editing callbacks

## Shared UI (`ui/`)

### Icons (`ui/icons/`)
- `SendIcon.tsx` - Arrow icon for submit actions
- `PaperClipIcon.tsx` - Attachment icon for file upload

### Layout
- `BookSpineDivider.tsx` - Vertical divider between panels (1px gradient line)

## Utilities (`lib/utils/`)

### textSelection.ts

**Purpose**: Calculate accurate text position in textarea for popup placement

**Key function**: `getSelectionCoordinates(element: HTMLTextAreaElement)`
- Creates mirror div with same styles
- Measures text height up to selection point
- Returns top/bottom coordinates for popup positioning

## Design System

### Colors (CSS Variables in `globals.css`)

```css
--ivory-cream: #879B89  (sage green background)
--ink-black: #0A2E26   (dark teal for buttons/text)
--paper-shadow: rgba(10, 46, 38, 0.1)
```

All components use these variables for consistency and easy theming.

### Typography

- **Primary font**: EB Garamond (serif) - editorial, manuscript feel
- **Mono font**: Geist Mono (for future code blocks)
- **Line heights**: 1.7 for inputs, 1.9 for output (readability)

### Interaction Patterns

- **Paper-lift effect**: `shadow-md` → `hover:shadow-lg` → `active:shadow-xl`
- **Focus rings**: Ink black ring with offset
- **Selection highlight**: Warm peach (#FFE5B4)

## Data Flow

### Current (UI-only)

```
User Input → Local State → Display
```

No backend integration yet. All state is local React state:
- TextInput: textarea value
- FileUpload: File[] array
- ContextInput: context text, refined text
- OutputPanel: output text, selection state

### Future (with backend)

```
Source Material + Context → API (Formalise) → Output
Output + AI Instruction → API (Edit) → Updated Output
Context + Refinement Action → API (Refine) → Refined Context
```

## Key Technical Decisions

**Why feature-based structure?**
- Clear separation of concerns
- Easy to find related code
- Scales well as features grow

**Why CSS variables?**
- Single source of truth for theme
- Easy color scheme updates
- No component changes needed

**Why modular components?**
- Testable in isolation
- Reusable (e.g., icons, editing bars)
- Clear prop interfaces

**Why textarea over contentEditable?**
- Simpler state management
- Easier selection handling
- Future migration to editor library (e.g., writing.js) is planned

## Future Enhancements

1. **Backend API integration**
   - Formalization endpoint
   - Inline editing endpoint
   - Context refinement endpoint

2. **Advanced output rendering**
   - LaTeX rendering (KaTeX/MathJax)
   - Markdown rendering
   - Syntax highlighting

3. **File processing**
   - Parse uploaded documents
   - Extract text content
   - Support more formats

4. **State persistence**
   - Save drafts to localStorage
   - Session management
   - Undo/redo functionality

5. **Editor upgrade**
   - Replace textarea with writing.js
   - Rich text editing
   - Collaborative features
