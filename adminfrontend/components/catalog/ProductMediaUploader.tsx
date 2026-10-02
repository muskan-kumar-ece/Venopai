"use client";

import React, { useState, useRef } from "react";
import { adminCatalogApi } from "@/lib/api/client";

interface ProductMediaUploaderProps {
  images: string[];
  onChangeImages: (images: string[]) => void;
  videoUrl?: string;
  onChangeVideoUrl: (url: string) => void;
  userManualUrl?: string;
  onChangeUserManualUrl?: (url: string) => void;
  maxImages?: number;
}

export default function ProductMediaUploader({
  images,
  onChangeImages,
  videoUrl = "",
  onChangeVideoUrl,
  userManualUrl = "",
  onChangeUserManualUrl,
  maxImages = 6,
}: ProductMediaUploaderProps) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastedImageUrl, setPastedImageUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [videoInputMode, setVideoInputMode] = useState<"upload" | "url">("upload");
  const [pastedVideoUrl, setPastedVideoUrl] = useState(videoUrl);
  const [pdfInputMode, setPdfInputMode] = useState<"upload" | "url">("upload");
  const [pastedPdfUrl, setPastedPdfUrl] = useState(userManualUrl);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Handle multi-image upload
  const handleImageFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    const filesArray = Array.from(files);

    if (images.length + filesArray.length > maxImages) {
      setError(`You can upload a maximum of ${maxImages} images (currently ${images.length}).`);
      return;
    }

    setUploadingImage(true);
    const newUrls: string[] = [];

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        setUploadProgress(`Uploading ${i + 1} of ${filesArray.length}: ${file.name}...`);

        const formData = new FormData();
        formData.append("file", file);

        const res = await adminCatalogApi.uploadMedia(formData);
        if (res?.data?.url) {
          newUrls.push(res.data.url);
        } else {
          throw new Error("Invalid response from media upload endpoint");
        }
      }

      onChangeImages([...images, ...newUrls]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadingImage(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle video upload
  const handleVideoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadingVideo(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await adminCatalogApi.uploadMedia(formData);
      if (res?.data?.url) {
        onChangeVideoUrl(res.data.url);
        setPastedVideoUrl(res.data.url);
      } else {
        throw new Error("Invalid response from video upload endpoint");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Video upload failed");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  // Reorder / Primary actions
  const handleSetPrimary = (index: number) => {
    if (index === 0) return;
    const item = images[index];
    const remaining = images.filter((_, i) => i !== index);
    onChangeImages([item, ...remaining]);
  };

  const handleMove = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const reordered = [...images];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);
    onChangeImages(reordered);
  };

  const handleRemoveImage = (index: number) => {
    onChangeImages(images.filter((_, i) => i !== index));
  };

  const handleAddPastedImage = () => {
    const url = pastedImageUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    if (images.length >= maxImages) {
      setError(`Maximum limit of ${maxImages} images reached.`);
      return;
    }
    onChangeImages([...images, url]);
    setPastedImageUrl("");
    setShowUrlInput(false);
    setError(null);
  };

  const handleSaveVideoUrl = () => {
    const url = pastedVideoUrl.trim();
    onChangeVideoUrl(url);
  };

  const handleClearVideo = () => {
    onChangeVideoUrl("");
    setPastedVideoUrl("");
  };

  const isEmbedVideo = (url: string) => {
    return (
      url.includes("youtube.com") ||
      url.includes("youtu.be") ||
      url.includes("vimeo.com")
    );
  };

  const getEmbedUrl = (url: string) => {
    if (url.includes("youtube.com/watch?v=")) {
      const id = url.split("v=")[1]?.split("&")[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    if (url.includes("vimeo.com/")) {
      const id = url.split("vimeo.com/")[1]?.split("?")[0];
      return `https://player.vimeo.com/video/${id}`;
    }
    return url;
  };

  // PDF User Manual Handlers
  const handlePdfFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Please select a valid PDF file (.pdf).");
      return;
    }

    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await adminCatalogApi.uploadMedia(formData);
      if (res?.data?.url) {
        if (onChangeUserManualUrl) {
          onChangeUserManualUrl(res.data.url);
        }
        setPastedPdfUrl(res.data.url);
      } else {
        throw new Error("Invalid response from document upload endpoint");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PDF upload failed");
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const handleSavePdfUrl = () => {
    const url = pastedPdfUrl.trim();
    if (!url) return;
    if (onChangeUserManualUrl) {
      onChangeUserManualUrl(url);
    }
  };

  const handleClearPdf = () => {
    if (onChangeUserManualUrl) {
      onChangeUserManualUrl("");
    }
    setPastedPdfUrl("");
  };

  return (
    <div className="space-y-6">
      {/* IMAGES SECTION */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Product Images</h3>
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-mono font-medium text-zinc-300">
                {images.length} of {maxImages} uploaded (3 to 4 recommended)
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Add multiple angles (Top, Isometric, PCB pinout, packaging). The first image will be the primary catalog cover.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition underline underline-offset-4"
            >
              {showUrlInput ? "Hide URL Input" : "+ Add by URL"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-white"
            >
              &times;
            </button>
          </div>
        )}

        {/* URL Input Form */}
        {showUrlInput && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
            <input
              type="url"
              placeholder="https://res.cloudinary.com/.../product-angle.jpg"
              value={pastedImageUrl}
              onChange={(e) => setPastedImageUrl(e.target.value)}
              className="flex-1 bg-transparent px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddPastedImage}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition"
            >
              Add URL
            </button>
          </div>
        )}

        {/* Drag & Drop Upload Zone */}
        {images.length < maxImages && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
              uploadingImage
                ? "border-emerald-500/50 bg-emerald-950/10 cursor-wait"
                : "border-zinc-800 hover:border-emerald-500/60 hover:bg-zinc-900/70"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageFilesSelected}
              disabled={uploadingImage}
              className="hidden"
            />

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-emerald-600/20 group-hover:text-emerald-400 text-zinc-400 transition">
              {uploadingImage ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>

            <p className="mt-2 text-xs font-semibold text-zinc-200">
              {uploadingImage ? uploadProgress || "Uploading images to Cloudinary..." : "Click or drag & drop product images"}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              JPG, PNG, or WebP &bull; Select up to {maxImages - images.length} more files &bull; Max 15MB each
            </p>
          </div>
        )}

        {/* Uploaded Images Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 pt-1">
            {images.map((img, idx) => {
              const isCover = idx === 0;
              return (
                <div
                  key={idx}
                  className={`group relative flex flex-col rounded-xl border bg-zinc-950/60 overflow-hidden transition ${
                    isCover
                      ? "border-emerald-500/80 shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-4/3 w-full bg-zinc-900/60 overflow-hidden flex items-center justify-center">
                    <img
                      src={img}
                      alt={`Product image ${idx + 1}`}
                      className="h-full w-full object-contain p-2"
                      loading="lazy"
                    />

                    {/* Badge: Cover */}
                    {isCover && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-600/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        <span>★</span> Cover Image
                      </span>
                    )}

                    {/* Order Pill */}
                    <span className="absolute top-2 right-2 rounded-md bg-neutral-900/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/90 px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-1">
                      {/* Move Left */}
                      <button
                        type="button"
                        onClick={() => handleMove(idx, "left")}
                        disabled={idx === 0}
                        title="Move Left"
                        className="rounded p-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                      >
                        &larr;
                      </button>

                      {/* Move Right */}
                      <button
                        type="button"
                        onClick={() => handleMove(idx, "right")}
                        disabled={idx === images.length - 1}
                        title="Move Right"
                        className="rounded p-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                      >
                        &rarr;
                      </button>

                      {/* Make Primary */}
                      {!isCover && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(idx)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                          title="Set as catalog cover photo"
                        >
                          Make Cover
                        </button>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="rounded p-1 text-zinc-500 hover:text-red-400 transition"
                      title="Remove image"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VIDEO SECTION */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Product Demo Video</h3>
              <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                Optional
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Provide an unboxing, assembly, or live firmware demonstration video. Customers can watch this directly on the product page.
            </p>
          </div>

          {/* Toggle between upload & external url */}
          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setVideoInputMode("upload")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                videoInputMode === "upload"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Upload Video
            </button>
            <button
              type="button"
              onClick={() => setVideoInputMode("url")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                videoInputMode === "url"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Embed / URL
            </button>
          </div>
        </div>

        {/* Video Mode 1: File Upload */}
        {videoInputMode === "upload" && !videoUrl && (
          <div
            onClick={() => videoInputRef.current?.click()}
            className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
              uploadingVideo
                ? "border-blue-500/50 bg-blue-950/10 cursor-wait"
                : "border-zinc-800 hover:border-blue-500/60 hover:bg-zinc-900/70"
            }`}
          >
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleVideoFileSelected}
              disabled={uploadingVideo}
              className="hidden"
            />

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-blue-600/20 group-hover:text-blue-400 text-zinc-400 transition">
              {uploadingVideo ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </div>

            <p className="mt-2 text-xs font-semibold text-zinc-200">
              {uploadingVideo ? "Uploading video asset to Cloudinary..." : "Click to select and upload video"}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              MP4, WebM, or MOV &bull; Maximum size: 100MB
            </p>
          </div>
        )}

        {/* Video Mode 2: External Video URL */}
        {videoInputMode === "url" && (
          <div className="flex items-center gap-2">
            <input
              type="url"
              placeholder="e.g. https://www.youtube.com/watch?v=... or direct MP4 link"
              value={pastedVideoUrl}
              onChange={(e) => setPastedVideoUrl(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveVideoUrl}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
            >
              Apply Video
            </button>
          </div>
        )}

        {/* Video Player Preview */}
        {videoUrl && (
          <div className="relative rounded-xl border border-zinc-800 bg-zinc-950 p-3 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active Product Video
              </span>
              <button
                type="button"
                onClick={handleClearVideo}
                className="text-xs text-red-400 hover:text-red-300 font-semibold transition"
              >
                Remove Video
              </button>
            </div>

            <div className="relative aspect-video w-full max-w-lg mx-auto rounded-lg overflow-hidden bg-black flex items-center justify-center">
              {isEmbedVideo(videoUrl) ? (
                <iframe
                  src={getEmbedUrl(videoUrl)}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  src={videoUrl}
                  controls
                  className="h-full w-full object-contain"
                >
                  Your browser does not support HTML5 video.
                </video>
              )}
            </div>

            <p className="mt-2 text-[11px] font-mono text-zinc-500 truncate text-center">
              {videoUrl}
            </p>
          </div>
        )}
      </div>

      {/* 3. User Manual & Technical Datasheet (Optional PDF) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                User Manual & Technical Datasheet
              </h3>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                Optional
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Upload a PDF datasheet, pinout diagram, or operating manual for customers to download on the product page.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPdfInputMode("upload")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                pdfInputMode === "upload"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Upload PDF
            </button>
            <button
              type="button"
              onClick={() => setPdfInputMode("url")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                pdfInputMode === "url"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              External Link
            </button>
          </div>
        </div>

        {/* Upload Mode */}
        {pdfInputMode === "upload" && !userManualUrl && (
          <div
            onClick={() => pdfInputRef.current?.click()}
            className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
              uploadingPdf
                ? "border-amber-500/50 bg-amber-950/10 cursor-wait"
                : "border-zinc-800 hover:border-amber-500/60 hover:bg-zinc-900/70"
            }`}
          >
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handlePdfFileSelected}
              disabled={uploadingPdf}
              className="hidden"
            />

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-amber-600/20 group-hover:text-amber-400 text-zinc-400 transition">
              {uploadingPdf ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              )}
            </div>

            <p className="mt-2 text-xs font-semibold text-zinc-200">
              {uploadingPdf ? "Uploading PDF document..." : "Click to select and upload PDF User Manual"}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              PDF file &bull; Up to 25MB
            </p>
          </div>
        )}

        {/* URL Mode */}
        {pdfInputMode === "url" && (
          <div className="flex items-center gap-2">
            <input
              type="url"
              placeholder="e.g. https://example.com/datasheets/esp32s3_manual.pdf"
              value={pastedPdfUrl}
              onChange={(e) => setPastedPdfUrl(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSavePdfUrl}
              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition cursor-pointer"
            >
              Apply Link
            </button>
          </div>
        )}

        {/* Active PDF card */}
        {userManualUrl && (
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white truncate max-w-sm">
                    {userManualUrl.split("/").pop() || "User Manual / Datasheet.pdf"}
                  </span>
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                    PDF Attached
                  </span>
                </div>
                <a
                  href={userManualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-amber-400 hover:underline truncate block"
                >
                  View / Download Document &rarr;
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearPdf}
              className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 transition cursor-pointer"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
