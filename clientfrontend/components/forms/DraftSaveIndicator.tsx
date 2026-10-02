"use client";

import React from "react";
import { SaveStatus } from "@/hooks/useFormDraft";

interface DraftSaveIndicatorProps {
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  isOnline?: boolean;
  className?: string;
}

export function DraftSaveIndicator({
  saveStatus,
  lastSaved,
  isOnline = true,
  className = "",
}: DraftSaveIndicatorProps) {
  const formatTime = (date: Date) => {
    try {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs transition-opacity duration-300 ${
        saveStatus === "idle" && !lastSaved ? "opacity-0" : "opacity-100"
      } ${className}`}
      aria-live="polite"
    >
      {!isOnline ? (
        <>
          <span className="h-2 w-2 rounded-full bg-amber-500 shadow-xs shadow-amber-500/50" />
          <span className="font-medium text-amber-700 dark:text-amber-400">
            Offline mode (Saved locally)
          </span>
        </>
      ) : saveStatus === "saving" ? (
        <>
          <svg
            className="h-3 w-3 animate-spin text-zinc-400 dark:text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="font-medium text-zinc-500 dark:text-zinc-400">Saving draft...</span>
        </>
      ) : saveStatus === "saved" || lastSaved ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-zinc-600 dark:text-zinc-400">
            Draft saved locally {lastSaved ? `at ${formatTime(lastSaved)}` : ""}
          </span>
        </>
      ) : saveStatus === "error" ? (
        <>
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-medium text-red-600 dark:text-red-400">Local save interrupted</span>
        </>
      ) : null}
    </div>
  );
}
