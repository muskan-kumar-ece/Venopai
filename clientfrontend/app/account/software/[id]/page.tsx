import { redirect } from "next/navigation";

export default async function AccountSoftwareDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/software/requests/${id}`);
}
