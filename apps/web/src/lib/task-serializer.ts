import type { CodifierTopic, Task } from "@prisma/client";

/**
 * Публичное представление задания — без полей, утекающих эталон.
 * canonicalAnswer, acceptedAnswers, solutionHint, gradingCriteria — НЕ включаются.
 */
export type PublicTask = {
  id: string;
  subjectCode: string;
  taskNumber: number;
  sourceLabel: string | null;
  conditionMd: string;
  answerType: string;
  status: string;
  topicId: string | null;
  topic: { id: string; code: string; title: string } | null;
  createdAt: string;
};

export function serializeTask(
  task: Task & { topic?: CodifierTopic | null },
): PublicTask {
  return {
    id: task.id,
    subjectCode: task.subjectCode,
    taskNumber: task.taskNumber,
    sourceLabel: task.sourceLabel,
    conditionMd: task.conditionMd,
    answerType: task.answerType,
    status: task.status,
    topicId: task.topicId,
    topic: task.topic
      ? { id: task.topic.id, code: task.topic.code, title: task.topic.title }
      : null,
    createdAt: task.createdAt.toISOString(),
  };
}
