"use client";

import { useState } from "react";
import { cn } from "@/lib/design-system";

export default function LandingPricingForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorText, setErrorText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorText("");

    try {
      const res = await fetch("/api/landing/request-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          organization: organization.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitStatus("error");
        setErrorText(data.error || "Ошибка при отправке");
        return;
      }
      setSubmitStatus("success");
      setName("");
      setEmail("");
      setPhone("");
      setOrganization("");
      setMessage("");
    } catch {
      setSubmitStatus("error");
      setErrorText("Ошибка при отправке. Попробуйте позже.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <section id="pricing" className="scroll-mt-20 py-16 md:py-24">
      <div className="container mx-auto px-4">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
          Узнать цены
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
          Оставьте заявку — мы рассчитаем стоимость под вашу организацию и свяжемся с вами.
        </p>

        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-8 landing-animate-in landing-animate-in-delay-2">
          {submitStatus === "success" ? (
            <div className="rounded-xl bg-primary/10 p-6 text-center dark:bg-primary/15">
              <p className="text-lg font-semibold text-foreground">Заявка отправлена</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Мы свяжемся с вами в ближайшее время по указанным контактам.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="pricing-name" className="mb-1 block text-sm font-medium text-foreground">
                  Имя *
                </label>
                <input
                  id="pricing-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Иван Иванов"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="pricing-email" className="mb-1 block text-sm font-medium text-foreground">
                  Email *
                </label>
                <input
                  id="pricing-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="email@example.com"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="pricing-phone" className="mb-1 block text-sm font-medium text-foreground">
                  Телефон *
                </label>
                <input
                  id="pricing-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+7 999 123-45-67"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="pricing-org" className="mb-1 block text-sm font-medium text-foreground">
                  Организация
                </label>
                <input
                  id="pricing-org"
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className={inputClass}
                  placeholder="Название организации или ППО"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="pricing-message" className="mb-1 block text-sm font-medium text-foreground">
                  Сообщение
                </label>
                <textarea
                  id="pricing-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={cn(inputClass, "resize-none")}
                  placeholder="Количество сотрудников, пожелания по срокам и т.п."
                  disabled={isSubmitting}
                />
              </div>
              {submitStatus === "error" && (
                <p className="text-sm text-destructive">{errorText}</p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "w-full rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                )}
              >
                {isSubmitting ? "Отправка…" : "Отправить заявку"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
