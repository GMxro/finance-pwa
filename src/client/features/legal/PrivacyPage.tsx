import React from 'react';
import { Page, PageHeader, Stack } from '@shared/ui/Layout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <Page>
      <PageHeader
        title="Política de Privacidad"
        actions={
          <button className="ui-header-back" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        }
      />
      <Stack gap="lg" className="ui-legal-content">
        <section>
          <h2>1. Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de tus datos personales es el titular de esta Aplicación
            ("el Responsable"). Podés contactar al Responsable a través de los canales disponibles
            en la Aplicación.
          </p>
        </section>

        <section>
          <h2>2. Datos que recopilamos</h2>
          <p>Recopilamos las siguientes categorías de datos personales:</p>
          <ul>
            <li><strong>Datos de autenticación:</strong> Tu ID de Google, nombre, correo electrónico y
              foto de perfil (proporcionados por Google a través de Better Auth). No almacenamos tu
              contraseña de Google.</li>
            <li><strong>Datos financieros:</strong> Movimientos (ingresos, gastos, transferencias),
              presupuestos, categorías, cuentas y transferencias que creés en la Aplicación.</li>
            <li><strong>Preferencias y configuración:</strong> Moneda preferida, zona horaria, estado
              de onboarding, versión de la aplicación.</li>
            <li><strong>Datos técnicos y de uso:</strong> Identificadores de sesión, marcas de tiempo
              de sincronización, versión de la aplicación, información del navegador y dispositivo
              (user agent), dirección IP (procesada por Cloudflare para seguridad y geolocalización
              aproximada).</li>
          </ul>
        </section>

        <section>
          <h2>3. Finalidad y base legal del tratamiento</h2>
          <p>Tratamos tus datos para las siguientes finalidades:</p>
          <ul>
            <li><strong>Prestación del servicio:</strong> Permitirte registrar y consultar tus
              finanzas, crear presupuestos, gestionar cuentas y transferencias, y visualizar
              estadísticas. Base legal: ejecución del contrato (términos de servicio).</li>
            <li><strong>Autenticación y seguridad:</strong> Identificarte, mantener tu sesión
              segura, prevenir fraude y abuso. Base legal: interés legítimo y obligación legal de
              seguridad.</li>
            <li><strong>Sincronización y funcionamiento offline:</strong> Guardar tus cambios
              localmente cuando estás sin conexión y sincronizarlos con el servidor cuando hay
              conexión. Base legal: ejecución del contrato.</li>
            <li><strong>Cumplimiento legal:</strong> Responder a requerimientos judiciales o
              administrativos, cumplir con obligaciones fiscales o regulatorias. Base legal:
              obligación legal.</li>
          </ul>
        </section>

        <section>
          <h2>4. Almacenamiento y ubicación de los datos</h2>
          <p>
            Los datos se almacenan en servicios de Cloudflare:
          </p>
          <ul>
            <li><strong>D1 (Base de datos SQL):</strong> Datos financieros, usuarios, preferencias,
              sesiones, estado de sincronización.</li>
            <li><strong>R2 (Almacenamiento de objetos):</strong> Diario de eliminación de cuentas
              (journal de auditoría).</li>
            <li><strong>IndexedDB (Navegador):</strong> Caché de movimientos, cola de operaciones
              offline (outbox), metadatos de sincronización. Estos datos están bajo tu control y
              pueden ser eliminados al borrar los datos del sitio en tu navegador.</li>
          </ul>
          <p>
            Cloudflare actúa como encargado del tratamiento. Los centros de datos pueden estar
            ubicados en diferentes jurisdicciones según la configuración de Cloudflare. No
            transferimos tus datos a terceros países sin las garantías adecuadas.
          </p>
        </section>

        <section>
          <h2>5. Compartición de datos</h2>
          <p>
            No vendemos, alquilamos ni compartimos tus datos financieros con terceros para fines
            comerciales. Solo compartimos datos en los siguientes casos:
          </p>
          <ul>
            <li>Con Cloudflare, como proveedor de infraestructura (encargado del tratamiento).</li>
            <li>Con Google, para la autenticación (Better Auth delega en Google OAuth).</li>
            <li>Cuando sea requerido por ley, orden judicial o solicitud de autoridad competente.</li>
            <li>En caso de fusión, adquisición o venta de activos, previa notificación y bajo
              garantías de confidencialidad.</li>
          </ul>
        </section>

        <section>
          <h2>6. Retención de datos</h2>
          <ul>
            <li><strong>Datos financieros y de cuenta:</strong> Se conservan mientras tu cuenta
              esté activa. Al eliminar la cuenta, se eliminan irreversiblemente según el proceso
              descrito en los Términos (ver sección 5).</li>
            <li><strong>Sesiones y tokens:</strong> Se eliminan al cerrar sesión o al expirar
              (configurado por Better Auth).</li>
            <li><strong>Datos de sincronización y auditoría:</strong> El journal de eliminación se
              conserva en R2 por un período razonable para auditoría y recuperación ante fallos.</li>
            <li><strong>Logs de seguridad y acceso:</strong> Se conservan según la política de
              retención de Cloudflare (generalmente 30-90 días para logs de acceso).</li>
          </ul>
        </section>

        <section>
          <h2>7. Tus derechos</h2>
          <p>Tenés los siguientes derechos sobre tus datos personales:</p>
          <ul>
            <li><strong>Acceso:</strong> Solicitar una copia de los datos que tenemos sobre vos.</li>
            <li><strong>Rectificación:</strong> Corregir datos inexactos o incompletos.</li>
            <li><strong>Supresión:</strong> Eliminar tu cuenta y todos tus datos (ver Términos,
              sección 5).</li>
            <li><strong>Limitación del tratamiento:</strong> Solicitar que restrinjamos el uso de
              tus datos en ciertos casos.</li>
            <li><strong>Portabilidad:</strong> Recibir tus datos en un formato estructurado, de uso
              común y lectura mecánica (la exportación CSV cubre gran parte de este derecho).</li>
            <li><strong>Oposición:</strong> Oponerte al tratamiento basado en interés legítimo.</li>
            <li><strong>No ser objeto de decisiones automatizadas:</strong> No tomamos decisiones
              automatizadas con efectos jurídicos significativos basadas únicamente en tratamiento
              automatizado.</li>
          </ul>
          <p>
            Para ejercer estos derechos, utilizá la funcionalidad de la Aplicación (exportar CSV,
            eliminar cuenta) o contactanos a través de los canales disponibles.
          </p>
        </section>

        <section>
          <h2>7. Cookies y almacenamiento local</h2>
          <p>
            La Aplicación utiliza:
          </p>
          <ul>
            <li><strong>Cookies de sesión (SameSite=Lax, Secure, HttpOnly):</strong> Para mantener
              tu sesión activa. Gestionadas por Better Auth.</li>
            <li><strong>IndexedDB (almacenamiento local del navegador):</strong> Para caché de
              movimientos, cola de operaciones offline y metadatos de sincronización. Estos datos
              están bajo tu control; podés eliminarlos desde la configuración de tu navegador
              ("Borrar datos del sitio").</li>
          </ul>
          <p>
            No utilizamos cookies de terceros para publicidad, seguimiento entre sitios ni análisis
            de comportamiento.
          </p>
        </section>

        <section>
          <h2>8. Seguridad</h2>
          <p>
            Implementamos medidas de seguridad técnicas y organizativas apropiadas:
          </p>
          <ul>
            <li>Comunicación exclusivamente HTTPS/TLS.</li>
            <li>Autenticación delegada a Google (OAuth 2.0 / OpenID Connect).</li>
            <li>Validación de origen (Same-Origin) en mutaciones.</li>
            <li>Límites de tasa (rate limiting) en endpoints de escritura y sincronización.</li>
            <li>Validación estricta de entrada en todos los endpoints.</li>
            <li>Headers de seguridad (CSP, HSTS, X-Frame-Options, etc.).</li>
            <li>Borrado seguro y auditable de cuentas.</li>
          </ul>
          <p>
            Ningún sistema es 100% seguro. En caso de incidente de seguridad que afecte tus datos
            personales, te notificaremos sin demora indebida según lo exige la normativa aplicable.
          </p>
        </section>

        <section>
          <h2>9. Transferencias internacionales</h2>
          <p>
            Cloudflare puede procesar datos en centros de datos fuera de Argentina. Cloudflare
            cuenta con mecanismos de transferencia internacional válidos (Cláusulas Contractuales
            Tipo de la UE, certificación Privacy Shield donde aplica). Al utilizar la Aplicación,
            aceptás que tus datos puedan ser procesados en las jurisdicciones donde Cloudflare
            opera sus servicios.
          </p>
        </section>

        <section>
          <h2>9. Cambios en esta Política</h2>
          <p>
            Podemos actualizar esta Política de Privacidad ocasionalmente. Te notificaremos sobre
            cambios significativos publicando la nueva versión en la Aplicación y actualizando la
            fecha de "Última actualización". Tu uso continuado constituye aceptación de la versión
            modificada.
          </p>
        </section>

        <section>
          <h2>10. Contacto y ejercicio de derechos</h2>
          <p>
            Para ejercer tus derechos, realizar consultas o reportar incidentes de privacidad,
            utilizá los canales disponibles en la Aplicación o contactanos directamente.
          </p>
        </section>

        <p className="ui-legal-updated">
          Última actualización: 31 de octubre de 2026
        </p>
      </Stack>
    </Page>
  );
}