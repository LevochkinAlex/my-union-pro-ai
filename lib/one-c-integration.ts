type OneCSyncStatus = "ok" | "failed" | "skipped";

export interface SyncInvoiceToOneCInput {
  offerNumber: string;
  amountRub: number;
  period: string;
  memberLimit: number;
  tariffLabel: string;
  issuedAt: Date;
  organization: {
    id: string;
    name: string;
    inn: string | null;
  };
  payer: {
    entityType: "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "LEGAL_ENTITY";
    fullName: string | null;
    companyName: string | null;
    inn: string | null;
    kpp: string | null;
    ogrn: string | null;
    legalAddress: string | null;
    checkingAccount: string | null;
    bankName: string | null;
    bik: string | null;
    correspondentAccount: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
}

export interface OneCSyncResult {
  status: OneCSyncStatus;
  message: string;
  httpStatus?: number;
}

function buildEndpoint(): string | null {
  const directEndpoint = process.env.ONEC_INVOICE_ENDPOINT?.trim();
  if (directEndpoint) return directEndpoint;

  const baseUrl = process.env.ONEC_BASE_URL?.trim();
  if (!baseUrl) return null;

  const entitySet = (process.env.ONEC_ODATA_ENTITY_SET || "Document_СчетПокупателю").trim();
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${entitySet}`;
}

function buildAuthHeader(): string | null {
  const login = process.env.ONEC_LOGIN?.trim();
  const password = process.env.ONEC_PASSWORD?.trim();
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

function toSafeMessage(text: string, max = 180): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max)}…` : singleLine;
}

export async function syncInvoiceToOneC(input: SyncInvoiceToOneCInput): Promise<OneCSyncResult> {
  const endpoint = buildEndpoint();
  const authHeader = buildAuthHeader();

  if (!endpoint || !authHeader) {
    return {
      status: "skipped",
      message: "1C credentials or endpoint not configured",
    };
  }

  const body = {
    source: "myunion-pro",
    type: "invoice-offer",
    invoice: {
      number: input.offerNumber,
      date: input.issuedAt.toISOString(),
      amountRub: input.amountRub,
      period: input.period,
      memberLimit: input.memberLimit,
      tariffLabel: input.tariffLabel,
      currency: "RUB",
    },
    organization: input.organization,
    payer: input.payer,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        status: "failed",
        message: toSafeMessage(text || `HTTP ${response.status}`),
        httpStatus: response.status,
      };
    }

    return {
      status: "ok",
      message: "Invoice sent to 1C",
      httpStatus: response.status,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error as { name?: string; message?: string };
    if (err?.name === "AbortError") {
      return { status: "failed", message: "1C request timeout" };
    }
    return {
      status: "failed",
      message: toSafeMessage(err?.message || "Unknown 1C sync error"),
    };
  }
}
