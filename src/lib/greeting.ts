// ברכת פתיחה לפי שעון ישראל — משותפת לסקירה הכללית (משרד) ולדשבורד הלקוח.
export function ilGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date())
  );
  if (hour >= 5 && hour < 12) return "בוקר טוב ☀️";
  if (hour >= 12 && hour < 17) return "צהריים טובים 🌤️";
  if (hour >= 17 && hour < 22) return "ערב טוב 🌆";
  return "לילה טוב 🌙";
}
