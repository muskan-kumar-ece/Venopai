"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient, catalogApi, cartApi, shippingApi } from "@/lib/api/client";

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

interface RecommendedProduct {
  id: string;
  name: string;
  slug?: string;
  price: string;
  primary_image_url?: string;
  images?: string[];
  stock_status?: string;
}

export default function CartPage() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Recommendations for empty cart / upsell
  const [recommended, setRecommended] = useState<RecommendedProduct[]>([]);
  const [addingRecId, setAddingRecId] = useState<string | null>(null);

  // In-cart Pincode Delivery Estimator
  const [pincode, setPincode] = useState<string>("");
  const [checkingPincode, setCheckingPincode] = useState<boolean>(false);
  const [pincodeResult, setPincodeResult] = useState<{
    serviceable: boolean;
    carrier?: string;
    eta?: string;
    message?: string;
  } | null>(null);

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
        const totalItems = res.data.items.reduce(
          (acc: number, item: CartItem) => acc + item.quantity,
          0
        );
        localStorage.setItem("venopai_cart_count", totalItems.toString());
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
        setError("Failed to load cart");
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch recommended hardware components
  const fetchRecommendations = async () => {
    try {
      const res = await catalogApi.listProducts({ page_size: 4 });
      const prods = res?.data?.items || res?.data || [];
      if (Array.isArray(prods)) {
        setRecommended(prods.slice(0, 4));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCart();
    fetchRecommendations();
    // Load previously verified pincode if saved
    try {
      const savedPin = localStorage.getItem("venopai_shipping_pincode");
      if (savedPin) {
        setPincode(savedPin);
        handleCheckPincode(savedPin);
      }
    } catch {
      // ignore
    }
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
      setError("Failed to update item quantity");
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
      setError("Failed to remove item");
    } finally {
      setIsUpdating(false);
    }
  };

  const clearAll = async () => {
    setIsUpdating(true);
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.delete("/cart", { headers });
      if (res?.data) {
        setCart(res.data);
        localStorage.setItem("venopai_cart_count", "0");
      }
    } catch {
      setError("Failed to clear cart");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddRecommended = async (productId: string) => {
    setAddingRecId(productId);
    try {
      await cartApi.addItem({ product_id: productId, quantity: 1 });
      await fetchCart();
    } catch {
      // ignore
    } finally {
      setAddingRecId(null);
    }
  };

  const handleCheckPincode = async (overridePin?: string) => {
    const pin = (overridePin || pincode).trim();
    if (!/^\d{6}$/.test(pin)) {
      setPincodeResult({
        serviceable: false,
        message: "Please enter a valid 6-digit Indian postal code.",
      });
      return;
    }

    setCheckingPincode(true);
    try {
      const res = await shippingApi.checkServiceability(pin);
      if (res?.data?.serviceable || res?.data?.success) {
        setPincodeResult({
          serviceable: true,
          carrier: res.data.courier_name || "Shiprocket Express Logistics",
          eta: "2 – 4 Business Days",
          message: "Standard express delivery available to your pincode.",
        });
        localStorage.setItem("venopai_shipping_pincode", pin);
      } else {
        setPincodeResult({
          serviceable: true,
          carrier: "Surface Logistics",
          eta: "3 – 5 Business Days",
          message: "Standard surface shipping available.",
        });
        localStorage.setItem("venopai_shipping_pincode", pin);
      }
    } catch {
      setPincodeResult({
        serviceable: true,
        carrier: "Shiprocket Surface Delivery",
        eta: "3 – 5 Business Days",
        message: "Standard domestic courier delivery available.",
      });
    } finally {
      setCheckingPincode(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-4">
            <div className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
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
          <Link
            href="/login?redirect=/cart"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors"
          >
            Sign In to Account
          </Link>
          <Link
            href="/register?redirect=/cart"
            className="rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 shadow-xs">
            <img
              src="/images/brand/venopai_cart_icon.png"
              alt="VenoPai Cart"
              className="h-full w-full object-contain"
            />
          </div>
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Your cart is empty
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Explore our hardware components, dev boards, sensors, and realization modules.
          </p>
          <div className="mt-6">
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition shadow-xs"
            >
              Browse Hardware Catalog &rarr;
            </Link>
          </div>
        </div>

        {/* Empty State Component Discovery (Module 2) */}
        {recommended.length > 0 && (
          <div className="mt-16 border-t border-zinc-200 pt-10 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                  Popular Components &amp; Dev Boards
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Quickly add essential prototyping items to your cart
                </p>
              </div>
              <Link
                href="/products"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 transition"
              >
                View Catalog &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recommended.map((prod) => {
                const img = prod.primary_image_url || (prod.images && prod.images[0]) || "";
                return (
                  <div
                    key={prod.id}
                    className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                  >
                    <div>
                      <div className="aspect-square w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 overflow-hidden flex items-center justify-center mb-3">
                        {img ? (
                          <img src={img} alt={prod.name} className="h-full w-full object-contain p-2" />
                        ) : (
                          <span className="text-xs text-zinc-400">Component</span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-2">
                        {prod.name}
                      </h4>
                      <p className="mt-1 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{prod.price}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAddRecommended(prod.id)}
                      disabled={addingRecId === prod.id}
                      className="mt-3.5 w-full rounded-lg bg-zinc-900 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50"
                    >
                      {addingRecId === prod.id ? "Adding..." : "+ Add to Cart"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <img
            src="/images/brand/venopai_cart_icon.png"
            alt="Cart"
            className="h-7 w-7 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Shopping Cart ({cart.items.length})
          </h1>
        </div>
        <button
          onClick={clearAll}
          disabled={isUpdating}
          className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium transition-colors cursor-pointer"
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
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4.5 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs"
            >
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-[10px] text-zinc-400">Component</span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {item.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    ₹{item.unit_price} each
                  </p>

                  {/* Stock Status Badge */}
                  {item.stock_warning ? (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>Low stock — reserved upon checkout</span>
                    </div>
                  ) : (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <span>✓ In Stock</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between w-full sm:w-auto sm:gap-6">
                {/* Quantity selector */}
                <div className="flex items-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                  <button
                    type="button"
                    disabled={isUpdating || item.quantity <= 1}
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-l-xl disabled:opacity-40 cursor-pointer"
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
                    className="px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-r-xl cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-zinc-900 dark:text-white">
                    ₹{item.line_total}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => removeItem(item.id)}
                  className="text-zinc-400 hover:text-red-500 transition-colors p-1.5 cursor-pointer"
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
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Order Summary
            </h2>

            <div className="mt-4 space-y-2 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-800">
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Subtotal</span>
                <span className="font-semibold font-mono text-zinc-900 dark:text-white">
                  ₹{cart.subtotal}
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Estimated Shipping</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Calculated at Checkout
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Applicable GST</span>
                <span>Calculated at Checkout</span>
              </div>
            </div>

            <div className="mt-4 flex justify-between text-base font-bold text-zinc-900 dark:text-white">
              <span>Estimated Total</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">₹{cart.subtotal}</span>
            </div>

            {/* Invariant transparency: CART-001 note */}
            <p className="mt-4 rounded-xl bg-zinc-50 p-2.5 text-center text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
              ℹ️ Items are held for 15 minutes once checkout begins
            </p>

            <Link
              href="/checkout"
              className={`mt-4 block w-full text-center rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-500 transition-colors ${
                cart.items.length === 0 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              Proceed to Checkout &rarr;
            </Link>
          </div>

          {/* In-Cart Delivery Pincode Estimator (Module 2) */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Estimate Courier Delivery
              </h3>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit Pincode"
                className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-mono text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <button
                type="button"
                onClick={() => handleCheckPincode()}
                disabled={checkingPincode || pincode.length !== 6}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
              >
                {checkingPincode ? "..." : "Check"}
              </button>
            </div>

            {pincodeResult && (
              <div
                className={`p-2.5 rounded-xl text-xs leading-relaxed ${
                  pincodeResult.serviceable
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300"
                }`}
              >
                <p className="font-semibold">{pincodeResult.message}</p>
                {pincodeResult.eta && (
                  <p className="mt-0.5 text-[11px] opacity-90">
                    Estimated Arrival: <strong>{pincodeResult.eta}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
