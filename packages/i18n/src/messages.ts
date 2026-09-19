/**
 * User-facing copy.
 *
 * Keys are flat and explicit so a missing translation is a type error rather
 * than a string that silently falls back to its key at runtime. Spanish is the
 * source language; English exists from the start because retrofitting it once
 * fifty screens exist is a rewrite, not a translation.
 */
export interface Messages {
  'common.loading': string;
  'common.retry': string;
  'common.cancel': string;
  'common.free': string;

  'welcome.title': string;
  'welcome.subtitle': string;
  'welcome.searchPlaceholder': string;
  'welcome.useLocation': string;
  'welcome.locating': string;
  'welcome.detected': string;
  'welcome.detectedConfirm': string;
  'welcome.detectedDismiss': string;
  'welcome.locationDenied': string;
  'welcome.locationUnavailable': string;
  'welcome.noResults': string;
  'welcome.notAvailableTitle': string;
  'welcome.notAvailableBody': string;
  'welcome.notifyMe': string;
  'welcome.notifyDone': string;
  'welcome.inhabitants': string;

  'calendar.tab': string;
  'calendar.today': string;
  'calendar.thisWeekend': string;
  'calendar.upcoming': string;
  'calendar.featured': string;
  'calendar.empty': string;
  'calendar.emptyFiltered': string;
  'calendar.allCategories': string;
  'calendar.onlyFree': string;
  'calendar.changeMunicipality': string;
  'calendar.municipalAgenda': string;
  'calendar.change': string;
  'calendar.viewList': string;
  'calendar.viewMonth': string;
  'calendar.previousMonth': string;
  'calendar.nextMonth': string;
  'calendar.backToThisMonth': string;
  'calendar.nothingOnThisDay': string;
  'calendar.dayWithEvents': string;
  'calendar.dayWithoutEvents': string;
  'calendar.weekdayInitials': string;

  'event.cancelled': string;
  'event.openMap': string;
  'event.organisedBy': string;
  'event.byTownHall': string;
  'event.interested': string;
  'event.interestedDone': string;
  'event.addToCalendar': string;
  'event.share': string;
  'event.watchLive': string;
  'event.priceFree': string;
  'event.notFound': string;

  'myEvents.title': string;
  'myEvents.empty': string;
  'myEvents.emptyHint': string;
  'myEvents.past': string;

  'live.title': string;
  'live.lastUpdate': string;
  'live.stale': string;
  'live.notStarted': string;
  'live.finished': string;
  'live.plannedRoute': string;

  'volunteer.title': string;
  'volunteer.intro': string;
  'volunteer.settingsBody': string;
  'volunteer.codeLabel': string;
  'volunteer.codePlaceholder': string;
  'volunteer.enter': string;
  'volunteer.checking': string;
  'volunteer.badCode': string;
  'volunteer.ready': string;
  'volunteer.start': string;
  'volunteer.pause': string;
  'volunteer.resume': string;
  'volunteer.finish': string;
  'volunteer.broadcasting': string;
  'volunteer.paused': string;
  'volunteer.lastSent': string;
  'volunteer.noneSent': string;
  'volunteer.keepOpen': string;
  'volunteer.permissionDenied': string;
  'volunteer.offline': string;
  'volunteer.expired': string;
  'volunteer.notActive': string;
  'volunteer.privacy': string;
  'volunteer.demoNotice': string;

  'push.reminderBody': string;
  'push.reminderBodyAllDay': string;
  'push.titleTimeChange': string;
  'push.titleLocationChange': string;
  'push.titleCancelled': string;
  'push.liveTitle': string;
  'push.liveBody': string;

  'settings.title': string;
  'settings.municipality': string;
  'settings.language': string;
  'settings.appearance': string;
  'settings.appearanceDark': string;
  'settings.appearanceLight': string;
  'settings.appearanceSystem': string;
  'settings.appearanceBody': string;
  'settings.notifications': string;
  'settings.notificationsBody': string;
  'settings.notificationsOn': string;
  'settings.notificationsOff': string;
  'settings.notificationsEnable': string;
  'settings.notificationsDisable': string;
  'settings.notificationsDenied': string;
  'settings.notificationsUnsupported': string;
  'settings.privacy': string;
  'settings.deleteData': string;
  'settings.deleteDataBody': string;
  'settings.demoNotice': string;
}

