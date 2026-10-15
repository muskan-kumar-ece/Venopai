import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://venopai.in").replace(/\/+$/, "");
  const now = new Date();

  // Core public marketing, catalog, and service routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/products`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/manufacturing`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/design`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/software`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/consultations`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/feedback`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/track`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/cancellation-refund`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/shipping-policy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/grievance`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  const productRoutes: MetadataRoute.Sitemap = [];
  const categoryRoutes: MetadataRoute.Sitemap = [];

  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";
  const cleanBase = rawBase.replace(/\/+$/, "");

  // Fetch live products for sitemap
  try {
    const productsRes = await fetch(`${cleanBase}/products?page_size=100`, {
      next: { revalidate: 3600 },
    });
    if (productsRes.ok) {
      const data = await productsRes.json();
      const items = Array.isArray(data.data) ? data.data : [];
      for (const p of items) {
        if (p.id) {
          const productRef = p.slug || p.id;
          productRoutes.push({
            url: `${siteUrl}/products/${productRef}`,
            lastModified: p.updated_at ? new Date(p.updated_at) : now,
            changeFrequency: "weekly",
            priority: 0.8,
          });
        }
      }
    }
  } catch {
    // Graceful fallback if backend is offline during build
  }

  // Fetch live categories for sitemap
  try {
    const categoriesRes = await fetch(`${cleanBase}/categories`, {
      next: { revalidate: 86400 },
    });
    if (categoriesRes.ok) {
      const data = await categoriesRes.json();
      const categories = Array.isArray(data.data) ? data.data : [];
      for (const c of categories) {
        if (c.slug) {
          categoryRoutes.push({
            url: `${siteUrl}/products/category/${c.slug}`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.7,
          });
        }
      }
    }
  } catch {
    // Graceful fallback
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
