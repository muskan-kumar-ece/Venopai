import React from "react";

export default function ShippingPolicyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 md:p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">LOGISTICS & DISPATCH</span>
          <h1 className="mt-2 text-3xl font-extrabold text-zinc-900 dark:text-white">
            Shipping & Delivery Policy
          </h1>
          <p className="mt-1 text-xs text-zinc-400">Effective Date: January 1, 2026 &bull; Domestic & Tier-1 Coverage</p>

          <div className="mt-8 space-y-6 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">1. Integrated Logistics Network</h2>
              <p className="mt-1">
                All shipments from the VenopAI Bengaluru fabrication facility are managed through Shiprocket's enterprise delivery network, integrating premium courier carriers including Delhivery, Blue Dart, DTDC, and Shadowfax.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">2. Protective ESD Packaging Standards</h2>
              <p className="mt-1">
                Electronic modules, populated boards, and sensitive semiconductor ICs are packaged in compliance with ANSI/ESD S20.20 standards:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Anti-static dissipative shielding bags.</li>
                <li>Moisture Barrier Bags (MBB) heat-sealed with cobalt-free desiccant and humidity indicator cards.</li>
                <li>Shock-absorbent high-density anti-static foam inserts within heavy-duty corrugated cartons.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">3. Serviceable Pincodes & Transit Times</h2>
              <p className="mt-1">
                We service over 27,000 postal codes across India. Typical transit durations:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li><strong>Metro Cities (Air Express):</strong> 1 - 2 business days following fabrication clearance.</li>
                <li><strong>Tier 2 & 3 Cities (Air/Express Surface):</strong> 2 - 4 business days.</li>
                <li><strong>Remote & Special Zones:</strong> 4 - 7 business days.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">4. Tracking & Notification</h2>
              <p className="mt-1">
                As soon as your shipment is manifest, a tracking Air Waybill (AWB) number is generated and linked to your order. You will receive milestone email and SMS notifications when the package is picked up, in-transit, out for delivery, and delivered.
              </p>
            </section>

            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">5. Transit Damage Claims</h2>
              <p className="mt-1">
                If a package arrives visibly damaged or tampered with, please take photos before unboxing and notify support@venopai.com within 48 hours of delivery to initiate an immediate insurance claim and expedited remanufacturing.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
