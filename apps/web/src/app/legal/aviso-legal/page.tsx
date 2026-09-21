import { BRAND, COMPANY } from '@agora/core';
import type { Metadata } from 'next';

import { Article, LegalPage } from '../../../components/legal';

export const metadata: Metadata = {
  title: `Aviso legal · ${BRAND.name}`,
  description: 'Titular del servicio, condiciones de uso y responsabilidad sobre los contenidos.',
};

export default function LegalNoticePage() {
  return (
    <LegalPage title="Aviso legal">
      <Article title="Titular">
        <p>
          {COMPANY.legalName}, con NIF {COMPANY.taxId} y domicilio en {COMPANY.address}. Correo de
          contacto: {COMPANY.email}.
        </p>
        <p>
          {BRAND.name} es un servicio que los ayuntamientos contratan para publicar la agenda de su
          municipio. La aplicación es nuestra; <strong>lo que se publica en ella es suyo</strong>.
        </p>
      </Article>

      <Article title="Quién responde de los contenidos">
        <p>
          Cada evento lo publica el ayuntamiento del municipio o una asociación a la que ese
          ayuntamiento ha dado acceso, y responde de él quien lo publica: de que la hora sea la
          correcta, de que el sitio exista y de que la foto del cartel sea suya o tenga permiso para
          usarla.
        </p>
        <p>
          Hacemos lo razonable para que la información llegue tal cual se publicó y para avisar de
          los cambios, pero una fiesta puede cambiar de hora o suspenderse sin que nadie lo
          actualice a tiempo. Antes de salir de casa para algo que dependa de ello, conviene mirar
          también los canales del ayuntamiento.
        </p>
      </Article>

      <Article title="Uso del servicio">
        <p>
          La aplicación es gratuita para los vecinos y no requiere registrarse. El panel de gestión
          es para el personal municipal y las asociaciones autorizadas: las credenciales son
          personales y no se comparten.
        </p>
        <p>
          No está permitido usar el servicio para publicar contenidos ilícitos, ni intentar acceder
          a los datos de otro municipio, ni extraer masivamente la información por medios
          automáticos.
        </p>
      </Article>

      <Article title="Propiedad intelectual">
        <p>
          El programa, su diseño y su nombre son de {COMPANY.legalName}. Los textos, las imágenes y
          los carteles de cada evento son de quien los publica, que autoriza a mostrarlos en la
          aplicación, en la página pública del evento y en lo que el ayuntamiento decida enlazar.
        </p>
      </Article>

      <Article title="Disponibilidad">
        <p>
          El servicio se presta tal y como está disponible. Se hace lo posible por mantenerlo en pie
          —especialmente los días que importan, que son los de fiesta—, pero no se garantiza que no
          haya interrupciones, y no se responde de los daños que pueda causar una caída, salvo lo
          que diga el contrato firmado con cada ayuntamiento.
        </p>
      </Article>

      <Article title="Ley aplicable">
        <p>
          Se aplica la legislación española. Para cualquier controversia con un consumidor, los
          juzgados competentes son los de su domicilio.
        </p>
      </Article>
    </LegalPage>
  );
}
