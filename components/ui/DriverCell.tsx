import Link from "next/link";

/** Team marker + bold code + full name; links to the driver profile when an id is known. */
export function DriverCell({ code, name, colour, driverId, showName = true }: { code: string; name: string; colour: string; driverId?: string | null; showName?: boolean }) {
  const body = (
    <span className="inline-flex items-center gap-2" title={name}>
      <span className="h-4 w-[3px] rounded-[1px]" style={{ background: colour }} aria-hidden />
      <span className="display w-9 text-[14px] font-bold tracking-[0.04em]">{code}</span>
      {showName && <span className="truncate text-[12.5px] text-fg-2">{name}</span>}
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

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <h2 className="display text-[24px] font-bold uppercase leading-none tracking-[0.04em]">{title}</h2>
      {children}
    </div>
  );
}
