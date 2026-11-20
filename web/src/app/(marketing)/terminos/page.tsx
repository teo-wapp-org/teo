import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Términos de servicio" };

export default function TerminosPage() {
  return (
    <LegalPage title="Términos de servicio" updated="20 de noviembre de 2026">
      <p>Al crear una cuenta en Teo aceptas estos términos. Si no estás de acuerdo, no uses el servicio.</p>
      <h2>1. El servicio</h2>
      <p>
        Teo es una plataforma que permite a comercios atender su WhatsApp con un asistente de inteligencia artificial,
        gestionar clientes por estado y responder desde un panel web.
      </p>
      <h2>2. Cuentas</h2>
      <ul>
        <li>Debes proporcionar información veraz y mantener segura tu contraseña.</li>
        <li>Eres responsable de las acciones de los usuarios que invites a tu comercio.</li>
      </ul>
      <h2>3. Uso de WhatsApp</h2>
      <ul>
        <li>Debes cumplir las políticas de WhatsApp Business y de Comercio de Meta.</li>
        <li>No puedes usar Teo para enviar spam ni vender productos o servicios prohibidos.</li>
        <li>Los mensajes iniciados por tu negocio requieren el consentimiento previo de tus clientes.</li>
      </ul>
      <h2>4. Contenido y respuestas de la IA</h2>
      <p>
        Teo responde con base en la información que cargas (productos, precios, políticas). Eres responsable de que esa
        información sea correcta. Las respuestas de la IA pueden contener errores; puedes revisarlas, tomar el control de la
        conversación o usar el modo copiloto en cualquier momento.
      </p>
      <h2>5. Datos de tus clientes</h2>
      <p>
        Eres responsable del tratamiento de los datos de tus clientes; Teo actúa como encargado y los trata solo para prestarte
        el servicio, según la Política de privacidad.
      </p>
      <h2>6. Planes y pagos</h2>
      <ul>
        <li>Los planes se cobran por mes o por año, por adelantado, en USD.</li>
        <li>Si agotas los mensajes de tu plan, Teo pasa a modo copiloto hasta que subas de plan o compres un paquete extra.</li>
        <li>Puedes cancelar en cualquier momento; el plan sigue activo hasta el fin del período pagado.</li>
      </ul>
      <h2>7. Suspensión</h2>
      <p>Podemos suspender cuentas que incumplan estos términos o las políticas de Meta, o que pongan en riesgo el servicio.</p>
      <h2>8. Responsabilidad</h2>
      <p>
        El servicio se presta “tal cual”. En la medida permitida por la ley, nuestra responsabilidad se limita al monto pagado
        por el comercio en los últimos tres meses.
      </p>
      <h2>9. Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República del Ecuador.</p>
      <h2>10. Contacto</h2>
      <p><a className="underline" href="mailto:teowapp@gmail.com">teowapp@gmail.com</a></p>
    </LegalPage>
  );
}
