import Link from "next/link";
import type { ReactNode } from "react";
import type { Provenance } from "@/lib/timing/types";
import { SourceInfo } from "./Popover";

/** Team marker + bold code + full name; links to the driver profile when an id is known. */
export function DriverCell({ code, name, colour, driverId, showName = true }: { code: string; name: string; colour: string; driverId?: string | null; showName?: boolean }) {
  const body = (
    <span className="inline-flex items-center gap-2.5" title={name}>
      <span className="h-5 w-[4px] rounded-full" style={{ background: colour }} aria-hidden />
      <span className="display w-10 text-[15px] font-bold tracking-[0.05em]">{code}</span>
      {showName && <span className="truncate text-[13px] text-fg-2">{name}</span>}
    </span>
  );
  return driverId ? (
    <Link href={`/drivers/${driverId}`} className="focus-ring hover:underline">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Page heading with an optional one-line subtitle, a data-source button and controls on the right. */
export function PageTitle({ title, subtitle, provenance, info, children }: { title: string; subtitle?: ReactNode; provenance?: Provenance | null; info?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="display text-[30px] font-bold leading-none tracking-[0.02em]">{title}</h2>
          {(provenance || info) && <SourceInfo provenance={provenance ?? null}>{info}</SourceInfo>}
        </div>
        {subtitle && <div className="mt-1.5 text-[13px] text-fg-2">{subtitle}</div>}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
