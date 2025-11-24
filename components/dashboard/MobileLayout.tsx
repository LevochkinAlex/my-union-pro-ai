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

interface MobileLayoutProps {
  items: NavItem[];
  userInitial: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export default function MobileLayout({
  items,
  userInitial,
  avatarUrl,
  isAdmin,
}: MobileLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <MobileHeader onMenuClick={() => setIsMenuOpen(true)} />
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        items={items}
        userInitial={userInitial}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
      />
    </>
  );
}

