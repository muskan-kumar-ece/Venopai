"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OrdersRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account/orders");
  }, [router]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-24 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent mx-auto" />
      <p className="mt-4 text-xs font-medium text-zinc-500">Redirecting to your orders portal...</p>
    </div>
  );
}
