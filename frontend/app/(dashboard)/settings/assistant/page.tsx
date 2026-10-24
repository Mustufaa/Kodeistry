import { PageHeader } from "@/components/dashboard/page-header";
import { PreferenceToggle } from "@/components/settings/preference-toggle";
import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Kody assistant" description="Choose how Kody appears while you use Kodeistry." />
      <Card><CardContent className="divide-y px-6">
          <PreferenceToggle preference="showAssistant" title="Show Kody" description="Show the assistant button across the website. You can turn it back on here anytime." />
          <PreferenceToggle preference="showGreeting" title="Show greeting" description="Display Kody's greeting beside the assistant button." />
      </CardContent></Card>
      <p className="text-sm text-muted-foreground">Changes save automatically in this browser and apply to this device.</p>
    </div>
  );
}
