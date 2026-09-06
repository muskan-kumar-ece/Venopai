"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { consultationsApi, filesApi } from "@/lib/api/client";

interface UploadedFileItem {
  id: string;
  filename: string;
  size_bytes: number;
}

export default function ConsultationRequestPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
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
        formData.append("association_type", "consultation");

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
    if (!topic.trim()) {
      setErrorMessage("Please enter a consultation topic.");
      return;
    }
    if (!description.trim()) {
      setErrorMessage("Please provide a technical description or engineering question.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        topic: topic.trim(),
        description: description.trim(),
        file_ids: attachedFiles.map((f) => f.id),
      };

      const res = await consultationsApi.createRequest(payload);
      if (res?.data?.id) {
        router.push(`/consultations/${res.data.id}`);
      } else {
        router.push("/consultations");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit consultation request";
      if (msg.includes("EMAIL_NOT_VERIFIED") || msg.toLowerCase().includes("verify your email")) {
        setErrorMessage("Your email address is not verified. Please verify your email from your account settings before submitting engineering consultation requests.");
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/consultations" className="text-sm font-medium text-neutral-400 hover:text-white transition">
            &larr; Back to Consultations
          </Link>
          <span className="text-xs font-mono text-neutral-500">Advisory Intake</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Request Engineering Consultation
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Submit your schematic query, MCU selection challenge, RF layout questions, or architecture review to our hardware specialists.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8 space-y-6">
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Consultation Topic <span className="text-emerald-400">*</span>
              </label>
              <input
                id="topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Selecting ultra-low power MCU for BLE sensor beacon"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-200 mb-1.5">
                Technical Context & Questions <span className="text-emerald-400">*</span>
              </label>
              <textarea
                id="description"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your design constraints, operating voltages, target battery life, communication interfaces, or specific component doubts..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                Attachments (Schematics, datasheets, or block diagrams)
              </label>
              <p className="text-xs text-neutral-400 mb-3">
                Upload relevant files (PDF, ZIP, PNG, Gerbers) to help our engineering team review your question.
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
                {isUploading && <span className="text-xs text-neutral-400 animate-pulse">Processing files...</span>}
              </div>

              {attachedFiles.length > 0 && (
                <ul className="mt-3 divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-950">
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
          </div>

          <div className="flex items-center justify-end gap-4">
            <Link
              href="/consultations"
              className="text-sm text-neutral-400 hover:text-neutral-200 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="inline-flex items-center justify-center text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-6 py-2.5 rounded-lg transition shadow-md shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Consultation Request"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
