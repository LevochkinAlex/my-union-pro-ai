"use client"

import { useReveal } from "@/hooks/use-reveal"
import { useState } from "react"
import { MagneticButton } from "@/components/landing/magnetic-button"
import { Check, Calculator } from "lucide-react"
import { Slider } from "@/components/ui/slider"

// Pricing data based on the spreadsheet
const pricingTiers = [
  { users: 50, monthly: 2250, perUser: 45, annual: 21600, perUserAnnual: 36 },
  { users: 100, monthly: 4000, perUser: 40, annual: 38400, perUserAnnual: 32 },
  { users: 150, monthly: 6000, perUser: 40, annual: 57600, perUserAnnual: 32 },
  { users: 200, monthly: 7000, perUser: 35, annual: 67200, perUserAnnual: 28 },
  { users: 250, monthly: 8750, perUser: 35, annual: 84000, perUserAnnual: 28 },
  { users: 300, monthly: 10500, perUser: 35, annual: 100800, perUserAnnual: 28 },
  { users: 400, monthly: 14000, perUser: 35, annual: 134400, perUserAnnual: 28 },
  { users: 500, monthly: 17500, perUser: 35, annual: 168000, perUserAnnual: 28 },
  { users: 750, monthly: 24750, perUser: 33, annual: 237600, perUserAnnual: 26.4 },
  { users: 1000, monthly: 33000, perUser: 33, annual: 316800, perUserAnnual: 26.4 },
  { users: 1500, monthly: 49500, perUser: 33, annual: 475200, perUserAnnual: 26.4 },
  { users: 2000, monthly: 66000, perUser: 33, annual: 633600, perUserAnnual: 26.4 },
  { users: 3000, monthly: 90000, perUser: 30, annual: 864000, perUserAnnual: 24 },
  { users: 3600, monthly: 108000, perUser: 30, annual: 1036800, perUserAnnual: 24 },
]

const orgTypes = [
  { id: "primary", name: "Первичная профсоюзная организация", discount: 0 },
  { id: "regional", name: "Региональная организация", discount: 5 },
  { id: "federal", name: "Общероссийская организация", discount: 10 },
]

export function PricingSection() {
  const { ref, isVisible } = useReveal(0.3)
  const [selectedOrg, setSelectedOrg] = useState(orgTypes[0])
  const [userCount, setUserCount] = useState(100)
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly")

  // Find the closest pricing tier
  const findTier = (users: number) => {
    for (let i = pricingTiers.length - 1; i >= 0; i--) {
      if (users >= pricingTiers[i].users) {
        return pricingTiers[i]
      }
    }
    return pricingTiers[0]
  }

  const currentTier = findTier(userCount)
  const basePrice = billingPeriod === "monthly" ? currentTier.monthly : currentTier.annual
  const discount = selectedOrg.discount
  const finalPrice = Math.round(basePrice * (1 - discount / 100))
  const perUserPrice =
    billingPeriod === "monthly"
      ? currentTier.perUser * (1 - discount / 100)
      : currentTier.perUserAnnual * (1 - discount / 100)

  return (
    <section
      ref={ref}
      className="flex min-h-screen w-full shrink-0 snap-start items-center px-4 py-20 sm:px-6 md:px-12 md:py-24 lg:px-16"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div
          className={`mb-8 transition-all duration-700 md:mb-10 ${
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-12 opacity-0"
          }`}
        >
          <h2 className="mb-2 font-sans text-3xl font-light tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            Тарифы и лицензии
          </h2>
          <p className="font-mono text-xs text-foreground/60 sm:text-sm md:text-base">/ Конструктор цены</p>
        </div>

        <div className="grid gap-6 md:gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Calculator */}
          <div
            className={`space-y-6 transition-all duration-700 ${
              isVisible ? "translate-x-0 opacity-100" : "-translate-x-16 opacity-0"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            {/* Organization Type */}
            <div>
              <label className="mb-3 block font-mono text-xs text-foreground/60">Тип организации</label>
              <div className="flex flex-wrap gap-2">
                {orgTypes.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrg(org)}
                    className={`rounded-full border px-4 py-2 text-sm transition-all ${
                      selectedOrg.id === org.id
                        ? "border-foreground/40 bg-foreground/15 text-foreground"
                        : "border-foreground/10 bg-foreground/5 text-foreground/70 hover:border-foreground/20"
                    }`}
                  >
                    {org.name}
                    {org.discount > 0 && <span className="ml-2 text-xs text-green-400">-{org.discount}%</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* User Count Slider */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="font-mono text-xs text-foreground/60">Количество пользователей</label>
                <span className="font-mono text-lg text-foreground">{userCount}</span>
              </div>
              <Slider
                value={[userCount]}
                onValueChange={(value) => setUserCount(value[0])}
                min={50}
                max={3600}
                step={50}
                className="py-4"
              />
              <div className="mt-1 flex justify-between font-mono text-xs text-foreground/40">
                <span>50</span>
                <span>3600+</span>
              </div>
            </div>

            {/* Billing Period */}
            <div>
              <label className="mb-3 block font-mono text-xs text-foreground/60">Период оплаты</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm transition-all ${
                    billingPeriod === "monthly"
                      ? "border-foreground/40 bg-foreground/15 text-foreground"
                      : "border-foreground/10 bg-foreground/5 text-foreground/70 hover:border-foreground/20"
                  }`}
                >
                  Ежемесячно
                </button>
                <button
                  onClick={() => setBillingPeriod("annual")}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm transition-all ${
                    billingPeriod === "annual"
                      ? "border-foreground/40 bg-foreground/15 text-foreground"
                      : "border-foreground/10 bg-foreground/5 text-foreground/70 hover:border-foreground/20"
                  }`}
                >
                  За год
                  <span className="ml-2 text-xs text-green-400">-20%</span>
                </button>
              </div>
            </div>
          </div>

          {/* Price Display */}
          <div
            className={`flex flex-col justify-center transition-all duration-700 ${
              isVisible ? "translate-x-0 opacity-100" : "translate-x-16 opacity-0"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6 backdrop-blur-xl md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <Calculator className="h-6 w-6 text-foreground/60" />
                <span className="font-mono text-sm text-foreground/60">Расчёт стоимости</span>
              </div>

              <div className="mb-6">
                <div className="text-4xl font-light text-foreground sm:text-5xl md:text-6xl">
                  {finalPrice.toLocaleString("ru-RU")} ₽
                </div>
                <div className="mt-2 font-mono text-xs text-foreground/60 sm:text-sm">
                  {billingPeriod === "monthly" ? "в месяц" : "в год"}
                </div>
              </div>

              <div className="mb-6 space-y-2 border-t border-foreground/10 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/60">За пользователя</span>
                  <span className="text-foreground">
                    {perUserPrice.toFixed(1)} ₽/{billingPeriod === "monthly" ? "мес" : "год"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/60">Пользователей</span>
                  <span className="text-foreground">{userCount}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground/60">Скидка</span>
                    <span className="text-green-400">-{discount}%</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {[
                  "Все функции платформы",
                  "AI-ассистент без ограничений",
                  "Генерация документов",
                  "Техническая поддержка",
                  "Обновления включены",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                    <Check className="h-4 w-4 text-green-400" />
                    {feature}
                  </div>
                ))}
              </div>

              <MagneticButton
                variant="primary"
                size="lg"
                className="mt-6 w-full"
                onClick={() => window.open("mailto:hello@myunion.pro?subject=Заявка на подключение", "_blank")}
              >
                Оставить заявку
              </MagneticButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
