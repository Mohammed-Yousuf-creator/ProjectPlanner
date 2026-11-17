// Shapes of the JSON the Go server returns. Keep in sync with backend/internal/model.

export type ProjectType = 'standard' | 'hackathon';
export type Phase = 'plan' | 'build' | 'shipped';
export type Complexity = 'tiny' | 'small' | 'medium' | 'hard';
export type VendorMode = 'diy' | 'fasttrack';

export interface Project {
  id: number;
  name: string;
  summary: string;
  type: ProjectType;
  complexity: Complexity;
  vendor_mode: VendorMode;
  phase: Phase;
  archived: boolean;
  decided_at: string;
  planning_deadline: string;
  build_started_at: string | null;
  forced_start: boolean;
  shipped_at: string | null;
  target_date: string | null;
  hack_start: string | null;
  hack_end: string | null;
  repo_path: string;
  plan: Record<string, string>;
  steps: Record<string, string>;
  created_at: string;
  updated_at: string;
  kit: string;
  archive_reason: string;
  archived_at: string | null;
  build_ack_at: string | null;
  original_target_date: string | null;
  stale_hours: number;
  plan_sync: boolean;
  commit_close: boolean;
}

export interface ProjectSummary extends Project {
  tasks_total: number;
  tasks_done: number;
  open_obstacles: number;
  last_log_day: string | null;
  focus_task: string | null;
}

export interface Check {
  label: string;
  ok: boolean;
}

export type StepStatus = 'todo' | 'done' | 'skipped';

export interface Step {
  key: string;
  title: string;
  tagline: string;
  essential: boolean;
  optional: boolean;
  status: StepStatus;
  move_on_by: string;
  checks: Check[];
}

export interface PlanningState {
  window_start: string;
  deadline: string;
  latest_deadline: string;
  essential_done: number;
  essential_total: number;
  ready_to_build: boolean;
  current_step: string;
}

export interface Segment {
  key: 'plan' | 'build' | 'polish' | 'submit';
  label: string;
  hint: string;
  start: string;
  end: string;
}

export interface HackathonSchedule {
  start: string;
  end: string;
  freeze_at: string;
  submit_from: string;
  segments: Segment[];
  planning_minutes: number;
  max_planning_minutes: number;
  breaks: Break[];
  work_minutes: number;
  build_work_minutes: number;
}

export interface Break {
  id: number;
  label: string;
  start: string;
  end: string;
}

export type Tier = 'unsorted' | 'mvp' | 'later' | 'cut';

export interface Story {
  id: number;
  project_id: number;
  text: string;
  tier: Tier;
  position: number;
  cut_rank: number | null;
}

export interface PlanItem<T = Record<string, unknown>> {
  id: number;
  project_id: number;
  kind: string;
  data: T;
  position: number;
}

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  due_at: string | null;
  position: number;
  origin: string;
  original_due_at: string | null;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'done';
export type TaskScope = 'mvp' | 'dlc' | 'debt';

export interface Task {
  id: number;
  project_id: number;
  milestone_id: number | null;
  story_id: number | null;
  title: string;
  notes: string;
  status: TaskStatus;
  scope: TaskScope;
  due_at: string | null;
  position: number;
  checklist: ChecklistItem[];
  origin: string;
  created_at: string;
  started_at: string | null;
  done_at: string | null;
  estimate_hours: number | null;
  spent_minutes: number;
  closed_commit: string;
}

export interface DailyLog {
  id: number;
  day: string;
  summary: string;
  hours: number | null;
}

export type ObstacleKind = 'unsorted' | 'memory' | 'knowledge' | 'problem' | 'debug';

export interface Obstacle {
  id: number;
  project_id: number;
  task_id: number | null;
  title: string;
  kind: ObstacleKind;
  attempts: number;
  approaches: string;
  resolution: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  timer_until: string | null;
  needs_help: boolean;
}

export interface StoredFile {
  id: number;
  project_id: number;
  category: 'wireframe' | 'reference' | 'other';
  name: string;
  mime: string;
  original_size: number;
  stored_size: number;
  compression: 'zstd' | 'none';
  created_at: string;
}

export interface Bundle {
  now: string;
  project: Project;
  planning: PlanningState;
  steps: Step[];
  hackathon: HackathonSchedule | null;
  stories: Story[];
  items: PlanItem[];
  milestones: Milestone[];
  tasks: Task[];
  logs: DailyLog[];
  obstacles: Obstacle[];
  files: StoredFile[];
  events: ProjectEvent[];
  picks: DayPick[];
  limits: Limits;
  plan_sync: PlanSyncState | null;
  slips: Slip[];
  cut_next: CutCandidate | null;
  has_snapshot: boolean;
  retro: Retro | null;
}

export interface Limits {
  scope_budget: number;
  stuck_minutes: number;
  cut_snooze_minutes: number;
}

export interface PlanSyncState {
  path: string;
  written_at: string | null;
  error: string;
}

/** Something that happened after coding started: a change of scope or a moved deadline. */
export type ProjectEvent =
  | { id: number; kind: 'scope_add' | 'scope_park' | 'scope_cut'; at: string; data: ScopeChange }
  | { id: number; kind: 'date_move'; at: string; data: DateMove };

