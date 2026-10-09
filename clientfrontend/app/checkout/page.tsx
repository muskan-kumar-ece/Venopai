"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient, getCustomerToken } from "@/lib/api/client";
import { simulateMockPayment } from "@/lib/payments/mockGateway";
import { useFormDraft } from "@/hooks/useFormDraft";
import { DraftRecoveryBanner } from "@/components/forms/DraftRecoveryBanner";
import { DraftSaveIndicator } from "@/components/forms/DraftSaveIndicator";

interface Address {
  id: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
  serviceability_warning: string | null;
}

interface CheckoutItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: string;
}

interface CheckoutSessionData {
  checkout_session_id: string;
  status: string;
  items: CheckoutItem[] | null;
  address: Address | null;
  reservation_expires_at: string | null;
  shipping: {
    rate: string;
    eta_days_min: number;
    eta_days_max: number;
    eta_description: string;
  } | null;
  tax: {
    type: string;
    amount: string;
    cgst_amount: string | null;
    sgst_amount: string | null;
    igst_amount: string | null;
  } | null;
  subtotal: string | null;
  total: string | null;
}

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

interface ConfirmedOrder {
  order_id?: string;
  order_number?: string;
  id?: string;
  total_amount?: string;
  total?: string;
  [key: string]: unknown;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [session, setSession] = useState<CheckoutSessionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddressModal, setShowAddressModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Payment states (Phase 7)
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "initiating" | "confirming" | "success" | "failed">("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const [agreeCheckoutTerms, setAgreeCheckoutTerms] = useState<boolean>(false);

  // New address form state
  const [formData, setFormData] = useState({
    recipient_name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
    is_default: false,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const {
    saveStatus: addressSaveStatus,
    lastSaved: addressLastSaved,
    draftTimestamp: addressDraftTimestamp,
    discardDraft: discardAddressDraft,
    clearDraft: clearAddressDraft,
    isOnline,
  } = useFormDraft({
    formKey: "venopai_draft_checkout_address",
    formData,
    setFormData,
    metadata: {
      title: "Checkout Shipping Address",
    },
  });

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = getCustomerToken();
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {
      // ignore
    }
    return {};
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      const addrRes = await apiClient.get("/addresses", { headers });
      const addrList: Address[] = addrRes?.data || [];
      setAddresses(addrList);

      const defaultAddr = addrList.find((a) => a.is_default) || addrList[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        // Automatically initiate or retrieve checkout session with default address
        await initiateSession(defaultAddr.id);
      } else {
        setShowAddressModal(true);
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
        } else if (err.message.includes("403")) {
          setError("UNVERIFIED_ACCOUNT");
        } else {
          setError(err.message);
        }
      } else {
        setError("An unexpected error occurred loading checkout");
      }
    } finally {
      setLoading(false);
    }
  };

