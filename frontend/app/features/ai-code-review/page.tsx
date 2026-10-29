import { GuidePage } from "@/components/marketing/public-page";
import { guides } from "@/lib/public-content";
import { publicMetadata } from "@/lib/seo";

const guide = guides[0];
export const metadata = publicMetadata(guide.path, guide.title, guide.description);
export default function Page() { return <GuidePage guide={guide} />; }
