"use client";

import { ReactNode } from "react";

type TabKey = "profile" | "additional" | "membership" | "education" | "awards";

interface ProfileTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  children: ReactNode;
}

export default function ProfileTabs({ activeTab, onTabChange, children }: ProfileTabsProps) {
  const tabs = [
    { key: "profile" as TabKey, label: "Основное", icon: "👤" },
    { key: "additional" as TabKey, label: "Дополнительно", icon: "📝" },
    { key: "membership" as TabKey, label: "Членство", icon: "🎖️" },
    { key: "education" as TabKey, label: "Образование", icon: "🎓" },
    { key: "awards" as TabKey, label: "Награды", icon: "🏆" },
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
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
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