export interface ScopeChange {
  task_id?: number;
  story_id?: number;
  milestone_id?: number;
  title: string;
  how: 'new' | 'moved' | 'deleted' | 'cut';
  tasks?: string[];
}

export interface DateMove {
  what: 'milestone' | 'target';
  id?: number;
  title: string;
  from: string;
  to: string;
  reason: string;
}

export interface DayPick {
  id: number;
  day: string;
  task_id: number | null;
  title: string;
  position: number;
}

export interface Slip {
  milestone_id: number;
  title: string;
  due_at: string;
  open_tasks: { id: number; title: string }[];
}

export interface CutCandidate {
  story_id: number;
  text: string;
  open_tasks: number;
}

export interface Retro {
  planning_allowed_hours: number;
  planning_used_hours: number;
  forced_start: boolean;
  steps_done: number;
  steps_total: number;
  build_days: number;
  first_target: string | null;
  final_target: string | null;
  days_vs_target: number | null;
  date_moves: number;
  days_logged: number;
  hours_logged: number;
  tasks_done: number;
  tasks_open: number;
  tasks_parked: number;
  scope_added: number;
  scope_parked: number;
  scope_cut: number;
  plan_changes: number;
  estimate_hours: number;
  spent_hours: number;
  multiplier: number;
  milestones: {
    title: string; first_due: string | null; due: string | null; finished_at: string | null; days_late: number | null;
    tasks_done: number; tasks_total: number; estimate_hours: number; spent_hours: number;
  }[];
  obstacles: {
    title: string; kind: ObstacleKind; attempts: number; resolution: string; solved: boolean; needed_help: boolean; hours_open: number;
  }[];
}

export interface Kit {
  key: string;
  label: string;
  blurb: string;
  stack_layers: string[];
  capabilities: string[];
  questions: string[];
  milestones: string[];
}

export interface Meta {
  max_planning_days: number;
  planning_days: Record<Complexity, number>;
  max_upload_bytes: number;
  scope_budget: Record<Complexity, number>;
  kits: Kit[];
  building: string[];
  one_build_mode: OneBuildMode;
  step_keys: Record<ProjectType, string[]>;
  multiplier: number;
  multiplier_tasks: number;
  max_picks: number;
}

export type OneBuildMode = 'off' | 'warn' | 'block';

export interface AppSettings {
  one_build_mode: OneBuildMode;
  backup_enabled: boolean;
  backup_keep: number;
}

export interface Lesson {
  project_id: number;
  project: string;
  kind: 'abandoned' | 'shipped';
  text: string;
  at: string | null;
}

export interface SearchHit {
  kind: 'project' | 'answer' | 'story' | 'item' | 'task' | 'obstacle' | 'log';
  project_id: number;
  project_name: string;
  id: number;
  sub: string;
  title: string;
  snippet: string;
}

export interface ActivityDay {
  day: string;
  entries: number;
  hours: number;
  tasks_done: number;
}

export interface Activity {
  from: string;
  to: string;
  days: ActivityDay[];
  multiplier: number;
  tasks: number;
}

export interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
  auto: boolean;
}

export interface BackupList {
  dir: string;
  available: boolean;
  missing: string;
  last_error: string;
  items: BackupInfo[];
}

export interface PlanChange {
  area: 'answers' | 'stories' | 'lists' | 'milestones';
  kind: 'added' | 'removed' | 'changed';
  label: string;
  before: string;
  after: string;
}

export interface SnapshotView {
  exists: boolean;
  taken_at: string | null;
  changes: PlanChange[];
  plan: {
    plan: Record<string, string>;
    target_date: string | null;
    stories: Story[];
    items: PlanItem[];
    milestones: Milestone[];
  };
}

export interface GitCommit {
  hash: string;
  subject: string;
  at: string;
  refs: number[];
  closes: number[];
}

export interface GitInfo {
  configured: boolean;
  ok: boolean;
  error?: string;
  path: string;
  branch: string;
  dirty: number;
  commits: GitCommit[];
  closed: number;
}

// Payloads of the blueprint lists (plan_items.data).
export interface QuestionData { text: string; status: 'open' | 'answered' | 'learn'; answer: string; box_until?: string }
export interface DecisionData { title: string; decision: string; why: string; alternatives: string; step: string; decided_at?: string }
export interface NotDoingData { text: string; why: string }
export interface BreakData { label: string; start: string; end: string }
export interface ResourceData { title: string; url: string; note: string }
export interface FieldData { name: string; type: string; note: string }
export interface EntityData { name: string; fields: FieldData[]; relations: string }
export interface ModuleData { name: string; responsibility: string; interface: string; files: string }
export interface StackData { layer: string; choice: string; why: string; familiarity: '' | 'known' | 'learning' }
export interface CapabilityData { name: string; decision: 'undecided' | 'build' | 'buy' | 'skip'; service: string; notes: string }
export interface FlowData { name: string; core: boolean; trigger: string; controller: string; logic: string; data: string }
export interface CriterionData { text: string; weight: string }
export interface SubmissionData { text: string; done: boolean }

/** A deadline moment worth a desktop notification. */
export interface Alert {
  key: string;
  project_id: number;
  project: string;
  at: string;
  title: string;
  body: string;
  path: string;
}
