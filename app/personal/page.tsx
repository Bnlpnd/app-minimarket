// Pagina de Personal. Renderiza el modulo de gestion de trabajadores.
// (force-dynamic porque el modulo usa estado de sesion en cliente.)
import { Layout } from "@/components/Layout";
import { PersonalModule } from "@/components/PersonalModule";

export const dynamic = "force-dynamic";

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
