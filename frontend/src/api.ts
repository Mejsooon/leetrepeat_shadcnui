// Wszystkie wywołania backendu (FastAPI pod /api). Kolejne etapy dopisują tu swoje funkcje i typy.

// Błąd z API: status HTTP (0 = brak połączenia z serwerem) i komunikat do pokazania użytkownikowi
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch("/api" + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    })
  } catch {
    throw new ApiError(0, "Brak połączenia")
  }
  // 204 i puste odpowiedzi nie mają treści; błąd serwera może przyjść jako zwykły tekst, nie JSON
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    if (response.ok) throw new ApiError(response.status, "Nieprawidłowa odpowiedź serwera")
  }
  if (!response.ok) {
    // detail to tekst; lista (stary format Pydantica) → pierwszy komunikat
    let detail = `Błąd ${response.status}`
    if (typeof data?.detail === "string") detail = data.detail
    else if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === "string") detail = data.detail[0].msg
    throw new ApiError(response.status, detail)
  }
  return data as T
}

export type Health = { status: string; version: string }

export function getHealth(): Promise<Health> {
  return request<Health>("/health")
}

// --- Zadania (spec §5) ---

export type Language = "python" | "csharp"
export type Kind = "function" | "program"
export type Difficulty = "easy" | "medium" | "hard"
export type Status = "new" | "due" | "learning" | "consolidated"

export type TestCase = { input: string; expected: string }

// Dane wysyłane przy dodawaniu i edycji
export type TaskInput = {
  title: string
  language: Language
  kind: Kind
  difficulty: Difficulty
  description: string
  starter_code: string
  hint: string
  solution: string
  tests: TestCase[]
  tags: string[]
}

export type Task = TaskInput & {
  id: number
  notes: string
  created_at: string
  updated_at: string
  interval_days: number
  due_date: string
  status: Status
  last_reviewed_at: string | null
}

export type TaskListItem = {
  id: number
  title: string
  tags: string[]
  language: Language
  difficulty: Difficulty
  due_date: string
  status: Status
}

export type TaskList = {
  items: TaskListItem[]
  total: number
  page: number
  pages: number
  counts: { library: number; due: number; new: number }
}

export type TaskFilters = {
  q?: string
  language?: Language
  difficulty?: Difficulty
  status?: Status
  tag?: string
  page?: number
}

export type Tag = { name: string; count: number }

export function listTasks(filters: TaskFilters = {}): Promise<TaskList> {
  // Do adresu trafiają tylko ustawione filtry
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
  }
  const query = params.toString()
  return request<TaskList>("/tasks" + (query ? "?" + query : ""))
}

export function getTask(id: number): Promise<Task> {
  return request<Task>(`/tasks/${id}`)
}

export function createTask(input: TaskInput): Promise<{ id: number }> {
  return request<{ id: number }>("/tasks", { method: "POST", body: JSON.stringify(input) })
}

