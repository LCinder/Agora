# Ideas para vender al ayuntamiento

Complementa a [`fase-1-validacion.md`](fase-1-validacion.md), que dice **a quién** ver y **cuándo**,
y a [`demo.md`](demo.md), que dice **qué enseñar**. Esto es el otro tercio: **con qué argumento**, y
qué se puede construir barato que haga la venta más fácil.

Cada idea lleva marcado si está **hecha** (se puede decir hoy en una reunión), **casi hecha** (hay
código que ya lo resuelve, falta poco) o **por hacer** (con una estimación honesta).

Regla que atraviesa todo el documento: **no vendas una aplicación.** Todos los ayuntamientos de la
franja han pagado alguna vez por una app que se descargaron ochenta personas, y la palabra está
quemada. Vende *que su programación llegue a sus vecinos* y *que puedan demostrar que llegó*.

---

## 1. Los argumentos que ya se pueden usar

### 1.1 «La memoria anual la escribe el programa» — hecho

Toda concejalía tiene que justificar el año. Hoy eso se hace a mano, contando carteles y
recordando. El panel ya exporta un PDF con el periodo, los eventos, el interés por actividad y la
evolución por meses.

Eso cambia de qué partida sale el dinero: deja de parecer informática y pasa a parecer **asistencia
técnica a la concejalía**, que es una partida más fácil y con menos cola.

Frase para la reunión: *«En diciembre, cuando tengas que escribir la memoria de Cultura, esto son
dos clics en vez de tres tardes.»*

### 1.2 El número que renueva el contrato — casi hecho

La cifra que de verdad firma el segundo año no es «cuánta gente se lo descargó», es **«la feria tuvo
un 30 % más de interés que el año pasado»**. La serie mensual ya se guarda; falta la comparación
interanual en el informe. *Estimación: medio día.*

Dilo en la primera reunión aunque todavía no esté: es lo que hace que quieran empezar **este** año y
no el que viene, porque el año uno es el que crea la línea de comparación.

### 1.3 La accesibilidad, que es una obligación legal que probablemente estén incumpliendo — hecho

El **RD 1112/2018** obliga a que las webs y apps del sector público cumplan la UNE-EN 301549
(≈ WCAG 2.1 AA) y a publicar una **declaración de accesibilidad**. Casi ninguna web municipal de un
pueblo de quince mil habitantes la tiene.

Nuestro producto nace cumpliéndolo y trae la declaración escrita. Esto no es un detalle técnico: es
un argumento de miedo, y en la administración los argumentos de miedo cierran ventas que los
argumentos de ilusión no cierran. Además desactiva de golpe la objeción de Secretaría.

### 1.4 «No pedimos ni un dato a sus vecinos» — hecho

Sin registro, sin correo, sin teléfono, sin padrón. Un identificador anónimo de dispositivo y nada
más (D-029). Eso significa: ningún banner de consentimiento, ningún fichero que declarar, ninguna
foto de alguien en una romería con su nombre debajo.

Para un ayuntamiento, el riesgo político de una app municipal es que filtre algo. Aquí **no hay nada
que filtrar**, y conviene decirlo con esas palabras. El contrato de encargo del tratamiento
(art. 28 RGPD) llegando ya redactado a la reunión cierra la objeción antes de que la abran.

### 1.5 «Esto lo puede firmar usted» — hecho

Por debajo de los 15.000 € sin IVA del contrato menor de servicios. No es un detalle
administrativo, es **la diferencia entre una firma y una licitación de seis meses**. Dilo pronto,
porque hasta que no lo oyen están calculando el coste en tiempo, no en dinero.

### 1.6 El trabajo que le quitas al técnico, en su propio número — hecho

No digas «te ahorra tiempo». Pregunta: *«¿cuánto tardas en publicar un evento en la web, en
Facebook y en el bando?»* Te dirá diez o quince minutos. Multiplícalo por los eventos que tuvieron
el año pasado —está en su propio programa de fiestas— y **el número lo ha dicho él**.

Y luego la segunda mitad, que es la que no se espera: de esos eventos, los de las hermandades, las
peñas y los clubes **no los mete él**. Los meten ellos y él solo aprueba.

---

## 2. Cosas pequeñas de construir que se venden solas

Ordenadas por lo que dan dividido entre lo que cuestan.

### 2.1 La pantalla del vestíbulo — por hacer, ~1 día

Una URL que abre la agenda de la semana a pantalla completa, en letra grande, rotando sola. Se pone
en la tele del vestíbulo del ayuntamiento, en la biblioteca, en el centro de mayores, en la piscina
municipal.

Es una página más sobre la API que ya existe y **es lo más visible que puede comprar un concejal**.
Un cargo electo paga por lo que se ve, y esto se ve todos los días en el sitio por donde pasa todo
el pueblo. También resuelve al vecino mayor que no tiene móvil, que es la primera objeción que sale
en la reunión.

### 2.2 El cartel automático — casi hecho, ~2 días

El lector de carteles con IA va en una dirección (foto → evento). La vuelta es más barata y se usa
más: **evento → cartel**, en cuadrado para Instagram y en A4 para imprimir, con el escudo y el color
del municipio. El código que dibuja sobre un lienzo ya está escrito para las portadas.

El community manager del ayuntamiento hace eso todas las semanas a mano. Quítaselo y tienes un
aliado dentro de la casa que no es el que firma pero habla con el que firma.

