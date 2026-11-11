import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ImportDialog from "@/components/ImportDialog"
import { IMPORT_PROMPT } from "@/lib/importPrompt"
import { stubApi } from "@/test/renderApp"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const TASK = {
  title: "Suma liczb parzystych", language: "python", kind: "function", difficulty: "easy", description: "d",
  starter_code: "", hint: "", solution: "s",
  tests: [1, 2, 3, 4, 5].map((n) => ({ input: `f(${n})`, expected: "1" })), tags: ["Listy", "Pętle"],
}
const PROGRAM = {
  ...TASK, title: "Podwój liczbę", language: "csharp", kind: "program", tests: [{ input: "4", expected: "8" }], tags: [],
}

// Podgląd: nowe zadanie, duplikat i zadanie z błędem bez tytułu (pozycja 7 w pliku)
const PREVIEW = {
  items: [
    { index: 0, title: TASK.title, language: "python", status: "new", message: "", task: TASK },
    { index: 1, title: "Nazwa typu obiektu", language: "python", status: "duplicate", message: "Już jest w bibliotece", task: null },
    { index: 6, title: null, language: null, status: "invalid", message: "tests: Dodaj co najmniej jeden test", task: null },
  ],
}

function requests(fetchMock: ReturnType<typeof stubApi>, path: string) {
  return fetchMock.mock.calls.filter((c) => (c[0] as string) === path)
}

async function openDialog(user = userEvent.setup()) {
  render(<ImportDialog onImported={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: "Importuj" }))
  return { user, field: screen.getByLabelText("JSON z zadaniami") }
}

it("kopiuje instrukcję dla AI i na 2 s pokazuje „Skopiowano”", async () => {
  stubApi({})
  const { user } = await openDialog()
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole("button", { name: "Skopiuj instrukcję dla AI" }))
  await act(async () => {})
  expect(writeText).toHaveBeenCalledWith(IMPORT_PROMPT)
  expect(screen.getByRole("button", { name: "Skopiowano" })).toBeInTheDocument()
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  expect(screen.getByRole("button", { name: "Skopiuj instrukcję dla AI" })).toBeInTheDocument()
  void user
})

it("wklejenie do pustego pola od razu uruchamia podgląd", async () => {
  const fetchMock = stubApi({ "/api/import/preview": PREVIEW })
  const { user, field } = await openDialog()
  await user.click(field)
  await user.paste("[1]")
  expect(await screen.findByText("Suma liczb parzystych")).toBeInTheDocument()
  expect(screen.getByText("Nazwa typu obiektu")).toBeInTheDocument()
  expect(requests(fetchMock, "/api/import/preview")).toHaveLength(1)
  expect(JSON.parse(requests(fetchMock, "/api/import/preview")[0][1]!.body as string)).toEqual({ text: "[1]" })
})

it("Ctrl+A i wklejenie w niepustym polu też uruchamia podgląd", async () => {   // Review Focus 4
  const fetchMock = stubApi({ "/api/import/preview": PREVIEW })
  const { user, field } = await openDialog()
  await user.type(field, "abc")
  ;(field as HTMLTextAreaElement).setSelectionRange(0, 3)
  await user.paste("[2]")
  await screen.findByText("Suma liczb parzystych")
  expect(JSON.parse(requests(fetchMock, "/api/import/preview")[0][1]!.body as string)).toEqual({ text: "[2]" })
})

it("pisanie nie uruchamia podglądu; „Sprawdź” tak", async () => {
  const fetchMock = stubApi({ "/api/import/preview": PREVIEW })
  const { user, field } = await openDialog()
  expect(screen.getByRole("button", { name: "Sprawdź" })).toBeDisabled()
  await user.type(field, "[[1]]")
  expect(requests(fetchMock, "/api/import/preview")).toHaveLength(0)
  await user.click(screen.getByRole("button", { name: "Sprawdź" }))
  await screen.findByText("Suma liczb parzystych")
  expect(requests(fetchMock, "/api/import/preview")).toHaveLength(1)
})

