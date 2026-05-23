import { Layout } from "@/components/Layout";
import { PersonalModule } from "@/components/PersonalModule";

export default function PersonalPage() {
  return (
    <Layout
      title="Personal"
      description="Registro de trabajadores, roles, asistencia y pagos semanales."
    >
      <PersonalModule />
    </Layout>
  );
}
