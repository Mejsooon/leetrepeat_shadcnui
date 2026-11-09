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
    const detail = typeof data?.detail === "string" ? data.detail : `Błąd ${response.status}`
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

export function updateNotes(id: number, notes: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/tasks/${id}/notes`, { method: "PATCH", body: JSON.stringify({ notes }) })
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
