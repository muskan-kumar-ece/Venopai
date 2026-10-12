import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";
  const cleanBase = rawBase.replace(/\/+$/, "");

  let categoryName = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  try {
    const res = await fetch(`${cleanBase}/categories/${slug}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      if (json.data?.name) {
        categoryName = json.data.name;
      }
    }
  } catch {
    // Fallback gracefully
  }

  const title = `${categoryName} Components & Hardware`;
  const description = `Shop verified ${categoryName} electronics components, modules, and hardware kits with fast express delivery in India.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/products/category/${slug}`,
    },
    openGraph: {
      title: `${title} | VenopAI`,
      description,
      url: `/products/category/${slug}`,
      siteName: "VenopAI",
      images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | VenopAI`,
      description,
      images: ["/images/og/venopai_og_preview.jpg"],
    },
  };
}

export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
