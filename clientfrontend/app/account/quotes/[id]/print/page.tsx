"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { quotesApi } from "@/lib/api/client";

interface LineItem {
  name?: string;
  description?: string;
  amount: string;
}

interface QuoteVersion {
  id: string;
  version_number: number;
  status: string;
  scope_summary?: string;
  line_items: LineItem[];
  subtotal: string;
  shipping_amount: string;
  tax: {
    type: string;
    amount: string;
    cgst_amount?: string;
    sgst_amount?: string;
    igst_amount?: string;
  };
  total: string;
  estimated_timeline?: string;
  valid_until?: string;
  terms?: string;
  created_at?: string;
}

interface QuoteDetail {
  id: string;
  status: string;
  request_type: string;
  request_id: string;
  current_version: QuoteVersion;
}

export default function PrintableQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const quoteId = resolvedParams.id;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadQuote() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || undefined : undefined;
        const res = await quotesApi.getQuote(quoteId, token);
        if (res?.data) {
          setQuote(res.data);
        } else {
          setError("Quotation details could not be retrieved.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load quotation.");
      } finally {
        setLoading(false);
      }
    }

    if (quoteId) {
      loadQuote();
    }
  }, [quoteId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mx-auto" />
          <p className="mt-3 text-xs text-zinc-600 font-mono">Generating formal engineering quotation...</p>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-sm border border-zinc-200">
          <h2 className="text-lg font-bold text-red-600">Quotation Unavailable</h2>
          <p className="mt-2 text-xs text-zinc-600">{error || "Quotation record not found."}</p>
          <button
            onClick={() => window.close()}
            className="mt-6 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  const ver = quote.current_version;
  const issueDate = ver.created_at
    ? new Date(ver.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Current";
  const validUntilDate = ver.valid_until
    ? new Date(ver.valid_until).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "14 Days from Issue";

  return (
    <div className="min-h-screen bg-zinc-100 py-10 px-4 text-zinc-900 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .quote-sheet {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 20px 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Action Bar (Hidden on print) */}
      <div className="no-print mx-auto max-w-4xl mb-6 flex items-center justify-between">
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-white text-zinc-700 border border-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 transition cursor-pointer"
        >
          ← Close Window
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 transition cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save as PDF
        </button>
      </div>

      {/* Main Quotation Sheet */}
      <div className="quote-sheet mx-auto max-w-4xl bg-white p-10 sm:p-12 rounded-3xl border border-zinc-200 shadow-sm font-sans">
        {/* Header Letterhead */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-8 border-b-2 border-zinc-900">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-zinc-900">VenopAI Technologies</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 font-mono">
                ENGINEERING DEPT
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Hardware Engineering, Rapid PCB Fabrication &amp; Turnkey Realization
            </p>
            <p className="mt-3 text-[11px] text-zinc-600 leading-relaxed">
              4th Floor, Tech Hub, Pune-Bangalore Highway, Pune, MH - 411045, India<br />
              <strong>GSTIN:</strong> 27ABCDE1234F1Z5 &nbsp;|&nbsp; <strong>PAN:</strong> ABCDE1234F<br />
              <strong>Web:</strong> https://venopai.com &nbsp;|&nbsp; <strong>Contact:</strong> projects@venopai.com
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="inline-block rounded-md bg-zinc-100 px-3 py-1 text-[11px] font-bold font-mono text-zinc-800 uppercase tracking-wider">
              FORMAL QUOTATION
            </div>
            <div className="mt-3 text-lg font-bold font-mono text-zinc-900">
              QUO-{quote.id.slice(0, 8).toUpperCase()}
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              <strong>Revision:</strong> Version {ver.version_number}
            </div>
            <div className="text-xs text-zinc-600">
              <strong>Date of Issue:</strong> {issueDate}
            </div>
            <div className="text-xs text-zinc-600">
              <strong>Valid Until:</strong> {validUntilDate}
            </div>
          </div>
        </div>

        {/* Client & Project Overview */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-8 pb-8 border-b border-zinc-200">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Client / Institution</span>
            <div className="mt-1 text-sm font-bold text-zinc-900">Valued Research &amp; Engineering Partner</div>
            <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
              Account Reference: <span className="font-mono text-zinc-800">{quote.id}</span><br />
              Associated Request: <span className="font-mono text-zinc-800 capitalize">{quote.request_type?.replace("_", " ")}</span><br />
              Place of Supply: Maharashtra (27)
            </p>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Engineering Scope</span>
            <div className="mt-1 text-sm font-bold text-zinc-900 capitalize">
              {quote.request_type?.replace("_", " ")} Realization
            </div>
            <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
              {ver.scope_summary || "Turnkey hardware prototyping, verification, BOM procurement, and fabrication per submitted specifications."}
            </p>
            {ver.estimated_timeline && (
              <div className="mt-2 text-xs font-semibold text-emerald-700">
                Estimated Delivery Timeline: {ver.estimated_timeline}
              </div>
            )}
          </div>
        </div>

        {/* Milestone & Line Item Breakdown */}
        <div className="mt-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Deliverables &amp; Cost Breakdown
          </h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                <th className="py-2.5 px-3 font-bold text-zinc-700 uppercase">#</th>
                <th className="py-2.5 px-3 font-bold text-zinc-700 uppercase">Deliverable / Milestone Scope</th>
                <th className="py-2.5 px-3 font-bold text-zinc-700 uppercase text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {ver.line_items && ver.line_items.length > 0 ? (
                ver.line_items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/50">
                    <td className="py-3 px-3 font-mono text-zinc-400">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-zinc-900">{item.name || `Phase ${idx + 1} Milestone`}</div>
                      {item.description && (
                        <div className="text-[11px] text-zinc-500 mt-0.5">{item.description}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900">
                      ₹{parseFloat(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 px-3 font-mono text-zinc-400">1</td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-zinc-900">Comprehensive Engineering &amp; Fabrication Scope</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{ver.scope_summary}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900">
                    ₹{parseFloat(ver.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="mt-8 flex flex-col sm:flex-row justify-between items-start gap-8 pt-6 border-t border-zinc-200">
          <div className="max-w-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Institutional PO &amp; Banking Details</span>
            <div className="mt-2 rounded-xl bg-zinc-50 p-4 border border-zinc-200 text-[11px] text-zinc-600 leading-relaxed font-mono">
              <strong>Account Name:</strong> VenopAI Technologies Pvt. Ltd.<br />
              <strong>Bank:</strong> HDFC Bank Ltd., Kothrud Branch, Pune<br />
              <strong>Account Number:</strong> 50200084920194<br />
              <strong>IFSC Code:</strong> HDFC0000148<br />
              <strong>Account Type:</strong> Current Account
            </div>
            <p className="mt-2 text-[10px] text-zinc-400">
              For online credit/debit/UPI payments, approve this quote inside the VenopAI customer portal to trigger immediate Razorpay gateway settlement.
            </p>
          </div>

          <div className="w-full sm:w-72">
            <div className="flex justify-between py-1.5 text-xs text-zinc-600">
              <span>Engineering Subtotal:</span>
              <span className="font-mono font-semibold">₹{parseFloat(ver.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-1.5 text-xs text-zinc-600">
              <span>GST Tax ({ver.tax?.type || "18%"}):</span>
              <span className="font-mono font-semibold">₹{parseFloat(ver.tax?.amount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-1.5 text-xs text-zinc-600">
              <span>Packaging &amp; Insured Shipping:</span>
              <span className="font-mono font-semibold">₹{parseFloat(ver.shipping_amount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between py-3 mt-2 border-t-2 border-zinc-900 text-sm font-black text-zinc-900">
              <span>Total Quotation (INR):</span>
              <span className="font-mono text-base">₹{parseFloat(ver.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="mt-10 pt-6 border-t border-zinc-200 text-[10px] text-zinc-500 leading-relaxed">
          <h4 className="font-bold uppercase tracking-wider text-zinc-700 mb-2">Terms &amp; Engineering Conditions</h4>
          <ol className="list-decimal pl-4 space-y-1">
            <li><strong>Intellectual Property:</strong> 100% full intellectual property rights, Gerber archives, and firmware source files are assigned to the client upon final invoice settlement.</li>
            <li><strong>Validity:</strong> This quotation remains locked for 14 calendar days from the date of issue. Components subject to international semiconductor allocation.</li>
            <li><strong>Tolerances:</strong> All fabrication adheres to IPC-A-610 Class 2 commercial and research standards unless otherwise agreed in writing.</li>
            <li><strong>Changes:</strong> Any revisions to schematic or CAD models after quote approval require formal Engineering Change Order (ECO) review.</li>
          </ol>
        </div>

        {/* Signatures */}
        <div className="mt-12 pt-6 border-t border-dashed border-zinc-300 flex justify-between items-end">
          <div>
            <div className="text-[10px] text-zinc-400">Client Acceptance Signature</div>
            <div className="mt-8 w-48 border-b border-zinc-400" />
            <div className="mt-1 text-[10px] text-zinc-500">Date &amp; Institutional Stamp</div>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold text-zinc-800">For VenopAI Technologies Pvt. Ltd.</div>
            <div className="mt-4 font-mono text-xs font-bold text-emerald-700">
              ✓ Digitally Approved &amp; Validated
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">Lead Engineering Manager</div>
          </div>
        </div>
      </div>
    </div>
  );
}
