import Image from "next/image";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";
import GlassCard from "@/components/landing/GlassCard";
import { CONTACTS } from "@/lib/constants/landing";

export default function MarketingContactsCards() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
      {CONTACTS.map((c, i) => (
        <AnimateOnScroll key={c.email} delay={Math.min(i + 2, 5) as 2 | 3 | 4 | 5}>
          <GlassCard className="p-6">
            <div className="relative mb-4 h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-white/15 ring-offset-2 ring-offset-background/80">
              <Image
                src={c.photo}
                alt={c.name}
                width={56}
                height={56}
                className="h-full w-full object-cover"
                sizes="56px"
              />
            </div>
            <p className="font-semibold text-foreground">{c.name}</p>
            <p className="mb-4 text-sm text-muted-foreground">{c.role}</p>
            <div className="space-y-2">
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                {c.email}
              </a>
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {c.phone}
              </a>
            </div>
          </GlassCard>
        </AnimateOnScroll>
      ))}
    </div>
  );
}
