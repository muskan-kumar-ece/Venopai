"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { manufacturingApi, projectsApi, filesApi } from "@/lib/api/client";
import { useFormDraft } from "@/hooks/useFormDraft";
import { DraftRecoveryBanner } from "@/components/forms/DraftRecoveryBanner";
import { DraftSaveIndicator } from "@/components/forms/DraftSaveIndicator";

interface ProjectOption {
  id: string;
  name: string;
}

interface UploadedFileMeta {
  id: string;
  filename: string;
  size_bytes: number;
  scan_status: string;
}

export default function ManufacturingIntakePage() {
  const router = useRouter();

  // Form State
  const [prototypeType, setPrototypeType] = useState("pcb_assembly");
  const [title, setTitle] = useState("");
  const [projectOverview, setProjectOverview] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [technicalRequirements, setTechnicalRequirements] = useState("");
  const [materials, setMaterials] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [pcbDetails, setPcbDetails] = useState("");
  const [deliveryRequirements, setDeliveryRequirements] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [agreeNDA, setAgreeNDA] = useState<boolean>(false);

  // Projects list
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Files State
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileMeta[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  // Auto-Save Draft Integration
  const currentFormData = useMemo(
    () => ({
      prototypeType,
      title,
      projectOverview,
      quantity,
      technicalRequirements,
      materials,
      dimensions,
      pcbDetails,
      deliveryRequirements,
      additionalNotes,
      selectedProjectId,
      agreeNDA,
      uploadedFiles,
    }),
    [
      prototypeType,
      title,
      projectOverview,
      quantity,
      technicalRequirements,
      materials,
      dimensions,
      pcbDetails,
      deliveryRequirements,
      additionalNotes,
      selectedProjectId,
      agreeNDA,
      uploadedFiles,
    ]
  );

  const {
    saveStatus,
    lastSaved,
    hasDraft,
    draftTimestamp,
    isOnline,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    formKey: "venopai_draft_manufacturing",
    formData: currentFormData,
    setFormData: (updated) => {
      const d = typeof updated === "function" ? updated(currentFormData) : updated;
      if (d.prototypeType !== undefined) setPrototypeType(d.prototypeType);
      if (d.title !== undefined) setTitle(d.title);
      if (d.projectOverview !== undefined) setProjectOverview(d.projectOverview);
      if (d.quantity !== undefined) setQuantity(Number(d.quantity));
      if (d.technicalRequirements !== undefined) setTechnicalRequirements(d.technicalRequirements);
      if (d.materials !== undefined) setMaterials(d.materials);
      if (d.dimensions !== undefined) setDimensions(d.dimensions);
      if (d.pcbDetails !== undefined) setPcbDetails(d.pcbDetails);
      if (d.deliveryRequirements !== undefined) setDeliveryRequirements(d.deliveryRequirements);
      if (d.additionalNotes !== undefined) setAdditionalNotes(d.additionalNotes);
      if (d.selectedProjectId !== undefined) setSelectedProjectId(d.selectedProjectId);
      if (d.agreeNDA !== undefined) setAgreeNDA(d.agreeNDA);
      if (d.uploadedFiles !== undefined && Array.isArray(d.uploadedFiles)) {
        setUploadedFiles(d.uploadedFiles);
      }
    },
    metadata: {
      title: title || "Manufacturing Request",
      fileCount: uploadedFiles.length,
    },
  });

  const handleDiscardDraft = () => {
    discardDraft(() => {
      setPrototypeType("pcb_assembly");
      setTitle("");
      setProjectOverview("");
      setQuantity(1);
      setTechnicalRequirements("");
      setMaterials("");
      setDimensions("");
      setPcbDetails("");
      setDeliveryRequirements("");
      setAdditionalNotes("");
      setSelectedProjectId("");
      setAgreeNDA(false);
      setUploadedFiles([]);
    });
  };

  useEffect(() => {
    // Check for prefilled draft payload from Design -> Manufacturing convenience flow
    try {
      const draftRaw = sessionStorage.getItem("venopai_mfg_draft");
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft.title) setTitle(draft.title);
        if (draft.project_overview) setProjectOverview(draft.project_overview);
        if (draft.prototype_type) setPrototypeType(draft.prototype_type);
        if (draft.quantity) setQuantity(Number(draft.quantity));
        if (draft.reference_file_ids && Array.isArray(draft.reference_file_ids)) {
          const initialFiles: UploadedFileMeta[] = draft.reference_file_ids.map((fid: string, idx: number) => ({
            id: fid,
            filename: `delivered_design_asset_${idx + 1}.zip`,
            size_bytes: 0,
            scan_status: "clean",
          }));
          setUploadedFiles(initialFiles);
        }
        setDraftNotice("Form prefilled from your completed PCB Design Request. Review and adjust details before submitting.");
        sessionStorage.removeItem("venopai_mfg_draft");
      }
    } catch {
      // Ignore storage errors
    }

    // Load existing projects for grouping
    projectsApi
      .listProjects()
      .then((res: { data?: ProjectOption[] }) => {
        if (res?.data) {
          setProjects(res.data);
        }
      })
      .catch(() => {
        // Unauthenticated or empty projects
      });
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("association_type", "manufacturing");

      const res = await filesApi.uploadFile(formData);
      if (res?.data) {
        setUploadedFiles((prev) => [...prev, res.data]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload file";
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    filesApi.deleteFile(fileId).catch(() => {});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("Please enter a title for your request.");
      return;
    }
    if (!projectOverview.trim()) {
      setErrorMessage("Please describe your project overview.");
      return;
    }
    if (quantity < 1) {
      setErrorMessage("Quantity must be at least 1 unit.");
      return;
    }
    if (!agreeNDA) {
      setErrorMessage("Please review and accept the Intellectual Property & Mutual NDA Undertaking.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        project_overview: projectOverview.trim(),
        prototype_type: prototypeType,
        quantity: Number(quantity),
        technical_requirements: technicalRequirements.trim() || undefined,
        materials: materials.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        pcb_hardware_details: pcbDetails.trim() || undefined,
        delivery_requirements: deliveryRequirements.trim() || undefined,
        additional_notes: additionalNotes.trim() || undefined,
        file_ids: uploadedFiles.map((f) => f.id),
        project_id: selectedProjectId || undefined,
      };

      const res = await manufacturingApi.createRequest(payload);
      await clearDraft();
      if (res?.data?.id) {
        router.push(`/manufacturing/requests/${res.data.id}`);
      } else {
        router.push("/manufacturing/requests");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit request";
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/manufacturing" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              &larr; Manufacturing Home
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <DraftSaveIndicator saveStatus={saveStatus} lastSaved={lastSaved} isOnline={isOnline} />
            <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
              Intake Specification Form
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Submit Manufacturing Request
          </h1>
          <p className="mt-2 text-neutral-400 text-sm">
            Provide your hardware specifications. Our engineering staff will review stackups, generate an authoritative quote, and initiate manufacturing.
          </p>
        </div>

        <DraftRecoveryBanner
          draftTimestamp={draftTimestamp}
          onDiscard={handleDiscardDraft}
          formTitle="Manufacturing Specification"
          hasUploadedFiles={uploadedFiles.length > 0}
        />

        {draftNotice && (
          <div className="mb-8 p-4 rounded-lg bg-cyan-950/50 border border-cyan-800 text-cyan-300 text-sm flex items-center justify-between">
            <span>{draftNotice}</span>
            <button
              type="button"
              onClick={() => setDraftNotice(null)}
              className="text-xs text-cyan-400 hover:text-cyan-200 underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-8 p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* Step 1: Discipline & Project */}
          <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center text-xs font-mono">1</span>
              Manufacturing Discipline & Organization
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                  Prototype Type *
                </label>
                <select
                  value={prototypeType}
                  onChange={(e) => setPrototypeType(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="pcb_assembly">PCB Fabrication & Assembly (PCBA)</option>
                  <option value="cnc_machining">CNC Machining (Milling / Turning)</option>
                  <option value="3d_printing">Industrial 3D Printing (SLA/SLS/FDM)</option>
                  <option value="sheet_metal">Sheet Metal & Enclosures</option>
                  <option value="injection_molding">Tooling & Injection Molding</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                  Assign to Project (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Standalone Request --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: Request Overview */}
          <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center text-xs font-mono">2</span>
              Title & Functional Scope
            </h2>

            <div>
              <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                Request Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 4-Layer Drone Flight Controller PCBA"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                Project Overview & Requirements *
              </label>
              <textarea
                value={projectOverview}
                onChange={(e) => setProjectOverview(e.target.value)}
                rows={4}
                placeholder="Detailed description of what you are manufacturing, operating environment, and design constraints..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                  Target Quantity (Units) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                  Materials / Stackup
                </label>
                <input
                  type="text"
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  placeholder="e.g. AL6061-T6 / FR4 1.6mm 2oz / PA12 Nylon"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Technical Details */}
          <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center text-xs font-mono">3</span>
              Engineering & Tolerances
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                  Dimensions / Footprint
                </label>
                <input
                  type="text"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  placeholder="e.g. 120 x 85 x 30 mm"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                  PCB / Hardware Specifics
                </label>
                <input
                  type="text"
                  value={pcbDetails}
                  onChange={(e) => setPcbDetails(e.target.value)}
                  placeholder="e.g. SMT single-sided, BGA 0.5mm pitch"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                Technical Tolerances & Specifications
              </label>
              <textarea
                value={technicalRequirements}
                onChange={(e) => setTechnicalRequirements(e.target.value)}
                rows={3}
                placeholder="Specific tolerances (e.g. ISO 2768-m), impedance control, surface finish requirements..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Step 4: Private File Uploads */}
          <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center text-xs font-mono">4</span>
              Design Files & CAD Upload
            </h2>
            <p className="text-xs text-neutral-400">
              Upload Gerber (ZIP), STEP, STL, DXF, PDF drawings, or BOM spreadsheets. Max 100MB per file. Files are stored securely and scanned for malware.
            </p>

            <div className="flex items-center gap-4">
              <label className="cursor-pointer px-4 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-sm font-medium transition flex items-center gap-2">
                <span>{isUploading ? "Uploading..." : "+ Choose File to Upload"}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
              {isUploading && (
                <span className="text-xs text-cyan-400 animate-pulse font-mono">
                  Encrypting and uploading to secure storage...
                </span>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="p-3.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-cyan-400">FILE</span>
                      <span className="text-neutral-200 font-medium">{file.filename}</span>
                      <span className="text-xs text-neutral-500 font-mono">
                        ({Math.round(file.size_bytes / 1024)} KB)
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                        {file.scan_status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 5: Delivery & Submit */}
          <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center text-xs font-mono">5</span>
              Delivery Requirements & Submission
            </h2>

            <div>
              <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                Timeline or Delivery Destination Requirements
              </label>
              <input
                type="text"
                value={deliveryRequirements}
                onChange={(e) => setDeliveryRequirements(e.target.value)}
                placeholder="e.g. Required by Oct 15, Hyderabad delivery with static-safe packaging"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-300 uppercase mb-2">
                Additional Notes / Non-Disclosure Notes
              </label>
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                rows={2}
                placeholder="Any special handling, testing requirements, or packaging notes..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Statutory Intellectual Property & NDA Declaration */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={agreeNDA}
                  onChange={(e) => setAgreeNDA(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                />
                <div className="text-xs text-neutral-300 leading-relaxed">
                  <span className="font-semibold text-white">Intellectual Property & Mutual NDA Undertaking:</span>{" "}
                  I confirm that I own or hold valid licenses to submit these Gerber files, CAD schematics, and BOM specs. I agree to the{" "}
                  <Link href="/terms#confidentiality" target="_blank" className="text-cyan-400 underline font-medium">
                    VenopAI Engineering Confidentiality Terms
                  </Link>
                  . VenopAI guarantees that all uploaded technical files are processed with 256-bit AES encryption under strict confidentiality solely for feasibility estimation, quoting, and manufacturing. <span className="text-red-400">*</span>
                </div>
              </label>
              <div className="flex items-center gap-2 text-[11px] text-neutral-400 pl-7">
                <span className="text-cyan-400">🔒</span>
                <span>Protected under DPDP Act 2023 & IPC-A-610 standards &bull; Files are never shared or sold.</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-neutral-800">
            <DraftSaveIndicator saveStatus={saveStatus} lastSaved={lastSaved} isOnline={isOnline} />
            <div className="flex items-center gap-4">
              <Link
                href="/manufacturing"
                className="px-5 py-2.5 rounded-lg border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || isUploading || !agreeNDA}
                className="px-7 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold text-sm transition shadow-lg shadow-cyan-500/25 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting Request..." : "Submit for Engineering Review"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