it("wybrany plik trafia do pola i uruchamia podgląd", async () => {
  const fetchMock = stubApi({ "/api/import/preview": PREVIEW })
  const { user } = await openDialog()
  const file = new File(['[{"title": "z pliku"}]'], "zadania.json", { type: "application/json" })
  await user.upload(screen.getByLabelText("Plik z zadaniami"), file)
  await screen.findByText("Suma liczb parzystych")
  expect(JSON.parse(requests(fetchMock, "/api/import/preview")[0][1]!.body as string)).toEqual({ text: '[{"title": "z pliku"}]' })
  await user.click(screen.getByRole("button", { name: "Wstecz" }))
  expect(screen.getByLabelText("JSON z zadaniami")).toHaveValue('[{"title": "z pliku"}]')
})

it("za duży plik — komunikat i brak żądania", async () => {
  const fetchMock = stubApi({ "/api/import/preview": PREVIEW })
  const { user } = await openDialog()
  const file = new File(["[]"], "duzy.json", { type: "application/json" })
  Object.defineProperty(file, "size", { value: 1_048_577 })
  await user.upload(screen.getByLabelText("Plik z zadaniami"), file)
  expect(await screen.findByText("Plik jest za duży (najwyżej 1 MB)")).toBeInTheDocument()
  expect(requests(fetchMock, "/api/import/preview")).toHaveLength(0)
})

it("błąd 422 pokazuje się pod polem, a tekst zostaje", async () => {
  stubApi({
    "/api/import/preview": new Response(JSON.stringify({ detail: "Nieprawidłowy JSON w linii 1, kolumnie 2" }), { status: 422 }),
  })
  const { user, field } = await openDialog()
  await user.click(field)
  await user.paste("[{")
  expect(await screen.findByText("Nieprawidłowy JSON w linii 1, kolumnie 2")).toBeInTheDocument()
  expect(screen.getByLabelText("JSON z zadaniami")).toHaveValue("[{")
  expect(screen.getByLabelText("JSON z zadaniami")).toHaveAttribute("aria-invalid", "true")
})

it("duplikat i zadanie z błędem: komunikat, wyłączony i pusty checkbox", async () => {
  stubApi({ "/api/import/preview": PREVIEW })
  const { user, field } = await openDialog()
  await user.click(field)
  await user.paste("[1]")
  await screen.findByText("Suma liczb parzystych")
  expect(screen.getByText("Już jest w bibliotece")).toBeInTheDocument()
  expect(screen.getByText("tests: Dodaj co najmniej jeden test")).toBeInTheDocument()
  const duplicate = screen.getByRole("checkbox", { name: "Nazwa typu obiektu" })
  expect(duplicate).toBeDisabled()
  expect(duplicate).not.toBeChecked()
  const invalid = screen.getByRole("checkbox", { name: "(bez tytułu) #7" })
  expect(invalid).toBeDisabled()
  expect(invalid).not.toBeChecked()
  const invalidRow = invalid.closest("tr")!
  expect(within(invalidRow).getByText("Pozycja 7 w pliku")).toBeInTheDocument()
  expect(within(invalidRow).getByText("—")).toBeInTheDocument()
})

it("opis wiersza: rodzaj, liczba testów i tagi", async () => {
  stubApi({
    "/api/import/preview": {
      items: [
        PREVIEW.items[0],
        { index: 1, title: PROGRAM.title, language: "csharp", status: "new", message: "", task: PROGRAM },
      ],
    },
  })
  const { user, field } = await openDialog()
  await user.click(field)
  await user.paste("[1]")
  expect(await screen.findByText("Funkcja · 5 testów · Listy, Pętle")).toBeInTheDocument()
  expect(screen.getByText("Program · 1 test")).toBeInTheDocument()
  expect(screen.getByRole("checkbox", { name: "Podwój liczbę" })).toBeChecked()
})

