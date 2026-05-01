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
  startDate: string
  hoursPerDay: number
  skipWeekends: boolean
  skipHolidays: boolean
  smallTaskThreshold: number
  approvalPercent: number
  approvalMode: 'after-task' | 'weekly' | 'after-block'
  approvalWeekday?: number
  grouping: 'by-phase' | 'by-section'
  showDisclaimer: boolean
  dateOverrides?: Record<string, RoadmapDateOverride>
}

export interface ProjectEstimate {
  projectName: string
  roles: Role[]
  sections: Section[]
  contact: ContactInfo
  roadmapSettings?: RoadmapSettings
}
