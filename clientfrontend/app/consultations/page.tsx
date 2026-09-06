"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { consultationsApi } from "@/lib/api/client";

interface ConsultationSummary {
  id: string;
  topic: string;
  description: string;
  status: string;
  converted_quote_id?: string;
  created_at: string;
  updated_at: string;
}

export default function ConsultationsListPage() {
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    consultationsApi
      .listRequests({ page: 1, page_size: 50 })
      .then((res: { data?: ConsultationSummary[] }) => {
        if (res?.data) {
          setConsultations(res.data);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load consultations";
        setErrorMessage(message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      submitted: { label: "Submitted", color: "bg-blue-950 text-blue-400 border-blue-800" },
      in_progress: { label: "In Review", color: "bg-amber-950 text-amber-400 border-amber-800" },
      responded: { label: "Answer Ready", color: "bg-emerald-950 text-emerald-400 border-emerald-800 animate-pulse" },
      closed: { label: "Closed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
      completed: { label: "Completed", color: "bg-neutral-800 text-neutral-300 border-neutral-700" },
    };
    const s = map[status] || { label: status, color: "bg-neutral-800 text-neutral-300 border-neutral-700" };
    return (
      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; Home
            </Link>
          </div>
          <Link
            href="/consultations/request"
            className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-3.5 py-1.5 rounded-md transition shadow-md shadow-emerald-500/20"
          >
            + Request Technical Consultation
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Engineering Consultations
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Direct, structured technical advisory for schematic reviews, power integrity, MCU selection, and DFM optimization.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="p-16 text-center text-emerald-400 font-mono text-sm animate-pulse">
            Loading your technical consultations...
          </div>
        ) : consultations.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-12 text-center">
            <h3 className="text-lg font-semibold text-white">No consultations yet</h3>
            <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto">
              Submit your engineering challenge, schematic draft, or architecture question to receive authoritative guidance from our senior hardware staff.
            </p>
            <div className="mt-6">
              <Link
                href="/consultations/request"
                className="inline-flex items-center text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-4 py-2 rounded-md transition shadow-md shadow-emerald-500/20"
              >
                Start Consultation
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1">
            {consultations.map((c) => (
              <Link
                key={c.id}
                href={`/consultations/${c.id}`}
                className="block p-5 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 hover:border-neutral-700 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-white group-hover:text-emerald-400 transition">
                        {c.topic}
                      </span>
                      {getStatusBadge(c.status)}
                      {c.converted_quote_id && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-purple-950 text-purple-300 border-purple-800">
                          Quote Converted
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-400 line-clamp-2">
                      {c.description}
                    </p>
                  </div>
                  <div className="text-xs text-neutral-500 font-mono shrink-0">
                    {new Date(c.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
