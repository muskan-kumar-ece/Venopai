import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Catalog",
  description:
    "Search components, development boards, and hardware modules in the VenopAI engineering catalog.",
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: "/search",
  },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
