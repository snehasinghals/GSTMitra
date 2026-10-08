"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { label: "Overview", href: "/gst-filing" },
  { label: "GSTR-1", href: "/gst-filing/gstr1" },
  { label: "GSTR-2B", href: "/gst-filing/gstr2b" },
  { label: "GSTR-3B", href: "/gst-filing/gstr3b" },
];

export function FilingSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-xs">
      <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 self-center mr-1">
        GST Filing
      </span>
      {SECTIONS.map((section) => {
        const active =
          section.href === "/gst-filing"
            ? pathname === "/gst-filing"
            : pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              active
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