### 2.3 «Publica una vez, sal en todos lados» — por hacer, ~2 días

Un *widget* para empotrar en la web municipal y un calendario **iCal** al que suscribirse. Mata en
seco la objeción *«es que nosotros ya tenemos web»*: no compites con su web, **se la rellenas**.

Y el iCal tiene un efecto de segundo orden: el AMPA, el club de fútbol y la biblioteca acaban
suscritos al calendario del pueblo desde su propio Google Calendar.

### 2.4 El QR en el cartel de papel — por hacer, ~medio día

Cada evento del panel enseña un QR listo para pegar en el cartel impreso, que abre ese evento
concreto. El mundo en el que viven las fiestas de un pueblo sigue siendo el papel; esto es el puente
y cuesta nada. Además es medible: los carteles con QR te dicen qué carteles mira la gente.

### 2.5 Un informe por concejalía — por hacer, ~1 día

El mismo informe, filtrado por categoría: uno para Cultura, uno para Juventud, uno para Deportes.

El efecto no es técnico sino comercial: **convierte un comprador en tres defensores internos**, y
tres partidas presupuestarias distintas donde antes había una. En un ayuntamiento de veinte mil
habitantes eso puede ser la diferencia entre 1.500 € y 3.000 €.

### 2.6 «Ya te lo han pedido treinta y siete vecinos» — por hacer, ~1 día

La app ya deja pedir un municipio que no está. Hoy eso se guarda solo en el teléfono. Convertirlo en
un contador anónimo por municipio —sin nada personal, igual que el resto— da **la mejor frase de
apertura que existe en esta venta**: *«treinta y siete vecinos de Atarfe ya han pedido esto.»*

No es un argumento, es una presión social, y funciona distinto: el concejal no está decidiendo si le
gusta el producto, está decidiendo si contesta a sus vecinos.

### 2.7 El aviso de última hora sin el grupo de WhatsApp — hecho (falta el envío real)

El dolor que de verdad tienen, y que no van a contar hasta la segunda reunión, es el grupo de
WhatsApp de doscientas cincuenta personas donde se anuncian los cortes de calle y del que no
controlan nada. Un aviso que llega **solo a quien marcó ese evento** es la alternativa, y el límite
diario anti-spam es parte del argumento, no una limitación: *«no podemos saturar a tus vecinos
aunque quisiéramos.»*

---

## 3. Mecánica comercial

### 3.1 El piloto es una fiesta, no treinta días

«Prueba gratis un mes» no significa nada en un ayuntamiento: el mes pasa sin que nadie entre.
Propón en su lugar: **«dadnos la feria»** (o la Semana Santa, o la cabalgata). Es una fecha, tiene
dueño, tiene urgencia y tiene un resultado que se mide solo.

Y es el escenario donde el producto se ve mejor, porque es cuando el directo tiene sentido y cuando
todo el pueblo mira el móvil a la vez.

### 3.2 Entra por la asociación, no solo por el ayuntamiento

La hermandad, la peña y el club están desesperados por que se entere alguien, y no tienen ningún
canal propio más allá de un Instagram con cuatrocientos seguidores. Enséñaselo a ellos primero: no
pagan, pero **le piden al ayuntamiento que lo contrate**, y esa petición vale más que tres correos
nuestros.

Es además la comprobación barata de la funcionalidad diferenciadora: si las asociaciones de La Zubia
no quieren subir sus eventos, el calendario colaborativo no vale nada y hay que saberlo antes de
seguir.

### 3.3 La Diputación como mayorista, y como pagador del primer año

Un contrato, cuarenta municipios. Pero hay una variante más fácil que vender el paquete entero:
**que la Diputación pague el primer año de los municipios pequeños**. Es una subvención de las que
ya conceden, el ayuntamiento no arriesga presupuesto y nosotros entramos en cuarenta sitios con una
sola firma.

### 3.4 El primer cliente es una referencia, y se paga como tal

Al primer ayuntamiento, descuento explícito a cambio de que podamos nombrarlo y de que su técnico
coja el teléfono cuando llame el de al lado. **La recomendación de un alcalde vecino vale más que
cualquier demo**, y los municipios del cinturón metropolitano se conocen todos.

### 3.5 Firma antes de la fiesta, no después

Tiene estacionalidad real: el directo solo luce en Semana Santa, feria, romería y cabalgata. Una
firma en enero se estrena en Semana Santa y renueva sola en octubre; una firma en junio pasa seis
meses sin que nadie vea la mejor parte del producto.

---

## 4. Qué no hacer

- **No compitas en lista de funcionalidades con Bandomovil.** Tienen once y nosotros cuatro. El
  terreno donde se gana es: las asociaciones lo rellenan, hay datos, y hay directo. Si la
  conversación se va a farmacias de guardia y listín telefónico, la hemos perdido.
- **No prometas la app con marca propia del municipio** en la primera reunión aunque la pidan.
  Multiplica el mantenimiento y está en el backlog por una razón. Se responde: *«se puede, y lo
  hablamos cuando el calendario esté funcionando.»*
- **No entres por Informática ni por Secretaría.** Ahí el producto se convierte en un expediente.
- **No enseñes datos inventados sin decir que lo son.** Si un concejal descubre en la segunda
  reunión que los números de la primera eran de mentira, se acabó. La demo se presenta como demo.
