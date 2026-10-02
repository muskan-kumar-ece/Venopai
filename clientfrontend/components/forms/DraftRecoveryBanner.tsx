"use client";

import React, { useState } from "react";

interface DraftRecoveryBannerProps {
  draftTimestamp: Date | null;
  onDiscard: () => void;
  onDismiss?: () => void;
  formTitle?: string;
  hasUploadedFiles?: boolean;
}

export function DraftRecoveryBanner({
  draftTimestamp,
  onDiscard,
  onDismiss,
  formTitle = "form",
  hasUploadedFiles = false,
}: DraftRecoveryBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  if (dismissed || !draftTimestamp) return null;

  const formatTime = (date: Date): string => {
    try {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return "just now";
      if (diffMins === 1) return "1 minute ago";
      if (diffMins < 60) return `${diffMins} minutes ago`;
      if (diffHours === 1) return "1 hour ago";
      if (diffHours < 24) return `${diffHours} hours ago`;

      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "a previous session";
    }
  };

  const handleDiscard = async () => {
    setIsDiscarding(true);
    try {
      await onDiscard();
      setDismissed(true);
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-50/80 p-4 text-emerald-950 backdrop-blur-sm transition-all dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <svg
              className="h-4 w-4 animate-spin-reverse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Unsaved draft recovered ({formatTime(draftTimestamp)})
            </p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
              Your previous inputs {hasUploadedFiles ? "and attached CAD/specs files" : ""} were restored from local storage.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isDiscarding}
            className="rounded-lg border border-red-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-red-600 shadow-xs hover:bg-red-50 focus:outline-hidden dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
          >
            {isDiscarding ? "Resetting..." : "Discard & Start Fresh"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 focus:outline-hidden dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
          >
            Keep Working
          </button>
        </div>
      </div>
    </div>
  );
}