  const initiateSession = async (addrId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.post(
        "/checkout/sessions",
        { address_id: addrId },
        { headers }
      );
      if (res?.data) {
        setSession(res.data);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to open checkout session");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddressChange = async (newAddrId: string) => {
    setSelectedAddressId(newAddrId);
    if (!session) {
      await initiateSession(newAddrId);
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.post(
        `/checkout/sessions/${session.checkout_session_id}/address`,
        { address_id: newAddrId },
        { headers }
      );
      if (res?.data) {
        setSession(res.data);
      }
    } catch {
      setError("Failed to update shipping address for this session");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.post("/addresses", formData, { headers });
      if (res?.data) {
        const newAddr: Address = res.data;
        setAddresses((prev) => [newAddr, ...prev]);
        setSelectedAddressId(newAddr.id);
        await clearAddressDraft();
        setShowAddressModal(false);
        await handleAddressChange(newAddr.id);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save address");
      }
    }
  };

  // Reservation countdown timer (INV-003, Document 03 §17)
  useEffect(() => {
    if (!session?.reservation_expires_at || session.status === "expired") {
      setRemainingSeconds(null);
      return;
    }

    const calculateRemaining = () => {
      const exp = new Date(session.reservation_expires_at!).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((exp - now) / 1000));
      setRemainingSeconds(diff);
      if (diff === 0 && session.status !== "expired") {
        setSession((prev) => (prev ? { ...prev, status: "expired" } : null));
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [session?.reservation_expires_at, session?.status]);

  useEffect(() => {
    loadData();
  }, []);

  const formatCountdown = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(false);
      if (window.Razorpay) return resolve(true);

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

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
      const res = await apiClient.post(
        `/payments/${paymentId}/confirm`,
        {
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: razorpaySignature,
        },
        { headers }
      );
      if (res?.data?.status === "successful") {
        setPaymentStatus("success");
        setConfirmedOrder(res.data);
        try {
          sessionStorage.setItem("venopai_last_order", JSON.stringify(res.data));
          localStorage.removeItem("venopai_cart_count");
        } catch {
          // ignore
        }
        const oId = res.data.order_id || res.data.id || "";
        const oNum = res.data.order_number || "";
        router.push(`/checkout/success?order_id=${encodeURIComponent(oId)}&order_number=${encodeURIComponent(oNum)}`);
      } else {
        setPaymentStatus("failed");
        setPaymentError(res?.data?.message || "Payment verification failed.");
      }
    } catch (err: unknown) {
      setPaymentStatus("failed");
      if (err instanceof Error) {
        setPaymentError(err.message);
      } else {
        setPaymentError("Payment confirmation failed.");
      }
    }
  };

  const handleInitiatePayment = async () => {
    if (!session) return;
    setPaymentStatus("initiating");
    setPaymentError(null);

    try {
      const headers = getAuthHeaders();
      const initRes = await apiClient.post(
        "/payments/initiate",
        {
          source_type: "checkout_session",
          source_id: session.checkout_session_id,
        },
        { headers }
      );

      const paymentData = initRes?.data;
      if (!paymentData) {
        throw new Error("Failed to initialize payment gateway.");
      }

      const { payment_id, gateway_order_id, amount_paise, key_id, customer } = paymentData;

      // Check if Razorpay script is accessible
      const scriptLoaded = await loadRazorpayScript();
      const isMockGateway = !key_id || key_id.includes("mock");
      const isDevelopment = process.env.NODE_ENV !== "production";
      const allowMockPayments = isDevelopment && process.env.NEXT_PUBLIC_ENABLE_MOCK_PAYMENTS === "true";

      if (!scriptLoaded) {
        if (allowMockPayments && isMockGateway) {
          const sim = simulateMockPayment(gateway_order_id);
          await handleConfirmPayment(payment_id, sim.paymentId, gateway_order_id, sim.signature);
          return;
        }
        throw new Error("Unable to load secure Razorpay payment gateway. If you are using an ad blocker, privacy shield, or tracker blocker (e.g. Brave, uBlock), please disable it for this checkout.");
      }

      if (isMockGateway) {
        if (allowMockPayments) {
          const sim = simulateMockPayment(gateway_order_id);
          await handleConfirmPayment(payment_id, sim.paymentId, gateway_order_id, sim.signature);
          return;
        }
        throw new Error("Payment gateway is currently unconfigured. Please contact support.");
      }

      // Live Razorpay popup modal
      const options = {
        key: key_id,
        amount: amount_paise,
        currency: "INR",
        name: "VenopAI",
        description: `Order Checkout - Session ${session.checkout_session_id.slice(0, 8)}`,
        order_id: gateway_order_id,
        prefill: {
          name: customer?.name || "",
          email: customer?.email || "",
          contact: customer?.phone || "",
        },
        theme: {
          color: "#059669",
        },
        handler: async function (response: RazorpaySuccessResponse) {
          await handleConfirmPayment(
            payment_id,
            response.razorpay_payment_id,
            response.razorpay_order_id,
            response.razorpay_signature
          );
        },
        modal: {
          ondismiss: function () {
            setPaymentStatus("failed");
            setPaymentError("Payment was cancelled. Your items remain reserved until the timer expires.");
          },
        },
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (err: unknown) {
      setPaymentStatus("failed");
      if (err instanceof Error) {
        setPaymentError(err.message);
      } else {
        setPaymentError("Payment initiation failed.");
      }
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-4">
            <div className="h-32 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-32 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="lg:col-span-4">
            <div className="h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    );
  }

  if (error === "AUTH_REQUIRED") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Sign in required
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          You must be signed in to proceed through checkout.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login?redirect=/checkout"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors"
          >
            Sign In to Complete Order
          </Link>
          <Link
            href="/register?redirect=/checkout"
            className="rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  if (error === "UNVERIFIED_ACCOUNT") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Email Verification Required
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Per security policy (CHK-001), please verify your email address before initiating checkout.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/verify-email"
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            Verify Your Email Address &rarr;
          </Link>
        </div>
      </div>
    );
  }

  if (paymentStatus === "success" && confirmedOrder) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm dark:border-emerald-950 dark:bg-zinc-900 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Order Confirmed!
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Payment verified successfully via Razorpay. Your engineering order has been placed.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-mono font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            <span>Order Number:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {confirmedOrder.order_number || confirmedOrder.order_id}
            </span>
          </div>

          <div className="mt-8 border-t border-zinc-200 pt-6 text-left dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Order Details</h3>
            <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 p-4 text-sm dark:divide-zinc-800 dark:border-zinc-800">
              <div className="flex justify-between py-2 text-zinc-600 dark:text-zinc-400">
                <span>Payment Status</span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                  Paid
                </span>
              </div>
              <div className="flex justify-between py-2 text-zinc-600 dark:text-zinc-400">
                <span>Total Amount Paid</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  ₹{confirmedOrder.total_amount || confirmedOrder.total || session?.total || "0.00"}
                </span>
              </div>
              {session?.shipping && (
                <div className="flex justify-between py-2 text-zinc-600 dark:text-zinc-400">
                  <span>Estimated Delivery</span>
                  <span className="text-zinc-900 dark:text-white">{session.shipping.eta_description}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/orders"
              className="w-full sm:w-auto rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              View Order in Dashboard
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Persistent reservation timer bar (Document 03 §17) */}
      {remainingSeconds !== null && session?.status !== "expired" && (
        <div className="mb-6 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Items held for you: <strong className="font-mono">{formatCountdown(remainingSeconds)}</strong></span>
          </div>
          <span className="text-xs">Stock is reserved until timer expires</span>
        </div>
      )}

      {/* Expired session notice */}
      {session?.status === "expired" && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300">
          <p className="font-semibold">Your reserved items have timed out</p>
          <p className="mt-1 text-xs">
            Please return to your cart to review item availability and resume checkout.
          </p>
          <Link
            href="/cart"
            className="mt-3 inline-block rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-500"
          >
            Return to Cart
          </Link>
        </div>
      )}

      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
        Checkout
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Main checkout area */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Delivery Address */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">1</span>
                Delivery Address
              </h2>
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
              >
                + Add New Address
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {addresses.map((addr) => (
                <label
                  key={addr.id}
                  className={`flex cursor-pointer items-start justify-between rounded-lg border p-4 transition-all ${
                    selectedAddressId === addr.id
                      ? "border-emerald-600 bg-emerald-50/20 dark:border-emerald-500"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="selected_address"
                      value={addr.id}
                      checked={selectedAddressId === addr.id}
                      onChange={() => handleAddressChange(addr.id)}
                      className="mt-1 h-4 w-4 text-emerald-600"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {addr.recipient_name}
                        </span>
                        {addr.is_default && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} — {addr.pincode}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Phone: {addr.phone}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Step 2: Shipping Method */}
          {session?.shipping && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">2</span>
                Shipping Option
              </h2>
              <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                      Standard Domestic Delivery (Shiprocket)
                    </span>
                    <p className="mt-1 text-xs text-zinc-500">
                      {session.shipping.eta_description}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">
                    ₹{session.shipping.rate}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Order Summary
            </h2>

            {session?.items && (
              <div className="mt-4 max-h-48 overflow-y-auto space-y-2 border-b border-zinc-200 pb-4 text-xs dark:border-zinc-800">
                {session.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="line-clamp-1 text-zinc-600 dark:text-zinc-400">
                      {it.name} (x{it.quantity})
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      ₹{it.unit_price}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-2 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-800">
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Subtotal</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  ₹{session?.subtotal || "0.00"}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Shipping</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  ₹{session?.shipping?.rate || "0.00"}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Tax ({session?.tax?.type || "GST"})</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  ₹{session?.tax?.amount || "0.00"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex justify-between text-base font-bold text-zinc-900 dark:text-white">
              <span>Total Amount</span>
              <span>₹{session?.total || "0.00"}</span>
            </div>

            {paymentError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300">
                <span className="font-semibold">Payment Error: </span>
                {paymentError}
              </div>
            )}

            {/* Statutory Return & Consumer Protection Disclosure */}
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-3 text-[11px] text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200 mb-0.5">
                  <span>⚖️</span> Consumer Protection & Return Policy:
                </div>
                <p>
                  Off-the-shelf components qualify for a 7-day replacement for manufacturing defects. Custom PCB fabrication orders are built to client specs under IPC-A-610 Class 2 standards.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={agreeCheckoutTerms}
                  onChange={(e) => setAgreeCheckoutTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 cursor-pointer"
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-emerald-600 dark:text-emerald-400 underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/cancellation-refund" target="_blank" className="font-medium text-emerald-600 dark:text-emerald-400 underline">
                    Refund Policy
                  </Link>
                  , and consent to delivery address verification with Shiprocket. <span className="text-red-500">*</span>
                </span>
              </label>
            </div>

            <button
              disabled={
                isSubmitting ||
                paymentStatus === "initiating" ||
                paymentStatus === "confirming" ||
                session?.status === "expired" ||
                !session ||
                !agreeCheckoutTerms
              }
              onClick={handleInitiatePayment}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {paymentStatus === "initiating" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Connecting to Razorpay...</span>
                </>
              ) : paymentStatus === "confirming" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Verifying Payment Signature...</span>
                </>
              ) : (
                <span>Pay ₹{session?.total || "0.00"} via Razorpay</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Add Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Add New Address
              </h3>
              <DraftSaveIndicator saveStatus={addressSaveStatus} lastSaved={addressLastSaved} isOnline={isOnline} />
            </div>
            <div className="mt-3">
              <DraftRecoveryBanner
                draftTimestamp={addressDraftTimestamp}
                onDiscard={() =>
                  discardAddressDraft(() =>
                    setFormData({
                      recipient_name: "",
                      phone: "",
                      line1: "",
                      line2: "",
                      city: "",
                      state: "",
                      pincode: "",
                      is_default: false,
                    })
                  )
                }
                formTitle="Shipping Address"
              />
            </div>
            {formError && (
              <p className="mt-2 text-xs text-red-600">{formError}</p>
            )}
            <form onSubmit={handleCreateAddress} className="mt-4 space-y-3">
              <input
                type="text"
                required
                placeholder="Recipient Name"
                value={formData.recipient_name}
                onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                type="tel"
                required
                placeholder="Mobile (+91...)"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                type="text"
                required
                placeholder="Address Line 1"
                value={formData.line1}
                onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                type="text"
                placeholder="Address Line 2 (Optional)"
                value={formData.line2}
                onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="City"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <input
                  type="text"
                  required
                  placeholder="State (e.g. Telangana)"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <input
                type="text"
                required
                placeholder="6-digit PIN Code"
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                />
                Set as default address
              </label>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
