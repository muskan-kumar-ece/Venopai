"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { softwareApi, filesApi } from "@/lib/api/client";

interface UploadedFileItem {
  id: string;
  filename: string;
  size_bytes: number;
}

export default function SoftwareRequestIntakePage() {
  const router = useRouter();

  // Basic info
  const [title, setTitle] = useState("");
  const [projectOverview, setProjectOverview] = useState("");
  const [targetTimeline, setTargetTimeline] = useState("3-4 weeks");

  // Technical constraints
  const [hardwarePlatform, setHardwarePlatform] = useState("");
  const [programmingLanguage, setProgrammingLanguage] = useState("C / C++");
  const [osFramework, setOsFramework] = useState("FreeRTOS");
  const [interfacesProtocols, setInterfacesProtocols] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [deliverablesRequired, setDeliverablesRequired] = useState("");

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
        formData.append("association_type", "software");

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
      setErrorMessage("Please enter a project title.");
      return;
    }
    if (!projectOverview.trim()) {
      setErrorMessage("Please enter an overview of your software/firmware requirements.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        title: title.trim(),
        project_overview: projectOverview.trim(),
        hardware_platform: hardwarePlatform.trim() || undefined,
        programming_language: programmingLanguage.trim() || undefined,
        os_framework: osFramework.trim() || undefined,
        interfaces_protocols: interfacesProtocols.trim() || undefined,
        repository_url: repositoryUrl.trim() || undefined,
        deliverables_required: deliverablesRequired.trim() || undefined,
        target_timeline: targetTimeline.trim() || undefined,
        file_ids: attachedFiles.map((f) => f.id),
      };

      const res = await softwareApi.createRequest(payload);
      if (res?.data?.id) {
        router.push(`/software/requests/${res.data.id}`);
      } else {
        router.push("/software/requests");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit software request";
      if (msg.includes("EMAIL_NOT_VERIFIED") || msg.toLowerCase().includes("verify your email")) {
        setErrorMessage("Your email address is not verified. Please verify your email before submitting firmware engineering requests.");
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
          <Link href="/software" className="text-sm font-medium text-neutral-400 hover:text-white transition">
            &larr; Software Home
          </Link>
          <span className="text-xs font-mono text-indigo-400">Firmware Intake</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Submit Software / Firmware Request
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Define your hardware targets, RTOS preferences, communications stacks, and development deliverables.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Project Scope */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-semibold text-white">1. Project Overview</h2>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Project Title <span className="text-indigo-400">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., FreeRTOS Motor Controller Firmware with CANopen Telemetry"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label htmlFor="overview" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Functional Description & Scope <span className="text-indigo-400">*</span>
              </label>
              <textarea
                id="overview"
                rows={5}
                value={projectOverview}
                onChange={(e) => setProjectOverview(e.target.value)}
                placeholder="Describe what the firmware must accomplish, timing constraints, state machines, interrupt handling requirements..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                placeholder="e.g., 3 weeks, 6 weeks"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 2: Hardware & Software Stack */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-semibold text-white">2. Target Hardware & Stack</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="hwPlatform" className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Target MCU / Processor
                </label>
                <input
                  id="hwPlatform"
                  type="text"
                  value={hardwarePlatform}
                  onChange={(e) => setHardwarePlatform(e.target.value)}
                  placeholder="e.g., STM32G474, ESP32-S3, nRF5340, RP2040"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="lang" className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Primary Language
                </label>
                <select
                  id="lang"
                  value={programmingLanguage}
                  onChange={(e) => setProgrammingLanguage(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="C (C99 / C11)">C (C99 / C11 - Bare Metal & Embedded)</option>
                  <option value="C++ (Modern C++17/20)">Modern C++ (C++17 / C++20)</option>
                  <option value="Embedded Rust">Embedded Rust (no_std)</option>
                  <option value="Python / MicroPython">Python / MicroPython / CircuitPython</option>
                </select>
              </div>

              <div>
                <label htmlFor="framework" className="block text-sm font-medium text-neutral-200 mb-1.5">
                  OS / Framework
                </label>
                <select
                  id="framework"
                  value={osFramework}
                  onChange={(e) => setOsFramework(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="FreeRTOS">FreeRTOS</option>
                  <option value="Zephyr OS">Zephyr RTOS</option>
                  <option value="Bare-metal">Bare-metal (Super-loop / Interrupt-driven)</option>
                  <option value="Embedded Linux">Embedded Linux (Yocto / Buildroot)</option>
                  <option value="ESP-IDF">ESP-IDF (Espressif)</option>
                </select>
              </div>

              <div>
                <label htmlFor="protocols" className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Protocols & Bus Interfaces
                </label>
                <input
                  id="protocols"
                  type="text"
                  value={interfacesProtocols}
                  onChange={(e) => setInterfacesProtocols(e.target.value)}
                  placeholder="e.g., CAN 2.0B, SPI (10MHz), I2C, BLE 5.2, UART DMA"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="repo" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Existing Code Repository URL (Optional)
              </label>
              <input
                id="repo"
                type="text"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="e.g., https://github.com/my-org/firmware-bringup (or leave blank for clean-slate)"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label htmlFor="deliverables" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Required Deliverables
              </label>
              <textarea
                id="deliverables"
                rows={3}
                value={deliverablesRequired}
                onChange={(e) => setDeliverablesRequired(e.target.value)}
                placeholder="e.g., Source Git repo with CMake/Make build scripts, compiled .bin/.hex binaries, hardware test harness script, register mapping PDF..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 3: Attachments */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-semibold text-white">3. Attachments & Hardware Specs</h2>
            <p className="text-xs text-neutral-400">
              Attach target hardware schematics, pinout maps, protocol specs, or register documentation (PDF, ZIP, C/H).
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
              {isUploading && <span className="text-xs text-neutral-400 animate-pulse">Processing upload...</span>}
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
              href="/software"
              className="text-sm text-neutral-400 hover:text-neutral-200 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="inline-flex items-center justify-center text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-neutral-950 px-6 py-2.5 rounded-lg transition shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Software Request"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
