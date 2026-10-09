"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { adminTeamApi, StaffMember } from "@/lib/api/client";

const ROLE_METADATA: Record<
  string,
  { label: string; badge: string; border: string; bg: string; text: string; description: string }
> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    badge: "bg-emerald-950/80 text-emerald-400 border-emerald-800",
    border: "border-emerald-700/60",
    bg: "bg-emerald-950/30",
    text: "text-emerald-400",
    description: "Root system authority (*:*), team management, system settings, customer deactivation, and all platform domains.",
  },
  ADMIN: {
    label: "Admin",
    badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
    border: "border-zinc-700/60",
    bg: "bg-zinc-900/40",
    text: "text-zinc-300",
    description: "General administration across products, catalog, inventory, order processing, and reviews.",
  },
  ORDER_MANAGER: {
    label: "Order Manager",
    badge: "bg-blue-950/80 text-blue-400 border-blue-800",
    border: "border-blue-700/60",
    bg: "bg-blue-950/30",
    text: "text-blue-400",
    description: "Catalog editing, manual stock adjustments, order fulfillment, shipping labels, and carrier tracking.",
  },
  MANUFACTURING_MANAGER: {
    label: "Manufacturing Manager",
    badge: "bg-cyan-950/80 text-cyan-400 border-cyan-800",
    border: "border-cyan-700/60",
    bg: "bg-cyan-950/30",
    text: "text-cyan-400",
    description: "Custom PCB, CAD, firmware requests, quotations authoring/revision, and project deliverables.",
  },
  SUPPORT_EXECUTIVE: {
    label: "Support Executive",
    badge: "bg-amber-950/80 text-amber-400 border-amber-800",
    border: "border-amber-700/60",
    bg: "bg-amber-950/30",
    text: "text-amber-400",
    description: "Customer accounts inspection, support inquiry responses, and product review moderation (hide/restore).",
  },
  FINANCE_MANAGER: {
    label: "Finance Manager",
    badge: "bg-purple-950/80 text-purple-400 border-purple-800",
    border: "border-purple-700/60",
    bg: "bg-purple-950/30",
    text: "text-purple-400",
    description: "Payment transaction verification, Razorpay refunds execution, invoices inspection, and revenue analytics.",
  },
};

