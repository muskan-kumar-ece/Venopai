"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { feedbackApi, FeedbackSubmissionPayload } from "@/lib/api/client";
import { useFormDraft } from "@/hooks/useFormDraft";
import { DraftRecoveryBanner } from "@/components/forms/DraftRecoveryBanner";
import { DraftSaveIndicator } from "@/components/forms/DraftSaveIndicator";

interface FeedbackTypeOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  badge: string;
  badgeColor: string;
}

const FEEDBACK_TYPES: FeedbackTypeOption[] = [
  {
    id: "bug_report",
    name: "Bug / Error Report",
    icon: "🐛",
    description: "Something is broken, returning an error, or not rendering correctly.",
    badge: "High Priority",
    badgeColor: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400 border-red-200 dark:border-red-900/60",
  },
  {
    id: "feature_request",
    name: "Feature Request",
    icon: "✨",
    description: "Suggest a new tool, hardware service, CAD tool, or capability.",
    badge: "Product Roadmap",
    badgeColor: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-900/60",
  },
  {
    id: "order_issue",
    name: "Order / Shipment Issue",
    icon: "📦",
    description: "Component delivery delay, damaged package, or fulfillment question.",
    badge: "Logistics Team",
    badgeColor: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-900/60",
  },
  {
    id: "service_issue",
    name: "Service Project Issue",
    icon: "🔧",
    description: "Questions or discrepancies regarding PCB fabrication, firmware, or design.",
    badge: "Engineering Lead",
    badgeColor: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/60",
  },
  {
    id: "payment_issue",
    name: "Payment / Billing Issue",
    icon: "💳",
    description: "Razorpay transaction dispute, GST invoice issue, or charge mismatch.",
    badge: "Critical Triage",
    badgeColor: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-900/60",
  },
  {
    id: "ui_ux_suggestion",
    name: "UI / UX Improvement",
    icon: "🎨",
    description: "Help us refine navigation, dark mode, mobile responsiveness, or typography.",
    badge: "Design Team",
    badgeColor: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border-purple-200 dark:border-purple-900/60",
  },
  {
    id: "general_feedback",
    name: "General Experience",
    icon: "💬",
    description: "Tell us about your experience using the VenopAI hardware platform.",
    badge: "General",
    badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60",
  },
  {
    id: "other",
    name: "Other Inquiry",
    icon: "📄",
    description: "Anything else our engineering and platform staff can assist you with.",
    badge: "Support Queue",
    badgeColor: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  },
];

