export interface Role {
  id: string
  category: string
  title: string
  hourlyRate: number
  color: string
}

export interface Task {
  id: string
  linkId?: string
  title: string
  description: string
  hours: Record<string, number>
  isDivider?: boolean
}

export type SectionType =
  | 'design'
  | 'projecting'
  | 'prototyping'
  | 'adaptive'
  | 'approval'
  | 'custom'

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export interface Section {
  id: string
  name: string
  sectionType: SectionType
  linkedGroupId?: string
  linkBroken?: boolean
  tasks: Task[]
  breakpoints?: Breakpoint[]
}

export interface ContactInfo {
  lines: string[]
}

export interface RoadmapDateOverride {
  startDate?: string
  endDate?: string
}

export interface RoadmapSettings {
  startDate: string         // ISO date string e.g. '2026-04-10'
  hoursPerDay: number       // рабочих часов в день (default 8)
  skipWeekends: boolean     // пропускать выходные
  skipHolidays: boolean     // пропускать государственные праздники РФ
  smallTaskThreshold: number // % от hoursPerDay для стэкинга задач в один день (default 80)
  approvalPercent: number   // % от общего времени проекта на согласование (default 25)
  approvalMode: 'after-task' | 'weekly' | 'after-block'
  approvalWeekday?: number  // 1=Пн ... 5=Пт, только для режима weekly
  grouping: 'by-phase' | 'by-section'
  showDisclaimer: boolean   // показывать строку-уведомление о примерных сроках (default true)
  dateOverrides?: Record<string, RoadmapDateOverride>
}

export interface ProjectEstimate {
  projectName: string
  roles: Role[]
  sections: Section[]
  contact: ContactInfo
  roadmapSettings?: RoadmapSettings
}