export default function AdminTeamPage() {
  const { hasRole, adminUser } = useAdminAuth();
  const isSuperAdmin = hasRole(["SUPER_ADMIN"]);

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState<StaffMember | null>(null);
  const [showResetPwModal, setShowResetPwModal] = useState<StaffMember | null>(null);
  const [showStatusModal, setShowStatusModal] = useState<StaffMember | null>(null);

  // New Staff Form
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("ADMIN");
  const [customPassword, setCustomPassword] = useState("");
  const [autoGenPassword, setAutoGenPassword] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Generated Credential Banner Modal
  const [createdCredential, setCreatedCredential] = useState<{
    email: string;
    role: string;
    temporary_password?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit Role Form
  const [editRoleVal, setEditRoleVal] = useState("");
  // Reset Password Form
  const [resetPwVal, setResetPwVal] = useState("");
  const [resetPwAutoGen, setResetPwAutoGen] = useState(true);

  const fetchStaff = async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await adminTeamApi.listStaff({
        role: selectedRole || undefined,
        status: selectedStatus || undefined,
        search: search.trim() || undefined,
      });
      if (res?.data) {
        setStaffList(res.data);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load team members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [isSuperAdmin, selectedRole, selectedStatus]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchStaff();
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // Counts
  const metrics = useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter((s) => s.status === "verified").length;
    const deactivated = staffList.filter((s) => s.status === "deactivated").length;
    const superAdmins = staffList.filter((s) => s.role === "SUPER_ADMIN").length;
    return { total, active, deactivated, superAdmins };
  }, [staffList]);

  // Handle Add Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setErrorMessage("");
    try {
      const res = await adminTeamApi.createStaff({
        email: newEmail.trim(),
        full_name: newName.trim(),
        phone: newPhone.trim() || undefined,
        role: newRole,
        password: autoGenPassword ? undefined : customPassword.trim(),
      });

      if (res?.data) {
        setShowAddModal(false);
        setCreatedCredential({
          email: res.data.email,
          role: res.data.role,
          temporary_password: res.data.temporary_password,
        });
        setNewEmail("");
        setNewName("");
        setNewPhone("");
        setCustomPassword("");
        setAutoGenPassword(true);
        fetchStaff();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create administrator.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Role Update
  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditRoleModal || !editRoleVal) return;
    setFormSubmitting(true);
    setErrorMessage("");
    try {
      await adminTeamApi.updateRole(showEditRoleModal.id, editRoleVal);
      setSuccessToast(`Role for ${showEditRoleModal.full_name} updated to ${editRoleVal}`);
      setShowEditRoleModal(null);
      fetchStaff();
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update staff role.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Status Update (Suspend/Reactivate)
  const handleToggleStatus = async () => {
    if (!showStatusModal) return;
    const targetStatus = showStatusModal.status === "verified" ? "deactivated" : "verified";
    setFormSubmitting(true);
    setErrorMessage("");
    try {
      await adminTeamApi.updateStatus(showStatusModal.id, targetStatus);
      setSuccessToast(
        targetStatus === "deactivated"
          ? `Account for ${showStatusModal.full_name} has been suspended.`
          : `Account for ${showStatusModal.full_name} has been reactivated.`
      );
      setShowStatusModal(null);
      fetchStaff();
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update staff status.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Password Reset Override
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetPwModal) return;
    setFormSubmitting(true);
    setErrorMessage("");
    try {
      const res = await adminTeamApi.resetPassword(
        showResetPwModal.id,
        resetPwAutoGen ? undefined : resetPwVal.trim()
      );
      setShowResetPwModal(null);
      if (res?.data?.temporary_password) {
        setCreatedCredential({
          email: res.data.email || showResetPwModal.email,
          role: showResetPwModal.role,
          temporary_password: res.data.temporary_password,
        });
      }
      setResetPwVal("");
      setResetPwAutoGen(true);
      setSuccessToast(`Password reset successfully for ${showResetPwModal.full_name}.`);
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/40 text-red-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white">Access Restricted</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Team Management and Role-Based Access Control configuration is restricted exclusively to{" "}
            <span className="font-mono text-emerald-400">SUPER_ADMIN</span> administrators.
          </p>
          <Link
            href="/admin"
            className="inline-block rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Team & Access Control</h1>
            <span className="text-xs font-mono uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full">
              Super Admin Only
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Provision platform administrators, assign scoped operational roles, and enforce security policies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchStaff}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
            title="Refresh Roster"
          >
            <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Administrator
          </button>
        </div>
      </div>

      {/* Toast Notifications */}
      {successToast && (
        <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/80 px-4 py-3 text-xs text-emerald-300 flex items-center justify-between">
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast("")} className="text-emerald-400 hover:text-emerald-200">✕</button>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg bg-red-950/40 border border-red-800/80 px-4 py-3 text-xs text-red-300 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage("")} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">Total Staff</p>
          <p className="text-2xl font-bold text-white mt-1">{metrics.total}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Across all 6 roles</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider font-mono">Active Members</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{metrics.active}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Authorized for console login</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-red-400 uppercase tracking-wider font-mono">Suspended</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{metrics.deactivated}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Sessions revoked</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">Super Admins</p>
          <p className="text-2xl font-bold text-white mt-1">{metrics.superAdmins}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Root authority holders</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name or email..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2 pl-9 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Roles</option>
            {Object.keys(ROLE_METADATA).map((r) => (
              <option key={r} value={r}>
                {ROLE_METADATA[r].label}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="verified">Active (Verified)</option>
            <option value="deactivated">Suspended (Deactivated)</option>
          </select>
        </div>
      </div>

      {/* Staff Roster Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-400">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-5 py-3.5">Administrator</th>
                <th className="px-5 py-3.5">Assigned Role</th>
                <th className="px-5 py-3.5">Account Status</th>
                <th className="px-5 py-3.5">Joined Date</th>
                <th className="px-5 py-3.5">Last Active</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                      <span>Loading team roster...</span>
                    </div>
                  </td>
                </tr>
              ) : staffList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                    <p className="text-zinc-400 font-medium">No administrators found</p>
                    <p className="text-xs text-zinc-600 mt-1">Try adjusting your search criteria or add a new team member.</p>
                  </td>
                </tr>
              ) : (
                staffList.map((member) => {
                  const roleMeta = ROLE_METADATA[member.role] || {
                    label: member.role,
                    badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
                    description: "",
                  };
                  const isSelf = adminUser?.id === member.id;

                  return (
                    <tr key={member.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Name & Email */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-semibold text-white border border-zinc-700 uppercase">
                            {member.full_name ? member.full_name.charAt(0) : "A"}
                          </div>
                          <div className="truncate max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white truncate">{member.full_name || "Staff Member"}</span>
                              {isSelf && (
                                <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 truncate">{member.email}</p>
                            {member.phone && <p className="text-[10px] text-zinc-600 truncate">{member.phone}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase border font-semibold ${roleMeta.badge}`}
                          title={roleMeta.description}
                        >
                          {roleMeta.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {member.status === "verified" ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-400 text-xs font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            Suspended
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="px-5 py-3.5 text-zinc-400 font-mono text-[11px]">
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}
                      </td>

                      {/* Last Active */}
                      <td className="px-5 py-3.5 text-zinc-400 font-mono text-[11px]">
                        {member.last_login_at
                          ? new Date(member.last_login_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                          : "Never"}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Role Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setShowEditRoleModal(member);
                              setEditRoleVal(member.role);
                            }}
                            className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                            title="Edit Role"
                          >
                            Role
                          </button>

                          {/* Reset Password Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setShowResetPwModal(member);
                              setResetPwVal("");
                              setResetPwAutoGen(true);
                            }}
                            className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                            title="Reset Password"
                          >
                            Reset Pwd
                          </button>

                          {/* Suspend / Reactivate */}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => setShowStatusModal(member)}
                              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                                member.status === "verified"
                                  ? "border-red-900/60 bg-red-950/20 text-red-400 hover:bg-red-900/40"
                                  : "border-emerald-900/60 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/40"
                              }`}
                              title={member.status === "verified" ? "Suspend Account" : "Reactivate Account"}
                            >
                              {member.status === "verified" ? "Suspend" : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: ADD ADMINISTRATOR ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Add New Administrator</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Provision credentials for a team member.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Vikramaditya Singh"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Work Email Address *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@venopai.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Phone Number (Optional)</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Administrative Role *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  {Object.keys(ROLE_METADATA).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_METADATA[r].label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 mt-1.5 p-2 rounded-md bg-zinc-900/60 border border-zinc-800">
                  {ROLE_METADATA[newRole]?.description}
                </p>
              </div>

              {/* Password choice */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <label className="block text-xs font-medium text-zinc-300">Initial Credential</label>
                <div className="flex items-center gap-4 text-xs text-zinc-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pwChoice"
                      checked={autoGenPassword}
                      onChange={() => setAutoGenPassword(true)}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Auto-generate secure password (Recommended)</span>
                  </label>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pwChoice"
                      checked={!autoGenPassword}
                      onChange={() => setAutoGenPassword(false)}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Set custom password</span>
                  </label>
                </div>

                {!autoGenPassword && (
                  <div className="mt-2">
                    <input
                      type="password"
                      required={!autoGenPassword}
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="Min 10 chars, uppercase, lowercase, digit, symbol"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {formSubmitting ? "Creating..." : "Create Administrator"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREDENTIALS COPY BANNER ================= */}
      {createdCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-emerald-800/80 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                ✓
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Administrator Credentials Ready</h3>
                <p className="text-xs text-zinc-400">Share these initial credentials securely with the staff member.</p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2 text-xs font-mono">
              <div>
                <span className="text-zinc-500 uppercase text-[10px]">Email:</span>
                <p className="text-white font-medium">{createdCredential.email}</p>
              </div>
              <div>
                <span className="text-zinc-500 uppercase text-[10px]">Assigned Role:</span>
                <p className="text-emerald-400 font-medium">{createdCredential.role}</p>
              </div>
              <div>
                <span className="text-zinc-500 uppercase text-[10px]">Temporary Password:</span>
                <p className="text-amber-400 font-bold bg-zinc-950 p-2 rounded border border-zinc-800 break-all select-all">
                  {createdCredential.temporary_password}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/admin/login` : '/admin/login';
                  copyToClipboard(
                    `VenopAI Admin Console Credentials:\nURL: ${loginUrl}\nEmail: ${createdCredential.email}\nPassword: ${createdCredential.temporary_password}\nRole: ${createdCredential.role}`
                  );
                }}
                className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40 transition"
              >
                {copied ? "✓ Copied to Clipboard" : "Copy All Credentials"}
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredential(null)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT ROLE ================= */}
      {showEditRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-white">Change Staff Role</h3>
              <button onClick={() => setShowEditRoleModal(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleUpdateRole} className="space-y-4">
              <div>
                <p className="text-xs text-zinc-400">
                  Target Member: <span className="font-semibold text-white">{showEditRoleModal.full_name}</span> ({showEditRoleModal.email})
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Select New Role</label>
                <div className="space-y-2">
                  {Object.keys(ROLE_METADATA).map((r) => {
                    const isCurrent = showEditRoleModal.role === r;
                    const isSelected = editRoleVal === r;
                    return (
                      <label
                        key={r}
                        onClick={() => setEditRoleVal(r)}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-950/20"
                            : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60"
                        }`}
                      >
                        <input
                          type="radio"
                          name="roleSelect"
                          checked={isSelected}
                          onChange={() => setEditRoleVal(r)}
                          className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{ROLE_METADATA[r].label}</span>
                            {isCurrent && <span className="text-[10px] text-zinc-500 font-mono">(Current)</span>}
                          </div>
                          <p className="text-[11px] text-zinc-400">{ROLE_METADATA[r].description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowEditRoleModal(null)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || editRoleVal === showEditRoleModal.role}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {formSubmitting ? "Updating..." : "Save Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RESET PASSWORD OVERRIDE ================= */}
      {showResetPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-white">Reset Staff Password</h3>
              <button onClick={() => setShowResetPwModal(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="rounded-lg bg-amber-950/20 border border-amber-900/40 p-3 text-xs text-amber-300">
                ⚠️ Overriding the password will immediately revoke all active refresh tokens and sign out this administrator from all devices.
              </div>

              <div>
                <p className="text-xs text-zinc-400">
                  Target: <span className="font-semibold text-white">{showResetPwModal.full_name}</span> ({showResetPwModal.email})
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="resetPwRadio"
                    checked={resetPwAutoGen}
                    onChange={() => setResetPwAutoGen(true)}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Auto-generate high-entropy password</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="resetPwRadio"
                    checked={!resetPwAutoGen}
                    onChange={() => setResetPwAutoGen(false)}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Specify new password manually</span>
                </label>

                {!resetPwAutoGen && (
                  <input
                    type="password"
                    required={!resetPwAutoGen}
                    value={resetPwVal}
                    onChange={(e) => setResetPwVal(e.target.value)}
                    placeholder="Min 10 characters, upper, lower, digit, symbol"
                    className="w-full mt-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowResetPwModal(null)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {formSubmitting ? "Resetting..." : "Confirm Password Reset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: STATUS TOGGLE (SUSPEND / REACTIVATE) ================= */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">
              {showStatusModal.status === "verified" ? "Suspend Administrator" : "Reactivate Administrator"}
            </h3>
            <p className="text-xs text-zinc-400">
              {showStatusModal.status === "verified"
                ? `Are you sure you want to suspend ${showStatusModal.full_name}? They will be immediately signed out from all active sessions and denied access to the admin console.`
                : `Are you sure you want to reactivate ${showStatusModal.full_name}? They will regain permission to sign in with their existing credentials.`}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowStatusModal(null)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={formSubmitting}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                  showStatusModal.status === "verified"
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {formSubmitting
                  ? "Updating..."
                  : showStatusModal.status === "verified"
                  ? "Suspend Account"
                  : "Reactivate Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
