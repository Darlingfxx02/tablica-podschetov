# MCP Usage Guide

## Core Rules

This MCP server is primarily used to build interface estimates, not automatic full-cycle product plans.

Before the agent creates or changes the role set, it must first ask the user:
- how many performers there are
- who they are
- what responsibility zone each one has

The responsibility zone must be clarified in one of these forms:
- interface-only
- interfaces and graphics
- full-cycle

The agent must not invent performers on its own.

## Section Structure

Default interface estimate structure must use two global sections:
- `Проектирование`
- `Дизайн`

This is the primary canonical layout for the table.

Do not split the estimate into many sections per feature or per screen if the same work can be expressed inside the two global sections.

Features, screens, and modules must be placed inside those sections through divider rows:
- `Главная`
- `Сайдбар`
- `Лендинг`
- other screen/module names when needed

The agent should avoid `custom` sections.
Use `custom` only when the user explicitly asks for it or confirms that the task does not fit:
- design
- prototyping
- adaptive
- approval

## Task Grouping

Inside the global sections `Проектирование` and `Дизайн`, tasks must be grouped through divider rows.

Required workflow:
1. Ensure the estimate has the two global sections: `Проектирование` and `Дизайн`.
2. Add divider rows that act as group headings for screens or modules.
3. Add detailed tasks under those divider rows.

Do not dump all tasks into one flat list.

Do not create extra sections instead of divider rows unless the user explicitly requires another section type.

## Task Descriptions

Task descriptions must not be vague summaries of the whole section.

For each task, the description must list the concrete elements that входят в этот блок:
- controls
- cards
- tabs
- filters
- states
- counters
- navigation points
- forms
- notifications
- other interface elements that are explicitly present in the feature list

Bad pattern:
- `Раздел с материалами и логикой работы`

Correct pattern:
- `Карточки курсов, фильтры по теме и типу, индикатор прогресса, количество модулей и вопросов, рекомендации`

The agent must rely on the Obsidian feature list first and should not invent UI parts that are not present there.

## Interface-Only Estimates

If the user says the project covers interfaces only:
- keep the estimate focused on UX, prototyping, UI design, states, adaptations, and approvals
- do not silently expand the estimate into backend, frontend, QA, AI, analytics, or production implementation
- if such roles are needed, ask the user explicitly before adding them
- keep the estimate structurally compact: one global `Проектирование`, one global `Дизайн`, divider headings inside them
