"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { apiClient, quotesApi } from "@/lib/api/client";

interface QuoteVersion {
  id: string;
  version_number: number;
  status: string;
  scope_summary?: string;
  line_items: Array<{ name?: string; description?: string; amount: string }>;
  subtotal: string;
  tax: { type: string; amount: string };
  shipping_amount: string;
  total: string;
}

interface QuoteData {
  id: string;
  status: string;
  request_type: string;
  request_id: string;
  current_version: QuoteVersion;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function QuotePaymentContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quote_id");

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment execution state
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "initiating" | "confirming" | "success" | "failed">("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem("access_token");
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {
      // ignore
    }
    return {};
  };

  const loadQuote = async () => {
    if (!quoteId) {
      setError("No quotation ID provided in payment request.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || undefined : undefined;
      const res = await quotesApi.getQuote(quoteId, token);
      if (res?.data) {
        setQuote(res.data);
      } else {
        setError("Quotation details could not be found.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (
          err.message.includes("401") ||
          (err as { status?: number }).status === 401 ||
          err.message.includes("credentials") ||
          err.message.includes("UNAUTHORIZED")
        ) {
          setError("AUTH_REQUIRED");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to load quotation for payment.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuote();
  }, [quoteId]);

  const handleConfirmPayment = async (
    paymentId: string,
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature: string
  ) => {
    setPaymentStatus("confirming");
    setPaymentError(null);
    try {
      const headers = getAuthHeaders();
      await apiClient.post(
        `/payments/${paymentId}/confirm`,
        {
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: razorpaySignature,
        },
        { headers }
      );
      setConfirmedPaymentId(paymentId);
      setPaymentStatus("success");
      await loadQuote();
    } catch (err: unknown) {
      setPaymentStatus("failed");
      setPaymentError(err instanceof Error ? err.message : "Payment verification failed.");
    }
  };

  const handlePayWithRazorpay = async () => {
    if (!quote) return;
    setPaymentStatus("initiating");
    setPaymentError(null);

    try {
      const headers = getAuthHeaders();
      const initRes = await apiClient.post(
        "/payments/initiate",
        {
          source_type: "quote",
          source_id: quote.id,
        },
        { headers }
      );

      const paymentData = initRes?.data;
      if (!paymentData) throw new Error("Could not initialize payment transaction.");

      const { payment_id, gateway_order_id, amount_paise, key_id, customer } = paymentData;
      const scriptLoaded = await loadRazorpayScript();
      const isMockGateway = !key_id || key_id.includes("mock");
      const isDevelopment = process.env.NODE_ENV !== "production";

      if (!scriptLoaded) {
        if (isDevelopment && isMockGateway) {
          await handleConfirmPayment(payment_id, `pay_sim_${Date.now()}`, gateway_order_id, "mock_valid_signature");
          return;
        }
        throw new Error("Unable to load secure Razorpay payment gateway. If you are using an ad blocker, privacy shield, or tracker blocker (e.g. Brave, uBlock), please disable it for this payment.");
      }

      if (isMockGateway) {
        if (isDevelopment) {
          await handleConfirmPayment(payment_id, `pay_sim_${Date.now()}`, gateway_order_id, "mock_valid_signature");
          return;
        }
        throw new Error("Payment gateway is currently unconfigured. Please contact support.");
      }

      const options = {
        key: key_id,
        amount: amount_paise,
        currency: "INR",
        name: "VenopAI Engineering",
        description: `Quotation Payment #${quote.id.slice(0, 8)}`,
        order_id: gateway_order_id,
        prefill: {
          name: customer?.name || "",
          email: customer?.email || "",
          contact: customer?.phone || "",
        },
        theme: {
          color: "#059669",
        },
        handler: async function (response: any) {
          await handleConfirmPayment(
            payment_id,
            response.razorpay_payment_id,
            response.razorpay_order_id,
            response.razorpay_signature
          );
        },
        modal: {
          ondismiss: function () {
            setPaymentStatus("idle");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: unknown) {
      setPaymentStatus("failed");
      setPaymentError(err instanceof Error ? err.message : "Failed to initiate payment.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Loading quotation invoice & payment gateway...</p>
        </div>
      </div>
    );
  }

  if (error === "AUTH_REQUIRED") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center mx-auto text-xl font-bold">
            🔒
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Sign In Required</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Please sign in to securely authorize and process payment for this quotation.
          </p>
          <div className="pt-2">
            <Link
              href={`/login?redirect=${encodeURIComponent(`/checkout/payment?quote_id=${quoteId || ""}`)}`}
              className="inline-flex px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              Sign In to Pay
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Payment Invoice Error</h2>
          <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{error || "Quotation could not be located."}</p>
          <div className="pt-2">
            <Link
              href="/account/quotes"
              className="inline-flex px-4 py-2 bg-zinc-900 dark:bg-zinc-800 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-700 transition"
            >
              &larr; Return to Quotes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const ver = quote.current_version;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Link href={`/account/quotes/${quote.id}`} className="hover:text-zinc-900 dark:hover:text-white font-medium transition">
            &larr; Quotation #{quote.id.slice(0, 8)}
          </Link>
          <span>/</span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">Checkout & Payment</span>
        </div>

        {/* Payment Success View */}
        {paymentStatus === "success" && (
          <div className="bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-8 text-center space-y-5 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                Payment Confirmed
              </span>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">Quotation Paid Successfully</h1>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
                Your payment of <strong className="text-zinc-900 dark:text-white font-mono">₹{ver.total}</strong> has been verified and registered. The engineering engagement is now authorized and entering execution.
              </p>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 text-left text-xs space-y-1 font-mono">
              <div className="text-zinc-500 dark:text-zinc-400">
                Quotation ID: <span className="text-zinc-900 dark:text-white font-semibold">{quote.id}</span>
              </div>
              {confirmedPaymentId && (
                <div className="text-zinc-500 dark:text-zinc-400">
                  Payment Ref: <span className="text-zinc-900 dark:text-white font-semibold">{confirmedPaymentId}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={`/account/quotes/${quote.id}`}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                View Updated Quote &rarr;
              </Link>
              <Link
                href="/account"
                className="px-5 py-2.5 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Regular Invoice & Payment Trigger */}
        {paymentStatus !== "success" && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                    Engineering Order Payment
                  </span>
                  <h1 className="text-xl font-bold text-zinc-900 dark:text-white mt-2">Quotation #{quote.id.slice(0, 8)}</h1>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">Type: {quote.request_type?.replace("_", " ")}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">Total Payable</div>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">₹{ver.total}</div>
                </div>
              </div>
            </div>

            {/* Error banner */}
            {paymentError && (
              <div className="m-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 font-medium">
                <strong>Payment Error:</strong> {paymentError}
              </div>
            )}

            {/* Line items summary */}
            <div className="p-6 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Deliverables Breakdown</h2>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden text-xs">
                {ver.line_items?.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.name}</span>
                    <span className="font-mono font-semibold text-zinc-900 dark:text-white">₹{item.amount}</span>
                  </div>
                ))}
              </div>

              {/* Cost summary table */}
              <div className="space-y-1.5 pt-2 text-xs text-zinc-600 dark:text-zinc-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono text-zinc-900 dark:text-white">₹{ver.subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Logistics & Handling</span>
                  <span className="font-mono text-zinc-900 dark:text-white">₹{ver.shipping_amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxes ({ver.tax?.type})</span>
                  <span className="font-mono text-zinc-900 dark:text-white">₹{ver.tax?.amount}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-900 dark:text-white">
                  <span>Total Due</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">₹{ver.total}</span>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                {quote.status === "paid" ? (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                    This quotation has already been paid and activated.
                  </div>
                ) : (
                  <button
                    onClick={handlePayWithRazorpay}
                    disabled={paymentStatus === "initiating" || paymentStatus === "confirming"}
                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/25 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    {paymentStatus === "initiating" && (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Opening Razorpay Gateway...</span>
                      </>
                    )}
                    {paymentStatus === "confirming" && (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Verifying Payment Signature...</span>
                      </>
                    )}
                    {paymentStatus !== "initiating" && paymentStatus !== "confirming" && (
                      <span>Pay ₹{ver.total} via Razorpay Gateway &rarr;</span>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500 pt-1">
                <span>🔒 256-bit Encrypted</span>
                <span>&bull;</span>
                <span>Razorpay Authorized</span>
                <span>&bull;</span>
                <span>Instant Milestone Allocation</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuotePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Initializing secure payment checkout...</p>
          </div>
        </div>
      }
    >
      <QuotePaymentContent />
    </Suspense>
  );
}
