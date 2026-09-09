import { useI18n } from "../../lib/i18n";
import { SalaryCard } from "../../components/SalaryCard";

/**
 * Teacher's own salary card: a monthly table with analytics and, for each
 * month, the list of students whose payments make up that month's salary.
 */
export function MySalary() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("mySalary")}</h1>
      {/* No teacherId → the API resolves to the signed-in teacher; read-only. */}
      <SalaryCard />
    </div>
  );
}
