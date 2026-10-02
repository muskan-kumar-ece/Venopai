"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { adminSecurityApi } from "@/lib/api/client";

const ROLE_PERMISSIONS: Record<string, { label: string; badge: string; scopes: string[] }> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    badge: "bg-emerald-950/80 text-emerald-400 border-emerald-800",
    scopes: [
      "Full Root Platform Authority (*:*)",
      "Administrator and Staff Lifecycle (Creation, Role Assignment, Suspension)",
      "Global Platform & System Configuration",
      "Customer Accounts & Deactivation Control",
      "Financial Transactions, Refund Approvals, and Invoicing",
      "Complete Immutable Audit Trail Access",
      "Full E-Commerce Catalog, Inventory, and Order Logistics",
      "Engineering Realization, Quotation Authoring, and Project Management",
    ],
  },
  ADMIN: {
    label: "Admin",
    badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
    scopes: [
      "Catalog Management & Product Publishing",
      "Inventory Stock Inspection and Reorders",
      "Customer Orders and Fulfillment Tracking",
      "Customer Inquiries and Review Moderation",
      "Operational Analytics",
    ],
  },
  ORDER_MANAGER: {
    label: "Order Manager",
    badge: "bg-blue-950/80 text-blue-400 border-blue-800",
    scopes: [
      "Orders Fulfillment & State Transitions (Processing → Ready to Ship)",
      "Shiprocket Carrier Integration & AWB Shipping Labels",
      "Catalog Products & Category Hierarchy Editing",
      "Inventory Stock Adjustments (Reason-gated Audit Trail)",
      "Order Exception Monitoring & Cancellation Handoffs",
    ],
  },
  MANUFACTURING_MANAGER: {
    label: "Manufacturing Manager",
    badge: "bg-cyan-950/80 text-cyan-400 border-cyan-800",
    scopes: [
      "Custom Manufacturing & Assembly Execution Pipeline",
      "PCB Design & Hardware Specification Review",
      "Firmware & Embedded Software Request Processing",
      "Client Quotations Formulation, Versioning & Supersession",
      "Team Deliverables & CAD File Uploads",
      "Technical Clarification Threads with Clients",
    ],
  },
  SUPPORT_EXECUTIVE: {
    label: "Support Executive",
    badge: "bg-amber-950/80 text-amber-400 border-amber-800",
    scopes: [
      "Customer Accounts & Order History Lookup",
      "Customer Review Moderation (Hide/Restore Policy Enforcement)",
      "Client Technical Consultation Inquiries Inspection",
      "Read Access to Service Requests & Order Details",
    ],
  },
  FINANCE_MANAGER: {
    label: "Finance Manager",
    badge: "bg-purple-950/80 text-purple-400 border-purple-800",
    scopes: [
      "Payment Transactions Inspection & Razorpay Reconciliation",
      "Disputed Orders & Cancellation Refund Approvals",
      "Financial Analytics, Revenue Splits & GST Reconciliation",
      "Quotation Invoices & Commercial Milestones Verification",
    ],
  },
};

