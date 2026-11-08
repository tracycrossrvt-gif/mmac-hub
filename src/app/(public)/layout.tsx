import { DemoBanner } from "@/components/layout/DemoBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { StatsBar } from "@/components/layout/StatsBar";
import { demoMode } from "@/lib/demoMode";

// Public site chrome (docs/DESIGN.md "Global elements"). Admin routes live
// outside this group and don't get any of it.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-site="public" className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-primary"
      >
        Skip to content
      </a>
      {demoMode && <DemoBanner />}
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <StatsBar />
      <SiteFooter />
    </div>
  );
}
