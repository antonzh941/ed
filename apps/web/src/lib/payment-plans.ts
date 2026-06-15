export type CycleTariffId = "test-drive" | "trial" | "single-subject" | "may-marathon";

export type CycleTariff = {
  id: CycleTariffId;
  title: string;
  amountRub: number;
  cyclesCount: number;
  description: string;
};

export const cycleTariffs: CycleTariff[] = [
  {
    id: "test-drive",
    title: "Тест-драйв",
    amountRub: 0,
    cyclesCount: 10,
    description: "Попробуй метод Сократа в деле. 10 советов для полноценного разбора одной задачи.",
  },
  {
    id: "trial",
    title: "На пробу",
    amountRub: 259,
    cyclesCount: 40,
    description: "Короткий пакет, чтобы проверить формат генерации и диалога.",
  },
  {
    id: "single-subject",
    title: "Один предмет",
    amountRub: 767,
    cyclesCount: 150,
    description: "Рабочий запас для регулярной подготовки по одному предмету.",
  },
  {
    id: "may-marathon",
    title: "Майский марафон",
    amountRub: 1287,
    cyclesCount: 300,
    description: "Максимальный пакет для интенсивной подготовки перед экзаменом.",
  },
];

export function findCycleTariff(input: {
  tariffId?: string;
  amountRub?: number;
  cyclesCount?: number;
}) {
  if (input.tariffId) {
    return cycleTariffs.find((tariff) => tariff.id === input.tariffId) ?? null;
  }

  return (
    cycleTariffs.find(
      (tariff) =>
        tariff.amountRub === input.amountRub && tariff.cyclesCount === input.cyclesCount,
    ) ?? null
  );
}
