import React from 'react';
import { Page, PageHeader, Stack } from '@shared/ui/Layout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TermsPage() {
  const navigate = useNavigate();
  return (
    <Page>
      <PageHeader
        title="Términos y Condiciones"
        actions={
          <button className="ui-header-back" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        }
      />
      <Stack gap="lg" className="ui-legal-content">
        <section>
          <h2>1. Aceptación de los términos</h2>
          <p>
            Al acceder y utilizar esta aplicación de finanzas personales ("la Aplicación"), aceptás estar
            vinculado por estos Términos y Condiciones ("los Términos"), nuestra Política de Privacidad
            y cualquier otra guía o regla publicada en la Aplicación. Si no estás de acuerdo con alguna
            parte de estos Términos, no deberías utilizar la Aplicación.
          </p>
        </section>

        <section>
          <h2>2. Descripción del servicio</h2>
          <p>
            La Aplicación es una herramienta de gestión de finanzas personales que te permite registrar
            ingresos y gastos, crear presupuestos, gestionar cuentas y transferencias, y visualizar
            estadísticas de tus finanzas. El servicio se proporciona "tal cual" y "según disponibilidad".
          </p>
        </section>

        <section>
          <h2>3. Cuenta de usuario y autenticación</h2>
          <p>
            Para utilizar la Aplicación, debés iniciar sesión con tu cuenta de Google a través de
            Better Auth. Sos responsable de mantener la confidencialidad de tu cuenta y de todas las
            actividades que ocurran en ella. La Aplicación no almacena tu contraseña de Google; la
            autenticación se delega completamente a Google.
          </p>
        </section>

        <section>
          <h2>4. Datos financieros</h2>
          <p>
            Los datos que ingreses en la Aplicación (movimientos, presupuestos, categorías, cuentas,
            transferencias) son de tu propiedad. La Aplicación no comparte tus datos financieros con
            terceros, salvo que sea necesario para cumplir con obligaciones legales o por orden judicial.
          </p>
          <p>
            Los datos se almacenan en una base de datos gestionada por Cloudflare (D1 y R2) y, cuando
            trabajás sin conexión, temporalmente en el almacenamiento local de tu navegador (IndexedDB).
            La sincronización entre dispositivos ocurre automáticamente cuando hay conexión a internet.
          </p>
        </section>

        <section>
          <h2>5. Eliminación de cuenta y datos</h2>
          <p>
            Podés solicitar la eliminación completa de tu cuenta y todos tus datos asociados desde la
            sección de Ajustes. Este proceso es irreversible: se elimina tu usuario, todos tus
            movimientos, presupuestos, categorías, cuentas, transferencias, preferencias y sesiones.
            Una vez completado, no es posible recuperar la información.
          </p>
        </section>

        <section>
          <h2>6. Funcionamiento offline y sincronización</h2>
          <p>
            La Aplicación permite registrar movimientos sin conexión a internet. Esos cambios se guardan
            localmente y se sincronizan automáticamente cuando se restablece la conexión. Durante la
            sincronización, los datos del servidor tienen prioridad; los cambios locales pendientes se
            envían y se resuelven los conflictos según la versión más reciente de cada registro.
          </p>
          <p>
            Si borrás los datos del sitio en tu navegador antes de sincronizar, los cambios offline
            pendientes se perderán irreversiblemente.
          </p>
        </section>

        <section>
          <h2>6. Limitación de responsabilidad</h2>
          <p>
            La Aplicación se proporciona "tal cual" y "según disponibilidad", sin garantías de ningún
            tipo, ya sean expresas o implícitas. No garantizamos que la Aplicación sea ininterrumpida,
            oportuna, segura o libre de errores. En la máxima medida permitida por la ley, no seremos
            responsables por daños directos, indirectos, incidentales, especiales, consecuentes o
            punitivos que resulten del uso o la imposibilidad de usar la Aplicación.
          </p>
        </section>

        <section>
          <h2>7. Cambios en los Términos</h2>
          <p>
            Podemos actualizar estos Términos ocasionalmente. Te notificaremos sobre cambios
            significativos publicando los nuevos Términos en la Aplicación y actualizando la fecha de
            "Última actualización". Tu uso continuado de la Aplicación después de la publicación
            constituye aceptación de los Términos modificados.
          </p>
        </section>

        <section>
          <h2>8. Ley aplicable y jurisdicción</h2>
          <p>
            Estos Términos se rigen por las leyes de la República Argentina. Cualquier disputa
            relacionada con estos Términos se someterá a la jurisdicción exclusiva de los tribunales
            ordinarios de la Ciudad Autónoma de Buenos Aires, República Argentina.
          </p>
        </section>

        <section>
          <h2>9. Contacto</h2>
          <p>
            Si tenés preguntas sobre estos Términos, podés contactarnos a través de los canales
            disponibles en la Aplicación.
          </p>
        </section>

        <p className="ui-legal-updated">
          Última actualización: 31 de octubre de 2026
        </p>
      </Stack>
    </Page>
  );
}