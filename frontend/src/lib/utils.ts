import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Łączy klasy Tailwind; przy konflikcie (np. p-2 i p-4) wygrywa ostatnia
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
