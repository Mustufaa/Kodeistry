import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SecuritySettingsPage() {
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold tracking-tight">Security</h1><p className="text-sm text-muted-foreground">Password and session controls supported by the backend.</p></div><Card><CardHeader><CardTitle>Password</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Password changes are handled through the reset-password flow.</p><Button asChild><Link href="/forgot-password">Send reset email</Link></Button></CardContent></Card><Card><CardHeader><CardTitle>Sessions</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">The backend currently exposes bearer-token authentication but no session management endpoint.</CardContent></Card></div>;
}
