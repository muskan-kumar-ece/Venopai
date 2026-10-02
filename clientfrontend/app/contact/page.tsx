"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useFormDraft } from "@/hooks/useFormDraft";
import { DraftRecoveryBanner } from "@/components/forms/DraftRecoveryBanner";
import { DraftSaveIndicator } from "@/components/forms/DraftSaveIndicator";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "Manufacturing Consultation",
    message: "",
  });

  const {
    saveStatus,
    lastSaved,
    draftTimestamp,
    isOnline,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    formKey: "venopai_draft_contact",
    formData: form,
    setFormData: setForm,
    metadata: {
      title: "Contact Inquiry",
    },
  });

  const handleDiscard = () => {
    discardDraft(() => {
      setForm({
        name: "",
        email: "",
        phone: "",
        subject: "Manufacturing Consultation",
        message: "",
      });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate inquiry dispatch
    setTimeout(async () => {
      await clearDraft();
      setLoading(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            SUPPORT & INQUIRIES
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            Connect with VenopAI Engineering
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Have questions regarding PCB fabrication tolerances, component sourcing, or bulk contract manufacturing? Our engineering specialists respond within 4 business hours.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3">
          {/* Contact Details */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Engineering HQ & Lab</h3>
              <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">
                VenopAI Technologies Pvt Ltd
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                100 Feet Road, HAL 2nd Stage,<br />
                Indiranagar, Bengaluru,<br />
                Karnataka 560038, India
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Direct Support Channels</h3>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-zinc-400">Email: </span>
                  <a href="mailto:support@venopai.com" className="font-semibold text-emerald-600 hover:underline">
                    support@venopai.com
                  </a>
                </div>
                <div>
                  <span className="text-zinc-400">Engineering Lab: </span>
                  <a href="mailto:engineering@venopai.com" className="font-semibold text-emerald-600 hover:underline">
                    engineering@venopai.com
                  </a>
                </div>
                <div>
                  <span className="text-zinc-400">Operating Hours: </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Mon - Sat: 9:00 AM - 7:00 PM IST
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Enterprise SLA Guarantee
              </h3>
              <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
                All production quotes, Gerber DFM checks, and technical clarification queries are addressed under strict NDA within 4 business hours.
              </p>
            </div>

            {/* Statutory Grievance Redressal Officer Card */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                  Statutory Grievance Officer
                </h3>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Published pursuant to Rule 3(2) of IT Rules, 2021 & Rule 5(9) of Consumer Protection (E-Commerce) Rules, 2020:
              </p>
              <div className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <p><strong>Designated Officer:</strong> Rajesh Kumar, Compliance Lead</p>
                <p><strong>Email:</strong> <a href="mailto:grievance@venopai.com" className="text-emerald-600 underline">grievance@venopai.com</a></p>
                <p><strong>Helpline:</strong> +91 (80) 4123-8900</p>
                <p><strong>SLA:</strong> 24h acknowledgment &bull; 15-day resolution</p>
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Link
                  href="/grievance"
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1"
                >
                  View Grievance Escalation Procedure &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {submitted ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/60">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300 font-bold text-xl">
                    &#10003;
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-emerald-900 dark:text-emerald-200">
                    Inquiry Received
                  </h3>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    An engineering specialist will review your request and get in touch at {form.email} shortly.
                  </p>
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setForm({ name: "", email: "", phone: "", subject: "Manufacturing Consultation", message: "" });
                    }}
                    className="mt-5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                  >
                    Submit Another Inquiry
                  </button>
                </div>
              ) : (
                <div>
                  <DraftRecoveryBanner
                    draftTimestamp={draftTimestamp}
                    onDiscard={handleDiscard}
                    formTitle="Engineering Inquiry"
                  />
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Send Technical Message
                    </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800 dark:focus:text-white"
                        placeholder="Dr. Rajesh Kumar"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Email Address *</label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800 dark:focus:text-white"
                        placeholder="rajesh@aerospace.in"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Phone Number (Optional)</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800 dark:focus:text-white"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Inquiry Domain</label>
                      <select
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800 dark:focus:text-white"
                      >
                        <option value="Manufacturing Consultation">Manufacturing Consultation</option>
                        <option value="PCB Layout & Design">PCB Layout & Design</option>
                        <option value="Embedded Firmware">Embedded Firmware</option>
                        <option value="Component Procurement">Component Procurement</option>
                        <option value="Corporate Billing & GST">Corporate Billing & GST</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Requirements / Project Brief *</label>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Outline your target volume, layer stackup, components, or schedule deadlines..."
                      className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:text-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-800 dark:focus:text-white"
                    />
                  </div>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 pt-1">
                    <span className="text-emerald-500">🔒</span>
                    <span>
                      Inquiry data is processed under strict confidentiality in compliance with the DPDP Act 2023. We never share contact details.
                    </span>
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <DraftSaveIndicator saveStatus={saveStatus} lastSaved={lastSaved} isOnline={isOnline} />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full sm:w-auto px-6 rounded-xl bg-zinc-900 py-3 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                    >
                      {loading ? "Transmitting..." : "Send Engineering Inquiry"}
                    </button>
                  </div>
                </form>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