const es: Messages = {
  'common.loading': 'Cargando…',
  'common.retry': 'Reintentar',
  'common.cancel': 'Cancelar',
  'common.free': 'Gratis',

  'welcome.title': '¿De qué pueblo quieres ver la agenda?',
  'welcome.subtitle': 'Puedes cambiarlo cuando quieras y seguir más de uno.',
  'welcome.searchPlaceholder': 'Busca tu municipio',
  'welcome.useLocation': 'Usar mi ubicación',
  'welcome.locating': 'Buscando tu municipio…',
  'welcome.detected': '¿Estás en {name}?',
  'welcome.detectedConfirm': 'Sí, es mi pueblo',
  'welcome.detectedDismiss': 'No, elijo otro',
  'welcome.locationDenied': 'Sin problema: busca tu municipio en la lista.',
  'welcome.locationUnavailable': 'No hemos podido saber dónde estás. Búscalo en la lista.',
  'welcome.noResults': 'No encontramos ese municipio',
  'welcome.notAvailableTitle': 'Todavía no está disponible',
  'welcome.notAvailableBody':
    'Tu ayuntamiento aún no tiene la app. Si nos lo dices, se lo haremos saber.',
  'welcome.notifyMe': 'Avisadme cuando esté',
  'welcome.notifyDone': 'Gracias. Te avisaremos.',
  'welcome.inhabitants': '{count} habitantes',

  'calendar.tab': 'Agenda',
  'calendar.today': 'Hoy',
  'calendar.thisWeekend': 'Este finde',
  'calendar.upcoming': 'Próximos',
  'calendar.featured': 'Destacado',
  'calendar.empty': 'Todavía no hay eventos publicados.',
  'calendar.emptyFiltered': 'No hay eventos con estos filtros.',
  'calendar.allCategories': 'Todo',
  'calendar.onlyFree': 'Gratis',
  'calendar.changeMunicipality': 'Cambiar de municipio',
  'calendar.municipalAgenda': 'Agenda municipal',
  'calendar.change': 'Cambiar',
  'calendar.viewList': 'Lista',
  'calendar.viewMonth': 'Mes',
  'calendar.previousMonth': 'Mes anterior',
  'calendar.nextMonth': 'Mes siguiente',
  'calendar.backToThisMonth': 'Volver a este mes',
  'calendar.nothingOnThisDay': 'Este día no hay nada.',
  'calendar.dayWithEvents': '{date}, {count} eventos',
  'calendar.dayWithoutEvents': '{date}, sin eventos',
  // One letter per weekday, Monday first, separated by spaces.
  'calendar.weekdayInitials': 'L M X J V S D',

  'event.cancelled': 'Cancelado',
  'event.openMap': 'Ver {place} en el mapa',
  'event.organisedBy': 'Organiza {name}',
  'event.byTownHall': 'Organiza el Ayuntamiento',
  'event.interested': 'Me interesa',
  'event.interestedDone': 'Te interesa',
  'event.addToCalendar': 'Añadir a mi calendario',
  'event.share': 'Compartir',
  'event.watchLive': 'Ver en directo',
  'event.priceFree': 'Entrada gratuita',
  'event.notFound': 'No encontramos este evento.',

  'myEvents.title': 'Mis eventos',
  'myEvents.empty': 'Todavía no te interesa ningún evento.',
  'myEvents.emptyHint': 'Marca «Me interesa» en un evento y aparecerá aquí.',
  'myEvents.past': 'Ya pasaron',

  'live.title': 'En directo',
  'live.lastUpdate': 'Actualizado hace {minutes} min',
  'live.stale': 'Sin señal desde hace {minutes} min',
  'live.notStarted': 'El directo todavía no ha empezado.',
  'live.finished': 'El directo ha terminado.',
  'live.plannedRoute': 'Recorrido previsto',

  'volunteer.title': 'Modo voluntario',
  'volunteer.intro':
    'Con el código que te ha dado el ayuntamiento, tu móvil comparte por dónde va el recorrido.',
  'volunteer.settingsBody':
    'Para quien lleva el móvil en una procesión, una cabalgata o una romería.',
  'volunteer.codeLabel': 'Código del directo',
  'volunteer.codePlaceholder': 'Por ejemplo, 4F7K2M',
  'volunteer.enter': 'Entrar',
  'volunteer.checking': 'Comprobando el código…',
  'volunteer.badCode': 'Ese código no vale. Pide otro al ayuntamiento.',
  'volunteer.ready': 'Listo para empezar',
  'volunteer.start': 'Empezar a emitir',
  'volunteer.pause': 'Pausar',
  'volunteer.resume': 'Seguir emitiendo',
  'volunteer.finish': 'Terminar',
  'volunteer.broadcasting': 'Estás emitiendo',
  'volunteer.paused': 'En pausa',
  'volunteer.lastSent': 'Última posición enviada a las {time}',
  'volunteer.noneSent': 'Todavía no se ha enviado ninguna posición.',
  'volunteer.keepOpen': 'Deja la app abierta y la pantalla encendida durante todo el recorrido.',
  'volunteer.permissionDenied':
    'Necesitamos tu ubicación para compartir por dónde vas. Actívala en los ajustes del móvil.',
  'volunteer.offline': 'Sin conexión. Lo seguimos intentando.',
  'volunteer.expired': 'La sesión ha caducado. Vuelve a introducir el código.',
  'volunteer.notActive': 'El directo no está activo. El ayuntamiento tiene que activarlo.',
  'volunteer.privacy':
    'Tu ubicación solo se comparte mientras emites y se borra al terminar el evento.',
  'volunteer.demoNotice': 'Demostración: no se envía nada fuera de este móvil.',

  'push.reminderBody': 'Mañana a las {time}',
  'push.reminderBodyAllDay': 'Mañana en tu pueblo',
  'push.titleTimeChange': 'Cambio de hora: {title}',
  'push.titleLocationChange': 'Cambio de lugar: {title}',
  'push.titleCancelled': 'Se cancela: {title}',
  'push.liveTitle': 'Ya está en directo: {title}',
  'push.liveBody': 'Mira por dónde va en el mapa.',

  'settings.title': 'Ajustes',
  'settings.municipality': 'Municipio',
  'settings.language': 'Idioma',
  'settings.appearance': 'Aspecto',
  'settings.appearanceDark': 'Oscuro',
  'settings.appearanceLight': 'Claro',
  'settings.appearanceSystem': 'Automático',
  'settings.appearanceBody': 'El claro se lee mejor a pleno sol.',
  'settings.notifications': 'Avisos',
  'settings.notificationsBody':
    'Te recordamos por la tarde los eventos que te interesan y te avisamos si cambia la hora, el lugar o se cancelan.',
  'settings.notificationsOn': 'Activados',
  'settings.notificationsOff': 'Desactivados',
  'settings.notificationsEnable': 'Activar avisos',
  'settings.notificationsDisable': 'Desactivar avisos',
  'settings.notificationsDenied':
    'Los has bloqueado en los ajustes del móvil. Se activan desde ahí.',
  'settings.notificationsUnsupported': 'En esta versión de demostración no se envían avisos.',
  'settings.privacy': 'Privacidad',
  'settings.deleteData': 'Borrar mis datos',
  'settings.deleteDataBody':
    'Se borrarán los eventos que te interesan y el municipio elegido. No guardamos nada más.',
  'settings.demoNotice': 'Versión de demostración con datos de ejemplo.',
};

