import type { AnswerType } from "@prisma/client";
import { gatewayGenerate } from "@/lib/ai/gateway";
import { startTrace } from "@/lib/ai/gateway/tracing";

// ─── Jailbreak detection ──────────────────────────────────────────────────────

const JAILBREAK_PATTERNS: RegExp[] = [
  /игнорируй\s+(предыдущ|все|свои|все\s+предыдущ)\s*(инструкц|правил|указани)/i,
  /притворяйся|притворись|сделай\s+вид/i,
  /ты\s+(теперь|сейчас)\s+не\s+(ии|бот|ограничен|ассистент)/i,
  /скажи\s+(мне\s+)?ответ/i,
  /дай\s+(прямой|готовый|полный|весь)\s+ответ/i,
  /forget\s+(your\s+)?(previous\s+)?instructions/i,
  /ignore\s+(all\s+)?instructions/i,
  /act\s+as\s+(if|though)/i,
  /без\s+(ограничений|инструкций|правил|цензуры)/i,
  /обойди\s+(систему|ограничения|правила)/i,
  /system\s+prompt/i,
  /jailbreak/i,
  /ты\s+свободен\s+от\s+правил/i,
  /новые\s+инструкции\s*:/i,
];

export function detectJailbreak(studentMessage: string): boolean {
  return JAILBREAK_PATTERNS.some((p) => p.test(studentMessage));
}

// ─── Answer leakage detection ─────────────────────────────────────────────────

/**
 * Регулярное выражение: проверяет, содержит ли ответ тьютора эталон
 * в "раскрывающем" контексте (declarative sentence, not a question).
 */
function leaksShortAnswerByRegex(responseText: string, canonicalAnswer: string): boolean {
  const escaped = canonicalAnswer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Ищем эталон как отдельный токен
  const matchPattern = new RegExp(`(?<![\\wа-яё])${escaped}(?![\\wа-яё])`, "i");
  if (!matchPattern.test(responseText)) return false;

  // Разбиваем на предложения, ищем то, что содержит ответ
  const sentences = responseText.split(/[.!;]\s*/);
  for (const sentence of sentences) {
    if (!matchPattern.test(sentence)) continue;
    // Если предложение — вопрос, это не раскрытие
    if (sentence.includes("?")) continue;
    // Если содержит глаголы раскрытия — скорее всего утечка
    if (/\b(ответ|равно|равен|получается|итого|результат|это)\b/i.test(sentence)) {
      return true;
    }
    // Стоит рядом со знаком «=»
    if (/=\s*/.test(sentence) && matchPattern.test(sentence)) {
      return true;
    }
  }
  return false;
}

/**
 * Дешёвая LLM-проверка для развёрнутых ответов.
 * Возвращает true если тьютор фактически раскрыл полное решение.
 */
async function leaksExtendedAnswerByLlm(
  responseText: string,
  canonicalAnswer: string,
  sessionId?: string,
): Promise<boolean> {
  const trace = await startTrace({
    role: "tutor",
    model: "deepseek-chat",
    provider: "primary",
    sessionId,
    subject: "filter",
  });

  try {
    const result = await gatewayGenerate({
      role: "tutor",
      sessionId,
      messages: [
        {
          role: "system",
          content: "Ты — проверяющий. Отвечай только «ДА» или «НЕТ», без пояснений.",
        },
        {
          role: "user",
          content: [
            `Эталонный ответ задания: «${canonicalAnswer}»`,
            `Реплика тьютора:\n«${responseText.slice(0, 1000)}»`,
            "Раскрывает ли тьютор полный ответ на задание — прямо или косвенно? ДА / НЕТ",
          ].join("\n\n"),
        },
      ],
    });
    trace.setUsage(result.usage.promptTokens, result.usage.completionTokens);
    await trace.flush();
    return /^да/i.test(result.text.trim());
  } catch (err) {
    trace.setError(err);
    await trace.flush();
    return false; // при ошибке фильтра — не блокируем
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FilterResult {
  safe: boolean;
  /** Замена, которую нужно отправить вместо оригинала. */
  safeReplacement: string;
}

const LEAKAGE_FALLBACK =
  "Давай попробуем иначе. Что ты знаешь о методе решения этого типа задач?";

export async function filterTutorResponse(params: {
  responseText: string;
  canonicalAnswer: string | null;
  answerType: AnswerType;
  sessionId?: string;
}): Promise<FilterResult> {
  const { responseText, canonicalAnswer, answerType, sessionId } = params;

  if (!canonicalAnswer) return { safe: true, safeReplacement: responseText };

  let leaks = false;

  if (answerType === "short") {
    leaks = leaksShortAnswerByRegex(responseText, canonicalAnswer);
  } else {
    // Для развёрнутых — только если ответ достаточно длинный
    if (responseText.length > 100) {
      leaks = await leaksExtendedAnswerByLlm(responseText, canonicalAnswer, sessionId);
    }
  }

  if (leaks) {
    return { safe: false, safeReplacement: LEAKAGE_FALLBACK };
  }

  return { safe: true, safeReplacement: responseText };
}
