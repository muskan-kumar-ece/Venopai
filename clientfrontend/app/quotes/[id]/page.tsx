import { redirect } from "next/navigation";

export default async function QuoteRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  redirect(`/account/quotes/${resolvedParams.id}`);
}