it("opis okna z liczbą znalezionych zadań", async () => {
  stubApi({ "/api/import/preview": PREVIEW })
  const { user, field } = await openDialog()
  await user.click(field)
  await user.paste("[1]")
  await waitFor(() =>
    expect(screen.getByText("Znaleziono 3 zadania. Zaznacz te, które chcesz dodać do biblioteki.")).toBeInTheDocument(),
  )
})

// --- Sprawdzanie rozwiązań (Zadanie 6) ---

// Atrapa API, w której każde /api/run czeka, aż test sam poda odpowiedź (kontrola kolejności)
function controlledApi(preview: unknown) {
  const runs: { body: { language: string; kind: string; code: string; tests: unknown[] }; resolve: (r: Response) => void }[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/import/preview") return Promise.resolve(new Response(JSON.stringify(preview), { status: 200 }))
    if (url === "/api/run") {
      return new Promise<Response>((resolve) => runs.push({ body: JSON.parse(init!.body as string), resolve }))
    }
    return Promise.resolve(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 }))
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, runs }
}

function runResponse(statuses: string[]) {
  const results = statuses.map((status) => ({ status, input: "f()", expected: "1", actual: "1", message: null }))
  return new Response(JSON.stringify({ results, duration_ms: 5 }), { status: 200 })
}

function newItems(tasks: (typeof TASK)[]) {
  return { items: tasks.map((task, index) => ({ index, title: task.title, language: task.language, status: "new", message: "", task })) }
}

async function pastePreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("JSON z zadaniami"))
  await user.paste("[1]")
}

