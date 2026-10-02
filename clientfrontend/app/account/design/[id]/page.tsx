import { redirect } from "next/navigation";

export default async function AccountDesignDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/design/requests/${id}`);
}
