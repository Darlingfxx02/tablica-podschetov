import type { ProjectEstimate, Section, Task, Role } from '../types'

export function taskTotalHours(task: Task): number {
  return Object.values(task.hours).reduce((sum, h) => sum + (h || 0), 0)
}

export function taskCost(task: Task, roles: Role[]): number {
  return roles.reduce((sum, role) => sum + (task.hours[role.id] || 0) * role.hourlyRate, 0)
}

export function sectionTotalHours(section: Section): number {
  return section.tasks.reduce((sum, t) => sum + taskTotalHours(t), 0)
}

export function sectionTotalCost(section: Section, roles: Role[]): number {
  return section.tasks.reduce((sum, t) => sum + taskCost(t, roles), 0)
}

export function sectionRoleHours(section: Section, roleId: string): number {
  return section.tasks.reduce((sum, t) => sum + (t.hours[roleId] || 0), 0)
}

export function grandTotalHours(estimate: ProjectEstimate): number {
  return estimate.sections.reduce((sum, s) => sum + sectionTotalHours(s), 0)
}

export function grandTotalCost(estimate: ProjectEstimate): number {
  return estimate.sections.reduce((sum, s) => sum + sectionTotalCost(s, estimate.roles), 0)
}

export function totalRoleHours(estimate: ProjectEstimate, roleId: string): number {
  return estimate.sections.reduce((sum, s) => sum + sectionRoleHours(s, roleId), 0)
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU')
}
