"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { designApi, filesApi } from "@/lib/api/client";

interface UploadedFileItem {
  id: string;
  filename: string;
  size_bytes: number;
}

export default function DesignRequestIntakePage() {
  const router = useRouter();

  // Basic info
  const [title, setTitle] = useState("");
  const [projectOverview, setProjectOverview] = useState("");
  const [targetTimeline, setTargetTimeline] = useState("3-4 weeks");

  // Scopes
  const [scopeSchematic, setScopeSchematic] = useState(true);
  const [scopeLayout, setScopeLayout] = useState(true);
  const [scopeComponentSelection, setScopeComponentSelection] = useState(true);
  const [scopeSimulation, setScopeSimulation] = useState(false);
  const [scopeFirmwarePrep, setScopeFirmwarePrep] = useState(false);

  // Technical constraints
  const [layerCount, setLayerCount] = useState("4");
  const [dimensions, setDimensions] = useState("");
  const [powerRequirements, setPowerRequirements] = useState("");
  const [keyComponents, setKeyComponents] = useState("");
  const [deliverablesNotes, setDeliverablesNotes] = useState("");

  // Files
  const [attachedFiles, setAttachedFiles] = useState<UploadedFileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("association_type", "design");

        const res = await filesApi.uploadFile(formData);
        if (res?.data) {
          setAttachedFiles((prev) => [
            ...prev,
            {
              id: res.data.id,
              filename: res.data.filename,
              size_bytes: res.data.size_bytes,
            },
          ]);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload file";
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage("Please enter a design project title.");
      return;
    }
    if (!projectOverview.trim()) {
      setErrorMessage("Please enter an overview of your hardware design requirements.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        title: title.trim(),
        project_overview: projectOverview.trim(),
        scope_schematic: scopeSchematic,
        scope_layout: scopeLayout,
        scope_component_selection: scopeComponentSelection,
        scope_simulation: scopeSimulation,
        scope_firmware_prep: scopeFirmwarePrep,
        target_timeline: targetTimeline.trim() || undefined,
        layer_count: parseInt(layerCount, 10) || 4,
        dimensions: dimensions.trim() || undefined,
        power_requirements: powerRequirements.trim() || undefined,
        key_components: keyComponents.trim() || undefined,
        deliverables_required: deliverablesNotes.trim() || undefined,
        file_ids: attachedFiles.map((f) => f.id),
      };

      const res = await designApi.createRequest(payload);
      if (res?.data?.id) {
        router.push(`/design/requests/${res.data.id}`);
      } else {
        router.push("/design/requests");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit design request";
      if (msg.includes("EMAIL_NOT_VERIFIED") || msg.toLowerCase().includes("verify your email")) {
        setErrorMessage("Your email address is not verified. Please verify your email before submitting PCB design requests.");
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/design" className="text-sm font-medium text-neutral-400 hover:text-white transition">
            &larr; Design Home
          </Link>
          <span className="text-xs font-mono text-cyan-400">PCB Engineering Intake</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Submit PCB / Hardware Design Request
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Define your hardware requirements, target layer count, power parameters, and scopes of work.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Overview */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-semibold text-white">1. Project Information</h2>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Design Title <span className="text-cyan-400">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Ultra-Low Power LoRa Sensor Node with Energy Harvesting"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>

            <div>
              <label htmlFor="overview" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Project Overview & Functional Requirements <span className="text-cyan-400">*</span>
              </label>
              <textarea
                id="overview"
                rows={5}
                value={projectOverview}
                onChange={(e) => setProjectOverview(e.target.value)}
                placeholder="Detail what the hardware does, intended operating conditions, target enclosures, interface protocols..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>

            <div>
              <label htmlFor="timeline" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Target Timeline
              </label>
              <input
                id="timeline"
                type="text"
                value={targetTimeline}
                onChange={(e) => setTargetTimeline(e.target.value)}
                placeholder="e.g., 2 weeks, 4 weeks, flexible"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 2: Scope Selection */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-semibold text-white">2. Scope of Work Required</h2>
            <p className="text-xs text-neutral-400">
              Select all engineering services you need VenopAI to perform for this project:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/60 cursor-pointer hover:border-neutral-700">
                <input
                  type="checkbox"
                  checked={scopeSchematic}
                  onChange={(e) => setScopeSchematic(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">Schematic Capture</span>
                  <p className="text-xs text-neutral-400 mt-0.5">Electrical schematic authoring and ERC audit</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/60 cursor-pointer hover:border-neutral-700">
                <input
                  type="checkbox"
                  checked={scopeLayout}
                  onChange={(e) => setScopeLayout(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">PCB Layout & Routing</span>
                  <p className="text-xs text-neutral-400 mt-0.5">Component placement, copper pours, impedance matching</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/60 cursor-pointer hover:border-neutral-700">
                <input
                  type="checkbox"
                  checked={scopeComponentSelection}
                  onChange={(e) => setScopeComponentSelection(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">BOM & Sourcing Analysis</span>
                  <p className="text-xs text-neutral-400 mt-0.5">Component lifecycle, MPN selection, second-sourcing</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/60 cursor-pointer hover:border-neutral-700">
                <input
                  type="checkbox"
                  checked={scopeSimulation}
                  onChange={(e) => setScopeSimulation(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">Signal/Power Simulation</span>
                  <p className="text-xs text-neutral-400 mt-0.5">SI/PI analysis, DC drop, thermal dissipation</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-neutral-800 bg-neutral-950/60 cursor-pointer hover:border-neutral-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={scopeFirmwarePrep}
                  onChange={(e) => setScopeFirmwarePrep(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">Firmware Bring-up Readiness</span>
                  <p className="text-xs text-neutral-400 mt-0.5">Test point placement, SWD/JTAG pinouts, pin-mapping register definitions</p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 3: Technical Constraints */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-semibold text-white">3. Technical Parameters</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="layerCount" className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Target Layer Count
                </label>
                <select
                  id="layerCount"
                  value={layerCount}
                  onChange={(e) => setLayerCount(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="2">2 Layers</option>
                  <option value="4">4 Layers (Standard)</option>
                  <option value="6">6 Layers (High Speed)</option>
                  <option value="8">8 Layers (Advanced / DDR)</option>
                </select>
              </div>

              <div>
                <label htmlFor="dimensions" className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Dimensions / Form-Factor
                </label>
                <input
                  id="dimensions"
                  type="text"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  placeholder="e.g., 65mm x 45mm, Raspberry Pi HAT shape"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="power" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Power Architecture & Voltages
              </label>
              <input
                id="power"
                type="text"
                value={powerRequirements}
                onChange={(e) => setPowerRequirements(e.target.value)}
                placeholder="e.g., 3.7V LiPo with USB-C charging, 3.3V buck-boost rail, 1.8V LDO"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="components" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Preferred ICs / Sensors / Modules
              </label>
              <input
                id="components"
                type="text"
                value={keyComponents}
                onChange={(e) => setKeyComponents(e.target.value)}
                placeholder="e.g., STM32WB55, BME680, SX1262, USB-C PD controller"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Deliverables & Specific Instructions
              </label>
              <textarea
                id="notes"
                rows={3}
                value={deliverablesNotes}
                onChange={(e) => setDeliverablesNotes(e.target.value)}
                placeholder="e.g., Require KiCad 8 source files, JLCPCB compatible drill format, 3D STEP model for mechanical enclosure designer..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 4: Attachments */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-semibold text-white">4. Requirements Documents & Attachments</h2>
            <p className="text-xs text-neutral-400">
              Attach functional specs, block diagrams, hand sketches, or existing schematic files (PDF, ZIP, KiCad, PNG).
            </p>

            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3.5 py-2 rounded-md border border-neutral-700 transition">
                <span>{isUploading ? "Uploading..." : "+ Attach Files"}</span>
                <input
                  type="file"
                  multiple
                  disabled={isUploading}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {isUploading && <span className="text-xs text-neutral-400 animate-pulse">Uploading file...</span>}
            </div>

            {attachedFiles.length > 0 && (
              <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-950">
                {attachedFiles.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-3.5 py-2 text-xs">
                    <span className="text-neutral-300 font-mono truncate max-w-sm">
                      {f.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(f.id)}
                      className="text-red-400 hover:text-red-300 ml-2"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-4">
            <Link
              href="/design"
              className="text-sm text-neutral-400 hover:text-neutral-200 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="inline-flex items-center justify-center text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 px-6 py-2.5 rounded-lg transition shadow-md shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Design Request"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
