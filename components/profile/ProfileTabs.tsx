"use client";

import { ReactNode } from "react";
import { User, FileText, Medal, GraduationCap, Trophy } from "lucide-react";

type TabKey = "profile" | "additional" | "membership" | "education" | "awards";

interface ProfileTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  children: ReactNode;
}

const TAB_ICONS: Record<TabKey, ReactNode> = {
  profile: <User className="h-4 w-4" />,
  additional: <FileText className="h-4 w-4" />,
  membership: <Medal className="h-4 w-4" />,
  education: <GraduationCap className="h-4 w-4" />,
  awards: <Trophy className="h-4 w-4" />,
};

export default function ProfileTabs({ activeTab, onTabChange, children }: ProfileTabsProps) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "profile", label: "Основное" },
    { key: "additional", label: "Дополнительно" },
    { key: "membership", label: "Членство" },
    { key: "education", label: "Образование" },
    { key: "awards", label: "Награды" },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`
                inline-flex items-center whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              <span className="mr-2 inline-flex shrink-0">{TAB_ICONS[tab.key]}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>{children}</div>
    </div>
  );
}

