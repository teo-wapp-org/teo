import { getPlatformConfig } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { BrandingForm } from "../forms";

export default async function AdminConfigBrandingPage() {
  const role = await requirePlatformAdmin();
  const { settings } = await getPlatformConfig();
  return <BrandingForm initial={settings.branding} canEdit={role === "superadmin"} />;
}
