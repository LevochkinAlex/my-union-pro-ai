"use client";

import { useEffect, useState } from "react";

interface Section {
  id: string;
  title: string;
}

interface Props {
  sections: Section[];
}

export default function LicenseTableOfContents({ sections }: Props) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-24 glass rounded-2xl p-4" aria-label="Оглавление">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Оглавление
      </p>
      <ul className="space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`block rounded-lg px-3 py-1.5 text-xs transition-colors ${
                activeId === s.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
