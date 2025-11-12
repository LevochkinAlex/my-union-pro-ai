import { Metadata } from "next";

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
    <div className="flex min-h-screen bg-gray-50">
      {/* Left side - Auth form */}
      <div className="flex flex-1 w-full lg:w-1/2 bg-white">
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
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto mb-6 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                </svg>
              </div>
            </div>
            <h2 className="mb-4 text-4xl font-bold">MyUnion Pro</h2>
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
    </div>
  );
}

