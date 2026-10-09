"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formDraftDB, FormDraftRecord } from "@/lib/storage/formDraftDB";

export interface UseFormDraftOptions<T> {
  formKey: string;
  formData: T;
  setFormData: (data: T | ((prev: T) => T)) => void;
  debounceMs?: number;
  excludeFields?: string[];
  userScoped?: boolean;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
  autoRestore?: boolean;
  onRestore?: (restoredData: T, record: FormDraftRecord<T>) => void;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useFormDraft<T extends Record<string, unknown>>({
  formKey,
  formData,
  setFormData,
  debounceMs = 800,
  excludeFields,
  userScoped = false,
  metadata,
  enabled = true,
  autoRestore = true,
  onRestore,
}: UseFormDraftOptions<T>) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [draftTimestamp, setDraftTimestamp] = useState<Date | null>(null);
  const [isRestored, setIsRestored] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // References to track lifecycle and prevent infinite save loops
  const isInitializedRef = useRef<boolean>(false);
  const isRestoringRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef<T>(formData);
  useEffect(() => {
    latestDataRef.current = formData;
  }, [formData]);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Determine user scope ID (if userScoped is true)
  const getUserScope = useCallback((): string => {
    if (!userScoped) return "anon";
    try {
      if (typeof window !== "undefined") {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed?.id) return parsed.id;
        }
      }
    } catch {
      // Ignore
    }
    return "anon";
  }, [userScoped]);

  // Check connectivity
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Multi-tab sync via BroadcastChannel
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    try {
      const channel = new BroadcastChannel("venopai_draft_sync");
      broadcastChannelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data?.formKey === formKey && event.data?.action === "saved") {
          // Another tab updated this form draft
          setDraftTimestamp(new Date(event.data.updatedAt));
          setHasDraft(true);
        } else if (event.data?.formKey === formKey && event.data?.action === "cleared") {
          setHasDraft(false);
          setDraftTimestamp(null);
        }
      };

      return () => {
        channel.close();
      };
    } catch {
      // Ignore
    }
  }, [formKey]);

  // Initial mount: check for existing draft in local DB
  useEffect(() => {
    if (!enabled || isInitializedRef.current) return;

    let isMounted = true;
    const checkDraft = async () => {
      try {
        const scope = getUserScope();
        const existing = await formDraftDB.getDraft<T>(formKey, scope);

        if (isMounted && existing && existing.data) {
          // Check if data is non-empty
          const hasValues = Object.values(existing.data).some((val) => {
            if (val === null || val === undefined) return false;
            if (typeof val === "string" && val.trim() === "") return false;
            if (Array.isArray(val) && val.length === 0) return false;
            if (typeof val === "boolean") return true;
            if (typeof val === "number") return true;
            return true;
          });

          if (hasValues) {
            setHasDraft(true);
            setDraftTimestamp(new Date(existing.updatedAt));

            if (autoRestore) {
              isRestoringRef.current = true;
              setFormData((prev) => {
                // Merge cleanly with default shape
                const merged = { ...prev, ...existing.data };
                return merged;
              });
              setIsRestored(true);
              if (onRestore) {
                onRestore(existing.data, existing);
              }
              // Allow React render loop to complete before resuming auto-save
              setTimeout(() => {
                isRestoringRef.current = false;
              }, 400);
            }
          }
        }
      } catch (err) {
        console.error("Error inspecting local draft:", err);
      } finally {
        if (isMounted) {
          isInitializedRef.current = true;
        }
      }
    };

    checkDraft();

    return () => {
      isMounted = false;
    };
  }, [formKey, enabled, autoRestore, getUserScope, onRestore, setFormData]);

  // Auto-save debounced effect
  useEffect(() => {
    if (!enabled || !isInitializedRef.current || isRestoringRef.current) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setSaveStatus("saving");

    timerRef.current = setTimeout(async () => {
      try {
        const scope = getUserScope();
        await formDraftDB.saveDraft(
          formKey,
          latestDataRef.current,
          {
            ...metadata,
            url: typeof window !== "undefined" ? window.location.pathname : "",
          },
          scope,
          excludeFields
        );

        setSaveStatus("saved");
        const now = new Date();
        setLastSaved(now);
        setDraftTimestamp(now);
        setHasDraft(true);

        // Notify other open tabs
        if (broadcastChannelRef.current) {
          try {
            broadcastChannelRef.current.postMessage({
              formKey,
              action: "saved",
              updatedAt: now.getTime(),
            });
          } catch {
            // Ignore
          }
        }
      } catch (err) {
        console.error("Draft auto-save error:", err);
        setSaveStatus("error");
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [formData, formKey, enabled, debounceMs, excludeFields, getUserScope, metadata]);

  // Warn if closing tab while in-flight unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveStatus === "saving") {
        // Immediate synchronous flush to localStorage if possible before unload
        try {
          const scope = getUserScope();
          formDraftDB.saveDraft(formKey, latestDataRef.current, metadata, scope, excludeFields);
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveStatus, formKey, getUserScope, metadata, excludeFields]);

  // Restore manually
  const restoreDraft = useCallback(async () => {
    try {
      const scope = getUserScope();
      const draft = await formDraftDB.getDraft<T>(formKey, scope);
      if (draft && draft.data) {
        isRestoringRef.current = true;
        setFormData((prev) => ({ ...prev, ...draft.data }));
        setIsRestored(true);
        if (onRestore) {
          onRestore(draft.data, draft);
        }
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 400);
      }
    } catch (err) {
      console.error("Manual restore error:", err);
    }
  }, [formKey, getUserScope, onRestore, setFormData]);

  // Discard draft completely (user clicked "Start Fresh")
  const discardDraft = useCallback(
    async (resetCallback?: () => void) => {
      try {
        await formDraftDB.removeDraft(formKey);
        setHasDraft(false);
        setDraftTimestamp(null);
        setIsRestored(false);
        setSaveStatus("idle");

        if (resetCallback) {
          resetCallback();
        }

        if (broadcastChannelRef.current) {
          try {
            broadcastChannelRef.current.postMessage({ formKey, action: "cleared" });
          } catch {
            // Ignore
          }
        }
      } catch (err) {
        console.error("Draft discard error:", err);
      }
    },
    [formKey]
  );

  // Clear draft on successful form submit
  const clearDraft = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    try {
      await formDraftDB.removeDraft(formKey);
      setHasDraft(false);
      setDraftTimestamp(null);
      setIsRestored(false);
      setSaveStatus("idle");

      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({ formKey, action: "cleared" });
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      console.error("Draft clear error:", err);
    }
  }, [formKey]);

  return {
    saveStatus,
    lastSaved,
    hasDraft,
    draftTimestamp,
    isRestored,
    isOnline,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
