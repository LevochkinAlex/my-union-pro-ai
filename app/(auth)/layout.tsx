import { Metadata } from "next";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "MyUnion — единая панель управления профсоюзом",
  description: "Управляйте документами, участниками и уведомлениями в одном месте",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Left side - Auth form */}
      <div className="flex flex-1 w-full lg:w-1/2 bg-white dark:bg-gray-800">
        {children}
      </div>

      {/* Right side - Gradient background */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}></div>
        </div>
        <div className="relative z-10 flex items-center justify-center w-full p-12">
          <div className="text-center text-white max-w-md">
            {/* Логотип MyUnion */}
            <div className="mb-8">
              <img 
                src="/Logo_dark_theme.svg" 
                alt="MyUnion Pro" 
                className="h-16 mx-auto"
              />
            </div>
            
            <p className="text-xl text-white/90 mb-8">
              Современная платформа для управления профсоюзом
            </p>
            
            <div className="space-y-4 text-left">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold">AI-помощник</div>
                  <div className="text-sm text-white/75">Автоматизация работы с документами</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold">Управление членами</div>
                  <div className="text-sm text-white/75">Полный контроль над базой участников</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold">Безопасность</div>
                  <div className="text-sm text-white/75">Защита персональных данных</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed right-16 bottom-16 z-50">
        <ThemeToggle />
      </div>
    </div>
  );
}

