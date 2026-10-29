import { PublicPage } from "@/components/marketing/public-page";
import { JsonLd } from "@/components/seo/json-ld";
import { faqs, faqPage } from "@/lib/public-content";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata(faqPage.path, faqPage.title, faqPage.description);
export default function Page() {
  return (
    <PublicPage path={faqPage.path} title={faqPage.title} summary="Quick answers about installing Kodeistry, reviewing GitHub pull requests, and understanding the limits of AI findings.">
      {faqs.map(({ question, answer }, index) => <section key={question} id={"question-" + (index + 1)} className="scroll-mt-28"><h2 className="text-xl font-semibold">{question}</h2><p className="mt-3 text-base leading-7 text-muted-foreground">{answer}</p></section>)}
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage", "@id": absoluteUrl("/faq#questions"),
        mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      }} />
    </PublicPage>
  );
}
