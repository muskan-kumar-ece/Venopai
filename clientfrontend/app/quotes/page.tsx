import { redirect } from "next/navigation";

export default function QuotesHubRedirectPage() {
  redirect("/account/quotes");
}