const en: Messages = {
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.cancel': 'Cancel',
  'common.free': 'Free',

  'welcome.title': 'Which town do you want to follow?',
  'welcome.subtitle': 'You can change it any time, and follow more than one.',
  'welcome.searchPlaceholder': 'Search for your town',
  'welcome.useLocation': 'Use my location',
  'welcome.locating': 'Looking for your town…',
  'welcome.detected': 'Are you in {name}?',
  'welcome.detectedConfirm': 'Yes, that is my town',
  'welcome.detectedDismiss': 'No, let me choose',
  'welcome.locationDenied': 'No problem: find your town in the list.',
  'welcome.locationUnavailable': 'We could not tell where you are. Find your town in the list.',
  'welcome.noResults': 'We could not find that town',
  'welcome.notAvailableTitle': 'Not available yet',
  'welcome.notAvailableBody':
    'Your town hall does not have the app yet. Tell us and we will let them know.',
  'welcome.notifyMe': 'Let me know when it is ready',
  'welcome.notifyDone': 'Thank you. We will let you know.',
  'welcome.inhabitants': '{count} inhabitants',

  'calendar.tab': 'What is on',
  'calendar.today': 'Today',
  'calendar.thisWeekend': 'This weekend',
  'calendar.upcoming': 'Coming up',
  'calendar.featured': 'Featured',
  'calendar.empty': 'No events published yet.',
  'calendar.emptyFiltered': 'No events match these filters.',
  'calendar.allCategories': 'All',
  'calendar.onlyFree': 'Free',
  'calendar.changeMunicipality': 'Change town',
  'calendar.municipalAgenda': 'Town agenda',
  'calendar.change': 'Change',
  'calendar.viewList': 'List',
  'calendar.viewMonth': 'Month',
  'calendar.previousMonth': 'Previous month',
  'calendar.nextMonth': 'Next month',
  'calendar.backToThisMonth': 'Back to this month',
  'calendar.nothingOnThisDay': 'Nothing on this day.',
  'calendar.dayWithEvents': '{date}, {count} events',
  'calendar.dayWithoutEvents': '{date}, no events',
  'calendar.weekdayInitials': 'M T W T F S S',

  'event.cancelled': 'Cancelled',
  'event.openMap': 'See {place} on the map',
  'event.organisedBy': 'Organised by {name}',
  'event.byTownHall': 'Organised by the town hall',
  'event.interested': 'I am interested',
  'event.interestedDone': 'Interested',
  'event.addToCalendar': 'Add to my calendar',
  'event.share': 'Share',
  'event.watchLive': 'Watch live',
  'event.priceFree': 'Free entry',
  'event.notFound': 'We could not find this event.',

  'myEvents.title': 'My events',
  'myEvents.empty': 'You are not interested in any event yet.',
  'myEvents.emptyHint': 'Mark an event as interesting and it will show up here.',
  'myEvents.past': 'Already happened',

  'live.title': 'Live',
  'live.lastUpdate': 'Updated {minutes} min ago',
  'live.stale': 'No signal for {minutes} min',
  'live.notStarted': 'The live tracking has not started yet.',
  'live.finished': 'The live tracking has finished.',
  'live.plannedRoute': 'Planned route',

  'volunteer.title': 'Volunteer mode',
  'volunteer.intro':
    'With the code the town hall gave you, your phone shares where the route is going.',
  'volunteer.settingsBody':
    'For whoever carries the phone in a procession, a parade or a pilgrimage.',
  'volunteer.codeLabel': 'Live tracking code',
  'volunteer.codePlaceholder': 'For example, 4F7K2M',
  'volunteer.enter': 'Enter',
  'volunteer.checking': 'Checking the code…',
  'volunteer.badCode': 'That code is not valid. Ask the town hall for another one.',
  'volunteer.ready': 'Ready to start',
  'volunteer.start': 'Start broadcasting',
  'volunteer.pause': 'Pause',
  'volunteer.resume': 'Keep broadcasting',
  'volunteer.finish': 'Finish',
  'volunteer.broadcasting': 'You are broadcasting',
  'volunteer.paused': 'Paused',
  'volunteer.lastSent': 'Last position sent at {time}',
  'volunteer.noneSent': 'No position has been sent yet.',
  'volunteer.keepOpen': 'Keep the app open and the screen on for the whole route.',
  'volunteer.permissionDenied':
    'We need your location to share where you are. Turn it on in your phone settings.',
  'volunteer.offline': 'No connection. We keep trying.',
  'volunteer.expired': 'The session has expired. Enter the code again.',
  'volunteer.notActive': 'The live tracking is not active. The town hall has to turn it on.',
  'volunteer.privacy':
    'Your location is only shared while you broadcast and is deleted when the event ends.',
  'volunteer.demoNotice': 'Demo: nothing leaves this phone.',

  'push.reminderBody': 'Tomorrow at {time}',
  'push.reminderBodyAllDay': 'Tomorrow in your town',
  'push.titleTimeChange': 'New time: {title}',
  'push.titleLocationChange': 'New place: {title}',
  'push.titleCancelled': 'Called off: {title}',
  'push.liveTitle': 'Live now: {title}',
  'push.liveBody': 'See where it is on the map.',

  'settings.title': 'Settings',
  'settings.municipality': 'Town',
  'settings.language': 'Language',
  'settings.appearance': 'Appearance',
  'settings.appearanceDark': 'Dark',
  'settings.appearanceLight': 'Light',
  'settings.appearanceSystem': 'Automatic',
  'settings.appearanceBody': 'Light reads better in bright sunshine.',
  'settings.notifications': 'Notifications',
  'settings.notificationsBody':
    'We remind you in the evening about the events you marked, and tell you if the time or the place changes, or they are called off.',
  'settings.notificationsOn': 'On',
  'settings.notificationsOff': 'Off',
  'settings.notificationsEnable': 'Turn notifications on',
  'settings.notificationsDisable': 'Turn notifications off',
  'settings.notificationsDenied': 'You blocked them in your phone settings. Turn them on there.',
  'settings.notificationsUnsupported': 'This demo build does not send notifications.',
  'settings.privacy': 'Privacy',
  'settings.deleteData': 'Delete my data',
  'settings.deleteDataBody':
    'This removes the events you marked and the town you chose. We store nothing else.',
  'settings.demoNotice': 'Demo version with example data.',
};

export const MESSAGES = { es, en } as const;