export default function FeedbackPage() {
  const { user, isAuthenticated } = useAuth();

  const [form, setForm] = useState({
    feedback_type: "bug_report",
    subject: "",
    description: "",
    page_url: "",
    order_id: "",
    screenshot_url: "",
    service_request_type: "",
    guest_name: "",
    guest_email: "",
    guest_phone: "",
  });

  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedItem, setSubmittedItem] = useState<{
    id?: string;
    feedback_type?: string;
    priority?: string;
    subject?: string;
    status?: string;
    [key: string]: unknown;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-detect browser and current page on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setForm((prev) => ({
        ...prev,
        page_url: prev.page_url || window.location.pathname,
        guest_name: prev.guest_name || user?.full_name || "",
        guest_email: prev.guest_email || user?.email || "",
      }));
    }
  }, [user]);

  const {
    saveStatus,
    lastSaved,
    draftTimestamp,
    isOnline,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    formKey: "venopai_draft_feedback",
    formData: form,
    setFormData: setForm,
    metadata: {
      title: "Platform Feedback Submission",
    },
  });

  const handleDiscard = () => {
    discardDraft(() => {
      setForm({
        feedback_type: "bug_report",
        subject: "",
        description: "",
        page_url: typeof window !== "undefined" ? window.location.pathname : "",
        order_id: "",
        screenshot_url: "",
        service_request_type: "",
        guest_name: user?.full_name || "",
        guest_email: user?.email || "",
        guest_phone: "",
      });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.subject.trim() || form.subject.trim().length < 3) {
      setErrorMsg("Please provide a concise subject of at least 3 characters.");
      return;
    }

    if (!form.description.trim() || form.description.trim().length < 5) {
      setErrorMsg("Please provide a detailed description of at least 5 characters.");
      return;
    }

    if (!isAuthenticated && !form.guest_email.trim()) {
      setErrorMsg("Your email address is required so we can keep you updated.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: FeedbackSubmissionPayload = {
        feedback_type: form.feedback_type,
        subject: form.subject.trim(),
        description: form.description.trim(),
        page_url: form.page_url.trim() || undefined,
        order_id: form.order_id.trim() || undefined,
        screenshot_url: form.screenshot_url.trim() || undefined,
        service_request_type: form.service_request_type.trim() || undefined,
        guest_name: form.guest_name.trim() || undefined,
        guest_email: form.guest_email.trim() || undefined,
        guest_phone: form.guest_phone.trim() || undefined,
        browser_info: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      };

      const res = await feedbackApi.submitFeedback(payload);
      await clearDraft();
      setSubmittedItem(res.data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit feedback. Please check your network and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 md:py-16 text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header Breadcrumb & Heading */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            CUSTOMER FEEDBACK & ERROR REPORTING
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl text-zinc-900 dark:text-white">
            Help Shape VenopAI Engineering
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Report bugs, request hardware realization features, or flag an issue with your order. Every submission is triaged directly by our engineering and fulfillment staff.
          </p>

          {mounted && isAuthenticated && (
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Signed in as {user?.full_name || user?.email}
              </span>
              <span>&bull;</span>
              <Link
                href="/account/feedback"
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                View My Feedback History →
              </Link>
            </div>
          )}
        </div>

        {/* Content Container */}
        <div className="mt-10">
          {submittedItem ? (
            /* Success confirmation card */
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 md:p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 text-3xl">
                ✓
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Feedback Successfully Logged
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-lg mx-auto">
                Thank you for helping us refine our platform. Your submission has been routed into our operational triage queue.
              </p>

              {/* Reference Metadata Box */}
              <div className="mt-6 inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
                <div>
                  <span className="text-zinc-400 block font-mono">TICKET REF</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    #{submittedItem.id?.slice(0, 8)}
                  </span>
                </div>
                <div className="hidden sm:block h-6 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <span className="text-zinc-400 block font-mono">CATEGORY</span>
                  <span className="font-medium text-zinc-900 dark:text-white capitalize">
                    {submittedItem.feedback_type?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="hidden sm:block h-6 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <span className="text-zinc-400 block font-mono">PRIORITY</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    {submittedItem.priority}
                  </span>
                </div>
                <div className="hidden sm:block h-6 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <span className="text-zinc-400 block font-mono">STATUS</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    Open for Review
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                {isAuthenticated ? (
                  <Link
                    href="/account/feedback"
                    className="w-full sm:w-auto rounded-xl bg-zinc-900 px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 transition-colors"
                  >
                    Go to My Feedback Queue
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="w-full sm:w-auto rounded-xl bg-zinc-900 px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 transition-colors"
                  >
                    Sign In to Track Updates
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedItem(null);
                    setForm({
                      feedback_type: "bug_report",
                      subject: "",
                      description: "",
                      page_url: typeof window !== "undefined" ? window.location.pathname : "",
                      order_id: "",
                      screenshot_url: "",
                      service_request_type: "",
                      guest_name: user?.full_name || "",
                      guest_email: user?.email || "",
                      guest_phone: "",
                    });
                  }}
                  className="w-full sm:w-auto rounded-xl border border-zinc-200 px-6 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                >
                  Submit Another Report
                </button>
              </div>
            </div>
          ) : (
            /* Main Form */
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <DraftRecoveryBanner
                draftTimestamp={draftTimestamp}
                onDiscard={handleDiscard}
                formTitle="Feedback / Issue Report"
              />

              <form onSubmit={handleSubmit} suppressHydrationWarning className="space-y-8">
                {/* Step 1: Feedback Type Cards */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Step 1: Select Feedback Category *
                    </label>
                    <span className="text-xs text-zinc-400">8 available</span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {FEEDBACK_TYPES.map((type) => {
                      const isSelected = form.feedback_type === type.id;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setForm({ ...form, feedback_type: type.id })}
                          className={`flex flex-col text-left p-3.5 rounded-xl border transition-all text-xs cursor-pointer ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/30 ring-1 ring-emerald-500/20"
                              : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xl">{type.icon}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${type.badgeColor}`}>
                              {type.badge}
                            </span>
                          </div>
                          <span className="mt-2 font-bold text-zinc-900 dark:text-white">
                            {type.name}
                          </span>
                          <span className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                            {type.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Details */}
                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                    Step 2: Provide Issue Details
                  </label>

                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Summary / Headline *
                    </label>
                    <input
                      type="text"
                      required
                      suppressHydrationWarning
                      placeholder={
                        form.feedback_type === "bug_report"
                          ? "e.g., Subtotal does not recalculate when updating quantity in Cart"
                          : form.feedback_type === "feature_request"
                          ? "e.g., Allow direct CSV export of Bill of Materials (BOM)"
                          : form.feedback_type === "order_issue"
                          ? "e.g., Received 5 units instead of 10 for order ORD-1234"
                          : "e.g., Suggestion regarding dark mode PCB layout preview"
                      }
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Detailed Description *
                      </label>
                      <span className="text-[11px] text-zinc-400">
                        {form.description.length} characters
                      </span>
                    </div>
                    <textarea
                      required
                      rows={5}
                      suppressHydrationWarning
                      placeholder={
                        form.feedback_type === "bug_report"
                          ? "Describe the steps to reproduce, what you expected vs what happened, and any error message displayed..."
                          : form.feedback_type === "feature_request"
                          ? "Explain why this feature would be valuable for your electronics or engineering workflow..."
                          : "Provide full context so our engineering team can inspect and resolve the issue quickly..."
                      }
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800"
                    />
                  </div>

                  {/* Contextual fields based on feedback type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Page URL if Bug or UI */}
                    {(form.feedback_type === "bug_report" || form.feedback_type === "ui_ux_suggestion") && (
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Affected Page / URL (Optional)
                        </label>
                        <input
                          type="text"
                          suppressHydrationWarning
                          placeholder="/cart or /products/stm32"
                          value={form.page_url}
                          onChange={(e) => setForm({ ...form, page_url: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                    )}

                    {/* Order ID if Order Issue */}
                    {form.feedback_type === "order_issue" && (
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Order Number or ID (Optional)
                        </label>
                        <input
                          type="text"
                          suppressHydrationWarning
                          placeholder="ORD-..."
                          value={form.order_id}
                          onChange={(e) => setForm({ ...form, order_id: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                    )}

                    {/* Service Type if Service Issue */}
                    {form.feedback_type === "service_issue" && (
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Engineering Domain
                        </label>
                        <select
                          suppressHydrationWarning
                          value={form.service_request_type}
                          onChange={(e) => setForm({ ...form, service_request_type: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        >
                          <option value="">Select Domain...</option>
                          <option value="manufacturing">Rapid PCB Fabrication</option>
                          <option value="design">PCB Layout & Schematic Design</option>
                          <option value="software">Embedded Firmware & Drivers</option>
                          <option value="consultation">Technical Consultation</option>
                        </select>
                      </div>
                    )}

                    {/* Screenshot URL */}
                    <div className={(form.feedback_type === "bug_report" || form.feedback_type === "ui_ux_suggestion") ? "" : "sm:col-span-2"}>
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Screenshot or Video URL (Optional)
                      </label>
                      <input
                        type="url"
                        suppressHydrationWarning
                        placeholder="https://... (Cloudinary, Imgur, or Drive link)"
                        value={form.screenshot_url}
                        onChange={(e) => setForm({ ...form, screenshot_url: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 3: Submitter Information */}
                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Step 3: Contact & Notification
                    </label>
                    {mounted && isAuthenticated && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        Linked to Account
                      </span>
                    )}
                  </div>

                  {mounted && isAuthenticated ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-950/60 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
                          {user?.full_name?.charAt(0) || "U"}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-white">
                            {user?.full_name || "Verified Customer"}
                          </p>
                          <p className="text-zinc-500 dark:text-zinc-400">{user?.email}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400">ID: {user?.id?.slice(0, 8)}</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Your Name (Optional)
                        </label>
                        <input
                          type="text"
                          suppressHydrationWarning
                          autoComplete="name"
                          placeholder="Dr. Rajesh Kumar"
                          value={form.guest_name}
                          onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Your Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          suppressHydrationWarning
                          autoComplete="email"
                          placeholder="rajesh@hardware.in"
                          value={form.guest_email}
                          onChange={(e) => setForm({ ...form, guest_email: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Error Banner */}
                {errorMsg && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    ⚠ {errorMsg}
                  </div>
                )}

                {/* Footer Controls */}
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <DraftSaveIndicator
                    saveStatus={saveStatus}
                    lastSaved={lastSaved}
                    isOnline={isOnline}
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto rounded-xl bg-zinc-900 px-8 py-3 text-xs font-bold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                  >
                    {submitting ? "Transmitting..." : "Submit Feedback Report"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
