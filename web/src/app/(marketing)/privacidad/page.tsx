import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="20 de noviembre de 2026">
      <p>
        En Teo (en adelante, “Teo”, “nosotros”) protegemos los datos personales conforme a la Ley Orgánica de Protección de
        Datos Personales del Ecuador (LOPDP) y su reglamento. Esta política explica qué datos tratamos, para qué y cuáles son
        tus derechos.
      </p>
      <h2>1. Roles en el tratamiento</h2>
      <ul>
        <li><strong>Usuarios del panel</strong> (dueños y equipos de los comercios): Teo es <strong>responsable</strong> del tratamiento de sus datos de cuenta.</li>
        <li><strong>Clientes finales</strong> que escriben por WhatsApp a un comercio: el comercio es el <strong>responsable</strong> y Teo actúa como <strong>encargado</strong>, tratando los datos solo por cuenta e instrucción del comercio.</li>
      </ul>
      <h2>2. Datos que tratamos</h2>
      <ul>
        <li>Datos de cuenta: nombre, correo electrónico, contraseña cifrada y datos del comercio.</li>
        <li>Datos de conversaciones de WhatsApp: número de teléfono, nombre de perfil, mensajes, archivos (por ejemplo, comprobantes de pago) y datos de pedidos.</li>
        <li>Datos técnicos: registros de uso, dirección IP y dispositivo, para seguridad y mejora del servicio.</li>
      </ul>
      <h2>3. Finalidades</h2>
      <ul>
        <li>Prestar el servicio: atender conversaciones, gestionar pedidos y mostrar la información en el panel del comercio.</li>
        <li>Generar respuestas con inteligencia artificial a partir de la información que el comercio carga.</li>
        <li>Seguridad, prevención de fraude, soporte y cumplimiento legal.</li>
        <li>Facturación del servicio a los comercios.</li>
      </ul>
      <h2>4. Proveedores (encargados y subencargados)</h2>
      <p>
        Usamos proveedores que tratan datos por nuestra cuenta con garantías adecuadas: Meta (WhatsApp Business Platform),
        Supabase (base de datos y almacenamiento), Vercel (alojamiento web), Anthropic (modelos de IA) y Google (datos de
        Google Maps cuando el comercio los importa). Algunos están fuera del Ecuador; las transferencias se realizan conforme a
        la LOPDP.
      </p>
      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos mientras la cuenta del comercio esté activa y por los plazos legales aplicables. El comercio puede
        configurar la retención de conversaciones y solicitar su eliminación.
      </p>
      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, actualización, eliminación, oposición, portabilidad y suspensión
        escribiendo a <a className="underline" href="mailto:teowapp@gmail.com">teowapp@gmail.com</a>. Si eres cliente de un
        comercio, también puedes dirigirte directamente a él. Puedes presentar reclamos ante la Superintendencia de Protección de
        Datos Personales.
      </p>
      <h2>7. Seguridad</h2>
      <p>
        Aplicamos cifrado en tránsito, aislamiento de datos entre comercios, control de acceso por roles y registro de auditoría.
      </p>
      <h2>8. Cambios</h2>
      <p>Publicaremos cualquier cambio en esta página e informaremos a los comercios por correo cuando sea relevante.</p>
    </LegalPage>
  );
}
