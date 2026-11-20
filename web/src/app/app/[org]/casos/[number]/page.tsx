import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseWorkspace } from "@/components/operacion/case-workspace";
import { requireOrg, requireUser } from "@/lib/auth";
import { getBoardCases, getCaseDetail, getMembers } from "@/lib/data/operacion";

export async function generateMetadata({ params }: PageProps<"/app/[org]/casos/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Caso #${number}` };
}

export default async function CasoPage({ params }: PageProps<"/app/[org]/casos/[number]">) {
  const { org: slug, number: raw } = await params;
  const user = await requireUser();
  const { org, impersonating } = await requireOrg(slug);
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1 || number > 2_147_483_647) notFound();

  const [data, members, open] = await Promise.all([getCaseDetail(org.id, number), getMembers(org.id), getBoardCases(org.id)]);
  if (!data) notFound();

  const queue = open
    .sort((a, b) => (b.last_message_at ?? b.status_changed_at).localeCompare(a.last_message_at ?? a.status_changed_at))
    .map(({ id, number, status, contact_name, last_message_at }) => ({ id, number, status, contact_name, last_message_at }));
  if (!queue.some((q) => q.id === data.kase.id)) {
    queue.unshift({ id: data.kase.id, number: data.kase.number, status: data.kase.status, contact_name: data.kase.contact.name ?? `#${data.kase.number}`, last_message_at: null });
  }

  return (
    <CaseWorkspace
      slug={org.slug}
      orgId={org.id}
      userId={user.id}
      data={data}
      members={members.map(({ id, name, avatar_url }) => ({ id, name, avatar_url }))}
      queue={queue}
      readOnly={impersonating}
    />
  );
}
