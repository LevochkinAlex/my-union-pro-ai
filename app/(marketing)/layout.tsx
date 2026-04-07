import MarketingNavbar from "@/components/landing/MarketingNavbar";
import MarketingFooter from "@/components/landing/MarketingFooter";
import LandingFloatingBot from "@/components/landing/LandingFloatingBot";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground font-marketing">
      <MarketingNavbar />
      <main>{children}</main>
      <MarketingFooter />
      <LandingFloatingBot />
    </div>
  );
}
