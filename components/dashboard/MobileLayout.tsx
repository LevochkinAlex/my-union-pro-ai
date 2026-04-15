"use client";

import { useState } from "react";
import MobileHeader from "./MobileHeader";
import MobileMenu from "./MobileMenu";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  subItems?: { href: string; label: string }[];
}

interface ViewModeOption {
  mode: string;
  label: string;
}

interface MobileLayoutProps {
  items: NavItem[];
  userInitial: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  brandHref?: string;
  serverViewModes?: ViewModeOption[];
  serverViewMode?: string;
}

export default function MobileLayout({
  items,
  userInitial,
  avatarUrl,
  isAdmin,
  brandHref,
  serverViewModes = [],
  serverViewMode,
}: MobileLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <MobileHeader onMenuClick={() => setIsMenuOpen(true)} brandHref={brandHref} />
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        items={items}
        userInitial={userInitial}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        brandHref={brandHref}
        serverViewModes={serverViewModes}
        serverViewMode={serverViewMode}
      />
    </>
  );
}

