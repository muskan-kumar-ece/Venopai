"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";

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

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem("access_token");
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
        if (err.message.includes("401")) {
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
    } catch (err: unknown) {
      alert("Failed to update shipping address for this session");
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
        <button
          onClick={() => {
            const token = prompt("Enter customer bearer JWT token:");
            if (token) {
              localStorage.setItem("access_token", token.trim());
              loadData();
            }
          }}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Sign In
        </button>
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

            <button
              disabled={isSubmitting || session?.status === "expired" || !session}
              onClick={() => {
                alert("Phase 6 boundary reached. Payment initiation (Razorpay) will be unlocked in Phase 7!");
              }}
              className="mt-6 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              Continue to Payment
            </button>
          </div>
        </div>
      </div>

      {/* Add Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              Add New Address
            </h3>
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
