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
  // 204 i puste odpowiedzi nie mają treści JSON
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
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
