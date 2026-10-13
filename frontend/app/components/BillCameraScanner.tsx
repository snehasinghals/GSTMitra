"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check, Image as ImageIcon, AlertCircle } from "lucide-react";

interface BillCameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (capturedFiles: Array<{ name: string; type: string; data: string }>) => void;
}

export function BillCameraScanner({ isOpen, onClose, onCapture }: BillCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedImages, setCapturedImages] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [cameraError, setCameraError] = useState<string>("");
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start camera stream when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImages([]);
      setCameraError("");
      return;
    }
    startCamera(facingMode);
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const startCamera = async (mode: "environment" | "user") => {
    stopCamera();
    setIsStartingCamera(true);
    setCameraError("");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported by your browser. Please upload a photo instead.");
      setIsStartingCamera(false);
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn("Could not start environment camera, trying default camera:", err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play().catch(() => {});
        }
      } catch (fallbackErr: any) {
        console.error("Camera permission or hardware error:", fallbackErr);
        setCameraError(
          fallbackErr.name === "NotAllowedError" || fallbackErr.name === "PermissionDeniedError"
            ? "Camera permission was denied. Please allow camera access in your browser settings or choose a photo."
            : "No camera found or camera is in use by another application. You can upload a photo instead."
        );
      }
    } finally {
      setIsStartingCamera(false);
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    const newCapture = {
      name: `bill_scan_${Date.now()}_${capturedImages.length + 1}.jpg`,
      type: "image/jpeg",
      data: dataUrl,
    };

    setCapturedImages((prev) => [...prev, newCapture]);
  };

  const handleDeviceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setCapturedImages((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type || "image/jpeg",
              data: dataUrl,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleConfirm = () => {
    if (capturedImages.length === 0) return;
    stopCamera();
    onCapture(capturedImages);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 border-b border-slate-800 text-white">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-lg">Scan / Capture Bill</h3>
            {capturedImages.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                {capturedImages.length} {capturedImages.length === 1 ? "bill snapped" : "bills snapped"}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder area */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[380px] overflow-hidden">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center text-center p-8 max-w-md">
              <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
              <p className="text-slate-200 text-sm mb-4">{cameraError}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-emerald-900/30"
              >
                <ImageIcon className="w-4 h-4" />
                Select Photo from Device
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover max-h-[500px]"
              />

              {/* Viewfinder guideline overlay */}
              <div className="absolute inset-8 pointer-events-none border-2 border-emerald-400/60 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                {/* Corner reticles */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-sm" />

                <div className="absolute inset-x-0 bottom-4 text-center">
                  <span className="inline-block px-3 py-1 bg-black/60 backdrop-blur-md text-emerald-300 text-xs font-medium rounded-full">
                    Position bill receipt inside frame
                  </span>
                </div>
              </div>

              {/* Camera Switch button */}
              <button
                type="button"
                onClick={toggleCamera}
                className="absolute top-4 right-4 p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-full transition border border-white/10"
                title="Switch Camera"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Hidden file input for gallery/fallback */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleDeviceUpload}
          />
        </div>

        {/* Thumbnail strip of captured images */}
        {capturedImages.length > 0 && (
          <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center gap-3 overflow-x-auto">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
              Captured ({capturedImages.length}):
            </span>
            {capturedImages.map((img, i) => (
              <div key={i} className="relative group flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.data} alt={`Scan ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setCapturedImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-rose-600 text-white rounded-full opacity-90 hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Controls footer */}
        <div className="px-5 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-medium rounded-xl transition"
          >
            <ImageIcon className="w-4 h-4 text-slate-400" />
            Device Photo
          </button>

          {/* Shutter capture button */}
          {!cameraError && (
            <button
              type="button"
              onClick={takePhoto}
              className="relative p-1 rounded-full border-4 border-emerald-400 hover:scale-105 active:scale-95 transition"
              title="Snap Bill Photo"
            >
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg">
                <Camera className="w-6 h-6 text-slate-900" />
              </div>
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={capturedImages.length === 0}
              onClick={handleConfirm}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition ${
                capturedImages.length > 0
                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/20"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              <Check className="w-4 h-4" />
              Use {capturedImages.length > 0 ? `(${capturedImages.length})` : ""} & Extract
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
