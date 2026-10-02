import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
  const cleanBase = rawBase.replace(/\/+$/, "");
  const endpoint = cleanBase.endsWith("/api/v1")
    ? `${cleanBase}/products/${id}`
    : `${cleanBase}/api/v1/products/${id}`;

  try {
    const res = await fetch(endpoint, {
      next: { revalidate: 60 },
    });

    if (res.ok) {
      const json = await res.json();
      const product = json.data;
      if (product) {
        const rawImg = product.primary_image_url || (Array.isArray(product.images) && product.images[0]);
        let previewImg = "/images/og/venopai_og_preview.jpg";
        if (rawImg && typeof rawImg === "string") {
          previewImg = rawImg;
        }

        const priceStr = product.price ? `₹${product.price}` : "";
        const title = `${product.name}${priceStr ? ` (${priceStr})` : ""}`;
        const description = product.description
          ? `${product.description.slice(0, 160)}...`
          : `Buy ${product.name} at VenopAI. 100% genuine certified components with fast pan-India express delivery.`;

        return {
          title,
          description,
          openGraph: {
            title: `${title} | VenopAI`,
            description,
            url: `/products/${id}`,
            siteName: "VenopAI",
            images: [
              {
                url: previewImg,
                width: 800,
                height: 600,
                alt: product.name,
              },
            ],
            type: "website",
          },
          twitter: {
            card: "summary_large_image",
            title: `${title} | VenopAI`,
            description,
            images: [previewImg],
          },
        };
      }
    }
  } catch (err) {
    // Fallback gracefully on network / dev mode errors
  }

  return {
    title: "Hardware Product Details",
    description: "Explore genuine electronics components and prototyping hardware with rapid delivery.",
    openGraph: {
      title: "Hardware Product Details | VenopAI",
      images: [{ url: "/images/og/venopai_og_preview.jpg", width: 1200, height: 630 }],
    },
  };
}

export default function ProductLayout({ children }: Props) {
  return <>{children}</>;
}
