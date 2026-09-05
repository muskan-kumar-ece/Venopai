"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";

interface CartItem {
  id: string;
  product_id: string;
  name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
  stock_warning: boolean;
  image_url: string | null;
}

interface CartData {
  id: string;
  items: CartItem[];
  subtotal: string;
  currency: string;
}

export default function CartPage() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Read auth token from localStorage if available
  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem("access_token");
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // ignore
    }
    return {};
  };

  const fetchCart = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.get("/cart", { headers });
      if (res?.data) {
        setCart(res.data);
        // Persist count to localStorage for Header badge
        const totalItems = res.data.items.reduce(
          (acc: number, item: CartItem) => acc + item.quantity,
          0
        );
        localStorage.setItem("venopai_cart_count", totalItems.toString());
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        // If 401 unauthorized, display sign-in prompt
        if (err.message.includes("401")) {
          setError("AUTH_REQUIRED");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to load cart");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setIsUpdating(true);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.patch(
        `/cart/items/${itemId}`,
        { quantity: newQuantity },
        { headers }
      );
      if (res?.data) {
        setCart(res.data);
      }
    } catch {
      alert("Failed to update item quantity");
    } finally {
      setIsUpdating(false);
    }
  };

  const removeItem = async (itemId: string) => {
    setIsUpdating(true);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.delete(`/cart/items/${itemId}`, { headers });
      if (res?.data) {
        setCart(res.data);
      }
    } catch {
      alert("Failed to remove item");
    } finally {
      setIsUpdating(false);
    }
  };

  const clearAll = async () => {
    if (!confirm("Are you sure you want to clear your cart?")) return;
    setIsUpdating(true);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.delete("/cart", { headers });
      if (res?.data) {
        setCart(res.data);
      }
    } catch {
      alert("Failed to clear cart");
    } finally {
      setIsUpdating(false);
    }
  };


  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-8 space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error === "AUTH_REQUIRED") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Sign in to view your cart
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Your cart is saved securely to your VenopAI customer account across all devices.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              const testToken = prompt("Enter customer bearer JWT token for testing:");
              if (testToken) {
                localStorage.setItem("access_token", testToken.trim());
                fetchCart();
              }
            }}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 transition-colors"
          >
            Sign In / Set Token
          </button>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Your cart is empty
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Explore our hardware components, dev boards, and realization modules.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Shopping Cart ({cart.items.length})
        </h1>
        <button
          onClick={clearAll}
          disabled={isUpdating}
          className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium transition-colors"
        >
          Clear Cart
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Cart items list */}
        <div className="lg:col-span-8 space-y-4">
          {cart.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-zinc-400">No Image</span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {item.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    ₹{item.unit_price} each
                  </p>

                  {/* CART-002: Soft stock warning */}
                  {item.stock_warning && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>Low stock — quantity will be verified at checkout</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between w-full sm:w-auto sm:gap-6">
                {/* Quantity selector */}
                <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    disabled={isUpdating || item.quantity <= 1}
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-40"
                  >
                    -
                  </button>
                  <span className="px-3 py-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">
                    ₹{item.line_total}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => removeItem(item.id)}
                  className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                  aria-label="Remove item"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Order Summary
            </h2>

            <div className="mt-4 space-y-2 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-800">
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Subtotal</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  ₹{cart.subtotal}
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Shipping &amp; Taxes</span>
                <span>Calculated at checkout</span>
              </div>
            </div>

            <div className="mt-4 flex justify-between text-base font-bold text-zinc-900 dark:text-white">
              <span>Estimated Total</span>
              <span>₹{cart.subtotal}</span>
            </div>

            {/* Invariant transparency: CART-001 note */}
            <p className="mt-4 rounded-lg bg-zinc-50 p-2.5 text-center text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
              ℹ️ Items aren&apos;t reserved until checkout
            </p>

            <button
              disabled={cart.items.length === 0}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
