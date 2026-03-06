"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, XCircle } from "lucide-react";

interface GenerationResult {
  total: number;
  generated: number;
  skipped: number;
  errors: number;
  details: Array<{
    email: string;
    status: "generated" | "skipped" | "error";
    reason?: string;
    error?: string;
  }>;
}

export default function GenerateDocumentsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateForUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      setError("Please enter a user ID");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/generate-user-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to generate documents");
        setResult(data);
      } else {
        setResult(data);
        setUserId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateForAll = async () => {
    if (!confirm("This will generate documents for ALL users with complete profiles. Continue?")) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/generate-user-documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to generate documents");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Generate Documents</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Force generate membership and contribution applications for users
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Generate for Single User */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Generate for Single User
          </h2>

          <form onSubmit={handleGenerateForUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="clh123abc456..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Generating..." : "Generate Documents"}
            </button>
          </form>
        </div>

        {/* Generate for All Users */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Generate for All Users
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Generate documents for all users with complete profiles who don't already have documents.
          </p>

          <button
            onClick={handleGenerateForAll}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Processing..." : "Generate for All"}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {result.results ? "Bulk Generation Results" : "Result"}
          </h3>

          {result.results ? (
            // Bulk results
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {result.results.total}
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">Total Users</div>
                </div>
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {result.results.generated}
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-300">Generated</div>
                </div>
                <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {result.results.skipped}
                  </div>
                  <div className="text-xs text-yellow-700 dark:text-yellow-300">Skipped</div>
                </div>
                <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {result.results.errors}
                  </div>
                  <div className="text-xs text-red-700 dark:text-red-300">Errors</div>
                </div>
              </div>

              {/* Details table */}
              {result.results.details && result.results.details.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                          Email
                        </th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                          Status
                        </th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.details.map((detail: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-2 text-gray-600 dark:text-gray-400">
                            {detail.email}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                detail.status === "generated"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                  : detail.status === "skipped"
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              }`}
                            >
                              {detail.status}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-gray-600 dark:text-gray-400 text-xs">
                            {detail.reason || detail.error || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            // Single user result
            <div className="space-y-4">
              {result.success ? (
                <>
                  <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {result.message}
                      </span>
                    </p>
                  </div>

                  {result.user && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        <div>
                          <strong>User:</strong> {result.user.name} ({result.user.email})
                        </div>
                      </div>
                    </div>
                  )}

                  {result.documents && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">Generated Documents:</h4>
                      {result.documents.map((doc: any) => (
                        <div key={doc.id} className="text-sm text-gray-600 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1.5">
                            <Check className="h-4 w-4 text-green-600" />
                            {doc.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    <span className="inline-flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" />
                      {result.error}
                    </span>
                  </p>
                  {result.profile && (
                    <div className="mt-2 text-xs text-red-700 dark:text-red-300">
                      <strong>Missing fields:</strong>
                      <ul className="mt-1 list-inside list-disc">
                        {Object.entries(result.profile.fields).map(([field, filled]: any) =>
                          !filled ? <li key={field}>{field}</li> : null
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
