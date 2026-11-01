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
          <h2>1. Responsable y contacto</h2>
          <p>
            El responsable es una persona humana titular de la Aplicación. Su nombre completo, domicilio
            válido para informar a las personas usuarias, CUIT cuando resulte exigible y correo exclusivo
            para privacidad están pendientes de confirmación y publicación. No se publica un domicilio
            particular sin autorización expresa. La ciudad y la provincia, por sí solas, no reemplazan
            los datos identificatorios y el domicilio requeridos por la normativa aplicable. Si se
            configura una relación de consumo por comercio electrónico, la Resolución 270/2020 prevé
            informar nombre, dirección física y electrónica, correo de atención y número de identificación
            tributaria. Un domicilio especial o electrónico del contrato no se presenta aquí como
            sustituto confirmado de la dirección física. Hasta completar y publicar estos datos, esta
            Política no ofrece un canal operativo para presentar solicitudes directamente al responsable.
          </p>
          <p>
            También podés presentar un reclamo ante la Agencia de Acceso a la Información Pública
            (AAIP), autoridad de aplicación de la Ley 25.326, en{' '}
            <a href="https://www.argentina.gob.ar/aaip" target="_blank" rel="noreferrer">argentina.gob.ar/aaip</a>.
          </p>
        </section>

        <section>
          <h2>2. Datos tratados</h2>
          <p>Según las funciones que usás, la Aplicación trata:</p>
          <ul>
            <li><strong>Identidad y cuenta:</strong> identificador de usuario, nombre, correo electrónico, estado de verificación, imagen de perfil e identificador de tu cuenta Google, recibidos para autenticarte. No se habilitan contraseñas propias ni se consultan otros servicios de Google. Los tokens OAuth se descartan y no se guardan en la base de la Aplicación.</li>
            <li><strong>Información financiera que ingresás:</strong> ingresos, gastos, transferencias, importes, moneda, fechas, notas, cuentas, categorías y presupuestos. Son datos personales cuando están asociados a tu cuenta.</li>
            <li><strong>Preferencias:</strong> moneda, idioma, zona horaria y estado de configuración inicial.</li>
            <li><strong>Datos técnicos:</strong> identificador de sesión, dirección IP y user-agent guardados con la sesión; identificadores y fechas de sincronización; y versión mínima de la Aplicación. El Worker registra errores con identificador de solicitud y mensaje. Cloudflare Observability está habilitado con muestreo del diez por ciento; el proyecto desactiva los registros automáticos de cada invocación y conserva los logs propios de error. Cloudflare documenta una retención de Workers Logs de tres días para Workers Free y siete días para Workers Paid; el plan efectivo de la cuenta no está verificado. Cloudflare también puede procesar datos técnicos adicionales al prestar infraestructura.</li>
            <li><strong>Constancia de aceptación:</strong> identificador del usuario, versión de estos Términos, versión de esta Política y fecha y hora UTC de la acción afirmativa. No se guarda una copia de los documentos ni una fecha de nacimiento.</li>
          </ul>
          <p>
            No solicitamos datos sensibles definidos por la Ley 25.326. Los movimientos financieros
            pueden, por su contenido, revelar información personal. No conectamos con cuentas bancarias.
          </p>
        </section>

        <section>
          <h2>3. Finalidades y fundamento</h2>
          <ul>
            <li><strong>Prestar las funciones solicitadas:</strong> crear y mantener tu cuenta, guardar tus registros, generar consultas y sincronizarlos entre dispositivos. La Ley 25.326 no exige consentimiento cuando los datos derivan de una relación contractual y son necesarios para desarrollarla o cumplirla.</li>
            <li><strong>Autenticar, proteger y operar el servicio:</strong> mantener sesiones, validar solicitudes, aplicar controles de origen y límites de uso, y diagnosticar errores, para prestar y proteger la Aplicación dentro de los límites legales.</li>
            <li><strong>Cumplir obligaciones legales:</strong> cuando una norma o requerimiento válido lo exija.</li>
          </ul>
          <p>
            Para iniciar sesión, Google envía datos de perfil y la Aplicación crea un registro de
            autenticación antes de que aceptes los Términos, a fin de identificarte y mostrarte los
            documentos vigentes. Si no aceptás, no se habilitan las funciones financieras; cerrar sesión
            no borra ese registro, aunque podés descargar el CSV disponible o solicitar el borrado desde
            la pantalla de aceptación. La base jurídica y el plazo de conservación de los datos de
            autenticación cuando una persona no acepta deben ser validados por el responsable antes de
            publicar. Una vez aceptado el contrato, los datos necesarios para prestarlo pueden tratarse
            sin consentimiento conforme al artículo 5, inciso 2, apartado d, de la Ley 25.326.
            La aceptación de estos documentos no es un consentimiento general para todos los tratamientos.
            Si un tratamiento no necesario requiere consentimiento, se solicitará de forma separada y
            podrás revocarlo cuando corresponda. No usamos datos financieros para publicidad dirigida
            ni para decisiones automatizadas con efectos jurídicos.
          </p>
        </section>

        <section>
          <h2>4. Dónde se almacenan y quién interviene</h2>
          <ul>
            <li><strong>Cloudflare Workers y D1:</strong> ejecución del servicio y almacenamiento de cuenta, sesiones, preferencias y datos financieros.</li>
            <li><strong>Cloudflare R2:</strong> marcadores de eliminación con identificadores de usuario y de movimientos, además de fechas de borrado. No incluyen importes ni notas de los movimientos.</li>
            <li><strong>Google:</strong> proveedor de inicio de sesión OAuth. Google procesa los datos necesarios para autenticarte conforme a sus propios términos y políticas.</li>
            <li><strong>Tu navegador:</strong> IndexedDB conserva copias locales de movimientos, categorías, cuentas, transferencias, presupuestos, cambios pendientes y metadatos de sincronización. localStorage guarda preferencias y algunos indicadores técnicos de continuidad y recuperación.</li>
          </ul>
          <p>
            Cloudflare y Google son proveedores. El código por sí solo no acredita sus condiciones
            contractuales, ubicaciones de tratamiento, subencargados, garantías de transferencia ni
            plazos de conservación. El responsable debe verificar esos extremos antes de publicar que
            existen garantías específicas. No se identificaron integraciones bancarias ni otros
            proveedores de tratamiento en el código revisado.
          </p>
        </section>

        <section>
          <h2>5. Transferencias internacionales</h2>
          <p>
            El uso de Google y Cloudflare puede implicar tratamiento fuera de Argentina. La Aplicación
            no permite determinar todos los destinos ni las condiciones contractuales de cada proveedor.
            Las transferencias deben cumplir el artículo 12 de la Ley 25.326, el Decreto 1558/2001 y las
            reglas vigentes de la AAIP. Antes de afirmar que existen garantías adecuadas, el responsable
            debe verificar los destinos, acuerdos y mecanismos aplicables, incluidos, cuando corresponda,
            los modelos aprobados por la AAIP. Esta verificación contractual y de configuración sigue
            pendiente.
          </p>
        </section>

        <section>
          <h2>6. Cookies y almacenamiento local</h2>
          <p>
            Better Auth mantiene la sesión mediante cookies seguras y una caché de sesión habilitada;
            las cookies entre subdominios están desactivadas. La sesión del servidor tiene una vigencia
            configurada de siete días y se actualiza durante su uso. La aplicación usa localStorage para
            algunas preferencias e indicadores técnicos, e IndexedDB para datos financieros y cambios
            offline. No se encontró código propio de cookies publicitarias o analíticas. El navegador
            puede eliminar el contenido local; los cambios todavía no sincronizados podrían perderse.
            Cerrar sesión no equivale a borrar los datos de la cuenta en el servidor.
          </p>
        </section>

        <section>
          <h2>7. Conservación y eliminación</h2>
          <p>
            Los datos de cuenta y financieros se conservan mientras la cuenta permanezca activa. Si
            iniciás sesión pero no aceptás los Términos, el registro de autenticación de Google permanece
            aunque cierres sesión; antes de salir de la pantalla de aceptación podés solicitar el borrado
            de la cuenta. Cerrar sesión por sí solo solo cierra la sesión y no elimina el perfil.
            Desde Ajustes podés solicitar la eliminación de la cuenta; la Aplicación borra de D1 los registros
            asociados, las credenciales de sesión y los datos financieros, y limpia los datos locales
            conocidos cuando el proceso se confirma. En R2 quedan marcadores de eliminación de usuario y
            de movimientos para apoyar una recuperación operativa. El código no configura expiración
            automática ni usa esos marcadores para bloquear o revertir automáticamente una restauración
            de D1. Si se restaura una copia anterior al borrado, podrían reaparecer datos eliminados;
            hace falta reconciliación manual con el registro de R2. El plazo de retención y ese
            procedimiento están pendientes de definir y verificar.
          </p>
          <p>
            D1 conserva un recibo técnico con identificador de solicitud, hashes vinculados al usuario y
            a la solicitud, fecha y estado. Durante un borrado pendiente también conserva temporalmente
            el identificador directo del usuario y los identificadores y fechas de movimientos para poder
            completar la operación por lotes. Al terminar, elimina esos datos directos del recibo. El
            recibo no tiene una expiración automática definida: permite reintentar una eliminación o
            confirmar su resultado y limpiar datos locales si el dispositivo no recibió la respuesta.
            No se determinó un plazo menor que asegure esa recuperación; el responsable debe revisar y
            minimizar periódicamente este registro.
          </p>
          <p>
            Cloudflare documenta recuperación de D1 por hasta siete días en Workers Free o treinta días
            en Workers Paid para bases que usan el almacenamiento actual; el período puede variar en
            bases anteriores. No se verificaron el plan ni el tipo de almacenamiento de la base en
            producción. Los logs y copias operativas de Cloudflare o Google tienen condiciones que deben
            confirmarse con esos proveedores. El borrado de la Aplicación no equivale a borrar los datos
            que esos proveedores deban conservar conforme a sus políticas o a la ley.
          </p>
          <p>
            La supresión no procede cuando una obligación legal o derechos de terceros exigen conservar
            un dato. Los datos deben conservarse solo el tiempo necesario para la finalidad aplicable y
            después eliminarse o anonimizarse de manera efectiva. Los cambios locales que todavía no se
            sincronizaron se conservan hasta confirmar el borrado para no perderlos accidentalmente.
          </p>
        </section>

        <section>
          <h2>8. Tus derechos y cómo ejercerlos</h2>
          <p>
            Podés solicitar acceso a todos tus datos personales y pedir su rectificación, actualización,
            supresión o confidencialidad cuando corresponda. El acceso debe responderse dentro de diez
            días corridos desde que el responsable recibe una intimación fehaciente; la rectificación,
            actualización o supresión debe realizarse dentro de cinco días hábiles desde el reclamo o
            desde que se advierte el error. El acceso es gratuito, en general, a intervalos no inferiores
            a seis meses.
          </p>
          <p>
            La descarga CSV de Ajustes incluye movimientos, categorías y presupuestos; no incluye el
            perfil, los datos de autenticación, las sesiones ni la constancia de aceptación. No sustituye
            una solicitud de acceso. La Aplicación no ofrece una herramienta para modificar el perfil:
            esa gestión requiere intervención manual del responsable. Las solicitudes de acceso,
            rectificación, actualización, supresión o revocación que requieran revisión también se
            tramitan manualmente; no hay un formulario automático.
          </p>
          <p>
            El correo exclusivo para privacidad está pendiente de que el responsable lo cree y publique.
            Hasta entonces no hay un canal de contacto publicado para tramitar solicitudes. Si no recibís
            respuesta dentro de los plazos legales o la respuesta es insuficiente, podés reclamar ante la
            AAIP o ejercer la acción de hábeas data conforme a la ley.
          </p>
        </section>

        <section>
          <h2>9. Seguridad</h2>
          <p>
            En el código revisado se observaron autenticación OAuth, sesiones, cookies seguras, validación
            del origen de solicitudes, límites de solicitudes y tamaño de cuerpo, validación de entradas,
            encabezados de seguridad y eliminación de tokens OAuth antes de guardarlos. Estas medidas no
            acreditan por sí solas cifrado en reposo, una auditoría independiente ni seguridad absoluta.
            El responsable debe verificar las medidas contractuales y operativas de los proveedores y
            definir cómo gestionar incidentes antes de hacer afirmaciones adicionales.
          </p>
        </section>

        <section>
          <h2>10. Personas menores de edad</h2>
          <p>
            El servicio está destinado exclusivamente a personas de 18 años o más. Antes del primer uso,
            la Aplicación solicita confirmar esa condición, pero no verifica automáticamente la edad ni
            puede impedir que alguien indique una edad falsa. Si el responsable recibe aviso de una cuenta
            de una persona menor de edad, deberá revisar el caso y adoptar las medidas que correspondan.
          </p>
        </section>

        <section>
          <h2>11. Cambios y registros pendientes</h2>
          <p>
            Publicaremos las modificaciones en esta página con su versión y fecha. El Decreto 1558/2001
            incluye en el registro bases privadas que exceden el uso exclusivamente personal o están
            destinadas a ceder o transferir datos; la Ley 25.326 regula su inscripción en los artículos
            21 y 24. Como esta Aplicación mantiene una base para prestar un servicio a varias personas,
            el responsable debe resolver la inscripción con la AAIP antes de publicar. No se afirma que
            exista una inscripción. La identificación del responsable,
            el domicilio apto para informar, el correo de privacidad, los acuerdos y destinos de los
            proveedores, y la retención de logs y marcadores siguen pendientes de confirmación.
          </p>
        </section>

        <p className="ui-legal-updated">Versión 2026-10-31 · Última actualización: 31 de octubre de 2026</p>
      </Stack>
    </Page>
  );
}
