'use client';

import React, { useEffect, useState } from 'react';
import { profileApi } from '@/lib/api/client';
import { LoadingState } from '@/components/account/LoadingState';

export default function ProfilePage() {
  const [profile, setProfile] = useState<{
    id?: string;
    email?: string;
    full_name?: string;
    phone?: string;
    status?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState('');
  const [emailErrorMsg, setEmailErrorMsg] = useState('');

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
        const res = await profileApi.getProfile(token);
        if (res?.data) {
          setProfile(res.data);
          setName(res.data.full_name || '');
          setPhone(res.data.phone || '');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load profile';
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await profileApi.updateProfile({ name, phone }, token);
      if (res?.data) {
        setProfile(res.data);
        setSuccessMsg('Profile updated successfully.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    setSavingEmail(true);
    setEmailSuccessMsg('');
    setEmailErrorMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await profileApi.changeEmail({ new_email: newEmail }, token);
      if (res?.data) {
        setProfile(res.data);
        setEmailSuccessMsg('Email updated successfully.');
        setNewEmail('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change email';
      setEmailErrorMsg(msg);
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading your profile..." />;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Personal Profile</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Manage your personal contact details, verified email address, and notification phone number.
        </p>
      </div>

      {/* Account Status Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 dark:text-zinc-500">
            Account Status
          </div>
          <div className="text-base font-bold text-zinc-900 dark:text-white capitalize mt-1">
            {profile?.status || 'Active'}
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          Verified Customer
        </span>
      </div>

      {/* Basic Profile Form */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-4">Contact Information</h2>
        {successMsg && (
          <div className="p-3 mb-4 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 mb-4 text-xs font-medium text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Phone Number (Domestic India)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="+91 9876543210"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Email Address Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-2">Email Address</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          Current email: <span className="font-semibold text-zinc-900 dark:text-white font-mono">{profile?.email}</span>
        </p>

        {emailSuccessMsg && (
          <div className="p-3 mb-4 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            {emailSuccessMsg}
          </div>
        )}
        {emailErrorMsg && (
          <div className="p-3 mb-4 text-xs font-medium text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
            {emailErrorMsg}
          </div>
        )}

        <form onSubmit={handleChangeEmail} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Update Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="new.email@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={savingEmail || !newEmail}
            className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
          >
            {savingEmail ? 'Updating...' : 'Change Email'}
          </button>
        </form>
      </div>
    </div>
  );
}
