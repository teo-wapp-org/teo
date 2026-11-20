"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Bot, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { STATUS_DOT, STATUS_LABEL, type CaseStatus, type HandledBy } from "@/lib/casos";
import { formatDate, formatDuration, initials, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Reloj compartido (cada 30 s) para tiempos relativos. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function TimeAgo({ iso, className, mode = "ago" }: { iso: string | null | undefined; className?: string; mode?: "ago" | "duration" }) {
  const now = useNow();
  if (!iso) return null;
  const text = mode === "ago" ? timeAgo(iso, now) : formatDuration(now - new Date(iso).getTime());
  return (
    <time dateTime={iso} title={formatDate(iso, { withTime: true })} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}

export function StatusDot({ status, className }: { status: CaseStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2 text-xs font-medium", className)}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function HandledIcon({ by, className }: { by: HandledBy; className?: string }) {
  return by === "teo" ? (
    <span title="Atiende Teo" className={cn("inline-flex", className)}>
      <Bot className="size-3.5" aria-hidden />
      <span className="sr-only">Atiende Teo</span>
    </span>
  ) : (
    <span title="Atiende una persona" className={cn("inline-flex", className)}>
      <UserRound className="size-3.5" aria-hidden />
      <span className="sr-only">Atiende una persona</span>
    </span>
  );
}

export type MemberLite = { id: string; name: string; avatar_url: string | null };

export function MemberAvatar({ member, size = "sm" }: { member: MemberLite | null | undefined; size?: "sm" | "default" }) {
  if (!member) return null;
  return (
    <Avatar size={size} title={`Asignado a ${member.name}`}>
      {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
      <AvatarFallback className="bg-secondary text-[10px] font-semibold text-secondary-foreground">{initials(member.name)}</AvatarFallback>
    </Avatar>
  );
}

export function EmptyState({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto grid max-w-md place-items-center gap-3 py-12 text-center", className)}>
      <Image src="/brand/personaje.png" alt="" width={152} height={155} className="size-16 rounded-2xl" />
      <p className="font-heading text-lg font-semibold">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
