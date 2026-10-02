import { redirect } from "next/navigation";

export default async function AccountConsultationDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/consultations/${id}`);
}
