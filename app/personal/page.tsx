import { Layout } from "@/components/Layout";
import { PersonalModule } from "@/components/PersonalModule";

export default function PersonalPage() {
  return (
    <Layout
      title="Personal"
      description="Registro de usuarios del sistema y asignacion de roles."
    >
      <PersonalModule />
    </Layout>
  );
}