export default function AdminSecuritySettingsPage() {
  const { adminUser, logout } = useAdminAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Real-time password strength checks
  const checks = {
    length: newPassword.length >= 10,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    digit: /\d/.test(newPassword),
    special: /[@$!%*?&_\-#^~+=><.,:;(){}\[\]]/.test(newPassword),
  };

  const isFormValid =
    currentPassword.length > 0 &&
    checks.length &&
    checks.upper &&
    checks.lower &&
    checks.digit &&
    checks.special &&
    newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg("New password must be different from current password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminSecurityApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setSuccessMsg(
        res?.data?.message ||
          "Password changed successfully! All other active sessions across devices have been terminated."
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to change password. Please verify your current password.");
    } finally {
      setSubmitting(false);
    }
  };

  const roleInfo = adminUser?.role
    ? ROLE_PERMISSIONS[adminUser.role] || {
        label: adminUser.role,
        badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
        scopes: ["Standard Administrative Access"],
      }
    : null;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono mb-1">
          <Link href="/admin" className="hover:text-zinc-200">Admin</Link>
          <span>/</span>
          <Link href="/admin/settings" className="hover:text-zinc-200">Settings</Link>
          <span>/</span>
          <span className="text-zinc-200">Security & Profile</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Profile & Security</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage your personal administrative credentials, update your login password, and review your assigned domain permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Staff Identity & Scopes */}
        <div className="space-y-6 lg:col-span-1">
          {/* Identity Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950 font-bold text-emerald-400 border border-emerald-800 text-base uppercase">
                {adminUser?.full_name ? adminUser.full_name.charAt(0) : "A"}
              </div>
              <div className="truncate">
                <h3 className="font-semibold text-white text-sm truncate">
                  {adminUser?.full_name || "Admin Staff"}
                </h3>
                <p className="text-xs text-zinc-400 truncate">{adminUser?.email}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-mono">ROLE:</span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                    roleInfo?.badge || "bg-zinc-800 text-zinc-300 border-zinc-700"
                  }`}
                >
                  {roleInfo?.label || adminUser?.role || "ADMIN"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-mono">STATUS:</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active / Verified
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-mono">SESSION:</span>
                <span className="text-zinc-400 font-mono text-[11px]">Protected JWT</span>
              </div>
            </div>
          </div>

          {/* Scopes Overview Card */}
          {roleInfo && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                Assigned Operational Scopes
              </h4>
              <p className="text-[11px] text-zinc-500">
                Your role grants authoritative access to the following system domains:
              </p>
              <ul className="space-y-2 text-xs text-zinc-300">
                {roleInfo.scopes.map((scope, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span className="leading-tight">{scope}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Password Change Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">Change Administrator Password</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Ensure your account is protected with a high-entropy password conforming to platform security policy.
              </p>
            </div>

            {/* Success Message */}
            {successMsg && (
              <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/80 p-4 text-xs text-emerald-300 flex items-start gap-3">
                <span className="text-emerald-400 text-sm mt-0.5">✓</span>
                <div>
                  <p className="font-semibold text-emerald-200">Password Updated</p>
                  <p className="mt-0.5">{successMsg}</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="rounded-lg bg-red-950/40 border border-red-800/80 p-4 text-xs text-red-300 flex items-start gap-3">
                <span className="text-red-400 text-sm mt-0.5">✕</span>
                <div>
                  <p className="font-semibold text-red-200">Update Failed</p>
                  <p className="mt-0.5">{errorMsg}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 pr-10 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-white"
                  >
                    {showCurrent ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 10 characters, upper, lower, number, symbol"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 pr-10 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-white"
                  >
                    {showNew ? "Hide" : "Show"}
                  </button>
                </div>

                {/* Password Strength Checklist */}
                {newPassword && (
                  <div className="mt-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 grid grid-cols-2 gap-2 text-[11px]">
                    <div className={`flex items-center gap-1.5 ${checks.length ? "text-emerald-400" : "text-zinc-500"}`}>
                      <span>{checks.length ? "✓" : "○"}</span>
                      <span>Min 10 characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${checks.upper ? "text-emerald-400" : "text-zinc-500"}`}>
                      <span>{checks.upper ? "✓" : "○"}</span>
                      <span>Uppercase letter (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${checks.lower ? "text-emerald-400" : "text-zinc-500"}`}>
                      <span>{checks.lower ? "✓" : "○"}</span>
                      <span>Lowercase letter (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${checks.digit ? "text-emerald-400" : "text-zinc-500"}`}>
                      <span>{checks.digit ? "✓" : "○"}</span>
                      <span>Number (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${checks.special ? "text-emerald-400" : "text-zinc-500"} col-span-2`}>
                      <span>{checks.special ? "✓" : "○"}</span>
                      <span>Special character (@$!%*?&_# etc.)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your new password"
                    className={`w-full rounded-lg border bg-zinc-950 px-3.5 py-2.5 pr-10 text-xs text-white focus:outline-none ${
                      confirmPassword && newPassword !== confirmPassword
                        ? "border-red-600 focus:border-red-500"
                        : confirmPassword && newPassword === confirmPassword
                        ? "border-emerald-600 focus:border-emerald-500"
                        : "border-zinc-700 focus:border-emerald-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-white"
                  >
                    {showConfirm ? "Hide" : "Show"}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[11px] text-red-400 mt-1">Passwords do not match.</p>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <p className="text-[11px] text-emerald-400 mt-1">Passwords match.</p>
                )}
              </div>

              {/* Security Invariant Notice */}
              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3.5 flex items-start gap-3 text-xs text-zinc-400">
                <span className="text-zinc-300 text-sm mt-0.5">ℹ️</span>
                <p className="leading-relaxed text-[11px]">
                  <strong className="text-zinc-200">Security Invariant:</strong> Updating your password immediately invalidates all active sessions on other devices and browsers. Your current session will remain active.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="submit"
                  disabled={submitting || !isFormValid}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Updating Password..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
