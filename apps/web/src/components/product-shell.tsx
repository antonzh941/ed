"use client";

import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { LearningWorkspace } from "@/components/learning/learning-workspace";
import { useLearningAppController } from "@/components/learning/use-learning-app-controller";

export function ProductShell() {
  const controller = useLearningAppController();

  return (
    <main>
      {controller.activeView === "dashboard" ? (
        <StudentDashboard controller={controller} />
      ) : (
        <LearningWorkspace controller={controller} />
      )}
    </main>
  );
}
