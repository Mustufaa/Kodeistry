import { privateMetadata } from "@/lib/seo";
export const metadata = privateMetadata("Settings");

import { SettingsBackLink } from "@/components/settings/settings-back-link";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl space-y-5"><SettingsBackLink />{children}</div>;
}
