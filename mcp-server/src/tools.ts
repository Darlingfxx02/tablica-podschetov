import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StateAdapter } from './store.js'
import type { ProjectEstimate } from './types.js'
import {
  grandTotalHours,
  grandTotalCost,
  sectionTotalHours,
  sectionTotalCost,
  totalRoleHours,
} from './calculations.js'
import path from 'node:path'
import os from 'node:os'
import { exportToXlsxFile } from './export-xlsx.js'

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

export function registerTools(server: McpServer, state: StateAdapter) {
  // ── Project ──

  server.tool(
    'get_estimate',
    'Get the full project estimate including roles, sections, tasks, and contacts',
    {},
    async () => json(state.getState()),
  )

  server.tool(
    'set_project_name',
    'Set the project name',
    { name: z.string().describe('New project name') },
    async ({ name }) => {
      const s = state.dispatch({ type: 'SET_PROJECT_NAME', name })
      return json({ projectName: s.projectName })
    },
  )

  // ── Roles ──

  server.tool(
    'list_roles',
    'List all roles with their categories, titles, hourly rates, and colors. Before changing the role set, the agent must first ask the user how many executors there are, who they are, and whether the scope is interface-only, interfaces+graphics, or full-cycle.',
    {},
    async () => json(state.getState().roles),
  )

  server.tool(
    'add_role',
    'Add a new role to the estimate. IMPORTANT: do not invent performers. Before the first add_role call for a new estimate, the agent must ask the user how many performers there are, who they are, and what their responsibility zone is: interface-only, interfaces+graphics, or full-cycle.',
    {
      category: z.string().describe('Role category, e.g. "Проектирование / Дизайн"'),
      title: z.string().describe('Role title, e.g. "Middle UX / UI-дизайнер"'),
      hourlyRate: z.number().describe('Hourly rate in rubles'),
      color: z.string().optional().describe('Hex color, e.g. "#6366f1". Auto-assigned if omitted'),
    },
    async ({ category, title, hourlyRate, color }) => {
      // First add an empty role
      state.dispatch({ type: 'ADD_ROLE' })
      // Then update it with the provided values
      const roles = state.getState().roles
      const newRole = roles[roles.length - 1]
      const updated = { ...newRole, category, title, hourlyRate, ...(color ? { color } : {}) }
      state.dispatch({ type: 'UPDATE_ROLE', role: updated })
      return json(updated)
    },
  )

  server.tool(
    'update_role',
    'Update an existing role (partial update)',
    {
      id: z.string().describe('Role ID'),
      category: z.string().optional().describe('New category'),
      title: z.string().optional().describe('New title'),
      hourlyRate: z.number().optional().describe('New hourly rate'),
      color: z.string().optional().describe('New hex color'),
    },
    async ({ id, category, title, hourlyRate, color }) => {
      const role = state.getState().roles.find(r => r.id === id)
      if (!role) return json({ error: `Role ${id} not found` })
      const updated = {
        ...role,
        ...(category !== undefined ? { category } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(hourlyRate !== undefined ? { hourlyRate } : {}),
        ...(color !== undefined ? { color } : {}),
      }
      state.dispatch({ type: 'UPDATE_ROLE', role: updated })
      return json(updated)
    },
  )

  server.tool(
    'remove_role',
    'Remove a role by ID',
    { id: z.string().describe('Role ID to remove') },
    async ({ id }) => {
      state.dispatch({ type: 'REMOVE_ROLE', id })
      return json({ success: true })
    },
  )

  // ── Sections ──

  server.tool(
    'list_sections',
    'List all sections with their tasks. STRICT INTERFACE ESTIMATE PROTOCOL: the default target structure is one global section "Проектирование" and one global section "Дизайн". Screens, features, and modules must be grouped inside those sections through divider rows such as "Главная", "Сайдбар", "Лендинг".',
    {},
    async () => json(state.getState().sections),
  )

  server.tool(
    'add_section',
    `Add a new section to the estimate. The "name" parameter works for ALL section types:

- "design" — creates a linked pair (Проектирование + Дизайн). With name "Главная" → "Проектирование: Главная" + "Дизайн: Главная". Tasks are synced between the pair (same title/description, independent hours).
- "prototyping" — creates a linked pair (Проектирование + Прототипирование). Naming works the same way as design.
- "adaptive" — adds a section for responsive breakpoints. Default name "Адаптивы".
- "approval" — adds a section with auto-calculated hours (25% of total). Default name "Согласование и правки".
- "custom" — adds a blank section with no special behavior.

STRICT MCP PROTOCOL:
- For interface estimates, the default structure is NOT many feature sections. The agent should keep one global section "Проектирование" and one global section "Дизайн".
- Features, screens, and modules must be grouped inside those two global sections through divider rows that act as headings: for example "Главная", "Сайдбар", "Лендинг".
- Do not create separate sections per screen or per feature when the same estimate can be represented through divider headings inside the global sections.
- Use "prototyping", "adaptive", "approval", or "custom" only if the user explicitly asks for them.
- Custom sections should be avoided. Use "custom" only if the user explicitly asks for it or confirms that the work really does not fit design/prototyping/adaptive/approval.
- For interface-only estimates, do not turn the estimate into a full-cycle production plan.`,
    {
      sectionType: z.enum(['design', 'projecting', 'prototyping', 'adaptive', 'approval', 'custom']).optional().describe('Section type'),
      name: z.string().optional().describe('Section name. For design/prototyping pairs, creates named pair e.g. "Главная" → "Проектирование: Главная" + "Дизайн: Главная". For other types, sets the section name directly.'),
    },
    async ({ sectionType, name }) => {
      const beforeCount = state.getState().sections.length
      state.dispatch({ type: 'ADD_SECTION', sectionType, name })
      const sections = state.getState().sections
      const newSections = sections.slice(beforeCount)
      return json(newSections)
    },
  )

  server.tool(
    'update_section_name',
    'Rename a section',
    {
      id: z.string().describe('Section ID'),
      name: z.string().describe('New section name'),
    },
    async ({ id, name }) => {
      state.dispatch({ type: 'UPDATE_SECTION_NAME', id, name })
      const section = state.getState().sections.find(s => s.id === id)
      return json(section || { error: `Section ${id} not found` })
    },
  )

  server.tool(
    'remove_section',
    'Remove a section by ID',
    { id: z.string().describe('Section ID to remove') },
    async ({ id }) => {
      state.dispatch({ type: 'REMOVE_SECTION', id })
      return json({ success: true })
    },
  )

  // ── Tasks ──

  server.tool(
    'add_task',
    'Add a new task to a section. Provide title, description, and hours per role. STRICT MCP WORKFLOW: in interface estimates, tasks should normally be added only inside the two global sections "Проектирование" and "Дизайн", and always under divider rows that act as group headings such as "Главная", "Сайдбар", or "Лендинг". Do not dump tasks into an unstructured flat list. The description must list the concrete UI elements included in that task based on the Obsidian feature list, not a vague summary of the whole section.',
    {
      sectionId: z.string().describe('Section ID to add the task to'),
      title: z.string().optional().describe('Task title'),
      description: z.string().optional().describe('Task description'),
      hours: z.record(z.string(), z.number()).optional().describe('Hours by role ID, e.g. {"r1": 8, "r2": 2}'),
    },
    async ({ sectionId, title, description, hours }) => {
      // Add empty task
      state.dispatch({ type: 'ADD_TASK', sectionId })
      const section = state.getState().sections.find(s => s.id === sectionId)
      if (!section) return json({ error: `Section ${sectionId} not found` })
      const task = section.tasks[section.tasks.length - 1]
      // Update with provided values
      if (title || description || hours) {
        const updated = {
          ...task,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(hours !== undefined ? { hours } : {}),
        }
        state.dispatch({ type: 'UPDATE_TASK', sectionId, task: updated })
        return json(updated)
      }
      return json(task)
    },
  )

  server.tool(
    'add_divider',
    'Add a divider row to a section. Divider rows are mandatory group headings for interface estimates and should usually represent screens or modules such as "Главная", "Сайдбар", "Лендинг". In the default MCP workflow, they are used inside the one global section "Проектирование" and the one global section "Дизайн" before detailed tasks are added.',
    {
      sectionId: z.string().describe('Section ID'),
      title: z.string().optional().describe('Divider title'),
    },
    async ({ sectionId, title }) => {
      state.dispatch({ type: 'ADD_DIVIDER', sectionId })
      if (title) {
        const section = state.getState().sections.find(s => s.id === sectionId)
        if (section) {
          const divider = section.tasks[section.tasks.length - 1]
          state.dispatch({ type: 'UPDATE_TASK', sectionId, task: { ...divider, title } })
        }
      }
      const section = state.getState().sections.find(s => s.id === sectionId)
      return json(section?.tasks[section.tasks.length - 1] || { error: 'Failed to add divider' })
    },
  )

  server.tool(
    'update_task',
    'Update an existing task (partial update). When editing interface estimates, preserve the canonical structure: one global section "Проектирование", one global section "Дизайн", divider rows as group headings, detailed tasks under those divider rows. Task descriptions must enumerate the concrete elements inside the block and stay aligned with the Obsidian feature list.',
    {
      sectionId: z.string().describe('Section ID containing the task'),
      taskId: z.string().describe('Task ID to update'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      hours: z.record(z.string(), z.number()).optional().describe('New hours by role ID'),
    },
    async ({ sectionId, taskId, title, description, hours }) => {
      const section = state.getState().sections.find(s => s.id === sectionId)
      const task = section?.tasks.find(t => t.id === taskId)
      if (!task) return json({ error: `Task ${taskId} not found in section ${sectionId}` })
      const updated = {
        ...task,
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(hours !== undefined ? { hours: { ...task.hours, ...hours } } : {}),
      }
      state.dispatch({ type: 'UPDATE_TASK', sectionId, task: updated })
      return json(updated)
    },
  )

  server.tool(
    'remove_task',
    'Remove a task from a section',
    {
      sectionId: z.string().describe('Section ID'),
      taskId: z.string().describe('Task ID to remove'),
    },
    async ({ sectionId, taskId }) => {
      state.dispatch({ type: 'REMOVE_TASK', sectionId, taskId })
      return json({ success: true })
    },
  )

  // ── Contacts ──

  server.tool(
    'set_contact',
    'Set contact information lines',
    { lines: z.array(z.string()).describe('Contact lines, e.g. ["tg: @handle", "email@example.com", "website.com"]') },
    async ({ lines }) => {
      state.dispatch({ type: 'SET_CONTACT', lines })
      return json(state.getState().contact)
    },
  )

  // ── Roadmap settings ──

  server.tool(
    'set_roadmap_settings',
    'Patch RoadmapSettings (partial update). Fields you pass are merged into state.roadmapSettings; everything else is preserved. If roadmapSettings did not exist yet, missing fields are filled with defaults (hoursPerDay 8, skipWeekends true, approvalPercent 25, approvalMode "after-task", grouping "by-phase", etc.). After this call the server reducer automatically recomputes all approval sections against the new approvalPercent, so there is no need to touch approval tasks by hand.',
    {
      startDate: z.string().optional().describe('ISO date string, e.g. "2026-04-10"'),
      hoursPerDay: z.number().optional().describe('Working hours per day (default 8)'),
      skipWeekends: z.boolean().optional().describe('Skip Sat/Sun on the roadmap'),
      skipHolidays: z.boolean().optional().describe('Skip RU public holidays on the roadmap'),
      smallTaskThreshold: z.number().optional().describe('% of hoursPerDay to allow day-stacking small tasks (default 80)'),
      approvalPercent: z.number().optional().describe('% of total project hours reserved for approval block (default 25)'),
      approvalMode: z.enum(['after-task', 'weekly', 'after-block']).optional().describe('When approval hours land on the roadmap'),
      approvalWeekday: z.number().optional().describe('1=Mon..5=Fri — only used when approvalMode=weekly'),
      grouping: z.enum(['by-phase', 'by-section']).optional().describe('Roadmap grouping mode'),
      showDisclaimer: z.boolean().optional().describe('Show the "примерные сроки" disclaimer line on the roadmap'),
    },
    async (patch) => {
      const settings = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      )
      state.dispatch({ type: 'SET_ROADMAP_SETTINGS', settings })
      return json(state.getState().roadmapSettings)
    },
  )

  server.tool(
    'set_approval_percent',
    'Shortcut over set_roadmap_settings: set only RoadmapSettings.approvalPercent. Use when the user asks "put approval at X %". The reducer then automatically recomputes every approval section against the new percent.',
    { percent: z.number().describe('Approval hours as % of total project hours (e.g. 25, 30)') },
    async ({ percent }) => {
      state.dispatch({ type: 'SET_ROADMAP_SETTINGS', settings: { approvalPercent: percent } })
      return json(state.getState().roadmapSettings)
    },
  )

  // ── Calculations ──

  server.tool(
    'get_summary',
    'Get a full project summary with total hours, costs, per-section and per-role breakdowns',
    {},
    async () => {
      const est = state.getState()
      return json({
        projectName: est.projectName,
        grandTotalHours: grandTotalHours(est),
        grandTotalCost: grandTotalCost(est),
        sections: est.sections.map(s => ({
          id: s.id,
          name: s.name,
          sectionType: s.sectionType,
          totalHours: sectionTotalHours(s),
          totalCost: sectionTotalCost(s, est.roles),
          taskCount: s.tasks.filter(t => !t.isDivider).length,
        })),
        roles: est.roles.map(r => ({
          id: r.id,
          category: r.category,
          title: r.title,
          hourlyRate: r.hourlyRate,
          totalHours: totalRoleHours(est, r.id),
          totalCost: totalRoleHours(est, r.id) * r.hourlyRate,
        })),
      })
    },
  )

  // ── Export ──

  server.tool(
    'export_xlsx',
    'Export the estimate to an Excel (.xlsx) file and return the file path. When no outputPath is given, the file is saved next to the state file (or in the current working directory if the default state path is used).',
    {
      outputPath: z.string().optional().describe('Output file path. If omitted, saves {projectName}.xlsx in the state file directory (or CWD for default state path)'),
    },
    async ({ outputPath }) => {
      const est = state.getState()
      let outPath: string
      if (outputPath) {
        outPath = outputPath
      } else {
        const statePath = state.getFilePath()
        const defaultStatePath = path.join(os.homedir(), '.estimate-mcp', 'state.json')
        const baseDir = statePath === defaultStatePath
          ? process.cwd()
          : path.dirname(statePath)
        outPath = path.join(baseDir, `${est.projectName}.xlsx`)
      }
      await exportToXlsxFile(est, outPath)
      return json({ filePath: path.resolve(outPath) })
    },
  )

  // ── Bulk load ──

  server.tool(
    'load_estimate',
    'Replace the entire estimate state (for importing a project)',
    {
      estimate: z.object({
        projectName: z.string(),
        roles: z.array(z.object({
          id: z.string(),
          category: z.string(),
          title: z.string(),
          hourlyRate: z.number(),
          color: z.string(),
        })),
        sections: z.array(z.any()),
        contact: z.object({ lines: z.array(z.string()) }),
        roadmapSettings: z.any().optional(),
      }).describe('Full ProjectEstimate object'),
    },
    async ({ estimate }) => {
      state.dispatch({ type: 'LOAD', state: estimate as ProjectEstimate })
      return json({ success: true })
    },
  )
}
