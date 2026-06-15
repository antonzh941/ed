/**
 * В production не пишем в лог тело ошибок и контекст с ПДн/платежами.
 * Опционально: `ERROR_REPORTING_WEBHOOK_URL` — POST JSON `{ "source","event","errorName" }`
 * без стека и без тел запросов (только имя ошибки при `Error`).
 */
function fireErrorReportingWebhook(context: string, error: unknown) {
  const url = process.env.ERROR_REPORTING_WEBHOOK_URL?.trim();
  if (!url || process.env.NODE_ENV !== "production") {
    return;
  }
  const payload = {
    source: "sokrat-web",
    event: context,
    errorName: error instanceof Error ? error.name : null,
  };
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2500),
  }).catch(() => undefined);
}

/**
 * В production не пишем в лог тело ошибок и контекст с ПДн/платежами.
 */
export function logApiRouteException(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") {
    console.error(context);
    fireErrorReportingWebhook(context, error);
    return;
  }
  console.error(context, error);
}
