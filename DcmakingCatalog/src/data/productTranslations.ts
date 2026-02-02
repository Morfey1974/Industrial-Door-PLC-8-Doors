import type { Lang } from "./translations";

type ProductTranslation = { name: string; shortDescription: string };

export const productTranslations: Record<
  Lang,
  Partial<Record<string, ProductTranslation>>
> = {
  en: {},
  ru: {
    "door-controller": {
      name: "Контроллер дверей",
      shortDescription:
        "Решение для двухдверных проходов. Поддержка распашных и раздвижных дверей с интеллектуальной блокировкой.",
    },
    "electric-bolt": {
      name: "Электрозащёлка",
      shortDescription:
        "Электромеханическая защёлка для установки в дверную коробку. Встроенный датчик состояния двери.",
    },
    "membrane-traffic-light-narrow": {
      name: "Мембранный светофор (узкий)",
      shortDescription:
        "Светодиодная панель с красным и зелёным индикаторами. Крепление на профиль дверной коробки.",
    },
    "traffic-light-narrow": {
      name: "Светофор (узкий)",
      shortDescription:
        "Светодиодная панель с красным и зелёным индикаторами. Металлический корпус, винтовое крепление.",
    },
    "traffic-light-membrane-wide": {
      name: "Светофор мембранный (широкий)",
      shortDescription:
        "Широкая светодиодная панель для настенного монтажа. Крепление на клей.",
    },
    "expansion-board-sliding": {
      name: "Плата расширения для раздвижных дверей",
      shortDescription:
        "Плата для управления раздвижными и роллетными дверями. Совместима с Dortec и Tadiran.",
    },
    "expansion-board-electromagnet": {
      name: "Плата расширения для электромагнита",
      shortDescription:
        "Плата для управления дверями с электромагнитным замком.",
    },
  },
  he: {
    "door-controller": {
      name: "בקר דלתות",
      shortDescription:
        "פתרון לשערי שני דלתות. תמיכה בדלתות נדנדה והחלקה עם לוגיקת נעילה חכמה.",
    },
    "electric-bolt": {
      name: "בריח חשמלי",
      shortDescription:
        "נעילת סולנואיד להתקנה במסגרת הדלת. כולל חיישן סטטוס דלת מובנה.",
    },
    "membrane-traffic-light-narrow": {
      name: "רמזור ממברנה (צר)",
      shortDescription:
        "לוח LED עם אורות אדום וירוק. מותאם להרכבה על פרופיל מסגרת הדלת.",
    },
    "traffic-light-narrow": {
      name: "רמזור (צר)",
      shortDescription:
        "לוח LED עם אורות אדום וירוק. מארז מתכת, התקנה בברגים.",
    },
    "traffic-light-membrane-wide": {
      name: "רמזור ממברנה (רחב)",
      shortDescription:
        "לוח LED רחב להרכבה על הקיר. התקנה בדבק.",
    },
    "expansion-board-sliding": {
      name: "לוח הרחבה לדלתות הזזה",
      shortDescription:
        "לוח לשליטה בדלתות הזזה וגלילה. תואם Dortec ו-Tadiran.",
    },
    "expansion-board-electromagnet": {
      name: "לוח הרחבה לאלקטרומגנט",
      shortDescription:
        "לוח לשליטה בדלתות עם מנעול אלקטרומגנטי.",
    },
  },
};
