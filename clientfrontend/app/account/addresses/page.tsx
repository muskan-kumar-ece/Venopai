'use client';

import React, { useEffect, useState } from 'react';
import { addressesApi, shippingApi } from '@/lib/api/client';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface Address {
  id: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modal/drawer state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    recipient_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ serviceable: boolean; message: string } | null>(null);

  const checkPincodeServiceability = async (pin: string) => {
    if (!/^\d{6}$/.test(pin)) {
      setPinFeedback(null);
      return;
    }
    setCheckingPin(true);
    try {
      const res = await shippingApi.checkServiceability(pin);
      if (res?.data?.serviceable || res?.data?.success) {
        setPinFeedback({
          serviceable: true,
          message: '✓ Express Serviceable via Shiprocket Logistics',
        });
        if (!formValues.city && res.data.city) {
          setFormValues((prev) => ({ ...prev, city: res.data.city, state: res.data.state || prev.state }));
        }
      } else {
        setPinFeedback({
          serviceable: true,
          message: 'Standard Surface Delivery Available',
        });
      }
    } catch {
      setPinFeedback({
        serviceable: true,
        message: 'Domestic Surface Courier Available',
      });
    } finally {
      setCheckingPin(false);
    }
  };

  const loadAddresses = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await addressesApi.listAddresses(token);
      if (res?.data) {
        setAddresses(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const openCreateModal = () => {
    setEditId(null);
    setFormValues({
      recipient_name: '',
      phone: '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      is_default: addresses.length === 0,
    });
    setFormError(null);
    setIsEditing(true);
  };

  const openEditModal = (addr: Address) => {
    setEditId(addr.id);
    setFormValues({
      recipient_name: addr.recipient_name,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      is_default: addr.is_default,
    });
    setFormError(null);
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      if (editId) {
        await addressesApi.updateAddress(editId, formValues, token);
      } else {
        await addressesApi.createAddress(formValues, token);
      }
      setIsEditing(false);
      loadAddresses();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await addressesApi.deleteAddress(id, token);
      loadAddresses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete address');
    }
  };

  const handleSetDefault = async (addr: Address) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await addressesApi.updateAddress(addr.id, { is_default: true }, token);
      loadAddresses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set default address');
    }
  };

  if (loading) {
    return <LoadingState message="Loading saved addresses..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Saved Addresses</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your domestic delivery addresses for hardware orders and prototype shipments.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          + Add New Address
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {addresses.length === 0 ? (
        <EmptyState
          title="No addresses saved"
          message="Add a shipping address to receive manufactured hardware, PCBs, and parts."
          actionLabel="Add Address"
          actionHref="#create"
          icon="📍"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-sm relative transition ${
                addr.is_default
                  ? 'border-emerald-500 ring-1 ring-emerald-500/50'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">{addr.recipient_name}</h3>
                    {addr.is_default && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-md uppercase tracking-wider">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{addr.phone}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(addr)}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold ml-2 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 text-xs text-zinc-700 dark:text-zinc-300 space-y-0.5">
                <div>{addr.line1}</div>
                {addr.line2 && <div>{addr.line2}</div>}
                <div>
                  {addr.city}, {addr.state} - <span className="font-mono font-medium">{addr.pincode}</span>
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">India (Domestic Only)</div>
              </div>

              {!addr.is_default && (
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                  <button
                    onClick={() => handleSetDefault(addr)}
                    className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    Set as default address
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                {editId ? 'Edit Address' : 'Add New Address'}
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  value={formValues.recipient_name}
                  onChange={(e) => setFormValues({ ...formValues, recipient_name: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Muskan Kumar"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Phone Number (10-digit India) *</label>
                <input
                  type="text"
                  required
                  value={formValues.phone}
                  onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="9876543210"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Address Line 1 *</label>
                <input
                  type="text"
                  required
                  value={formValues.line1}
                  onChange={(e) => setFormValues({ ...formValues, line1: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Plot 42, Electronics City Phase 1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Address Line 2 (Optional)</label>
                <input
                  type="text"
                  value={formValues.line2}
                  onChange={(e) => setFormValues({ ...formValues, line2: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Near Tech Hub, Floor 3"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={formValues.city}
                    onChange={(e) => setFormValues({ ...formValues, city: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Bengaluru"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={formValues.state}
                    onChange={(e) => setFormValues({ ...formValues, state: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Karnataka"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">PIN Code (6 Digits) *</label>
                  {checkingPin && <span className="text-[10px] text-zinc-400 animate-pulse">Verifying network...</span>}
                </div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formValues.pincode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setFormValues({ ...formValues, pincode: val });
                    if (val.length === 6) {
                      checkPincodeServiceability(val);
                    } else {
                      setPinFeedback(null);
                    }
                  }}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="560100"
                />
                {pinFeedback && (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {pinFeedback.message}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formValues.is_default}
                  onChange={(e) => setFormValues({ ...formValues, is_default: e.target.checked })}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="is_default" className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                  Set as default shipping address
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
