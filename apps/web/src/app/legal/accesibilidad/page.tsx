import { BRAND, COMPANY } from '@agora/core';
import type { Metadata } from 'next';

import { Article, LegalPage } from '../../../components/legal';

export const metadata: Metadata = {
  title: `Accesibilidad · ${BRAND.name}`,
  description: 'Declaración de accesibilidad conforme al Real Decreto 1112/2018.',
};

/**
 * The accessibility statement the law asks a public-sector service for.
 *
 * Written as "partially compliant" and with the list of what is not accessible
 * yet, because that is what it is: there has been no third-party audit, and three
 * known limitations are listed by name. A statement that claims full conformity
 * without an audit is the kind of thing that ends a procurement.
 */
export default function AccessibilityPage() {
  return (
    <LegalPage title="Declaración de accesibilidad">
      <p>
        {COMPANY.legalName} se compromete a hacer accesibles {BRAND.name} y su panel de gestión de
        conformidad con el Real Decreto 1112/2018, de 7 de septiembre, sobre accesibilidad de los
        sitios web y aplicaciones para dispositivos móviles del sector público.
      </p>

      <Article title="Situación de cumplimiento">
        <p>
          Esta aplicación es <strong>parcialmente conforme</strong> con la norma UNE-EN 301549:2019
          (equivalente a las WCAG 2.1 nivel AA) debido a las excepciones y a la falta de conformidad
          que se indican a continuación.
        </p>
      </Article>

      <Article title="Contenido no accesible">
        <p>El contenido que se recoge a continuación no es accesible por lo siguiente:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>El mapa del seguimiento en directo.</strong> La posición de una procesión se
            dibuja sobre un mapa y no tiene todavía un equivalente en texto que diga por qué calle
            va. Sí se indica en texto la hora de la última actualización y si la señal se ha
            perdido. Está previsto añadir el nombre de la calle más cercana.
          </li>
          <li>
            <strong>El informe en PDF.</strong> El documento que genera el panel no está etiquetado,
            así que un lector de pantalla no distingue sus encabezados de su contenido. Los mismos
            datos están disponibles en la pantalla, que sí es accesible, y en CSV.
          </li>
          <li>
            <strong>Los carteles de los eventos.</strong> Los sube el ayuntamiento o la asociación
            que organiza, y su texto alternativo depende de quien los suba. La información
            importante —título, fecha, hora y lugar— está siempre fuera de la imagen, en texto.
          </li>
        </ul>
      </Article>

      <Article title="Preparación de la declaración">
        <p>
          Declaración realizada el {COMPANY.updatedAt} mediante <strong>autoevaluación</strong>{' '}
          llevada a cabo por el propio equipo de desarrollo. Está pendiente una evaluación por un
          tercero independiente, que se hará antes de la primera implantación en un ayuntamiento.
        </p>
        <p>
          La autoevaluación es en parte <strong>automática y continua</strong>: cada pantalla del
          panel y estas tres páginas legales se analizan con la herramienta <em>axe</em> contra las
          WCAG 2.1 nivel AA en cada cambio del código, y un incumplimiento detiene la publicación.
          Eso cubre el contraste, el orden de los encabezados, los nombres de los campos y los
          atributos de los elementos, que es lo que una máquina puede comprobar.
        </p>
        <p>
          Lo que <strong>no</strong> cubre, y por tanto sigue pendiente de la evaluación con
          personas: que lo que lee un lector de pantalla se entienda, que el orden de tabulación
          tenga sentido, y que la aplicación móvil funcione con VoiceOver y con TalkBack. La
          aplicación del vecino no está incluida en el análisis automático.
        </p>
        <p>
          Lo que se ha tenido en cuenta desde el principio: contraste suficiente en los dos temas,
          textos que escalan con el tamaño de letra del sistema, foco visible, botones grandes,
          etiquetas en todos los campos, y ninguna información que dependa solo del color —las
          gráficas del panel tienen su vista en tabla al lado.
        </p>
      </Article>

      <Article title="Observaciones y datos de contacto">
        <p>
          Se pueden comunicar problemas de accesibilidad, dificultades de acceso a un contenido o
          cualquier otra consulta escribiendo a {COMPANY.email}. Las comunicaciones se responden en
          el plazo de veinte días hábiles.
        </p>
        <p>
          A través de esa misma dirección se pueden presentar quejas sobre el cumplimiento de estos
          requisitos y solicitudes de información accesible sobre contenidos excluidos o exentos.
        </p>
      </Article>

      <Article title="Procedimiento de aplicación">
        <p>
          Si una solicitud o queja no obtiene respuesta, o la respuesta no es satisfactoria, puede
          iniciarse una reclamación ante el ayuntamiento titular del servicio, conforme al artículo
          13 del Real Decreto 1112/2018, y en última instancia ante la unidad responsable de
          accesibilidad de la administración correspondiente.
        </p>
      </Article>
    </LegalPage>
  );
}
