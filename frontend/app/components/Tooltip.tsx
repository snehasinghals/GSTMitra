"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface TooltipProps {
  term: string;
  text: string;
  example?: string;
  children?: React.ReactNode;
}

export function Tooltip({ term, text, example, children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Close the popup when tapping/clicking outside (important on mobile)
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [isOpen]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* The difficult word itself is the trigger - no (?) icon */}
      <span
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen((o) => !o);
          }
          if (e.key === "Escape") setIsOpen(false);
        }}
        aria-label={`Meaning of ${term}`}
        className="cursor-help font-medium text-blue-800 bg-blue-50 px-1 rounded border-b border-dashed border-blue-500 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {children ?? term}
      </span>

      {isOpen && (
        // pb-2 (not margin) keeps the hover area connected, so the button stays clickable
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50 block w-72">
          <span className="block p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl animate-fadeIn text-left">
            <span className="block font-bold mb-1 text-blue-300">{term}</span>
            <span className="block text-gray-200 leading-relaxed">{text}</span>

            {example && (
              <span className="block mt-2 pt-1 border-t border-gray-700 text-gray-300 italic">
                <span className="font-semibold text-yellow-300 not-italic">Example:</span> {example}
              </span>
            )}

            <Link
              href="/glossary"
              className="mt-2.5 flex items-center justify-center gap-1 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 rounded-md transition-colors"
            >
              Open GST Dictionary →
            </Link>
          </span>
        </span>
      )}
    </span>
  );
}