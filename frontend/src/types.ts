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
}

export type Tier = 'unsorted' | 'mvp' | 'later' | 'cut';

export interface Story {
  id: number;
  project_id: number;
  text: string;
  tier: Tier;
  position: number;
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
}

export interface Meta {
  max_planning_days: number;
  planning_days: Record<Complexity, number>;
  max_upload_bytes: number;
}

export interface GitCommit {
  hash: string;
  subject: string;
  at: string;
}

export interface GitInfo {
  configured: boolean;
  ok: boolean;
  error?: string;
  path: string;
  branch: string;
  dirty: number;
  commits: GitCommit[];
}

// Payloads of the blueprint lists (plan_items.data).
export interface QuestionData { text: string; status: 'open' | 'answered'; answer: string }
export interface ResourceData { title: string; url: string; note: string }
export interface FieldData { name: string; type: string; note: string }
export interface EntityData { name: string; fields: FieldData[]; relations: string }
export interface ModuleData { name: string; responsibility: string; interface: string; files: string }
export interface StackData { layer: string; choice: string; why: string; familiarity: '' | 'known' | 'learning' }
export interface CapabilityData { name: string; decision: 'undecided' | 'build' | 'buy' | 'skip'; service: string; notes: string }
export interface FlowData { name: string; core: boolean; trigger: string; controller: string; logic: string; data: string }
export interface CriterionData { text: string; weight: string }
export interface SubmissionData { text: string; done: boolean }
