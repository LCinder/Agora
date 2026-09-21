import { BRAND, COMPANY } from '@agora/core';
import type { Metadata } from 'next';

import { Article, LegalPage, Rows } from '../../../components/legal';

export const metadata: Metadata = {
  title: `Privacidad · ${BRAND.name}`,
  description: 'Qué datos trata la aplicación del municipio, para qué y durante cuánto tiempo.',
};

/**
 * The privacy policy.
 *
 * Written from what the system actually does rather than from a template: every
 * paragraph here matches a decision in docs/decisiones.md, and where the product
 * chose not to collect something, that is what the page says. The point of the
 * architecture was to have little to declare (D-029); this is where that pays.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad">
      <p>
        {BRAND.name} es una aplicación que muestra la agenda de eventos de un municipio. Está hecha
        para pedir lo menos posible: un vecino la usa <strong>sin registrarse</strong>, sin dar su
        nombre, su correo ni su teléfono, y sin que en ningún momento se guarde dónde está.
      </p>

      <Article title="1. Quién trata tus datos">
        <p>
          El <strong>ayuntamiento</strong> que ha contratado la aplicación es el responsable del
          tratamiento: es quien decide qué se publica y para qué. {COMPANY.legalName} (NIF{' '}
          {COMPANY.taxId}, {COMPANY.address}) es el <strong>encargado del tratamiento</strong>: pone
          la tecnología y trata los datos siguiendo sus instrucciones, con un contrato de encargo
          firmado como exige el artículo 28 del Reglamento General de Protección de Datos.
        </p>
        <p>
          Para cualquier cuestión sobre esta política: {COMPANY.email}. Si tu consulta es sobre lo
          que publica tu ayuntamiento, la dirección de su delegado de protección de datos está en su
          propia sede electrónica.
        </p>
      </Article>

      <Article title="2. Qué se trata, y para qué">
        <Rows
          rows={[
            {
              term: 'Identificador del dispositivo',
              description:
                'Un número aleatorio que genera la propia aplicación la primera vez que guardas algo. No es el número de teléfono, ni el IMEI, ni el identificador de publicidad del móvil, y no se comparte con nadie. Sirve para que tus eventos marcados sigan ahí la próxima vez que abras la aplicación.',
            },
            {
              term: 'Plataforma e idioma',
              description:
                'Si el dispositivo es Android, iPhone o navegador, y en qué idioma está. Lo primero, para enviar la notificación por el camino correcto; lo segundo, para escribírtela en tu idioma.',
            },
            {
              term: 'Municipios que sigues',
              description:
                'Para enseñarte su agenda al abrir, y para que el ayuntamiento sepa cuántos vecinos usan la aplicación. Es una cuenta: cuántos, nunca quiénes.',
            },
            {
              term: '«Me interesa»',
              description:
                'Los eventos que marcas, para recordártelos y para avisarte si cambian de hora o se cancelan. El ayuntamiento ve cuántas personas marcaron cada evento, nunca la lista.',
            },
            {
              term: 'Testigo de notificaciones',
              description:
                'Solo si aceptas recibirlas. Es la dirección a la que el sistema envía el aviso; se borra en cuanto las desactivas. Recibirás recordatorios y cambios de lo que hayas marcado y, alguna vez, un evento que el ayuntamiento destaque para todo el municipio. Nunca más de tres al día, y de esos tres el último está reservado para el recordatorio que tú has pedido.',
            },
            {
              term: 'Ubicación',
              description:
                'La tuya no se recoge nunca. La aplicación puede pedirte permiso de ubicación una sola vez, para sugerirte tu municipio al empezar: esa coordenada se resuelve en tu propio móvil y no se envía ni se guarda en ningún sitio. La única ubicación que trata este sistema es la del voluntario que lleva el móvil en una procesión o una cabalgata, mientras está emitiendo, con su consentimiento explícito y nunca en segundo plano.',
            },
            {
              term: 'Personal del ayuntamiento y de las asociaciones',
              description:
                'Quien entra en el panel tiene una cuenta con su correo, su nombre y su papel en el municipio, porque hace falta saber quién publica y quién aprueba. Queda registrado qué se creó, se aprobó o se canceló, y por quién.',
            },
          ]}
        />
        <p>
          La base legal del tratamiento es el{' '}
          <strong>cumplimiento de una misión de interés público</strong> por parte del ayuntamiento
          (artículo 6.1.e del Reglamento), salvo las notificaciones y la ubicación del voluntario,
          que son <strong>consentimiento</strong> (artículo 6.1.a) y se retiran cuando quieras: las
          primeras desde Ajustes, la segunda dejando de emitir.
        </p>
      </Article>

      <Article title="3. Lo que no se hace">
        <p>
          No hay publicidad ni rastreadores de terceros. No se elaboran perfiles ni se toman
          decisiones automatizadas sobre nadie. No se venden ni se ceden datos. No se cruza esta
          información con ninguna otra, y no hay forma de saber quién eres: lo que hay guardado es
          un número aleatorio y una lista de eventos.
        </p>
      </Article>

      <Article title="4. Dónde están los datos">
        <p>
          En la nube de Amazon Web Services, en su región de <strong>Fráncfort (Alemania)</strong>,
          dentro de la Unión Europea. Todo viaja cifrado y se guarda cifrado.
        </p>
        <p>Intervienen, como encargados ulteriores y solo para lo que se dice:</p>
        <Rows
          rows={[
            {
              term: 'Amazon Web Services',
              description: 'Alojamiento, base de datos y copias de seguridad. Unión Europea.',
            },
            {
              term: 'Expo',
              description:
                'Envío de las notificaciones a los móviles. Recibe el testigo del dispositivo y el texto del aviso, que es el mismo que verías en la pantalla. Está en Estados Unidos, así que esa transferencia se ampara en las cláusulas contractuales tipo de la Comisión Europea.',
            },
            {
              term: 'Google y Cloudflare',
              description:
                'Solo para los carteles: leer la foto de un cartel que sube el ayuntamiento y dibujar uno cuando lo pide. No reciben datos de vecinos.',
            },
          ]}
        />
      </Article>

      <Article title="5. Cuánto tiempo">
        <Rows
          rows={[
            {
              term: 'Tus eventos marcados',
              description: 'Hasta que los desmarques o borres los datos desde Ajustes.',
            },
            {
              term: 'Posiciones de un directo',
              description:
                'Se borran al terminar el evento, y en todo caso a las 24 horas. De un recorrido solo puede conservarse una línea simplificada, sin horas, que no dice nada de quién llevaba el teléfono.',
            },
            {
              term: 'Contadores de avisos',
              description: '48 horas. Existen para no enviarte más de tres al día.',
            },
            {
              term: 'Registros técnicos',
              description: '14 días.',
            },
            {
              term: 'Copias de seguridad',
              description: '30 días.',
            },
            {
              term: 'Cuentas del panel',
              description:
                'Mientras esa persona trabaje para el ayuntamiento o la asociación. El registro de auditoría se conserva mientras dure el contrato con el ayuntamiento.',
            },
          ]}
        />
      </Article>

      <Article title="6. Tus derechos">
        <p>
          Puedes <strong>borrar todo lo que esta aplicación guarda sobre tu dispositivo</strong>{' '}
          desde Ajustes → Borrar mis datos. Se borra en el móvil y también en el servidor: las
          marcas, la cuenta de tu municipio y el testigo de notificaciones.
        </p>
        <p>
          Sobre el resto de derechos —acceso, rectificación, oposición, portabilidad— hay que ser
          honestos: como no pedimos ningún dato que te identifique, no podemos saber cuáles de los
          datos guardados son tuyos, y el artículo 11 del Reglamento dice que en ese caso no estamos
          obligados a conservar información adicional solo para poder identificarte. Si nos das el
          identificador de tu dispositivo, te atenderemos igualmente.
        </p>
        <p>
          El personal del panel ejerce sus derechos escribiendo a su ayuntamiento o a{' '}
          {COMPANY.email}.
        </p>
        <p>
          Si crees que algo se está haciendo mal, puedes reclamar ante la{' '}
          <a className="underline" href="https://www.aepd.es">
            Agencia Española de Protección de Datos
          </a>
          .
        </p>
      </Article>

      <Article title="7. Menores">
        <p>
          La aplicación no pide datos a nadie, ni pregunta la edad, porque no hay registro. Un menor
          que la use está en la misma situación que cualquier otro vecino: un identificador
          aleatorio y una lista de eventos que puede borrar cuando quiera.
        </p>
      </Article>

      <Article title="8. Cambios">
        <p>
          Si esto cambia, cambia la fecha de arriba y se avisa en la propia aplicación cuando el
          cambio afecte a lo que se trata o para qué.
        </p>
      </Article>
    </LegalPage>
  );
}
