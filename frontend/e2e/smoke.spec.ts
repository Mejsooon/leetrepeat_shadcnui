import { expect, test } from "@playwright/test"

test("start, nawigacja, odświeżenie głębokiego linku i motyw", async ({ page }) => {
  // Aplikacja działa offline: każde żądanie musi iść do lokalnego serwera
  const requests: string[] = []
  page.on("request", (r) => requests.push(r.url()))

  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Pulpit" })).toBeVisible()

  await page.getByRole("link", { name: "Statystyki" }).click()
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Statystyki" })).toBeVisible()

  await page.getByRole("radio", { name: "Motyw ciemny" }).click()
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)

  // Serwer działa, więc baneru braku połączenia nie ma
  await expect(page.getByText("Nie można połączyć się z aplikacją")).toHaveCount(0)

  for (const url of requests) expect(url.startsWith("http://127.0.0.1:8000")).toBe(true)
})
