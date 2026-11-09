import { modKey } from "@/lib/platform"

afterEach(() => vi.restoreAllMocks())

it("⌘ na Macu, Ctrl gdzie indziej", () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
  expect(modKey()).toBe("⌘")
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32")
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0)")
  expect(modKey()).toBe("Ctrl")
})
