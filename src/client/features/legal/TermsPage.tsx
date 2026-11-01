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
          <h2>1. Aceptación y alcance</h2>
          <p>
            Estos Términos regulan el uso de la aplicación de finanzas personales (la “Aplicación”).
            Iniciar sesión con Google no implica aceptarlos. Después de iniciar sesión, antes de usar
            las funciones de la Aplicación, vas a poder leer estos Términos y la Política de Privacidad
            y confirmar tu decisión mediante casillas separadas. Si no aceptás, podés salir sin usar
            el servicio. La Aplicación registra tu identificador, la versión de ambos documentos y la
            fecha y hora UTC de esa acción. La constancia de lectura de la Política no es un
            consentimiento general para tratar datos personales.
          </p>
        </section>

        <section>
          <h2>2. Personas usuarias</h2>
          <p>
            El servicio está destinado exclusivamente a personas de 18 años o más. Al continuar,
            confirmás que cumplís esa condición. La Aplicación no verifica automáticamente la edad.
            Si no tenés 18 años, no podés usar el servicio.
          </p>
        </section>

        <section>
          <h2>3. Servicio</h2>
          <p>
            La Aplicación permite registrar y consultar movimientos, cuentas, transferencias y
            presupuestos, y ver estadísticas personales. No accede a tus cuentas bancarias ni ejecuta
            pagos o transferencias bancarias. Sus resultados dependen de la información que ingreses;
            no constituyen asesoramiento financiero, contable ni impositivo.
          </p>
        </section>

        <section>
          <h2>4. Cuenta e inicio de sesión</h2>
          <p>
            El acceso se realiza con Google mediante Better Auth. No se habilita el acceso con
            contraseña propia de la Aplicación. Recibimos identificadores y datos de perfil que Google
            provee para autenticarte; no usamos la Aplicación para consultar otros servicios de Google.
            Iniciar sesión puede crear un registro de autenticación antes de que aceptes estos Términos,
            pero no habilita las funciones financieras. Si salís sin aceptar, podés descargar el CSV
            disponible o borrar la cuenta desde esa pantalla. Cerrar sesión, por sí solo, no borra el
            perfil de Google asociado ni la cuenta guardada. Sos responsable de usar tu cuenta y de
            avisarnos si detectás un uso no autorizado.
          </p>
        </section>

        <section>
          <h2>5. Tus datos y uso fuera de línea</h2>
          <p>
            Conservás tus derechos sobre la información que cargás. La Aplicación la trata para ofrecer
            sus funciones y sincronizarla entre dispositivos. Para operar, ciertos datos se procesan en
            Google y Cloudflare, conforme a la Política de Privacidad. No se venden ni se usan para
            publicidad según la implementación actual.
          </p>
          <p>
            Cuando no hay conexión, los movimientos y metadatos necesarios pueden quedar en IndexedDB
            del navegador y se sincronizan al recuperar la conexión. Los cambios todavía no sincronizados
            pueden perderse si borrás los datos del sitio o el almacenamiento del navegador los elimina.
            Revisá el estado de sincronización antes de cerrar sesión o borrar esos datos.
          </p>
        </section>

        <section>
          <h2>6. Exportación, solicitudes y eliminación</h2>
          <p>
            Desde Ajustes podés descargar en CSV movimientos, categorías y presupuestos. La exportación
            no incluye todos los datos de cuenta ni reemplaza una solicitud de acceso prevista por la ley.
            También podés iniciar la eliminación de la cuenta desde Ajustes. El proceso borra de D1 la
            cuenta y los datos asociados de la Aplicación y, al confirmar el borrado, elimina los datos
            locales conocidos en ese dispositivo. Se conservan registros técnicos mínimos de la
            eliminación descritos en la Política. Para solicitar acceso, rectificación o actualización
            de información de perfil, contactá al responsable por el canal indicado en la Política.
          </p>
        </section>

        <section>
          <h2>7. Disponibilidad y responsabilidad</h2>
          <p>
            Procuramos que la Aplicación esté disponible, pero puede interrumpirse o presentar errores.
            No garantizamos disponibilidad continua ni que el almacenamiento local sea permanente.
            Nada de estos Términos limita derechos irrenunciables que te correspondan, incluida la
            protección aplicable a las relaciones de consumo. En particular, no se excluyen las
            responsabilidades que la ley no permita excluir.
          </p>
        </section>

        <section>
          <h2>8. Cambios y nueva aceptación</h2>
          <p>
            Publicaremos aquí las versiones actualizadas con su fecha y número de versión. Cuando el
            servicio detecte una versión cuya aceptación sea obligatoria, no podrás usar las funciones
            conectadas hasta leerla y aceptar expresamente la nueva versión. Para comprobar cambios y
            registrar una aceptación se necesita conexión; los datos pendientes del dispositivo no se
            sincronizan hasta que el servidor confirme la versión vigente. El uso posterior o el inicio
            de sesión, por sí solos, no constituyen esa aceptación.
          </p>
        </section>

        <section>
          <h2>9. Ley y consultas</h2>
          <p>
            Se aplican las leyes de la República Argentina, sin perjuicio de las normas imperativas que
            protejan a usuarios y consumidores. No se establece una renuncia a la jurisdicción que la
            legislación aplicable reconozca. Para consultas, usá los canales de contacto indicados en
            la Política de Privacidad.
          </p>
        </section>

        <p className="ui-legal-updated">Versión 2026-10-31 · Última actualización: 31 de octubre de 2026</p>
      </Stack>
    </Page>
  );
}
