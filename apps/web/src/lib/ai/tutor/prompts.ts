import fs from "node:fs";
import path from "node:path";

import type { SessionPhase } from "@prisma/client";

import type { GatewayMessage } from "@/lib/ai/gateway";
import { getPhaseInstruction, getHintInstruction, MAX_HINTS } from "./state-machine";

// Читаем шаблон один раз при старте модуля
function loadTemplate(name: string): string {
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  return fs.readFileSync(file, "utf-8");
}

let _tutorTemplate: string | null = null;

function getTutorTemplate(): string {
  if (!_tutorTemplate) _tutorTemplate = loadTemplate("tutor-system");
  return _tutorTemplate;
}

export interface TutorPromptParams {
  taskCondition: string;
  canonicalAnswer: string | null;
  phase: SessionPhase;
  hintLevel: number;
  history: Array<{ role: "student" | "assistant"; text: string }>;
  studentMessage: string;
}

export function buildTutorMessages(params: TutorPromptParams): GatewayMessage[] {
  const {
    taskCondition,
    canonicalAnswer,
    phase,
    hintLevel,
    history,
    studentMessage,
  } = params;

  const systemPrompt = getTutorTemplate()
    .replace("{{TASK_CONDITION}}", taskCondition)
    .replace("{{CANONICAL_ANSWER}}", canonicalAnswer ?? "не задан")
    .replace("{{PHASE}}", phase)
    .replace("{{PHASE_INSTRUCTION}}", getPhaseInstruction(phase))
    .replace("{{HINT_LEVEL}}", String(hintLevel))
    .replace("{{HINT_INSTRUCTION}}", getHintInstruction(hintLevel))
    .replace("{{MAX_HINTS}}", String(MAX_HINTS));

  const messages: GatewayMessage[] = [
    { role: "system", content: systemPrompt },
    // История диалога
    ...history.map((m): GatewayMessage => ({
      role: m.role === "student" ? "user" : "assistant",
      content: m.text,
    })),
    // Текущее сообщение ученика
    { role: "user", content: studentMessage },
  ];

  return messages;
}
