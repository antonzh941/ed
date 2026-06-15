import type { SessionPhase } from "@prisma/client";

export const MAX_HINTS = 3;

export interface SessionState {
  phase: SessionPhase;
  hintLevel: number;
}

export type HintInstruction =
  | { mode: "ask" }
  | { mode: "hint1"; text: string }
  | { mode: "hint2"; text: string }
  | { mode: "breakdown" };

export function getPhaseInstruction(phase: SessionPhase): string {
  switch (phase) {
    case "understanding":
      return "Убедись, что ученик понимает условие: что дано, что требуется найти. Задавай уточняющие вопросы.";
    case "plan":
      return "Направляй ученика к составлению плана решения. Не предлагай шаги сам — задавай вопросы о методе.";
    case "steps":
      return "Сопровождай решение пошагово. Проверяй каждый шаг ученика и помогай при ошибке.";
    case "check":
      return "Ученик дал ответ. Скажи, верно ли — но не раскрывай эталон. Если неверно — дай подсказку следующего уровня.";
    case "reflect":
      return "Задание решено. Помоги ученику осмыслить использованный метод — что он узнал, где это пригодится.";
  }
}

export function getHintInstruction(hintLevel: number): string {
  if (hintLevel <= 0) {
    return "Реагируй только на слова ученика. Не давай подсказок первым.";
  }
  if (hintLevel === 1) {
    return "Задай ОДИН наводящий вопрос, направляющий к нужному методу решения. Не указывай метод напрямую.";
  }
  if (hintLevel === 2) {
    return "Укажи конкретный метод или формулу, которую нужно применить. Не показывай вычисления.";
  }
  // hintLevel >= 3 → breakdown
  return "Режим пошагового разбора: объясни ПЕРВЫЙ шаг решения подробно. После этого ученик продолжает сам.";
}

export function isBreakdownMode(hintLevel: number): boolean {
  return hintLevel >= MAX_HINTS;
}

/** Переход фазы после корректного ответа. */
export function advancePhaseOnSuccess(phase: SessionPhase): SessionPhase {
  switch (phase) {
    case "understanding": return "plan";
    case "plan":          return "steps";
    case "steps":         return "check";
    case "check":         return "reflect";
    case "reflect":       return "reflect";
  }
}

/** Переход при неверном ответе: фаза остаётся, хинт растёт. */
export function incrementHint(hintLevel: number): number {
  return Math.min(hintLevel + 1, MAX_HINTS);
}

/** Нормализует ответ ученика для сравнения с эталоном. */
export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/,/g, ".")        // десятичная запятая → точка
    .replace(/^[=:]/, "")      // убрать «= 42» или «: 42»
    .trim();
}

/** Проверяет краткий ответ против эталона + допустимых вариантов. */
export function isAnswerCorrect(
  studentRaw: string,
  canonicalAnswer: string | null,
  acceptedAnswers: string[],
): boolean {
  if (!canonicalAnswer) return false;
  const student = normalizeAnswer(studentRaw);
  const allAccepted = [canonicalAnswer, ...acceptedAnswers].map(normalizeAnswer);
  return allAccepted.includes(student);
}
