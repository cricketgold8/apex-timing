"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Provenance } from "@/lib/timing/types";
import { ProvenanceNote } from "./Provenance";

/** Click-to-open popover that closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  width = 320,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && (
        <div id={id} role="dialog" aria-label={label} className={`pop absolute top-[calc(100%+6px)] z-40 ${align === "right" ? "right-0" : "left-0"}`} style={{ width: `min(${width}px, calc(100vw - 24px))` }}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

/** Small "i" button that reveals where a panel's data came from, instead of a footnote under every panel. */
export function SourceInfo({ provenance, children }: { provenance: Provenance | null; children?: ReactNode }) {
  if (!provenance && !children) return null;
  return (
    <Popover
      label="Data source"
      trigger={({ open, toggle, id }) => (
        <button className="icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="About this data" title="About this data">
          <Info size={14} />
        </button>
      )}
    >
      <div className="p-3 text-[12px] leading-relaxed text-fg-2">
        {children}
        {provenance && <ProvenanceNote provenance={provenance} expanded />}
      </div>
    </Popover>
  );
}

/** Segmented control for a small set of mutually exclusive options. */
export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (v: T) => void; label: string; size?: "sm" | "md" }) {
  return (
    <div className={`segmented ${size === "sm" ? "segmented-sm" : ""}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
