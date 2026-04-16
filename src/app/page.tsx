import Image from "next/image";
import { getDashboardData } from "@/lib/data";
import { InteractiveDashboard } from "@/components/interactive-dashboard";

// Revalidate every hour
export const revalidate = 3600;

export default async function Home() {
  const data = await getDashboardData();

  return (
    <div className="min-h-screen max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4 md:py-10">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_16px_rgba(0,0,0,0.04)] p-4 sm:p-5 md:p-7 min-w-0 overflow-hidden mb-4 md:mb-6">
        <header className="flex items-center gap-3">
          <Image src="/ethos-logo.svg" alt="Ethos" width={100} height={25} className="shrink-0 w-[72px] h-auto md:w-[100px]" />
          <div className="w-px h-5 bg-border shrink-0" />
          <span className="text-[10px] md:text-sm font-mono tracking-widest uppercase text-muted-foreground leading-none">
            Score vs Holdings
          </span>
        </header>
      </div>

      <InteractiveDashboard
        profiles={data.clientProfiles}
        fetchedAt={data.fetchedAt}
      />
    </div>
  );
}