it("rozwiązanie przechodzi testy — zadanie zaznaczone", async () => {
  const { runs } = controlledApi(newItems([TASK]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  expect(runs[0].body).toEqual({ language: "python", kind: "function", code: "s", tests: TASK.tests })
  await act(async () => runs[0].resolve(runResponse(["pass", "pass", "pass", "pass", "pass"])))
  expect(await screen.findByText("Rozwiązanie przechodzi testy")).toBeInTheDocument()
  expect(screen.getByRole("checkbox", { name: TASK.title })).toBeChecked()
})

it("rozwiązanie nie przechodzi części testów — zadanie odznaczone, ale da się je zaznaczyć", async () => {
  const { runs } = controlledApi(newItems([TASK]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  await act(async () => runs[0].resolve(runResponse(["pass", "fail", "pass", "error", "pass"])))
  expect(await screen.findByText("Nie przechodzi 2 z 5 testów")).toBeInTheDocument()
  const box = screen.getByRole("checkbox", { name: TASK.title })
  expect(box).not.toBeChecked()
  await user.click(box)
  expect(box).toBeChecked()
})

it("brak Pythona / .NET — „Nie sprawdzono”, zadanie zaznaczone", async () => {
  const { runs } = controlledApi(newItems([TASK, PROGRAM]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  await act(async () => runs[0].resolve(new Response(JSON.stringify({ detail: "Nie znaleziono Pythona" }), { status: 503 })))
  await waitFor(() => expect(runs).toHaveLength(2))
  await act(async () => runs[1].resolve(new Response(JSON.stringify({ detail: "Nie znaleziono dotnet" }), { status: 503 })))
  expect(await screen.findByText("Nie sprawdzono (brak Pythona)")).toBeInTheDocument()
  expect(screen.getByText("Nie sprawdzono (brak .NET)")).toBeInTheDocument()
  expect(screen.getByRole("checkbox", { name: TASK.title })).toBeChecked()
  expect(screen.getByRole("checkbox", { name: PROGRAM.title })).toBeChecked()
})

it("inny błąd sprawdzania — „Nie udało się sprawdzić”, zadanie zaznaczone", async () => {
  const { runs } = controlledApi(newItems([TASK]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  await act(async () => runs[0].resolve(new Response("Internal Server Error", { status: 500 })))
  expect(await screen.findByText("Nie udało się sprawdzić")).toBeInTheDocument()
  expect(screen.getByRole("checkbox", { name: TASK.title })).toBeChecked()
})

it("sprawdza po kolei: drugie zadanie dopiero po odpowiedzi na pierwsze", async () => {
  const { runs } = controlledApi(newItems([TASK, PROGRAM]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  expect(within(screen.getByRole("checkbox", { name: TASK.title }).closest("tr")!).getByText("sprawdzam…")).toBeInTheDocument()
  expect(within(screen.getByRole("checkbox", { name: PROGRAM.title }).closest("tr")!).getByText("czeka na sprawdzenie")).toBeInTheDocument()
  expect(screen.getByText("Sprawdzam rozwiązania: 1 z 2…")).toBeInTheDocument()
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  await act(async () => runs[0].resolve(runResponse(["pass"])))
  await waitFor(() => expect(runs).toHaveLength(2))
  expect(screen.getByText("Sprawdzam rozwiązania: 2 z 2…")).toBeInTheDocument()
})

it("po sprawdzeniu: podsumowanie i pełny pasek", async () => {
  const tasks = [TASK, { ...TASK, title: "B" }, { ...TASK, title: "C" }, PROGRAM]
  const { runs } = controlledApi(newItems(tasks))
  const { user } = await openDialog()
  await pastePreview(user)
  const answers = [runResponse(["pass"]), runResponse(["pass"]), runResponse(["fail"]),
    new Response(JSON.stringify({ detail: "brak" }), { status: 503 })]
  for (let i = 0; i < answers.length; i++) {
    await waitFor(() => expect(runs).toHaveLength(i + 1))
    await act(async () => runs[i].resolve(answers[i]))
  }
  expect(await screen.findByText("Sprawdzono 4 rozwiązania")).toBeInTheDocument()
  expect(screen.getByText("2 gotowe · 1 nie przechodzi · 1 bez sprawdzenia")).toBeInTheDocument()
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
})

it("przycisk importu nieaktywny w trakcie sprawdzania", async () => {
  const { runs } = controlledApi(newItems([TASK]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  expect(screen.getByRole("button", { name: "Importuj 1 zadanie" })).toBeDisabled()
  await act(async () => runs[0].resolve(runResponse(["pass"])))
  await waitFor(() => expect(screen.getByRole("button", { name: "Importuj 1 zadanie" })).toBeEnabled())
})

it("licznik na przycisku z odmianą; bez zaznaczonych — nieaktywny", async () => {
  const tasks = [TASK, { ...TASK, title: "B" }, { ...TASK, title: "C" }]
  const { runs } = controlledApi(newItems(tasks))
  const { user } = await openDialog()
  await pastePreview(user)
  for (let i = 0; i < 3; i++) {
    await waitFor(() => expect(runs).toHaveLength(i + 1))
    await act(async () => runs[i].resolve(runResponse(["pass"])))
  }
  expect(await screen.findByRole("button", { name: "Importuj 3 zadania" })).toBeEnabled()
  await user.click(screen.getByRole("checkbox", { name: "B" }))
  await user.click(screen.getByRole("checkbox", { name: "C" }))
  expect(screen.getByRole("button", { name: "Importuj 1 zadanie" })).toBeEnabled()
  await user.click(screen.getByRole("checkbox", { name: TASK.title }))
  expect(screen.getByRole("button", { name: "Importuj" })).toBeDisabled()
})

it("„Wstecz” przerywa sprawdzanie", async () => {
  const { runs } = controlledApi(newItems([TASK, PROGRAM]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  await user.click(screen.getByRole("button", { name: "Wstecz" }))
  await act(async () => runs[0].resolve(runResponse(["pass"])))
  await act(async () => {})
  expect(runs).toHaveLength(1)
  expect(screen.getByLabelText("JSON z zadaniami")).toBeInTheDocument()
})

it("zamknięcie okna przerywa sprawdzanie", async () => {
  const { runs } = controlledApi(newItems([TASK, PROGRAM]))
  const { user } = await openDialog()
  await pastePreview(user)
  await waitFor(() => expect(runs).toHaveLength(1))
  await user.keyboard("{Escape}")
  await act(async () => runs[0].resolve(runResponse(["pass"])))
  await act(async () => {})
  expect(runs).toHaveLength(1)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