export function updateTask(id: number, input: TaskInput): Promise<{ id: number }> {
  return request<{ id: number }>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

export function deleteTask(id: number): Promise<null> {
  return request<null>(`/tasks/${id}`, { method: "DELETE" })
}

// keepalive: żądanie dokończy się nawet przy zamykaniu karty
export function updateNotes(id: number, notes: string, keepalive = false): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/tasks/${id}/notes`, { method: "PATCH", body: JSON.stringify({ notes }), keepalive })
}

export function listTags(): Promise<Tag[]> {
  return request<Tag[]>("/tags")
}

// --- Sesja (Etap 3) ---

export type Rating = "again" | "hard" | "good" | "easy"
export type RunStatus = "pass" | "fail" | "error" | "timeout"
export type RunResult = { status: RunStatus; input: string; expected: string; actual: string | null; message: string | null }
export type RunResponse = { results: RunResult[]; duration_ms: number }
export type RunInput = { language: Language; kind: Kind; code: string; tests: TestCase[] }
export type SessionItem = { id: number; title: string; language: Language; difficulty: Difficulty; tags: string[]; status: Status }
export type ReviewPreviewItem = { rating: Rating; interval_days: number; due_date: string }
export type ReviewInput = {
  rating: Rating
  duration_seconds: number
  tests_passed: number | null
  tests_total: number | null
  hint_used: boolean
  solution_used: boolean
}

export function getSession(language?: Language): Promise<SessionItem[]> {
  return request<SessionItem[]>("/session" + (language ? `?language=${language}` : ""))
}

export function runTests(input: RunInput): Promise<RunResponse> {
  return request<RunResponse>("/run", { method: "POST", body: JSON.stringify(input) })
}

export function getReviewPreview(id: number): Promise<ReviewPreviewItem[]> {
  return request<ReviewPreviewItem[]>(`/tasks/${id}/review-preview`)
}

export function submitReview(id: number, input: ReviewInput): Promise<{ interval_days: number; due_date: string }> {
  return request(`/tasks/${id}/review`, { method: "POST", body: JSON.stringify(input) })
}

// --- Pulpit i Statystyki (Etap 4) ---

export type ByLanguage<T> = { python: T; csharp: T }
export type DashboardQueueItem = { id: number; title: string; language: Language; difficulty: Difficulty; due_date: string }
export type LanguageProgress = { language: Language; consolidated: number; learning: number; new: number }
export type Dashboard = {
  due_count: number
  due_by_language: ByLanguage<number>
  new_count: number
  streak: number
  longest_streak: number
  library_count: number
  library_by_language: ByLanguage<number>
  queue: DashboardQueueItem[]
  queue_rest: string[]
  session_count: number
  progress_by_language: LanguageProgress[]
  next_review_date: string | null
  completed_today: number
}

export type DailyCount = { date: string; python: number; csharp: number }
export type WeakTask = { id: number; title: string; language: Language; successful: number; total: number }
export type RecentDay = { date: string; count: number; success_rate: number | null }
export type Stats = {
  reviews_count: number
  by_language: ByLanguage<number>
  success_rate: number | null
  success_by_language: ByLanguage<{ successful: number; total: number }>
  avg_duration_s: number | null
  avg_duration_by_language: ByLanguage<number | null>
  streak: number
  longest_streak: number
  daily: DailyCount[]
  weak_tasks: WeakTask[]
  recent_days: RecentDay[]
}

// Panel boczny i Pulpit pytają o to samo w tej samej chwili — równoczesne wywołania dzielą jedno żądanie
let dashboardInFlight: Promise<Dashboard> | null = null

export function getDashboard(): Promise<Dashboard> {
  if (!dashboardInFlight) {
    dashboardInFlight = request<Dashboard>("/dashboard").finally(() => {
      dashboardInFlight = null
    })
  }
  return dashboardInFlight
}

export function getStats(from: string, to: string): Promise<Stats> {
  return request<Stats>(`/stats?from=${from}&to=${to}`)
}

// --- Ustawienia i kopia zapasowa (Etap 5) ---

export type SettingsValues = { python_path: string; dotnet_path: string; python_timeout_s: number; csharp_timeout_s: number }
export type DatabaseInfo = { path: string; task_count: number; last_backup_at: string | null }
export type SettingsResponse = { values: SettingsValues; defaults: SettingsValues; database: DatabaseInfo }
export type RuntimeInfo = { found: boolean; version: string | null; path: string }
export type Runtimes = { python: RuntimeInfo; dotnet: RuntimeInfo }

export const BACKUP_URL = "/api/backup"

export function getSettings(): Promise<SettingsResponse> {
  return request<SettingsResponse>("/settings")
}

export function saveSettings(values: SettingsValues): Promise<SettingsResponse> {
  return request<SettingsResponse>("/settings", { method: "PUT", body: JSON.stringify(values) })
}

export function getRuntimes(): Promise<Runtimes> {
  return request<Runtimes>("/settings/runtimes")
}

// Plik idzie jako surowe ciało żądania (bez formularza multipart)
export function restoreBackup(file: Blob): Promise<{ tasks: number; backup_path: string }> {
  return request("/backup/restore", { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } })
}
