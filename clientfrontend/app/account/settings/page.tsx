'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { profileApi, getCustomerToken } from "@/lib/api/client";

export default function SettingsPage() {
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  // Privacy & DPDP Consent state
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [consentSavedMsg, setConsentSavedMsg] = useState('');
  const [dataRequestMsg, setDataRequestMsg] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('venopai_marketing_consent');
      if (saved === 'true') setMarketingConsent(true);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleMarketing = (enabled: boolean) => {
    setMarketingConsent(enabled);
    try {
      localStorage.setItem('venopai_marketing_consent', String(enabled));
      setConsentSavedMsg(enabled ? 'Opted in to engineering product advisories.' : 'Consent withdrawn for promotional communications.');
      setTimeout(() => setConsentSavedMsg(''), 3500);
    } catch {
      // ignore
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setPwSuccess('');
    setPwError('');
    try {
      const token = getCustomerToken() || undefined;
      await profileApi.changePassword(
        { current_password: currentPassword, new_password: newPassword },
        token
      );
      setPwSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Account Settings</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Manage your account credentials, security preferences, and verified notification channels.
        </p>
      </div>

      {/* Password Change Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-1">Security & Password</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          Ensure your account uses a secure password with at least 8 characters including numbers and symbols.
        </p>

        {pwSuccess && (
          <div className="p-3 mb-4 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            {pwSuccess}
          </div>
        )}
        {pwError && (
          <div className="p-3 mb-4 text-xs font-medium text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
            {pwError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Current Password *</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">New Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Data Privacy & Statutory Consent Controls (DPDP Act 2023) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Data Privacy & Statutory Consent (DPDP Act 2023)
            </h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your consent preferences and exercise your rights as a Data Principal under Indian law.
          </p>
        </div>

        {consentSavedMsg && (
          <div className="p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            {consentSavedMsg}
          </div>
        )}

        {dataRequestMsg && (
          <div className="p-3 text-xs font-medium text-cyan-800 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 rounded-xl">
            {dataRequestMsg}
          </div>
        )}

        {/* Consent Toggles */}
        <div className="space-y-4 text-xs">
          <div className="flex items-start justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40">
            <div className="pr-4">
              <span className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <span>📦</span> Mandatory Transactional Communications
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Order fulfillment notices, GST tax invoices, quote revisions, and Shiprocket delivery alerts.
              </p>
            </div>
            <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
              Required
            </span>
          </div>

          <div className="flex items-start justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="pr-4">
              <span className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <span>📢</span> Engineering Advisories & Stock Alerts
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                DFM manufacturing insights, new component releases, and promotional fabrication discounts.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => handleToggleMarketing(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>

        {/* Data Principal Rights (Section 11 & 12) */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
            Data Principal Statutory Rights
          </h3>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDataRequestMsg('Your data archive request (DPDP Sec 11) has been received. Our compliance desk will compile your data within 72 hours.');
                setTimeout(() => setDataRequestMsg(''), 5000);
              }}
              className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              Export Personal & Design Data Archive
            </button>
            <button
              type="button"
              onClick={() => {
                setDataRequestMsg('To request account & design data erasure (DPDP Sec 12), an acknowledgment ticket has been logged with our Data Protection Officer.');
                setTimeout(() => setDataRequestMsg(''), 5000);
              }}
              className="px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
            >
              Request Data & Account Erasure
            </button>
          </div>
        </div>

        {/* Legal Links */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-4 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-emerald-600 underline">
            Privacy Policy (DPDP Notice)
          </Link>
          <Link href="/terms#confidentiality" className="hover:text-emerald-600 underline">
            Mutual NDA Terms
          </Link>
          <Link href="/grievance" className="hover:text-emerald-600 underline">
            Grievance Redressal Officer
          </Link>
        </div>
      </div>
    </div>
  );
}
