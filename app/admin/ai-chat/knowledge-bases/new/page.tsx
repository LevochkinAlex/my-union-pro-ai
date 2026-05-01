"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import Button from "@/components/ui/button/Button";
import InputField from "@/components/ui/InputField";
import Label from "@/components/form/Label";
import TextArea from "@/components/ui/TextArea";

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось создать базу знаний");
      }

      const data = await response.json();
      router.push(`/admin/ai-chat/knowledge-bases/${data.knowledgeBase.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/ai-chat"
          className={backNavLinkButtonClass}
        >
          ← Назад к базам знаний
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        Создать базу знаний
      </h1>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        <div>
          <Label htmlFor="name">
            Название <span className="text-red-500">*</span>
          </Label>
          <InputField
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Например: Документы профсоюза"
          />
        </div>

        <div>
          <Label htmlFor="description">Описание</Label>
          <TextArea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Краткое описание базы знаний..."
          />
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? "Создание..." : "Создать"}
          </Button>
          <Link href="/admin/ai-chat">
            <Button type="button" variant="outline">
              Отмена
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

