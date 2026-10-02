import { redirect } from "next/navigation";

export default function AdminProductsCanonicalRedirect() {
  redirect("/admin/catalog/products");
}
