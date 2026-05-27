// ============================================================
// PARTE 1: Inicializacion y Firebase
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDVLLTC-kqLBJ0Me06rqsu5BRneQiFkoE4",
  authDomain: "mundial-2026-12e6c.firebaseapp.com",
  databaseURL: "https://mundial-2026-12e6c-default-rtdb.firebaseio.com",
  projectId: "mundial-2026-12e6c",
  storageBucket: "mundial-2026-12e6c.firebasestorage.app",
  messagingSenderId: "498565136746",
  appId: "1:498565136746:web:3a73c5e92a5bdfc5726513"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
let currentUser = null;
let listenersRegistrados = false;
let modoAccesoLogin = 'menu';
let filtroPartidosActivo = 'proximos';
let prediccionesUsuarioActual = {};
const CLAVE_DOCENTE = '2707';
const HUSO_CANCUN = '-05:00';
const MINUTOS_CIERRE_PREDICCION = 15;
const MAPA_DIECISEISAVOS_BASE = {
  m049: { slot1: '1A', slot2: '2B' },
  m050: { slot1: '1C', slot2: '2D' },
  m051: { slot1: '1E', slot2: '2F' },
  m052: { slot1: '1G', slot2: '2H' },
  m053: { slot1: '2A', slot2: '1B' },
  m054: { slot1: '2C', slot2: '1D' },
  m055: { slot1: '2E', slot2: '1F' },
  m056: { slot1: '2G', slot2: '1H' }
};

function normalizarCodigoInvitacion(codigo) {
  return (codigo || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function normalizarTextoRol(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function esCodigoValido(codigo) {
  return /^[A-Z0-9]{5}$/.test(codigo || '');
}

function tieneAccesoDocente() {
  if (esUsuarioAdmin()) return true;
  return sessionStorage.getItem('acceso_docente') === '1';
}

function desbloquearModuloDocente() {
  if (!esUsuarioAdmin()) {
    mostrarNotificacion('error', '❌ Solo docente/admin puede acceder');
    return;
  }

  sessionStorage.setItem('acceso_docente', '1');
  mostrarNotificacion('success', '✅ Módulo docente habilitado automáticamente');
  mostrarPerfil();
}

function abrirModuloMaestroDesdePrincipal() {
  if (!esUsuarioAdmin()) {
    mostrarNotificacion('error', '❌ Solo admin/docente puede acceder al módulo maestro');
    return;
  }

  const clave = window.prompt('Ingresa el código de acceso del módulo maestro');
  if (clave === null) return;

  if (clave.trim() !== CLAVE_DOCENTE) {
    mostrarNotificacion('error', '❌ Código incorrecto');
    return;
  }

  sessionStorage.setItem('acceso_docente', '1');
  mostrarNotificacion('success', '✅ Acceso concedido al módulo maestro');
  cambiarTab('perfil');
  mostrarPerfil();

  const panelMaestro = document.getElementById('admin-master-panel');
  if (panelMaestro) {
    panelMaestro.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function formatearGrupoUsuario(grupo) {
  const valor = (grupo || '').toString().trim();
  if (!valor || valor.toLowerCase() === 'sin_grupo' || valor.toLowerCase() === 'sin grupo') {
    return 'Sin Grupo';
  }

  return `Grupo ${valor}`;
}

function formatearNombreConGrupo(grupo, nombre) {
  const nombreLimpio = (nombre || 'Usuario').toString().trim();
  const grupoLimpio = (grupo || '').toString().trim();

  if (!grupoLimpio) return nombreLimpio;

  const grupoSinPrefijo = grupoLimpio.replace(/^grupo\s+/i, '').trim();
  const grupoMinuscula = grupoSinPrefijo.toLowerCase();
  if (!grupoSinPrefijo || grupoMinuscula === 'sin grupo' || grupoMinuscula === 'sin_grupo') {
    return nombreLimpio;
  }

  const prefijo = `${grupoSinPrefijo} `;
  if (nombreLimpio.toUpperCase().startsWith(prefijo.toUpperCase())) {
    return nombreLimpio;
  }

  return `${grupoSinPrefijo} ${nombreLimpio}`;
}

function obtenerTimestampPartidoCancun(fecha, hora) {
  const f = (fecha || '').toString().trim();
  const h = (hora || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{2}:\d{2}$/.test(h)) return null;

  const iso = `${f}T${h}:00${HUSO_CANCUN}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function obtenerCierrePrediccionMs(partido) {
  const inicio = obtenerTimestampPartidoCancun(partido.fecha, partido.hora);
  if (!inicio) return null;
  return inicio - (MINUTOS_CIERRE_PREDICCION * 60 * 1000);
}

function estaCerradaPrediccion(partido) {
  const cierre = obtenerCierrePrediccionMs(partido);
  if (!cierre) return false;
  return Date.now() >= cierre;
}

function obtenerTextoCierrePrediccion(partido) {
  const cierre = obtenerCierrePrediccionMs(partido);
  if (!cierre) return 'Cierre no disponible';
  const fechaHora = new Date(cierre).toLocaleString('es-MX', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `Cierra ${fechaHora} (Cancún GMT-5)`;
}

function escaparJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ');
}

function generarCodigoAleatorio() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 5; i += 1) {
    codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return codigo;
}

async function reservarCodigoInvitacionNuevo(grupoSugerido = 'Sin Grupo') {
  const snapshot = await db.ref('codigos_invitacion').once('value');
  const existentes = new Set();
  snapshot.forEach((child) => existentes.add(child.key));

  let codigo = generarCodigoAleatorio();
  let intentos = 0;
  while (existentes.has(codigo) && intentos < 50) {
    codigo = generarCodigoAleatorio();
    intentos += 1;
  }

  if (existentes.has(codigo)) {
    throw new Error('No se pudo generar un código único');
  }

  await db.ref(`codigos_invitacion/${codigo}`).set({
    usado: false,
    usuario_id: null,
    grupo_sugerido: grupoSugerido === 'Sin Grupo' ? null : grupoSugerido,
    creado_en: Date.now()
  });

  return codigo;
}

function obtenerResultadoPartido(partido) {
  const fuente = partido.resultado_en_vivo || partido.resultado || {};
  const goles1 = Number.parseInt(fuente.goles1, 10);
  const goles2 = Number.parseInt(fuente.goles2, 10);

  return {
    goles1: Number.isFinite(goles1) ? goles1 : null,
    goles2: Number.isFinite(goles2) ? goles2 : null
  };
}

function normalizarFasePartido(fase) {
  return (fase || '').toString().trim().toLowerCase();
}

async function actualizarNodoConFallback(ruta, payload) {
  try {
    await db.ref(ruta).update(payload);
    return { via: 'sdk' };
  } catch (error) {
    const base = (firebaseConfig.databaseURL || '').replace(/\/+$/, '');
    const path = String(ruta || '').replace(/^\/+/, '');
    const endpoint = `${base}/${path}.json`;

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw error;
    }

    return { via: 'rest' };
  }
}

const FASES_GRUPO_OFICIAL = new Set([
  'grupos',
  'fase de grupos',
  'fase_de_grupos',
  'grupos_mundial',
  'mundial_grupos'
]);

const FASES_GRUPO_TEST = new Set([
  'prueba_libertadores',
  'test_libertadores'
]);

function esFaseGrupoOficial(fase) {
  return FASES_GRUPO_OFICIAL.has(normalizarFasePartido(fase));
}

function esFaseGrupoTest(fase) {
  return FASES_GRUPO_TEST.has(normalizarFasePartido(fase));
}

function obtenerPuntajeConducta(equipo) {
  if (!equipo) return 0;
  if (Number.isFinite(Number(equipo.puntaje_conducta))) return Number(equipo.puntaje_conducta);
  if (Number.isFinite(Number(equipo.fair_play_puntos))) return Number(equipo.fair_play_puntos);
  if (Number.isFinite(Number(equipo.conducta))) return Number(equipo.conducta);

  const amarillas = Number.parseInt(equipo.tarjetas_amarillas || 0, 10) || 0;
  const rojas = Number.parseInt(equipo.tarjetas_rojas || 0, 10) || 0;
  return -(amarillas + (rojas * 3));
}

function crearEstadisticaBaseEquipo(codigo, meta = {}) {
  return {
    codigo,
    nombre: meta.nombre || codigo,
    posicion_fifa: Number.parseInt(meta.posicion_fifa || 9999, 10) || 9999,
    puntaje_conducta: obtenerPuntajeConducta(meta),
    pj: 0,
    pg: 0,
    pe: 0,
    pp: 0,
    gf: 0,
    gc: 0,
    dg: 0,
    pts: 0,
    fairPlay: obtenerPuntajeConducta(meta)
  };
}

function actualizarEstadisticaGrupo(statsA, statsB, golesA, golesB) {
  statsA.pj += 1;
  statsB.pj += 1;
  statsA.gf += golesA;
  statsA.gc += golesB;
  statsB.gf += golesB;
  statsB.gc += golesA;
  statsA.dg = statsA.gf - statsA.gc;
  statsB.dg = statsB.gf - statsB.gc;

  if (golesA > golesB) {
    statsA.pg += 1;
    statsB.pp += 1;
    statsA.pts += 3;
    return;
  }

  if (golesA < golesB) {
    statsB.pg += 1;
    statsA.pp += 1;
    statsB.pts += 3;
    return;
  }

  statsA.pe += 1;
  statsB.pe += 1;
  statsA.pts += 1;
  statsB.pts += 1;
}

function construirMiniTablaEnfrentamientos(codigosBloque, partidosGrupo, catalogoEquipos) {
  const codigos = new Set(codigosBloque);
  const tabla = new Map();

  codigos.forEach((codigo) => {
    tabla.set(codigo, crearEstadisticaBaseEquipo(codigo, catalogoEquipos[codigo] || {}));
  });

  partidosGrupo.forEach((partido) => {
    if (partido.estado !== 'finalizado') return;
    if (!codigos.has(partido.pais1) || !codigos.has(partido.pais2)) return;

    const resultado = obtenerResultadoPartido(partido);
    if (resultado.goles1 === null || resultado.goles2 === null) return;

    const statsA = tabla.get(partido.pais1);
    const statsB = tabla.get(partido.pais2);
    actualizarEstadisticaGrupo(statsA, statsB, resultado.goles1, resultado.goles2);
  });

  return tabla;
}

function compararBloqueEmpatadoGrupo(a, b, contexto) {
  const { codigosBloque, partidosGrupo, catalogoEquipos } = contexto;
  const miniTabla = construirMiniTablaEnfrentamientos(codigosBloque, partidosGrupo, catalogoEquipos);
  const h2hA = miniTabla.get(a.codigo);
  const h2hB = miniTabla.get(b.codigo);

  const comparaciones = [
    [h2hB.pts - h2hA.pts],
    [h2hB.dg - h2hA.dg],
    [h2hB.gf - h2hA.gf],
    [b.dg - a.dg],
    [b.gf - a.gf],
    [b.fairPlay - a.fairPlay],
    [a.posicion_fifa - b.posicion_fifa],
    [a.nombre.localeCompare(b.nombre, 'es')]
  ];

  for (const [valor] of comparaciones) {
    if (valor !== 0) return valor;
  }

  return 0;
}

function ordenarTablaGrupoConDesempates(tabla, partidosGrupo, catalogoEquipos) {
  const ordenados = [...tabla].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
    if (a.posicion_fifa !== b.posicion_fifa) return a.posicion_fifa - b.posicion_fifa;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const salida = [];
  let i = 0;
  while (i < ordenados.length) {
    const bloquePts = ordenados[i].pts;
    const bloque = [];
    while (i < ordenados.length && ordenados[i].pts === bloquePts) {
      bloque.push(ordenados[i]);
      i += 1;
    }

    if (bloque.length > 1) {
      const codigosBloque = bloque.map((item) => item.codigo);
      bloque.sort((a, b) => compararBloqueEmpatadoGrupo(a, b, { codigosBloque, partidosGrupo, catalogoEquipos }));
    }

    salida.push(...bloque);
  }

  salida.forEach((item, index) => {
    item.posicion = index + 1;
  });

  return salida;
}

async function calcularClasificacionesDeGrupos(opciones = {}) {
  const fasesObjetivo = Array.isArray(opciones.fases) && opciones.fases.length
    ? new Set(opciones.fases.map((fase) => normalizarFasePartido(fase)).filter(Boolean))
    : new Set(FASES_GRUPO_OFICIAL);
  const rutaDestino = opciones.rutaDestino || 'clasificaciones_grupo';

  const [partidosSnap, equiposSnap] = await Promise.all([
    db.ref('partidos').once('value'),
    db.ref('equipos').once('value')
  ]);

  const catalogoEquipos = {};
  equiposSnap.forEach((child) => {
    catalogoEquipos[child.key] = child.val() || {};
  });

  const partidosPorGrupo = new Map();
  partidosSnap.forEach((child) => {
    const partido = child.val() || {};
    if (!fasesObjetivo.has(normalizarFasePartido(partido.fase))) return;
    if (!partido.grupo) return;
    const grupo = partido.grupo.toString().trim();
    if (!partidosPorGrupo.has(grupo)) partidosPorGrupo.set(grupo, []);
    partidosPorGrupo.get(grupo).push({ id: child.key, ...partido });
  });

  const resultados = {};
  partidosPorGrupo.forEach((partidosGrupo, grupo) => {
    const equiposDelGrupo = new Map();

    partidosGrupo.forEach((partido) => {
      [partido.pais1, partido.pais2].forEach((codigo) => {
        if (!codigo) return;
        if (!equiposDelGrupo.has(codigo)) {
          equiposDelGrupo.set(codigo, crearEstadisticaBaseEquipo(codigo, catalogoEquipos[codigo] || {}));
        }
      });
    });

    partidosGrupo.forEach((partido) => {
      if (partido.estado !== 'finalizado') return;
      const resultado = obtenerResultadoPartido(partido);
      if (resultado.goles1 === null || resultado.goles2 === null) return;

      const statsA = equiposDelGrupo.get(partido.pais1);
      const statsB = equiposDelGrupo.get(partido.pais2);
      if (!statsA || !statsB) return;
      actualizarEstadisticaGrupo(statsA, statsB, resultado.goles1, resultado.goles2);
    });

    const tabla = ordenarTablaGrupoConDesempates(Array.from(equiposDelGrupo.values()), partidosGrupo, catalogoEquipos);
    resultados[grupo] = tabla;
  });

  await db.ref(rutaDestino).set(resultados);
  return resultados;
}

function renderizarClasificacionesDeGrupos(resultados = {}) {
  const contenedor = document.getElementById('admin-master-group-standings');
  const status = document.getElementById('admin-master-group-status');
  if (!contenedor) return;

  const gruposOrden = Object.keys(resultados).sort((a, b) => a.localeCompare(b, 'es'));
  if (!gruposOrden.length) {
    contenedor.innerHTML = '<div style="padding:14px;color:#666;text-align:center;">No hay clasificaciones aún.</div>';
    if (status) status.textContent = 'No hay partidos finalizados en fases de posiciones para calcular tablas.';
    return;
  }

  const bloques = gruposOrden.map((grupo) => {
    const tabla = resultados[grupo] || [];
    const clasificados = tabla.slice(0, 2).map((item) => item.codigo).join(' · ');
    return `
      <section style="border:1px solid #E2E5E2;border-radius:12px;padding:12px;background:#FAFAF8;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;">
          <h4 style="margin:0;color:#1F2A63;font-size:1rem;">Grupo ${escaparHtml(grupo)}</h4>
          <span style="font-weight:700;color:#666;">Clasifican: ${escaparHtml(clasificados || 'Pendiente')}</span>
        </div>
        <div style="overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
            <thead>
              <tr style="background:#EEF2FF;color:#1F2A63;">
                <th style="padding:8px;text-align:left;">#</th>
                <th style="padding:8px;text-align:left;">Selección</th>
                <th style="padding:8px;text-align:center;">Pts</th>
                <th style="padding:8px;text-align:center;">PJ</th>
                <th style="padding:8px;text-align:center;">GF</th>
                <th style="padding:8px;text-align:center;">GC</th>
                <th style="padding:8px;text-align:center;">DG</th>
                <th style="padding:8px;text-align:center;">FIFA</th>
              </tr>
            </thead>
            <tbody>
              ${tabla.map((item) => `
                <tr>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;">${item.posicion}</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;">${escaparHtml(item.nombre)} (${escaparHtml(item.codigo)})</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;text-align:center;">${item.pts}</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;text-align:center;">${item.pj}</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;text-align:center;">${item.gf}</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;text-align:center;">${item.gc}</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;text-align:center;">${item.dg}</td>
                  <td style="padding:8px;border-top:1px solid #E8EBE8;text-align:center;">${item.posicion_fifa}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  });

  contenedor.innerHTML = bloques.join('');
  if (status) status.textContent = `Clasificaciones actualizadas para ${gruposOrden.length} grupo${gruposOrden.length === 1 ? '' : 's'}.`;
}

async function actualizarClasificacionesDeGruposModuloMaestro() {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const status = document.getElementById('admin-master-group-status');
  try {
    if (status) status.textContent = 'Calculando clasificaciones de grupos…';
    const resultados = await calcularClasificacionesDeGrupos();
    renderizarClasificacionesDeGrupos(resultados);
    mostrarNotificacion('success', '✅ Clasificaciones de grupos actualizadas');
  } catch (error) {
    if (status) status.textContent = 'No se pudieron calcular las clasificaciones.';
    mostrarNotificacion('error', '❌ Error al calcular las clasificaciones de grupos');
  }
}

function esSlotClasificacion(token) {
  return /^[12][A-Z]$/.test((token || '').toString().trim());
}

async function generarCrucesDieciseisavosDesdeClasificacion() {
  const clasificaciones = await calcularClasificacionesDeGrupos();
  const mapaPosiciones = {};

  Object.keys(clasificaciones).forEach((grupo) => {
    const tabla = clasificaciones[grupo] || [];
    if (tabla[0]) mapaPosiciones[`1${grupo}`] = tabla[0].codigo;
    if (tabla[1]) mapaPosiciones[`2${grupo}`] = tabla[1].codigo;
  });

  const updates = {};
  const partidosSnap = await db.ref('partidos').once('value');

  Object.entries(MAPA_DIECISEISAVOS_BASE).forEach(([matchId, slotsBase]) => {
    const partido = partidosSnap.child(matchId).val() || {};
    const slot1 = partido.slot_pais1 || (esSlotClasificacion(partido.pais1) ? partido.pais1 : slotsBase.slot1);
    const slot2 = partido.slot_pais2 || (esSlotClasificacion(partido.pais2) ? partido.pais2 : slotsBase.slot2);
    const equipo1 = mapaPosiciones[slot1] || partido.pais1;
    const equipo2 = mapaPosiciones[slot2] || partido.pais2;

    updates[`partidos/${matchId}/slot_pais1`] = slot1;
    updates[`partidos/${matchId}/slot_pais2`] = slot2;
    updates[`partidos/${matchId}/pais1`] = equipo1;
    updates[`partidos/${matchId}/pais2`] = equipo2;
  });

  await db.ref().update(updates);
  return clasificaciones;
}

async function generarEliminatoriaModuloMaestro() {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const status = document.getElementById('admin-master-group-status');
  try {
    if (status) status.textContent = 'Generando cruces de dieciseisavos desde clasificación…';
    const clasificaciones = await generarCrucesDieciseisavosDesdeClasificacion();
    renderizarClasificacionesDeGrupos(clasificaciones);
    cargarPartidosModuloMaestro();
    cargarDetallePartidoModuloMaestro();
    if (status) status.textContent = 'Cruces de dieciseisavos generados correctamente.';
    mostrarNotificacion('success', '✅ Eliminatoria generada desde posiciones de grupo');
  } catch (error) {
    if (status) status.textContent = 'No se pudieron generar los cruces de eliminatoria.';
    mostrarNotificacion('error', '❌ Error al generar cruces de dieciseisavos');
  }
}

function extraerPartidosDesdePayloadFixture(payload) {
  if (Array.isArray(payload)) return payload;

  if (payload && Array.isArray(payload.partidos)) {
    return payload.partidos;
  }

  if (payload && payload.partidos && typeof payload.partidos === 'object') {
    return Object.entries(payload.partidos).map(([id, partido]) => ({ id, ...(partido || {}) }));
  }

  if (payload && typeof payload === 'object') {
    const clavesPartido = Object.keys(payload).filter((key) => /^m\d{3}$/i.test(key));
    if (clavesPartido.length) {
      return clavesPartido.map((id) => ({ id, ...(payload[id] || {}) }));
    }
  }

  return [];
}

function obtenerFechaCancunISO(offsetDias = 0) {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(ahora);

  const y = partes.find((p) => p.type === 'year')?.value || '2026';
  const m = partes.find((p) => p.type === 'month')?.value || '01';
  const d = partes.find((p) => p.type === 'day')?.value || '01';

  const base = new Date(`${y}-${m}-${d}T00:00:00${HUSO_CANCUN}`);
  base.setUTCDate(base.getUTCDate() + offsetDias);

  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function cargarFixturePruebaLibertadores() {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const status = document.getElementById('admin-master-fixture-status');
  const fechaManana = obtenerFechaCancunISO(1);

  const partidosPrueba = [
    { id: 'm901', fase: 'prueba_libertadores', grupo: 'C', hora: '19:30', pais1: 'Bolivar', pais2: 'Independiente Rivadavia' },
    { id: 'm902', fase: 'prueba_libertadores', grupo: 'C', hora: '19:30', pais1: 'Fluminense', pais2: 'Deportivo La Guaira' },
    { id: 'm903', fase: 'prueba_libertadores', grupo: 'E', hora: '19:30', pais1: 'Peñarol', pais2: 'Santa Fe' },
    { id: 'm904', fase: 'prueba_libertadores', grupo: 'E', hora: '19:30', pais1: 'Corinthians', pais2: 'Club Atletico Platense' },
    { id: 'm905', fase: 'prueba_libertadores', grupo: 'H', hora: '17:00', pais1: 'Independiente del Valle', pais2: 'Rosario Central' },
    { id: 'm906', fase: 'prueba_libertadores', grupo: 'H', hora: '17:00', pais1: 'Libertad', pais2: 'Universidad Central' }
  ];

  try {
    if (status) status.textContent = 'Cargando quiniela de prueba Libertadores…';

    const updates = {};
    partidosPrueba.forEach((p, index) => {
      updates[`partidos/${p.id}`] = {
        id: p.id,
        fase: p.fase,
        grupo: p.grupo,
        jornada: 100 + index,
        fecha: fechaManana,
        hora: p.hora,
        pais1: p.pais1,
        pais2: p.pais2,
        estado: 'programado',
        resultado: {
          goles1: null,
          goles2: null
        }
      };
    });

    await db.ref().update(updates);

    if (status) status.textContent = `Prueba cargada: ${partidosPrueba.length} partidos para ${fechaManana} (Cancún).`;
    mostrarNotificacion('success', `✅ Quiniela de prueba cargada (${partidosPrueba.length} partidos)`);
    cargarPartidosModuloMaestro();
    cargarPartidos();
  } catch (error) {
    if (status) status.textContent = 'No se pudo cargar la prueba de Libertadores.';
    mostrarNotificacion('error', '❌ Error al crear quiniela de prueba');
  }
}

async function importarFixtureDieciseisavosDesdeURL() {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const inputUrl = document.getElementById('admin-master-fixture-url');
  const status = document.getElementById('admin-master-fixture-status');
  const rawUrl = (inputUrl?.value || '').trim();

  if (!rawUrl) {
    if (status) status.textContent = 'Pega una URL válida del fixture.';
    mostrarNotificacion('warning', '⚠️ Falta URL del fixture');
    return;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL inválida');
    }
  } catch (error) {
    if (status) status.textContent = 'La URL no es válida.';
    mostrarNotificacion('error', '❌ URL inválida');
    return;
  }

  try {
    if (status) status.textContent = 'Descargando fixture…';

    const response = await fetch(rawUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`No se pudo descargar (${response.status})`);
    }

    const payload = await response.json();
    const partidos = extraerPartidosDesdePayloadFixture(payload);
    if (!partidos.length) {
      throw new Error('El JSON no contiene la lista de partidos');
    }

    const partidosSnap = await db.ref('partidos').once('value');
    const updates = {};
    let importados = 0;

    partidos.forEach((partidoInput) => {
      const id = (partidoInput.id || '').toString().trim().toLowerCase();
      if (!/^m\d{3}$/.test(id)) return;

      const fase = (partidoInput.fase || '').toString().toLowerCase();
      if (fase && fase !== 'dieciseisavos') return;

      const existente = partidosSnap.child(id).val() || {};
      const pais1 = (partidoInput.pais1 || existente.pais1 || '').toString().trim().toUpperCase();
      const pais2 = (partidoInput.pais2 || existente.pais2 || '').toString().trim().toUpperCase();
      if (!pais1 || !pais2) return;

      const resInput = partidoInput.resultado || {};
      const goles1 = Number.isFinite(Number(resInput.goles1)) ? Number(resInput.goles1) : null;
      const goles2 = Number.isFinite(Number(resInput.goles2)) ? Number(resInput.goles2) : null;

      const slotPais1 = (partidoInput.slot_pais1 || existente.slot_pais1 || (esSlotClasificacion(pais1) ? pais1 : null));
      const slotPais2 = (partidoInput.slot_pais2 || existente.slot_pais2 || (esSlotClasificacion(pais2) ? pais2 : null));

      updates[`partidos/${id}`] = {
        ...existente,
        id,
        fase: 'dieciseisavos',
        grupo: null,
        jornada: partidoInput.jornada ?? existente.jornada ?? null,
        fecha: (partidoInput.fecha || existente.fecha || '').toString(),
        hora: (partidoInput.hora || existente.hora || '').toString(),
        pais1,
        pais2,
        slot_pais1: slotPais1,
        slot_pais2: slotPais2,
        estado: (partidoInput.estado || existente.estado || 'programado').toString(),
        resultado: {
          goles1,
          goles2
        }
      };

      importados += 1;
    });

    if (!importados) {
      throw new Error('No hubo partidos válidos para importar');
    }

    await db.ref().update(updates);

    if (status) status.textContent = `Fixture importado: ${importados} partido(s) de dieciseisavos.`;
    mostrarNotificacion('success', `✅ Fixture cargado (${importados} partidos)`);
    cargarPartidosModuloMaestro();
    cargarDetallePartidoModuloMaestro();
  } catch (error) {
    const msg = (error && error.message) ? error.message : 'Error desconocido';
    if (status) status.textContent = `No se pudo importar fixture: ${msg}`;
    mostrarNotificacion('error', '❌ No se pudo importar el fixture');
  }
}

function obtenerGanadorEliminatoria(partido, goles1, goles2) {
  if (goles1 > goles2) return partido.pais1 || null;
  if (goles2 > goles1) return partido.pais2 || null;

  const resultado = partido.resultado_en_vivo || partido.resultado || {};
  const ganadorPenales = (resultado.ganador_penales || resultado.ganador || partido.ganador_codigo || '').toString().trim().toUpperCase();
  if (!ganadorPenales) return null;
  return ganadorPenales;
}

async function propagarGanadorPartidoEliminatoria(partidoId, partido, goles1, goles2) {
  if (esFaseGrupoOficial(partido.fase) || esFaseGrupoTest(partido.fase)) {
    return { propagado: false, motivo: 'fase_grupos' };
  }

  const ganador = obtenerGanadorEliminatoria(partido, goles1, goles2);
  if (!ganador) {
    return { propagado: false, motivo: 'empate_sin_ganador' };
  }

  const numero = Number.parseInt((partidoId || '').toString().replace(/^m/i, ''), 10);
  if (!Number.isFinite(numero)) {
    return { propagado: false, motivo: 'id_invalido' };
  }

  const tokenGanador = `W${numero}`;
  const partidosSnap = await db.ref('partidos').once('value');
  const updates = {};
  let reemplazos = 0;

  partidosSnap.forEach((child) => {
    const id = child.key;
    if (id === partidoId) return;

    const p = child.val() || {};
    const slot1 = (p.slot_pais1 || p.pais1 || '').toString().trim().toUpperCase();
    const slot2 = (p.slot_pais2 || p.pais2 || '').toString().trim().toUpperCase();

    if (slot1 === tokenGanador || (p.pais1 || '').toString().trim().toUpperCase() === tokenGanador) {
      updates[`partidos/${id}/pais1`] = ganador;
      updates[`partidos/${id}/slot_pais1`] = tokenGanador;
      reemplazos += 1;
    }

    if (slot2 === tokenGanador || (p.pais2 || '').toString().trim().toUpperCase() === tokenGanador) {
      updates[`partidos/${id}/pais2`] = ganador;
      updates[`partidos/${id}/slot_pais2`] = tokenGanador;
      reemplazos += 1;
    }
  });

  updates[`partidos/${partidoId}/ganador_codigo`] = ganador;
  updates[`partidos/${partidoId}/token_ganador`] = tokenGanador;
  await db.ref().update(updates);

  return { propagado: reemplazos > 0, ganador, tokenGanador, reemplazos };
}

function inicializarApp() {
  registrarEventListenersUI();

  // Verificar si usuario esta registrado en localStorage
  const usuarioGuardado = localStorage.getItem('usuarioId');
  if (usuarioGuardado) {
    cargarUsuario(usuarioGuardado);
  } else {
    mostrarLoginModal();
  }
}

function ocultarCapasIniciales() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.style.display = 'none';

  const loginScreenLegacy = document.getElementById('login-screen');
  if (loginScreenLegacy) {
    loginScreenLegacy.classList.remove('visible');
    loginScreenLegacy.style.display = 'none';
  }
}

function mostrarLoginModal() {
  ocultarCapasIniciales();

  const loginError = document.getElementById('modal-login-error');
  if (loginError) loginError.textContent = '';
  const modal = document.getElementById('modal-login');
  if (modal) modal.style.display = 'flex';
  actualizarVistaAccesoLogin('menu');
}

function esPerfilAdmin(usuario) {
  if (!usuario) return false;
  const rol = normalizarTextoRol(usuario.rol);

  if (rol === 'profesor' || rol === 'profesora' || rol === 'docente' || rol === 'admin' || rol === 'administrador' || rol === 'organizador' || rol === 'maestro' || rol === 'teacher') {
    return true;
  }

  if (usuario.admin === true || usuario.es_admin === true || usuario.profesor === true || usuario.docente === true) {
    return true;
  }

  return false;
}

function esUsuarioAdmin() {
  return esPerfilAdmin(currentUser);
}

function obtenerUsuarioIdSeguro() {
  const idActual = (currentUser && currentUser.id) ? String(currentUser.id).trim() : '';
  if (idActual) return idActual;

  const idLocal = (localStorage.getItem('usuarioId') || '').toString().trim();
  if (idLocal && idLocal !== 'undefined' && idLocal !== 'null') return idLocal;

  return '';
}

function actualizarVistaAccesoLogin(modo) {
  modoAccesoLogin = modo;

  const modal = document.getElementById('modal-login');
  const title = document.getElementById('modal-login-title');
  const subtitle = document.getElementById('modal-login-subtitle');
  const presentacion = document.getElementById('modal-login-presentacion');
  const panelAlumno = document.getElementById('modal-panel-alumno');
  const panelProfesor = document.getElementById('modal-panel-profesor');
  const fieldNombre = document.getElementById('modal-field-alumno-nombre');
  const fieldGrupo = document.getElementById('modal-field-alumno-grupo');
  const fieldSexo = document.getElementById('modal-field-alumno-sexo');
  const btnAlumno = document.getElementById('btn-modal-registrarme');
  const loginError = document.getElementById('modal-login-error');

  if (modal) modal.dataset.mode = modo;
  if (loginError) loginError.textContent = '';

  if (presentacion) presentacion.style.display = modo === 'menu' ? 'grid' : 'none';
  if (panelAlumno) panelAlumno.classList.toggle('active', modo === 'alumno_login' || modo === 'alumno_registro');
  if (panelProfesor) panelProfesor.classList.toggle('active', modo === 'profesor');

  if (modo === 'menu') {
    if (presentacion) {
      presentacion.classList.remove('animate');
      void presentacion.offsetWidth;
      presentacion.classList.add('animate');
    }
    if (title) title.textContent = 'Bienvenido';
    if (subtitle) subtitle.textContent = 'Selecciona cómo quieres entrar.';
    return;
  }

  if (presentacion) {
    presentacion.classList.remove('animate');
  }

  if (modo === 'alumno_login') {
    if (title) title.textContent = 'Ingresar como alumno';
    if (subtitle) subtitle.textContent = 'Ingresa únicamente tu código de invitación de 5 caracteres.';
    if (fieldNombre) fieldNombre.style.display = 'none';
    if (fieldGrupo) fieldGrupo.style.display = 'none';
    if (fieldSexo) fieldSexo.style.display = 'none';
    if (btnAlumno) btnAlumno.textContent = 'INGRESAR COMO ALUMNO';
    const codeInput = document.getElementById('modal-login-code');
    if (codeInput) codeInput.focus();
    return;
  }

  if (modo === 'alumno_registro') {
    if (title) title.textContent = 'Registro de alumno';
    if (subtitle) subtitle.textContent = 'Completa tus datos para registrarte por primera vez.';
    if (fieldNombre) fieldNombre.style.display = 'flex';
    if (fieldGrupo) fieldGrupo.style.display = 'flex';
    if (fieldSexo) fieldSexo.style.display = 'flex';
    if (btnAlumno) btnAlumno.textContent = 'REGISTRARME COMO ALUMNO';
    const codeInput = document.getElementById('modal-login-code');
    if (codeInput) codeInput.focus();
    return;
  }

  if (modo === 'profesor') {
    if (title) title.textContent = 'Ingreso de profesor (admin)';
    if (subtitle) subtitle.textContent = 'Ingresa tu código de invitación y la clave docente.';
    const profCode = document.getElementById('modal-prof-code');
    const profPass = document.getElementById('modal-prof-pass');
    if (profCode) profCode.focus();
    if (profPass) profPass.value = '';
  }
}

function ingresarComoProfesorDesdeModal() {
  const loginError = document.getElementById('modal-login-error');
  const codigo = normalizarCodigoInvitacion(document.getElementById('modal-prof-code')?.value || '');
  const clave = (document.getElementById('modal-prof-pass')?.value || '').trim();

  if (clave !== CLAVE_DOCENTE) {
    if (loginError) loginError.textContent = 'Clave docente incorrecta.';
    mostrarNotificacion('error', '❌ Clave docente incorrecta');
    return;
  }

  if (!esCodigoValido(codigo)) {
    if (loginError) loginError.textContent = 'El código debe tener 5 caracteres en mayúscula.';
    mostrarNotificacion('error', '❌ Código inválido');
    return;
  }

  db.ref(`codigos_invitacion/${codigo}`).once('value', (snap) => {
    if (!snap.exists()) {
      if (loginError) loginError.textContent = 'Código inválido. Verifica e intenta de nuevo.';
      mostrarNotificacion('error', '❌ Código inválido');
      return;
    }

    const codigoData = snap.val() || {};
    if (codigoData.usado !== true || !codigoData.usuario_id) {
      if (loginError) loginError.textContent = 'Este código no tiene un profesor/admin asociado.';
      mostrarNotificacion('error', '❌ Código sin cuenta de profesor');
      return;
    }

    db.ref(`usuarios/${codigoData.usuario_id}`).once('value', (userSnap) => {
      if (!userSnap.exists()) {
        if (loginError) loginError.textContent = 'No se encontró el usuario asociado al código.';
        mostrarNotificacion('error', '❌ Usuario no encontrado');
        return;
      }

      const usuario = userSnap.val() || {};
      if (!esPerfilAdmin(usuario)) {
        if (loginError) loginError.textContent = 'La cuenta no tiene permisos de profesor/admin.';
        mostrarNotificacion('error', '❌ Cuenta sin permisos de profesor/admin');
        return;
      }

      localStorage.setItem('usuarioId', usuario.id);
      currentUser = usuario;
      sessionStorage.setItem('acceso_docente', '1');
      registrarEventoSesion(usuario.id, 'codigo_profesor', codigo, { acceso_docente: true });
      if (loginError) loginError.textContent = '';

      const modal = document.getElementById('modal-login');
      if (modal) modal.style.display = 'none';
      mostrarNotificacion('success', `✅ Bienvenido profesor: ${usuario.nombre || 'Admin'}`);
      mostrarApp();
    });
  });
}

function escaparHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function etiquetaMetodoSesion(metodo) {
  const m = (metodo || '').toLowerCase();
  if (m === 'registro_inicial') return 'Registro inicial';
  if (m === 'codigo_nombre') return 'Código + nombre';
  if (m === 'recuperacion_codigo') return 'Recuperación por código';
  return metodo || 'N/A';
}

function actualizarPanelAuditoriaDocente() {
  const panel = document.getElementById('doc-session-audit-panel');
  const tbody = document.getElementById('doc-session-audit-tbody');
  if (!panel || !tbody) return;

  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#666;">Cargando accesos…</td></tr>';

  db.ref('usuarios').once('value', (snapshot) => {
    const accesos = [];

    snapshot.forEach((child) => {
      const usuario = child.val() || {};
      const rol = (usuario.rol || 'alumno').toLowerCase();
      if (rol !== 'alumno') return;

      const ultimoLogin = usuario.ultimo_login || {};
      const timestamp = Number(ultimoLogin.timestamp || 0);

      accesos.push({
        nombre: usuario.nombre || 'Usuario',
        grupo: usuario.grupo || '—',
        metodo: etiquetaMetodoSesion(ultimoLogin.metodo),
        fecha: timestamp ? new Date(timestamp).toLocaleString('es-MX') : 'Sin registro',
        codigo: ultimoLogin.codigo || '',
        timestamp
      });
    });

    accesos.sort((a, b) => b.timestamp - a.timestamp);

    if (!accesos.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#666;">No hay accesos registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = accesos.slice(0, 120).map((item) => {
      return `<tr>
        <td>${escaparHtml(item.nombre)}</td>
        <td>${escaparHtml(item.grupo)}</td>
        <td>${escaparHtml(item.metodo)}</td>
        <td>${escaparHtml(item.fecha)}</td>
        <td>${escaparHtml(item.codigo || '—')}</td>
      </tr>`;
    }).join('');
  });
}

function actualizarListaJugadoresPorGrupoModuloMaestro() {
  const contenedor = document.getElementById('admin-master-players-by-group');
  if (!contenedor) return;

  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    contenedor.innerHTML = '';
    return;
  }

  contenedor.innerHTML = '<div style="padding:14px;color:#666;text-align:center;">Cargando jugadores por grupo…</div>';

  db.ref('usuarios').once('value', (snapshot) => {
    const gruposOrden = ['2A', '2C', '2D', '2F', 'Sin Grupo'];
    const grupos = new Map(gruposOrden.map((grupo) => [grupo, []]));

    snapshot.forEach((child) => {
      const usuario = child.val() || {};
      const rol = (usuario.rol || 'alumno').toLowerCase();
      if (rol !== 'alumno') return;

      const grupoNormalizado = formatearGrupoUsuario(usuario.grupo).replace(/^Grupo\s+/i, '');
      const grupoClave = grupos.has(grupoNormalizado) ? grupoNormalizado : 'Sin Grupo';
      grupos.get(grupoClave).push({
        id: child.key,
        nombre: usuario.nombre || 'Usuario',
        codigo: usuario.codigo || usuario.codigo_invitacion || '—',
        sexo: usuario.sexo || '—'
      });
    });

    const bloques = [];
    grupos.forEach((jugadores, grupo) => {
      jugadores.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      bloques.push(`
        <section style="border:1px solid #E2E5E2;border-radius:12px;padding:12px;background:#FAFAF8;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;">
            <h4 style="margin:0;color:#1F2A63;font-size:1rem;">${grupo === 'Sin Grupo' ? 'Sin Grupo' : `Grupo ${grupo}`}</h4>
            <span style="font-weight:700;color:#666;">${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'}</span>
          </div>
          ${jugadores.length ? `
            <div style="display:grid;gap:8px;">
              ${jugadores.map((jugador) => `
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 12px;background:#fff;border:1px solid #E8EBE8;border-radius:10px;">
                  <div>
                    <div style="font-weight:700;color:#333;">${escaparHtml(jugador.nombre)}</div>
                    <div style="font-size:0.88rem;color:#666;">Código ${escaparHtml(jugador.codigo)} · ${escaparHtml(jugador.sexo)}</div>
                  </div>
                  <button
                    class="btn-admin-master-delete-player"
                    data-user-id="${escaparHtml(jugador.id)}"
                    style="border:1px solid #E61D25;background:#fff;color:#E61D25;padding:7px 10px;border-radius:8px;cursor:pointer;font-weight:700;"
                  >Eliminar</button>
                </div>
              `).join('')}
            </div>
          ` : '<div style="color:#888;font-size:0.92rem;">No hay jugadores en este grupo.</div>'}
        </section>
      `);
    });

    contenedor.innerHTML = bloques.join('');

    const botonesEliminar = contenedor.querySelectorAll('.btn-admin-master-delete-player');
    botonesEliminar.forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-user-id') || '';
        eliminarJugadorModuloMaestro(userId);
      });
    });
  });
}

function esRolAdmin(rol) {
  const valor = (rol || '').toString().toLowerCase();
  return valor === 'profesor' || valor === 'admin' || valor === 'organizador';
}

function esUsuarioBaneadoChat(usuarioId) {
  return db.ref(`chat_baneados/${usuarioId}/activo`).once('value')
    .then((snap) => snap.val() === true)
    .catch(() => false);
}

function actualizarPanelBaneosChatDocente() {
  const contenedor = document.getElementById('admin-master-chat-bans');
  const status = document.getElementById('admin-master-chat-ban-status');
  if (!contenedor || !status) return;

  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    contenedor.innerHTML = '';
    status.textContent = 'Solo visible para docente/admin.';
    return;
  }

  contenedor.innerHTML = '<div style="padding:10px;color:#666;text-align:center;">Cargando baneos…</div>';
  db.ref('chat_baneados').once('value', (snapshot) => {
    const baneados = [];
    snapshot.forEach((child) => {
      const item = child.val() || {};
      if (item.activo !== true) return;
      baneados.push({
        usuarioId: child.key,
        nombre: item.nombre || 'Usuario',
        grupo: item.grupo || '',
        motivo: item.motivo || 'Sin motivo',
        fecha: item.timestamp ? new Date(item.timestamp).toLocaleString('es-MX') : 'Sin fecha'
      });
    });

    if (!baneados.length) {
      status.textContent = 'Sin baneos activos.';
      contenedor.innerHTML = '<div style="color:#888;font-size:0.92rem;">No hay jugadores baneados del chat.</div>';
      return;
    }

    status.textContent = `Baneos activos: ${baneados.length}`;
    contenedor.innerHTML = baneados.map((item) => {
      const nombreVisible = formatearNombreConGrupo(item.grupo, item.nombre);
      return `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 12px;background:#fff;border:1px solid #E8EBE8;border-radius:10px;">
          <div>
            <div style="font-weight:700;color:#333;">${escaparHtml(nombreVisible)}</div>
            <div style="font-size:0.86rem;color:#666;">${escaparHtml(item.motivo)} · ${escaparHtml(item.fecha)}</div>
          </div>
          <button
            class="btn-admin-chat-unban"
            data-user-id="${escaparHtml(item.usuarioId)}"
            style="border:1px solid #2A398D;background:#fff;color:#2A398D;padding:7px 10px;border-radius:8px;cursor:pointer;font-weight:700;"
          >Quitar baneo</button>
        </div>
      `;
    }).join('');

    const botones = contenedor.querySelectorAll('.btn-admin-chat-unban');
    botones.forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-user-id') || '';
        desbanearJugadorDelChat(userId);
      });
    });
  });
}

async function banearJugadorDelChat(usuarioId, motivo = 'Baneo manual por docente/admin') {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const id = (usuarioId || '').toString().trim();
  if (!id) return;

  if (currentUser && currentUser.id === id) {
    mostrarNotificacion('warning', '⚠️ No puedes banear tu propio usuario');
    return;
  }

  const userSnap = await db.ref(`usuarios/${id}`).once('value');
  if (!userSnap.exists()) {
    mostrarNotificacion('error', '❌ Usuario no encontrado');
    return;
  }

  const usuario = userSnap.val() || {};
  if (esRolAdmin(usuario.rol)) {
    mostrarNotificacion('warning', '⚠️ No se puede banear a un admin/docente');
    return;
  }

  const nombreVisible = formatearNombreConGrupo(usuario.grupo, usuario.nombre || 'Usuario');
  const motivoCapturado = window.prompt(`Motivo de baneo para ${nombreVisible}:`, motivo || '');
  if (motivoCapturado === null) return;
  const motivoLimpio = motivoCapturado.toString().trim();
  if (motivoLimpio.length < 3) {
    mostrarNotificacion('warning', '⚠️ Debes escribir un motivo de al menos 3 caracteres');
    return;
  }

  const confirmar = window.confirm(`¿Confirmas banear del chat a ${nombreVisible}?`);
  if (!confirmar) return;

  await db.ref(`chat_baneados/${id}`).set({
    activo: true,
    usuario_id: id,
    nombre: usuario.nombre || 'Usuario',
    grupo: usuario.grupo || '',
    motivo: motivoLimpio,
    timestamp: Date.now(),
    baneado_por: currentUser ? currentUser.id : 'sistema'
  });

  mostrarNotificacion('success', `✅ ${nombreVisible} fue baneado del chat`);
  actualizarPanelBaneosChatDocente();
}

async function desbanearJugadorDelChat(usuarioId) {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const id = (usuarioId || '').toString().trim();
  if (!id) return;

  const confirmar = window.confirm('¿Quitar baneo de chat a este jugador?');
  if (!confirmar) return;

  await db.ref(`chat_baneados/${id}`).update({
    activo: false,
    desbaneado_por: currentUser ? currentUser.id : 'sistema',
    desbaneado_timestamp: Date.now()
  });

  mostrarNotificacion('success', '✅ Baneo de chat removido');
  actualizarPanelBaneosChatDocente();
}

async function eliminarJugadorModuloMaestro(usuarioId) {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const id = (usuarioId || '').toString().trim();
  if (!id) {
    mostrarNotificacion('error', '❌ Usuario inválido');
    return;
  }

  const status = document.getElementById('admin-master-player-status');

  try {
    const userSnap = await db.ref(`usuarios/${id}`).once('value');
    if (!userSnap.exists()) {
      if (status) status.textContent = 'El jugador ya no existe.';
      actualizarListaJugadoresPorGrupoModuloMaestro();
      return;
    }

    const usuario = userSnap.val() || {};
    const nombre = usuario.nombre || 'Jugador';
    const codigo = normalizarCodigoInvitacion(usuario.codigo_invitacion || usuario.codigo || '');

    const confirmar = window.confirm(`¿Eliminar a ${nombre}? Esta acción borrará su cuenta y sus predicciones.`);
    if (!confirmar) return;

    const updates = {
      [`usuarios/${id}`]: null,
      [`predicciones/${id}`]: null
    };

    if (codigo) {
      updates[`codigos_invitacion/${codigo}/usado`] = false;
      updates[`codigos_invitacion/${codigo}/usuario_id`] = null;
    }

    await db.ref().update(updates);

    if (status) status.textContent = `Jugador eliminado: ${nombre}`;
    mostrarNotificacion('success', `✅ Jugador eliminado: ${nombre}`);

    actualizarListaJugadoresPorGrupoModuloMaestro();
    actualizarPanelAuditoriaDocente();

    if (currentUser && currentUser.id === id) {
      cerrarSesion();
    }
  } catch (error) {
    if (status) status.textContent = 'No se pudo eliminar el jugador.';
    mostrarNotificacion('error', '❌ Error al eliminar jugador');
  }
}

function actualizarEstadoMaestroResultados(texto, tipo = 'info') {
  const el = document.getElementById('admin-master-status');
  if (!el) return;

  const colores = {
    info: '#2A398D',
    success: '#3CAC3B',
    warning: '#7A5B00',
    error: '#E61D25'
  };

  el.textContent = texto;
  el.style.color = colores[tipo] || colores.info;
}

function cargarPartidosModuloMaestro() {
  const panel = document.getElementById('admin-master-panel');
  const select = document.getElementById('admin-master-match-select');
  if (!panel || !select) return;

  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  db.ref('partidos').once('value', (snapshot) => {
    const partidos = [];
    snapshot.forEach((child) => {
      partidos.push({ id: child.key, ...child.val() });
    });

    partidos.sort((a, b) => {
      const da = `${a.fecha || '9999-99-99'} ${a.hora || '99:99'} ${a.id || ''}`;
      const dbb = `${b.fecha || '9999-99-99'} ${b.hora || '99:99'} ${b.id || ''}`;
      return da.localeCompare(dbb);
    });

    const seleccionadoActual = select.value;
    const options = ['<option value="">Selecciona partido</option>'];
    partidos.forEach((p) => {
      const estado = p.estado || 'programado';
      const titulo = `${p.id} · ${p.fecha || '--'} ${p.hora || '--:--'} · ${p.pais1 || 'Equipo 1'} vs ${p.pais2 || 'Equipo 2'} · ${estado}`;
      options.push(`<option value="${escaparHtml(p.id)}">${escaparHtml(titulo)}</option>`);
    });

    select.innerHTML = options.join('');
    if (seleccionadoActual && partidos.some((p) => p.id === seleccionadoActual)) {
      select.value = seleccionadoActual;
    }
  });
}

function cargarDetallePartidoModuloMaestro() {
  const select = document.getElementById('admin-master-match-select');
  const input1 = document.getElementById('admin-master-goles1');
  const input2 = document.getElementById('admin-master-goles2');
  const resumen = document.getElementById('admin-master-summary');
  if (!select || !input1 || !input2 || !resumen) return;

  const partidoId = select.value;
  if (!partidoId) {
    resumen.textContent = 'Selecciona un partido para cargar sus datos.';
    input1.value = '';
    input2.value = '';
    actualizarEstadoMaestroResultados('Esperando selección de partido.', 'info');
    return;
  }

  db.ref(`partidos/${partidoId}`).once('value', (snap) => {
    if (!snap.exists()) {
      actualizarEstadoMaestroResultados('Partido no encontrado.', 'error');
      return;
    }

    const partido = snap.val() || {};
    const resultado = partido.resultado_en_vivo || {};

    input1.value = Number.isFinite(resultado.goles1) ? resultado.goles1 : '';
    input2.value = Number.isFinite(resultado.goles2) ? resultado.goles2 : '';

    const estado = partido.estado || 'programado';
    const calculado = partido.puntos_calculados === true ? 'Puntos calculados' : 'Sin cálculo de puntos';
    resumen.textContent = `${partido.pais1 || 'Equipo 1'} vs ${partido.pais2 || 'Equipo 2'} · Estado: ${estado} · ${calculado}`;
    actualizarEstadoMaestroResultados('Partido cargado. Puedes guardar marcador o finalizar.', 'info');
  });
}

function guardarResultadoModuloMaestro(finalizar = false) {
  if (!esUsuarioAdmin()) {
    actualizarEstadoMaestroResultados('Solo docente/admin puede editar resultados.', 'error');
    return;
  }

  const select = document.getElementById('admin-master-match-select');
  const input1 = document.getElementById('admin-master-goles1');
  const input2 = document.getElementById('admin-master-goles2');
  if (!select || !input1 || !input2) return;

  const partidoId = select.value;
  const goles1 = parseInt(input1.value, 10);
  const goles2 = parseInt(input2.value, 10);

  if (!partidoId) {
    actualizarEstadoMaestroResultados('Selecciona un partido.', 'warning');
    return;
  }

  if (Number.isNaN(goles1) || Number.isNaN(goles2) || goles1 < 0 || goles2 < 0) {
    actualizarEstadoMaestroResultados('Ingresa goles válidos (0 o más).', 'warning');
    return;
  }

  db.ref(`partidos/${partidoId}`).once('value', (snap) => {
    if (!snap.exists()) {
      actualizarEstadoMaestroResultados('Partido no encontrado.', 'error');
      return;
    }

    const partido = snap.val() || {};
    const updates = {
      resultado_en_vivo: {
        goles1,
        goles2,
        timestamp: Date.now(),
        actualizado_por: currentUser ? currentUser.id : 'sistema'
      },
      resultado: `${goles1}-${goles2}`,
      ultima_actualizacion_resultado: Date.now()
    };

    if (finalizar) {
      updates.estado = 'finalizado';
    }

    const procesarDespuesDeGuardar = () => {

      if (!finalizar) {
        actualizarEstadoMaestroResultados('Marcador guardado correctamente.', 'success');
        mostrarNotificacion('success', '✅ Marcador guardado');
        cargarPartidosModuloMaestro();
        cargarDetallePartidoModuloMaestro();
        return;
      }

      if (partido.puntos_calculados === true) {
        if (esFaseGrupoOficial(partido.fase) || esFaseGrupoTest(partido.fase)) {
          const opcionesTabla = esFaseGrupoTest(partido.fase)
            ? { fases: Array.from(FASES_GRUPO_TEST), rutaDestino: 'clasificaciones_grupo_test' }
            : { fases: Array.from(FASES_GRUPO_OFICIAL), rutaDestino: 'clasificaciones_grupo' };

          calcularClasificacionesDeGrupos(opcionesTabla)
            .then((clasificaciones) => {
              renderizarClasificacionesDeGrupos(clasificaciones);
            })
            .catch(() => {
              actualizarEstadoMaestroResultados('Partido finalizado, pero no se pudo refrescar la tabla de posiciones.', 'warning');
            });
        }

        actualizarEstadoMaestroResultados('Partido finalizado. Los puntos ya estaban calculados.', 'warning');
        mostrarNotificacion('warning', '⚠️ Puntos ya calculados anteriormente para este partido');
        cargarPartidosModuloMaestro();
        cargarDetallePartidoModuloMaestro();
        return;
      }

      actualizarPuntosPartidoMejorado(partidoId, goles1, goles2);
      db.ref(`partidos/${partidoId}/puntos_calculados`).set(true);
      db.ref(`partidos/${partidoId}/puntos_calculados_timestamp`).set(Date.now());

      if (esFaseGrupoOficial(partido.fase) || esFaseGrupoTest(partido.fase)) {
        const opcionesTabla = esFaseGrupoTest(partido.fase)
          ? { fases: Array.from(FASES_GRUPO_TEST), rutaDestino: 'clasificaciones_grupo_test' }
          : { fases: Array.from(FASES_GRUPO_OFICIAL), rutaDestino: 'clasificaciones_grupo' };

        calcularClasificacionesDeGrupos(opcionesTabla)
          .then((clasificaciones) => {
            renderizarClasificacionesDeGrupos(clasificaciones);
          })
          .catch(() => {
            actualizarEstadoMaestroResultados('Partido finalizado, pero no se pudo refrescar la tabla de posiciones.', 'warning');
          });
      }

      propagarGanadorPartidoEliminatoria(partidoId, partido, goles1, goles2)
        .then((info) => {
          if (!info || !info.propagado) return;
          actualizarEstadoMaestroResultados(`Partido finalizado, puntos calculados y ganador ${info.ganador} enviado a la siguiente llave.`, 'success');
          mostrarNotificacion('success', `✅ ${info.ganador} avanzó automáticamente en el bracket`);
          cargarPartidosModuloMaestro();
          cargarDetallePartidoModuloMaestro();
        })
        .catch(() => {
          mostrarNotificacion('warning', '⚠️ El partido se finalizó, pero no se pudo propagar al siguiente cruce');
        });

      actualizarEstadoMaestroResultados('Partido finalizado y puntos calculados.', 'success');
      mostrarNotificacion('success', '✅ Partido finalizado y puntos calculados');
      cargarPartidosModuloMaestro();
      cargarDetallePartidoModuloMaestro();
    };

    actualizarNodoConFallback(`partidos/${partidoId}`, updates)
      .then((meta) => {
        if (meta && meta.via === 'rest') {
          mostrarNotificacion('warning', '⚠️ Conexión inestable: resultado guardado por canal alterno');
        }
        procesarDespuesDeGuardar();
      })
      .catch(() => {
        actualizarEstadoMaestroResultados('Error al guardar resultado. Revisa tu conexión.', 'error');
      });
  });
}

async function generarCodigoJugadorMaestro() {
  const inputCodigo = document.getElementById('admin-master-player-code');
  const status = document.getElementById('admin-master-player-status');

  if (!inputCodigo) return;

  try {
    const codigo = await reservarCodigoInvitacionNuevo('Sin Grupo');
    inputCodigo.value = codigo;
    if (status) status.textContent = `Código reservado: ${codigo}`;
    mostrarNotificacion('success', `✅ Código generado: ${codigo}`);
  } catch (error) {
    if (status) status.textContent = 'No se pudo generar el código.';
    mostrarNotificacion('error', '❌ No se pudo generar un código único');
  }
}

async function agregarJugadorModuloMaestro() {
  if (!esUsuarioAdmin() || !tieneAccesoDocente()) {
    mostrarNotificacion('error', '❌ Debes desbloquear el módulo docente');
    return;
  }

  const nombre = document.getElementById('admin-master-player-name')?.value?.trim() || '';
  const grupo = document.getElementById('admin-master-player-group')?.value || '';
  const sexoRaw = document.getElementById('admin-master-player-sex')?.value || '';
  const codigoInput = document.getElementById('admin-master-player-code');
  const status = document.getElementById('admin-master-player-status');
  const sexo = sexoRaw === 'F' ? 'femenino' : 'masculino';

  if (!nombre) {
    if (status) status.textContent = 'Escribe el nombre del jugador.';
    mostrarNotificacion('error', '❌ El nombre es obligatorio');
    return;
  }

  if (!grupo) {
    if (status) status.textContent = 'Selecciona un grupo o Sin Grupo.';
    mostrarNotificacion('error', '❌ El grupo es obligatorio');
    return;
  }

  try {
    const codigo = await reservarCodigoInvitacionNuevo(grupo);
    if (codigoInput) codigoInput.value = codigo;
    if (status) status.textContent = `Código reservado: ${codigo}`;

    const existe = await db.ref(`codigos_invitacion/${codigo}`).once('value');
    if (!existe.exists()) {
      await db.ref(`codigos_invitacion/${codigo}`).set({
        usado: false,
        usuario_id: null,
        grupo_sugerido: grupo === 'Sin Grupo' ? null : grupo,
        creado_en: Date.now()
      });
    }

    const creado = await registrarUsuario(codigo, nombre, grupo, sexo, { iniciarSesion: false });
    if (!creado) {
      throw new Error('No se pudo crear el jugador');
    }

    if (status) status.textContent = `Jugador agregado con código ${codigo}`;
    mostrarNotificacion('success', `✅ Jugador creado: ${nombre} (${codigo})`);
    actualizarListaJugadoresPorGrupoModuloMaestro();
  } catch (error) {
    if (status) status.textContent = 'No se pudo agregar el jugador.';
    mostrarNotificacion('error', '❌ No se pudo agregar el jugador');
  }
}

function registrarEventoSesion(usuarioId, metodo, codigo = '', extra = {}) {
  if (!usuarioId) return;

  const evento = {
    timestamp: Date.now(),
    metodo,
    codigo: codigo || '',
    ...extra
  };

  db.ref(`usuarios/${usuarioId}/auditoria_sesion`).push(evento);
  db.ref(`usuarios/${usuarioId}/ultimo_login`).set(evento);

  if (currentUser && currentUser.id === usuarioId) {
    currentUser.ultimo_login = evento;
  }
}

function iniciarSesionExistente(codigo, nombre) {
  iniciarSesionSoloConCodigo(codigo);
}

function recuperarSesionConCodigoUsado(codigoNormalizado, loginError) {
  db.ref(`codigos_invitacion/${codigoNormalizado}`).once('value', (snap) => {
    if (!snap.exists()) {
      if (loginError) loginError.textContent = 'Código inválido. Verifica e intenta de nuevo.';
      mostrarNotificacion('error', '❌ Código inválido');
      return;
    }

    const codigoData = snap.val() || {};
    if (codigoData.usado !== true) {
      if (loginError) loginError.textContent = 'Este código aún no tiene una cuenta registrada.';
      mostrarNotificacion('error', '❌ Código sin usuario registrado');
      return;
    }

    if (codigoData.usuario_id) {
      iniciarSesionSoloConCodigo(codigoNormalizado);
      return;
    }

    // Fallback: recover link if code is marked used but usuario_id is missing.
    db.ref('usuarios')
      .orderByChild('codigo_invitacion')
      .equalTo(codigoNormalizado)
      .limitToFirst(1)
      .once('value', (userSnap) => {
        if (!userSnap.exists()) {
          if (loginError) loginError.textContent = 'Código usado sin usuario asociado. Contacta al docente.';
          mostrarNotificacion('error', '❌ Código usado sin usuario asociado');
          return;
        }

        const [usuarioId] = Object.keys(userSnap.val() || {});
        if (!usuarioId) {
          if (loginError) loginError.textContent = 'No se pudo recuperar la sesión con este código.';
          mostrarNotificacion('error', '❌ No se pudo recuperar la sesión');
          return;
        }

        db.ref(`codigos_invitacion/${codigoNormalizado}/usuario_id`).set(usuarioId, (err) => {
          if (err) {
            if (loginError) loginError.textContent = 'No se pudo reparar el vínculo del código.';
            mostrarNotificacion('error', '❌ Error al reparar código');
            return;
          }

          iniciarSesionSoloConCodigo(codigoNormalizado);
        });
      });
  });
}

function procesarEntradaLoginRegistro(codigo, nombre, grupo, sexoRaw) {
  const loginError = document.getElementById('modal-login-error');
  const codigoNormalizado = normalizarCodigoInvitacion(codigo);
  const grupoLimpio = (grupo || '').toString().trim();

  if (!esCodigoValido(codigoNormalizado)) {
    if (loginError) loginError.textContent = 'El código debe tener 5 caracteres en mayúscula.';
    mostrarNotificacion('error', '❌ Código inválido');
    return;
  }

  db.ref(`codigos_invitacion/${codigoNormalizado}`).once('value', (snap) => {
    if (!snap.exists()) {
      if (loginError) loginError.textContent = 'Código inválido. Verifica e intenta de nuevo.';
      mostrarNotificacion('error', '❌ Código inválido');
      return;
    }

    const codigoData = snap.val() || {};
    const codigoMarcadoComoUsado = codigoData.usado === true;

    // If the code is already used, always recover session first.
    if (codigoMarcadoComoUsado) {
      recuperarSesionConCodigoUsado(codigoNormalizado, loginError);
      return;
    }

    if (!grupoLimpio) {
      if (loginError) loginError.textContent = 'Selecciona grupo para registro nuevo.';
      mostrarNotificacion('warning', '⚠️ Para registro nuevo debes seleccionar grupo');
      return;
    }

    const sexo = sexoRaw === 'F' ? 'femenino' : 'masculino';
    registrarUsuario(codigoNormalizado, nombre, grupoLimpio, sexo);
  });
}

function iniciarSesionSoloConCodigo(codigo) {
  const loginError = document.getElementById('modal-login-error');
  const codigoNormalizado = normalizarCodigoInvitacion(codigo);

  if (!esCodigoValido(codigoNormalizado)) {
    if (loginError) loginError.textContent = 'El código debe tener 5 caracteres en mayúscula.';
    mostrarNotificacion('error', '❌ Código obligatorio para recuperar sesión');
    return;
  }

  db.ref(`codigos_invitacion/${codigoNormalizado}`).once('value', (snap) => {
    if (!snap.exists()) {
      if (loginError) loginError.textContent = 'Código inválido. Verifica e intenta de nuevo.';
      mostrarNotificacion('error', '❌ Código inválido');
      return;
    }

    const codigoData = snap.val() || {};
    if (codigoData.usado !== true) {
      if (loginError) loginError.textContent = 'Este código aún no tiene una cuenta registrada.';
      mostrarNotificacion('error', '❌ Código sin usuario registrado');
      return;
    }

    if (!codigoData.usuario_id) {
      recuperarSesionConCodigoUsado(codigoNormalizado, loginError);
      return;
    }

    db.ref(`usuarios/${codigoData.usuario_id}`).once('value', (userSnap) => {
      if (!userSnap.exists()) {
        if (loginError) loginError.textContent = 'No se encontró el usuario asociado al código.';
        mostrarNotificacion('error', '❌ Usuario no encontrado');
        return;
      }

      const usuario = userSnap.val();
      localStorage.setItem('usuarioId', usuario.id);
      currentUser = usuario;
      registrarEventoSesion(usuario.id, 'recuperacion_codigo', codigoNormalizado, { recuperacion: true });
      if (loginError) loginError.textContent = '';

      mostrarNotificacion('success', `✅ Sesión recuperada: ${usuario.nombre}`);
      document.getElementById('modal-login').style.display = 'none';
      mostrarApp();
    });
  });
}

function registrarUsuario(codigo, nombre, grupo, sexo, opciones = {}) {
  const iniciarSesion = opciones.iniciarSesion !== false;
  const loginError = document.getElementById('modal-login-error');
  if (loginError) loginError.textContent = '';

  const codigoNormalizado = normalizarCodigoInvitacion(codigo);
  const nombreNormalizado = (nombre || '').toString().trim();

  if (!esCodigoValido(codigoNormalizado)) {
    if (loginError) loginError.textContent = 'El código debe tener 5 caracteres en mayúscula.';
    mostrarNotificacion('error', '❌ Código inválido');
    return Promise.resolve(false);
  }

  if (!nombre || !grupo || !sexo) {
    if (loginError) loginError.textContent = 'Todos los campos son obligatorios.';
    mostrarNotificacion('error', '❌ Todos los campos son obligatorios');
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    // Validar codigo en Firebase
    db.ref(`codigos_invitacion/${codigoNormalizado}`).once('value', (snap) => {
      if (!snap.exists()) {
        if (loginError) loginError.textContent = 'Código inválido. Verifica e intenta de nuevo.';
        mostrarNotificacion('error', '❌ Código inválido');
        resolve(false);
        return;
      }

      const codigoData = snap.val() || {};
      if (codigoData.usado === true) {
        if (iniciarSesion) {
          recuperarSesionConCodigoUsado(codigoNormalizado, loginError);
        } else {
          if (loginError) loginError.textContent = 'El código ya fue utilizado por otro usuario.';
          mostrarNotificacion('error', '❌ Código ya utilizado');
        }
        resolve(false);
        return;
      }

      // Crear usuario nuevo
      const usuarioId = 'usuario_' + Date.now();
      const usuarioData = {
        id: usuarioId,
        nombre: nombreNormalizado,
        grupo: grupo,
        sexo: sexo,
        rol: 'alumno',
        codigo_invitacion: codigoNormalizado,
        fecha_registro: Date.now(),
        estadisticas: {
          puntos_totales: 0,
          aciertos_5pts: 0,
          aciertos_3pts: 0,
          aciertos_1pt: 0,
          fallos: 0,
          partidos_predichos: 0,
          porcentaje_aciertos: 0,
          badges: [],
          racha_actual: 0,
          racha_maxima: 0,
          mensajes_chat: 0
        }
      };

      Promise.all([
        db.ref(`usuarios/${usuarioId}`).set(usuarioData),
        db.ref(`codigos_invitacion/${codigoNormalizado}/usado`).set(true),
        db.ref(`codigos_invitacion/${codigoNormalizado}/usuario_id`).set(usuarioId)
      ])
        .then(() => {
          if (iniciarSesion) {
            localStorage.setItem('usuarioId', usuarioId);
            currentUser = usuarioData;
            registrarEventoSesion(usuarioId, 'registro_inicial', codigoNormalizado);

            mostrarNotificacion('success', '✅ ¡Bienvenido! Registro completado');
            document.getElementById('modal-login').style.display = 'none';
            mostrarApp();
          }
          resolve(true);
        })
        .catch(() => {
          mostrarNotificacion('error', '❌ No se pudo completar el registro');
          resolve(false);
        });
    });
  });
}

function cargarUsuario(usuarioId) {
  db.ref(`usuarios/${usuarioId}`).once('value', (snap) => {
    if (snap.exists()) {
      currentUser = snap.val();
      mostrarApp();
    } else {
      localStorage.removeItem('usuarioId');
      mostrarLoginModal();
    }
  });
}

function mostrarNotificacion(tipo, mensaje, duracion = 5000) {
  const container = document.getElementById('notifications-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = mensaje;

  const colores = {
    success: '#3CAC3B',
    error: '#E61D25',
    info: '#2A398D',
    warning: '#CDDC39'
  };

  toast.style.backgroundColor = colores[tipo] || '#2A398D';
  toast.style.color = '#FFFFFF';
  toast.style.padding = '16px';
  toast.style.borderRadius = '8px';
  toast.style.marginBottom = '12px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

function mostrarApp() {
  ocultarCapasIniciales();

  const modalLogin = document.getElementById('modal-login');
  if (modalLogin) modalLogin.style.display = 'none';

  const appShell = document.getElementById('app-shell');
  if (appShell) {
    appShell.classList.add('visible');
    appShell.style.display = 'flex';
  }

  const appContent = document.getElementById('app-content');
  if (appContent) appContent.style.display = 'block';

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    // Bind directly each time app is shown so logout always works.
    btnLogout.onclick = (e) => {
      if (e) e.preventDefault();
      cerrarSesion();
    };
  }

  if (currentUser) {
    if (esUsuarioAdmin()) {
      sessionStorage.setItem('acceso_docente', '1');
    }

    const btnMasterQuick = document.getElementById('btn-master-quick-access');
    if (btnMasterQuick) {
      btnMasterQuick.style.display = esUsuarioAdmin() ? 'inline-flex' : 'none';
    }

    const headerUserName = document.getElementById('header-username');
    const headerUserGroup = document.getElementById('header-usergroup');
    const profileName = document.getElementById('profile-name');
    const profileGroup = document.getElementById('profile-group');
    const profileRole = document.getElementById('profile-role');

    if (headerUserName) headerUserName.textContent = currentUser.nombre || 'Usuario';
    if (headerUserGroup) headerUserGroup.textContent = formatearGrupoUsuario(currentUser.grupo);
    if (profileName) profileName.textContent = currentUser.nombre || 'Usuario';
    if (profileGroup) profileGroup.textContent = formatearGrupoUsuario(currentUser.grupo);
    if (profileRole) {
      const rol = (currentUser.rol || 'alumno').toString();
      profileRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
    }
  }

  configurarBotonPartidoEnVivoAdmin();
  registrarEventListenersUI();
  mostrarPerfil();
  cargarPartidos();
  cargarMensajes();
}

function configurarBotonPartidoEnVivoAdmin() {
  const btnLive = document.getElementById('btn-live');
  if (!btnLive) return;

  btnLive.classList.remove('visible');
  btnLive.onclick = null;

  if (!esUsuarioAdmin()) return;

  btnLive.classList.add('visible');
  btnLive.innerHTML = '<span>🔴</span> INICIAR EN VIVO';
  btnLive.onclick = seleccionarPartidoEIniciarEnVivo;
}

function seleccionarPartidoEIniciarEnVivo() {
  db.ref('partidos').once('value', (snapshot) => {
    const partidos = [];
    snapshot.forEach((child) => {
      partidos.push({ id: child.key, ...child.val() });
    });

    if (!partidos.length) {
      mostrarNotificacion('error', '❌ No hay partidos disponibles');
      return;
    }

    const yaEnVivo = partidos.find((p) => p.estado === 'en_vivo');
    if (yaEnVivo) {
      iniciarPartidoEnVivo(yaEnVivo.id);
      return;
    }

    const candidatos = partidos.filter((p) => !p.estado || p.estado === 'pendiente' || p.estado === 'programado' || p.estado === 'proximo');

    if (candidatos.length === 1) {
      iniciarPartidoEnVivo(candidatos[0].id);
      mostrarNotificacion('success', `✅ Partido iniciado: ${candidatos[0].id}`);
      return;
    }

    const listado = candidatos.slice(0, 10)
      .map((p) => `${p.id}: ${p.pais1 || 'Equipo 1'} vs ${p.pais2 || 'Equipo 2'}`)
      .join('\n');
    const sugerido = candidatos[0] ? candidatos[0].id : partidos[0].id;
    const partidoIdElegido = window.prompt(`Ingresa el ID del partido a iniciar en vivo:\n\n${listado}`, sugerido);
    if (!partidoIdElegido) return;

    const partidoExiste = partidos.find((p) => p.id === partidoIdElegido);
    if (!partidoExiste) {
      mostrarNotificacion('error', '❌ ID de partido no encontrado');
      return;
    }

    iniciarPartidoEnVivo(partidoIdElegido);
    mostrarNotificacion('success', `✅ Partido iniciado: ${partidoIdElegido}`);
  });
}

function cerrarSesion() {
  localStorage.removeItem('usuarioId');
  localStorage.removeItem('quinielaSesion');
  currentUser = null;
  sessionStorage.removeItem('acceso_docente');

  const appShell = document.getElementById('app-shell');
  if (appShell) {
    appShell.classList.remove('visible');
    appShell.style.display = 'none';
  }

  const appContent = document.getElementById('app-content');
  if (appContent) appContent.style.display = 'none';

  mostrarLoginModal();
}

window.onLogout = cerrarSesion;

// Inicializar cuando carga la pagina
window.addEventListener('DOMContentLoaded', inicializarApp);

// ============================================================
// PARTE 2: Puntos y Rankings
// ============================================================

function calcularPuntos(goles1_pred, goles2_pred, goles1_real, goles2_real) {
  // Determinar ganador predicho
  const ganador_pred = goles1_pred > goles2_pred ? 1 : goles1_pred < goles2_pred ? 2 : 0;

  // Determinar ganador real
  const ganador_real = goles1_real > goles2_real ? 1 : goles1_real < goles2_real ? 2 : 0;

  // Si ganador incorrecto: 0 puntos
  if (ganador_pred !== ganador_real) return 0;

  // Contar goles exactos
  const goles_exactos = (goles1_pred === goles1_real ? 1 : 0) + (goles2_pred === goles2_real ? 1 : 0);

  // Retornar puntos segun goles exactos
  if (goles_exactos === 2) return 5; // +5 puntos (acierto total)
  if (goles_exactos === 1) return 3; // +3 puntos (ganador + 1 golo)
  return 1; // +1 punto (solo ganador)
}

function compararUsuarios(u1, u2) {
  // 1. Aciertos +5
  if (u1.estadisticas.aciertos_5pts !== u2.estadisticas.aciertos_5pts) {
    return u2.estadisticas.aciertos_5pts - u1.estadisticas.aciertos_5pts;
  }

  // 2. Aciertos +3
  if (u1.estadisticas.aciertos_3pts !== u2.estadisticas.aciertos_3pts) {
    return u2.estadisticas.aciertos_3pts - u1.estadisticas.aciertos_3pts;
  }

  // 3. Porcentaje
  if (u1.estadisticas.porcentaje_aciertos !== u2.estadisticas.porcentaje_aciertos) {
    return u2.estadisticas.porcentaje_aciertos - u1.estadisticas.porcentaje_aciertos;
  }

  // 4. Alfabetico
  return u1.nombre.localeCompare(u2.nombre);
}

function generarRanking(tipo) {
  db.ref('usuarios').once('value', (snapshot) => {
    let usuarios = [];
    snapshot.forEach((child) => {
      usuarios.push(child.val());
    });

    // Filtrar segun tipo
    if (tipo.startsWith('grupo_')) {
      const grupo = tipo.replace('grupo_', '');
      usuarios = usuarios.filter((u) => u.grupo === grupo);
    }

    if (tipo.startsWith('femenil_grupo_')) {
      const grupo = tipo.replace('femenil_grupo_', '');
      usuarios = usuarios.filter((u) => u.grupo === grupo);
    }

    if (tipo.includes('femenil')) {
      usuarios = usuarios.filter((u) => u.sexo === 'femenino');
    }

    // Ordenar con desempate
    usuarios.sort(compararUsuarios);

    // Asignar posiciones
    usuarios.forEach((u, i) => {
      u.posicion = i + 1;
    });

    // Guardar en Firebase
    db.ref(`rankings/${tipo}`).set(usuarios, (error) => {
      if (error) return;

      // Si es ranking actual del usuario, mostrar y notificar cambio de posicion
      if (currentUser && tipo === 'general') {
        mostrarRanking(usuarios);
        notificarCambiosPosicionMejorado(currentUser.id);
      }
    });

    return usuarios;
  });
}

function mostrarRanking(usuarios) {
  const tabla = document.getElementById('ranking-tabla');
  if (!tabla) return;
  tabla.innerHTML = '';

  // Header
  const header = tabla.insertRow();
  header.style.backgroundColor = '#2A398D';
  header.style.color = '#FFFFFF';
  header.innerHTML = '<th>#</th><th>Nombre</th><th>Grupo</th><th>Puntos</th><th>+5</th><th>+3</th><th>%</th><th>Género</th>';

  // Filas
  usuarios.slice(0, 20).forEach((user, index) => {
    const row = tabla.insertRow();

    // Destacar si es el usuario actual
    if (currentUser && user.id === currentUser.id) {
      row.style.backgroundColor = 'rgba(230, 29, 37, 0.1)';
    } else if (index % 2 === 0) {
      row.style.backgroundColor = '#F5F5F5';
    }

    const genero = user.sexo === 'femenino' ? '👩⭐' : '👨';

    row.innerHTML = `
      <td>${user.posicion}</td>
      <td>${user.nombre}</td>
      <td>${user.grupo}</td>
      <td><strong>${user.estadisticas.puntos_totales}</strong></td>
      <td>${user.estadisticas.aciertos_5pts}</td>
      <td>${user.estadisticas.aciertos_3pts}</td>
      <td>${user.estadisticas.porcentaje_aciertos}%</td>
      <td>${genero}</td>
    `;
  });

  // Mostrar posicion del usuario
  if (!currentUser) return;
  const miPosicion = usuarios.find((u) => u.id === currentUser.id);
  if (miPosicion) {
    const miPosicionEl = document.getElementById('mi-posicion');
    if (miPosicionEl) {
      miPosicionEl.innerHTML = `🔺 TÚ ESTÁS EN: ${miPosicion.posicion}º lugar (${miPosicion.estadisticas.puntos_totales} puntos)`;
    }
  }
}

function hacerPrediccion(usuarioId, partidoId, goles1, goles2) {
  const usuarioIdNormalizado = (usuarioId || '').toString().trim();
  const partidoIdNormalizado = (partidoId || '').toString().trim();

  if (!usuarioIdNormalizado) {
    mostrarNotificacion('error', '❌ Sesión inválida. Vuelve a iniciar sesión.');
    return;
  }

  if (!partidoIdNormalizado) {
    mostrarNotificacion('error', '❌ Partido inválido para guardar predicción');
    return;
  }

  if (!Number.isFinite(goles1) || !Number.isFinite(goles2)) {
    mostrarNotificacion('error', '❌ Ingresa goles válidos');
    return;
  }

  if (goles1 < 0 || goles1 > 9 || goles2 < 0 || goles2 > 9) {
    mostrarNotificacion('error', '❌ Goles deben estar entre 0 y 9');
    return;
  }

  db.ref(`partidos/${partidoIdNormalizado}`).once('value', (snap) => {
    if (!snap.exists()) {
      mostrarNotificacion('error', '❌ Partido no encontrado');
      return;
    }

    const partido = snap.val() || {};
    const cierreMs = obtenerCierrePrediccionMs(partido);
    if (estaCerradaPrediccion(partido)) {
      const cierreTxt = cierreMs
        ? new Date(cierreMs).toLocaleString('es-MX', { timeZone: 'America/Cancun' })
        : 'N/A';
      mostrarNotificacion('warning', `⏰ Predicción cerrada (15 min antes). Cierre: ${cierreTxt} GMT-5 Cancún`);
      return;
    }

    const resultado_previsto = goles1 > goles2 ? 'gana_equipo1' : goles1 < goles2 ? 'gana_equipo2' : 'empate';

    const payloadPrediccion = {
      goles1,
      goles2,
      resultado_previsto,
      puntos: null,
      timestamp: Date.now(),
      timezone_referencia: 'America/Cancun',
      cierre_minutos_antes: MINUTOS_CIERRE_PREDICCION
    };

    const predRef = db.ref(`predicciones/${usuarioIdNormalizado}/${partidoIdNormalizado}`);

    predRef.set(payloadPrediccion)
      .then(() => predRef.once('value'))
      .then((savedSnap) => {
        const saved = savedSnap.val() || {};
        const savedG1 = Number.parseInt(saved.goles1, 10);
        const savedG2 = Number.parseInt(saved.goles2, 10);
        const persistio = Number.isFinite(savedG1) && Number.isFinite(savedG2)
          && savedG1 === goles1 && savedG2 === goles2;

        if (!persistio) {
          throw new Error('Predicción no persistida correctamente');
        }

        prediccionesUsuarioActual[partidoIdNormalizado] = payloadPrediccion;
        mostrarNotificacion('success', '✅ Predicción guardada');

        if (typeof window.closePredictionModal === 'function') {
          window.closePredictionModal();
        } else {
          cerrarModal('modal-prediction');
        }

        filtroPartidosActivo = 'proximos';
        cambiarTab('partidos');
        cargarPartidos();
        if (typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      })
      .catch((error) => {
        const msg = String(error && error.message ? error.message : '').toLowerCase();
        if (msg.includes('permission')) {
          mostrarNotificacion('error', '❌ Sin permisos para guardar predicción');
          return;
        }

        mostrarNotificacion('error', '❌ No se pudo guardar la predicción');
      });
  });
}

// ============================================================
// PARTE 3: Chat y Sugerencias
// ============================================================

function enviarMensaje(mensaje) {
  if (!mensaje.trim()) return;

  esUsuarioBaneadoChat(currentUser.id).then((baneado) => {
    if (baneado) {
      mostrarNotificacion('error', '❌ Estás baneado del chat por el docente/admin');
      return;
    }

    db.ref('chat_general/estado').once('value', (snap) => {
      const estado = snap.val();
      if (estado === 'cerrado' && currentUser.rol !== 'profesor') {
        mostrarNotificacion('error', '❌ Chat cerrado por el profesor');
        return;
      }

      const msgId = db.ref('chat_general').push().key;
      db.ref(`chat_general/${msgId}`).set({
        usuario_id: currentUser.id,
        nombre: currentUser.nombre,
        grupo: currentUser.grupo,
        mensaje: mensaje,
        timestamp: Date.now(),
        reacciones: {}
      });

      mostrarNotificacion('success', '✅ Mensaje enviado', 2000);
      const input = document.getElementById('chat-input') || document.getElementById('input-mensaje');
      if (input) input.value = '';
    });
  });
}

function cargarMensajes(limite = 50) {
  db.ref('chat_general')
    .orderByChild('timestamp')
    .limitToLast(limite)
    .on('value', (snapshot) => {
      const mensajes = [];
      snapshot.forEach((childSnap) => {
        if (childSnap.key !== 'estado') {
          mensajes.push({ key: childSnap.key, ...childSnap.val() });
        }
      });

      mostrarMensajesEnUI(mensajes);
      scrollAlFinal();
    });
}

function mostrarMensajesEnUI(mensajes) {
  const zona = document.getElementById('chat-messages') || document.getElementById('chat-mensajes');
  if (!zona) return;
  zona.innerHTML = '';

  mensajes.forEach((msg) => {
    const nombreVisible = formatearNombreConGrupo(msg.grupo, msg.nombre);
    const puedeBanear = esUsuarioAdmin() && tieneAccesoDocente() && msg.usuario_id && msg.usuario_id !== (currentUser ? currentUser.id : '');
    const div = document.createElement('div');
    div.style.padding = '12px';
    div.style.marginBottom = '8px';
    div.style.borderRadius = '6px';
    div.style.backgroundColor = '#F5F5F5';

    const inicial = msg.nombre.charAt(0).toUpperCase();
    const reacciones = msg.reacciones
      ? Object.entries(msg.reacciones)
        .map(
          ([emoji, count]) => `<button style="background:#F0F0F0;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-right:4px;" onclick="agregarReaccion('${msg.key}','${emoji}')">${emoji} ${count}</button>`
        )
        .join('')
      : '';

    const hora = new Date(msg.timestamp).toLocaleTimeString();

    div.innerHTML = `
      <div style="display:flex;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#2A398D;color:#FFF;display:flex;align-items:center;justify-content:center;font-weight:bold;">
          ${inicial}
        </div>
        <div style="flex:1;">
          <div style="display:flex;gap:8px;">
            <strong style="color:#474A4A;">${nombreVisible}</strong>
            <span style="color:#D1D4D1;font-size:12px;">${hora}</span>
            ${puedeBanear ? `<button class="btn-chat-ban" data-user-id="${escaparHtml(msg.usuario_id)}" style="border:1px solid #E61D25;background:#fff;color:#E61D25;padding:1px 7px;border-radius:6px;font-size:11px;cursor:pointer;">Banear</button>` : ''}
          </div>
          <div style="color:#474A4A;margin-top:4px;">${msg.mensaje}</div>
          <div style="margin-top:8px;display:flex;gap:4px;">
            ${reacciones}
            <button style="background:#F0F0F0;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;" onclick="agregarReaccion('${msg.key}','👍')">👍</button>
            <button style="background:#F0F0F0;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;" onclick="agregarReaccion('${msg.key}','😂')">😂</button>
            <button style="background:#F0F0F0;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;" onclick="agregarReaccion('${msg.key}','❤️')">❤️</button>
            <button style="background:#F0F0F0;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;" onclick="agregarReaccion('${msg.key}','🔥')">🔥</button>
            <button style="background:#F0F0F0;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;" onclick="agregarReaccion('${msg.key}','🤔')">🤔</button>
          </div>
        </div>
      </div>
    `;

    zona.appendChild(div);

    const btnBan = div.querySelector('.btn-chat-ban');
    if (btnBan) {
      btnBan.addEventListener('click', () => {
        const userId = btnBan.getAttribute('data-user-id') || '';
        banearJugadorDelChat(userId, 'Baneo desde chat general');
      });
    }
  });
}

function agregarReaccion(mensajeId, emoji) {
  db.ref(`chat_general/${mensajeId}/reacciones/${emoji}`).once('value', (snap) => {
    const count = (snap.val() || 0) + 1;
    db.ref(`chat_general/${mensajeId}/reacciones/${emoji}`).set(count);
  });
}

function scrollAlFinal() {
  const zona = document.getElementById('chat-messages') || document.getElementById('chat-mensajes');
  if (!zona) return;
  zona.scrollTop = zona.scrollHeight;
}

function calcularSugerencia(partidoId) {
  db.ref(`partidos/${partidoId}`).once('value', (partidoSnap) => {
    const partido = partidoSnap.val();
    const eq1_codigo = partido.pais1;
    const eq2_codigo = partido.pais2;

    db.ref(`equipos/${eq1_codigo}`).once('value', (eq1Snap) => {
      db.ref(`equipos/${eq2_codigo}`).once('value', (eq2Snap) => {
        const eq1 = eq1Snap.val();
        const eq2 = eq2Snap.val();

        const diferencia = eq1.posicion_fifa - eq2.posicion_fifa;
        let prediccion;
        let confianza;
        let analisis;

        if (diferencia > 30) {
          prediccion = `${eq1.nombre} 3-0`;
          confianza = 'Alta (70%)';
          analisis = `${eq1.nombre} es mucho más fuerte (${eq1.posicion_fifa}º vs ${eq2.posicion_fifa}º). Ataque superior y defensa sólida.`;
        } else if (diferencia > 15) {
          prediccion = `${eq1.nombre} 2-1`;
          confianza = 'Media-Alta (65%)';
          analisis = `${eq1.nombre} tiene ventaja clara. Mejor ataque y defensa.`;
        } else if (diferencia > 5) {
          prediccion = `${eq1.nombre} 2-0`;
          confianza = 'Media (60%)';
          analisis = `${eq1.nombre} tiene ligera ventaja.`;
        } else if (diferencia > -5) {
          prediccion = '1-1 (Empate)';
          confianza = 'Media (55%)';
          analisis = 'Equipos muy parejos en fuerza.';
        } else {
          prediccion = `${eq2.nombre} 2-0`;
          confianza = 'Media (60%)';
          analisis = `${eq2.nombre} tiene ventaja.`;
        }

        mostrarModalSugerencia(prediccion, confianza, analisis, eq1, eq2);
      });
    });
  });
}

function mostrarModalSugerencia(pred, conf, analisis, eq1, eq2) {
  document.getElementById('modal-sugerencia').style.display = 'flex';
  document.getElementById('prediccion-recomendada').innerHTML = pred;
  document.getElementById('confianza').innerHTML = conf;
  document.getElementById('analisis-texto').innerHTML = analisis;

  document.getElementById('btn-usar-sugerencia').onclick = () => {
    let g1;
    let g2;
    if (pred.includes('Empate')) {
      [g1, g2] = [1, 1];
    } else {
      const partes = pred.split('-');
      g1 = parseInt(partes[0].trim(), 10);
      g2 = parseInt(partes[1].trim(), 10);
    }

    document.getElementById('input-goles-1').value = g1;
    document.getElementById('input-goles-2').value = g2;
    document.getElementById('modal-sugerencia').style.display = 'none';
  };
}

// ============================================================
// PARTE 4: UI y Control Modal
// ============================================================

function abrirModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('open');
  modal.style.display = 'flex';
}

function cerrarModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('open');
  modal.style.display = 'none';
}

function cambiarTab(tabId) {
  if (typeof window.activateTab === 'function') {
    window.activateTab(tabId);
    return;
  }

  const panels = document.querySelectorAll('.tab-panel');
  const tabs = document.querySelectorAll('.nav-tab[data-tab]');

  panels.forEach((p) => p.classList.remove('active'));
  tabs.forEach((t) => t.classList.remove('active'));

  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add('active');

  tabs.forEach((t) => {
    if (t.dataset.tab === tabId) t.classList.add('active');
  });
}

function mostrarPerfil() {
  if (!currentUser) return;

  const stats = currentUser.estadisticas || {};
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('profile-name', currentUser.nombre || 'Usuario');
  setText('profile-group', formatearGrupoUsuario(currentUser.grupo));
  setText('profile-role', (currentUser.rol || 'alumno').toString());

  setText('stat-pts-total', stats.puntos_totales || 0);
  setText('aciertos-5', stats.aciertos_5pts || 0);
  setText('aciertos-3', stats.aciertos_3pts || 0);
  setText('aciertos-1', stats.aciertos_1pt || 0);
  setText('fallos-total', stats.fallos || 0);
  setText('pct-aciertos', `${stats.porcentaje_aciertos || 0}%`);
  setText('partidos-predichos', stats.partidos_predichos || 0);
  setText('racha-actual', stats.racha_actual || 0);
  setText('racha-maxima', stats.racha_maxima || 0);

  setText('acc5', stats.aciertos_5pts || 0);
  setText('acc3', stats.aciertos_3pts || 0);
  setText('acc1', stats.aciertos_1pt || 0);
  setText('acc-fallos', stats.fallos || 0);
  setText('acc-pct', `${stats.porcentaje_aciertos || 0}%`);
  setText('acc-pred', stats.partidos_predichos || 0);
  setText('streak-current', stats.racha_actual || 0);
  setText('streak-max', stats.racha_maxima || 0);

  const sessionAuditNote = document.getElementById('session-audit-note');
  if (sessionAuditNote) {
    const ultimoLogin = currentUser.ultimo_login || null;
    if (ultimoLogin && ultimoLogin.metodo === 'recuperacion_codigo') {
      const fechaLegible = new Date(ultimoLogin.timestamp || Date.now()).toLocaleString('es-MX');
      sessionAuditNote.style.display = 'block';
      sessionAuditNote.textContent = `Aviso de seguridad: esta cuenta ingresó por recuperación con código (${fechaLegible}).`;
    } else {
      sessionAuditNote.style.display = 'none';
      sessionAuditNote.textContent = '';
    }
  }

  actualizarPanelAuditoriaDocente();
  cargarPartidosModuloMaestro();
  actualizarListaJugadoresPorGrupoModuloMaestro();
  actualizarPanelBaneosChatDocente();
  actualizarClasificacionesDeGruposModuloMaestro();
}

function actualizarVisibilidadModuloDocente() {
  const accesoPanel = document.getElementById('docente-access-panel');
  const status = document.getElementById('docente-access-status');
  const btn = document.getElementById('btn-docente-unlock');
  const puedeVer = esUsuarioAdmin();
  const desbloqueado = tieneAccesoDocente();

  if (accesoPanel) accesoPanel.style.display = puedeVer ? 'block' : 'none';
  if (!puedeVer) return;

  if (status) {
    status.textContent = desbloqueado ? 'Módulo docente activo' : 'Módulo bloqueado con contraseña';
  }

  if (btn) {
    btn.textContent = desbloqueado ? 'Módulo docente activo' : 'Desbloquear módulo docente';
    btn.disabled = desbloqueado;
  }
}

function cargarPartidos() {
  const promPartidos = db.ref('partidos').once('value');
  const promPredicciones = currentUser
    ? db.ref(`predicciones/${currentUser.id}`).once('value')
    : Promise.resolve(null);

  Promise.all([promPartidos, promPredicciones])
    .then(([snapshot, predSnap]) => {
      const partidos = [];
      snapshot.forEach((child) => {
        partidos.push({ id: child.key, ...child.val() });
      });

      const mapaPredicciones = {};
      if (predSnap && predSnap.exists()) {
        predSnap.forEach((child) => {
          mapaPredicciones[child.key] = child.val() || {};
        });
      }

      prediccionesUsuarioActual = mapaPredicciones;
      mostrarPartidosEnUI(partidos, mapaPredicciones);
      actualizarVisibilidadModuloDocente();
    })
    .catch(() => {
      mostrarNotificacion('error', '❌ No se pudieron cargar los partidos');
    });
}

function actualizarFiltroPartidosUI() {
  const contenedorProximos = document.getElementById('matches-proximos');
  const contenedorJugados = document.getElementById('matches-jugados');
  const botones = document.querySelectorAll('.filter-btn[data-filter]');

  const mostrandoJugados = filtroPartidosActivo === 'jugados';

  if (contenedorProximos) contenedorProximos.style.display = mostrandoJugados ? 'none' : 'flex';
  if (contenedorJugados) contenedorJugados.style.display = mostrandoJugados ? 'flex' : 'none';

  botones.forEach((btn) => {
    const activo = btn.getAttribute('data-filter') === filtroPartidosActivo;
    btn.classList.toggle('active', activo);
  });
}

function mostrarPartidosEnUI(partidos, prediccionesUsuario = {}) {
  const contenedorProximos = document.getElementById('matches-proximos');
  const contenedorJugados = document.getElementById('matches-jugados');
  if (!contenedorProximos || !contenedorJugados) return;

  if (!Array.isArray(partidos) || !partidos.length) {
    contenedorProximos.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No hay partidos disponibles</p></div>';
    contenedorJugados.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No hay resultados todavía</p></div>';
    actualizarFiltroPartidosUI();
    return;
  }

  const partidosProgramados = partidos
    .filter((p) => !p.estado || p.estado === 'pendiente' || p.estado === 'programado' || p.estado === 'proximo');

  const partidosJugados = partidos
    .filter((p) => {
      const resultado = obtenerResultadoPartido(p);
      const tieneMarcador = resultado.goles1 !== null && resultado.goles2 !== null;
      return p.estado === 'finalizado' || tieneMarcador;
    })
    .sort((a, b) => {
      const fechaA = `${a.fecha || ''} ${a.hora || ''}`.trim();
      const fechaB = `${b.fecha || ''} ${b.hora || ''}`.trim();
      return fechaB.localeCompare(fechaA, 'es');
    });

  const partidosPrueba = partidosProgramados
    .filter((p) => (p.fase || '').toString().toLowerCase() === 'prueba_libertadores');

  const partidosNormales = partidosProgramados
    .filter((p) => (p.fase || '').toString().toLowerCase() !== 'prueba_libertadores');

  // Mantener visibles los partidos de prueba para todos los jugadores,
  // incluso cuando exista mucho calendario regular.
  const limiteVisual = Math.max(20, partidosPrueba.length);
  const proximos = [...partidosPrueba, ...partidosNormales].slice(0, limiteVisual);

  if (!proximos.length) {
    contenedorProximos.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>No hay partidos próximos</p></div>';
  } else {
    contenedorProximos.innerHTML = proximos.map((p) => {
      const pred = prediccionesUsuario[p.id] || null;
      const predG1 = Number.parseInt(pred ? pred.goles1 : null, 10);
      const predG2 = Number.parseInt(pred ? pred.goles2 : null, 10);
      const tienePred = Number.isFinite(predG1) && Number.isFinite(predG2);
      const textoPred = tienePred
        ? `Mi predicción: <strong>${predG1} - ${predG2}</strong>`
        : 'Sin predicción aún';
      const clasePred = tienePred ? 'my-prediction' : 'my-prediction no-pred';
      const textoBoton = tienePred ? '✏️ Editar' : '✏️ Hacer predicción';
      const claseBoton = tienePred ? 'btn-predict btn-edit' : 'btn-predict';

      return `
      <article class="match-card" data-match-id="${p.id}">
        <div class="match-card-header">
          <span class="match-group">${p.fase || 'Fase de grupos'}${p.grupo ? ` · Grupo ${p.grupo}` : ''}</span>
          <span class="match-datetime">📅 ${p.fecha || 'Por definir'} · ${p.hora || '--:--'}</span>
        </div>
        <div class="match-card-body">
          <div class="match-team">
            <span class="team-flag">${p.bandera1 || '🏳️'}</span>
            <span class="team-name">${p.pais1 || 'Equipo 1'}</span>
          </div>
          <div class="match-vs">
            <span class="vs-text">VS</span>
            <span class="match-result pending">· · ·</span>
          </div>
          <div class="match-team">
            <span class="team-flag">${p.bandera2 || '🏳️'}</span>
            <span class="team-name">${p.pais2 || 'Equipo 2'}</span>
          </div>
        </div>
        <div class="match-card-footer">
          <span class="${clasePred}">${textoPred}</span>
          <button class="${claseBoton}" onclick="abrirModalPrediccion({id:'${escaparJsString(p.id)}', flagA:'${escaparJsString(p.bandera1 || '🏳️')}', teamA:'${escaparJsString(p.pais1 || 'Equipo 1')}', flagB:'${escaparJsString(p.bandera2 || '🏳️')}', teamB:'${escaparJsString(p.pais2 || 'Equipo 2')}', closeText:'${escaparJsString(obtenerTextoCierrePrediccion(p))}', isClosed:${estaCerradaPrediccion(p)}, predA:${tienePred ? predG1 : 0}, predB:${tienePred ? predG2 : 0}})">${textoBoton}</button>
        </div>
        <div style="font-size:0.8rem;color:#666;margin-top:6px;padding:0 4px;">⏰ ${escaparHtml(obtenerTextoCierrePrediccion(p))}</div>
      </article>
    `;
    }).join('');
  }

  if (!partidosJugados.length) {
    contenedorJugados.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Aún no hay partidos jugados con resultado.</p></div>';
  } else {
    contenedorJugados.innerHTML = partidosJugados.map((p) => {
      const resultado = obtenerResultadoPartido(p);
      const pred = prediccionesUsuario[p.id] || null;
      const predG1 = Number.parseInt(pred ? pred.goles1 : null, 10);
      const predG2 = Number.parseInt(pred ? pred.goles2 : null, 10);
      const tienePred = Number.isFinite(predG1) && Number.isFinite(predG2);
      const predTexto = tienePred
        ? `<div class="my-prediction" style="margin-top:8px;">Mi predicción: <strong>${predG1} - ${predG2}</strong></div>`
        : '<div class="my-prediction no-pred" style="margin-top:8px;">No registraste predicción para este partido.</div>';
      return `
        <article class="match-card jugado" data-match-id="${p.id}">
          <div class="match-card-header">
            <span class="match-group">${escaparHtml(p.fase || 'Fase de grupos')}${p.grupo ? ` · Grupo ${escaparHtml(p.grupo)}` : ''}</span>
            <span class="match-datetime">📅 ${escaparHtml(p.fecha || 'Por definir')} · ${escaparHtml(p.hora || '--:--')}</span>
          </div>
          <div class="match-card-body">
            <div class="match-team">
              <span class="team-flag">${escaparHtml(p.bandera1 || '🏳️')}</span>
              <span class="team-name">${escaparHtml(p.pais1 || 'Equipo 1')}</span>
            </div>
            <div class="match-vs">
              <span class="vs-text">Resultado</span>
              <span class="match-result">${resultado.goles1 ?? '-'} - ${resultado.goles2 ?? '-'}</span>
            </div>
            <div class="match-team">
              <span class="team-flag">${escaparHtml(p.bandera2 || '🏳️')}</span>
              <span class="team-name">${escaparHtml(p.pais2 || 'Equipo 2')}</span>
            </div>
          </div>
          <div class="match-card-footer">${predTexto}</div>
        </article>
      `;
    }).join('');
  }

  actualizarFiltroPartidosUI();
}

function abrirModalPrediccion(matchData) {
  if (typeof window.openPredictionModal === 'function') {
    window.openPredictionModal(matchData);
    return;
  }
  abrirModal('modal-prediction');
}

function guardarPrediccion() {
  if (!currentUser) {
    mostrarNotificacion('error', '❌ Debes iniciar sesión');
    return;
  }

  const modalPred = document.getElementById('modal-prediction');
  const partidoId = modalPred ? modalPred.dataset.matchId : null;
  const goles1 = parseInt(document.getElementById('pred-score-a')?.value || '0', 10);
  const goles2 = parseInt(document.getElementById('pred-score-b')?.value || '0', 10);

  if (!partidoId) {
    mostrarNotificacion('error', '❌ No se encontró el partido');
    return;
  }

  const usuarioId = obtenerUsuarioIdSeguro();
  if (!usuarioId) {
    mostrarNotificacion('error', '❌ Sesión inválida. Entra de nuevo con tu código.');
    return;
  }

  if (currentUser && !currentUser.id) {
    currentUser.id = usuarioId;
  }

  hacerPrediccion(usuarioId, partidoId, goles1, goles2);
}

function cambiarRanking(tipo) {
  if (typeof window.setRanking === 'function') {
    window.setRanking(tipo);
  } else {
    generarRanking(tipo);
  }
}

function registrarEventListenersUI() {
  if (listenersRegistrados) return;
  listenersRegistrados = true;

  const btnTabs = document.querySelectorAll('.nav-tab[data-tab]');
  btnTabs.forEach((tab) => {
    tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
  });

  const btnFiltrosPartidos = document.querySelectorAll('.filter-btn[data-filter]');
  btnFiltrosPartidos.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filtro = btn.getAttribute('data-filter');
      if (filtro !== 'proximos' && filtro !== 'jugados') return;
      filtroPartidosActivo = filtro;
      actualizarFiltroPartidosUI();
    });
  });

  const rankingSelect = document.getElementById('ranking-select');
  if (rankingSelect) {
    rankingSelect.addEventListener('change', (e) => cambiarRanking(e.target.value));
  }

  const btnGuardarPred = document.getElementById('btn-pred-save');
  if (btnGuardarPred) {
    btnGuardarPred.addEventListener('click', guardarPrediccion);
  }

  const btnCerrarPred = document.getElementById('btn-pred-cancel');
  if (btnCerrarPred) {
    btnCerrarPred.addEventListener('click', () => cerrarModal('modal-prediction'));
  }

  const btnRegistrar = document.getElementById('btn-modal-registrarme');
  if (btnRegistrar) {
    btnRegistrar.addEventListener('click', () => {
      const codigo = normalizarCodigoInvitacion(document.getElementById('modal-login-code')?.value || '');
      const nombre = document.getElementById('modal-login-name')?.value?.trim() || '';
      const grupo = document.getElementById('modal-login-group')?.value || '';
      const sexoRaw = document.getElementById('modal-login-sex')?.value || '';
      const modo = document.getElementById('modal-login')?.dataset.mode || modoAccesoLogin;

      if (modo === 'alumno_login') {
        iniciarSesionSoloConCodigo(codigo);
        return;
      }

      if (modo === 'alumno_registro') {
        procesarEntradaLoginRegistro(codigo, nombre, grupo, sexoRaw);
        return;
      }

      const loginError = document.getElementById('modal-login-error');
      if (loginError) loginError.textContent = 'Selecciona primero una opción de acceso.';
      mostrarNotificacion('warning', '⚠️ Selecciona cómo deseas entrar');
    });
  }

  const btnPresentAlumnoLogin = document.getElementById('btn-presentacion-alumno-login');
  if (btnPresentAlumnoLogin) {
    btnPresentAlumnoLogin.addEventListener('click', () => actualizarVistaAccesoLogin('alumno_login'));
  }

  const btnPresentAlumnoRegistro = document.getElementById('btn-presentacion-alumno-registro');
  if (btnPresentAlumnoRegistro) {
    btnPresentAlumnoRegistro.addEventListener('click', () => actualizarVistaAccesoLogin('alumno_registro'));
  }

  const btnPresentProfesor = document.getElementById('btn-presentacion-profesor');
  if (btnPresentProfesor) {
    btnPresentProfesor.addEventListener('click', () => actualizarVistaAccesoLogin('profesor'));
  }

  const btnBackAlumno = document.getElementById('btn-login-back-menu');
  if (btnBackAlumno) {
    btnBackAlumno.addEventListener('click', () => actualizarVistaAccesoLogin('menu'));
  }

  const btnBackProfesor = document.getElementById('btn-prof-back-menu');
  if (btnBackProfesor) {
    btnBackProfesor.addEventListener('click', () => actualizarVistaAccesoLogin('menu'));
  }

  const btnModalProfesor = document.getElementById('btn-modal-profesor');
  if (btnModalProfesor) {
    btnModalProfesor.addEventListener('click', ingresarComoProfesorDesdeModal);
  }

  const codeInputs = [
    document.getElementById('modal-login-code'),
    document.getElementById('login-code'),
    document.getElementById('modal-prof-code')
  ].filter(Boolean);

  codeInputs.forEach((input) => {
    input.maxLength = 5;
    input.addEventListener('input', () => {
      input.value = normalizarCodigoInvitacion(input.value);
    });
  });

  const btnDocenteUnlock = document.getElementById('btn-docente-unlock');
  if (btnDocenteUnlock) {
    btnDocenteUnlock.addEventListener('click', desbloquearModuloDocente);
  }

  const btnMasterQuick = document.getElementById('btn-master-quick-access');
  if (btnMasterQuick) {
    btnMasterQuick.addEventListener('click', abrirModuloMaestroDesdePrincipal);
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      cerrarSesion();
    });
  }

  const selectMaestro = document.getElementById('admin-master-match-select');
  if (selectMaestro) {
    selectMaestro.addEventListener('change', cargarDetallePartidoModuloMaestro);
  }

  const btnCargarMaestro = document.getElementById('admin-master-load');
  if (btnCargarMaestro) {
    btnCargarMaestro.addEventListener('click', cargarDetallePartidoModuloMaestro);
  }

  const btnGuardarMaestro = document.getElementById('admin-master-save');
  if (btnGuardarMaestro) {
    btnGuardarMaestro.addEventListener('click', () => guardarResultadoModuloMaestro(false));
  }

  const btnFinalizarMaestro = document.getElementById('admin-master-finalize');
  if (btnFinalizarMaestro) {
    btnFinalizarMaestro.addEventListener('click', () => guardarResultadoModuloMaestro(true));
  }

  const btnGenerarCodigoJugador = document.getElementById('admin-master-generate-code');
  if (btnGenerarCodigoJugador) {
    btnGenerarCodigoJugador.addEventListener('click', generarCodigoJugadorMaestro);
  }

  const btnAgregarJugador = document.getElementById('admin-master-add-player');
  if (btnAgregarJugador) {
    btnAgregarJugador.addEventListener('click', agregarJugadorModuloMaestro);
  }

  const btnActualizarClasificaciones = document.getElementById('admin-master-refresh-groups');
  if (btnActualizarClasificaciones) {
    btnActualizarClasificaciones.addEventListener('click', actualizarClasificacionesDeGruposModuloMaestro);
  }

  const btnGenerarEliminatoria = document.getElementById('admin-master-generate-knockout');
  if (btnGenerarEliminatoria) {
    btnGenerarEliminatoria.addEventListener('click', generarEliminatoriaModuloMaestro);
  }

  const btnImportarFixture = document.getElementById('admin-master-import-fixture');
  if (btnImportarFixture) {
    btnImportarFixture.addEventListener('click', importarFixtureDieciseisavosDesdeURL);
  }

  const btnCargarLibertadoresTest = document.getElementById('admin-master-load-libertadores-test');
  if (btnCargarLibertadoresTest) {
    btnCargarLibertadoresTest.addEventListener('click', cargarFixturePruebaLibertadores);
  }

  const btnChat = document.getElementById('chat-send-btn');
  const inputChat = document.getElementById('chat-input');
  if (btnChat && inputChat) {
    btnChat.addEventListener('click', () => enviarMensaje(inputChat.value));
    inputChat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensaje(inputChat.value);
      }
    });
  }
}

// ============================================================
// PARTE 5: Badges y Actualizacion
// ============================================================

function notificarUsuarioAfectado(usuarioId, tipo, mensaje, duracion = 5000) {
  // Solo mostrar notificacion si el usuario actual es el afectado
  if (currentUser && currentUser.id === usuarioId) {
    mostrarNotificacion(tipo, mensaje, duracion);
  }
}

function actualizarPuntosPartidoMejorado(partidoId, goles1_real, goles2_real) {
  db.ref('predicciones').once('value', (snapshot) => {
    snapshot.forEach((usuarioSnap) => {
      const pred = usuarioSnap.child(partidoId).val();
      if (pred) {
        const puntos = calcularPuntos(pred.goles1, pred.goles2, goles1_real, goles2_real);

        db.ref(`predicciones/${usuarioSnap.key}/${partidoId}/puntos`).set(puntos);
        actualizarEstadisticasUsuario(usuarioSnap.key, puntos);

        // Notificar SOLO al usuario que hizo la prediccion
        if (puntos === 5) {
          notificarUsuarioAfectado(usuarioSnap.key, 'success', '✅ ¡ACERTASTE! +5 puntos', 5000);
        } else if (puntos === 3) {
          notificarUsuarioAfectado(usuarioSnap.key, 'success', '✅ Acertaste ganador +1 golo. +3 puntos', 5000);
        } else if (puntos === 1) {
          notificarUsuarioAfectado(usuarioSnap.key, 'info', '✅ Acertaste ganador. +1 punto', 5000);
        } else {
          notificarUsuarioAfectado(usuarioSnap.key, 'error', '❌ Fallaste esta predicción. +0 puntos', 5000);
        }
      }
    });
  });

  // Recalcular todos los rankings
  const tipos = ['general', 'grupo_2A', 'grupo_2C', 'grupo_2D', 'grupo_2F',
    'femenil_general', 'femenil_grupo_2A', 'femenil_grupo_2C', 'femenil_grupo_2D', 'femenil_grupo_2F'];
  tipos.forEach((tipo) => generarRanking(tipo));
}

function actualizarEstadisticasUsuario(usuarioId, puntos) {
  db.ref(`usuarios/${usuarioId}/estadisticas`).once('value', (snap) => {
    const stats = snap.val() || {
      puntos_totales: 0,
      aciertos_5pts: 0,
      aciertos_3pts: 0,
      aciertos_1pt: 0,
      fallos: 0,
      partidos_predichos: 0,
      porcentaje_aciertos: 0,
      badges: [],
      racha_actual: 0,
      racha_maxima: 0,
      mensajes_chat: 0
    };

    stats.puntos_totales += puntos;
    stats.partidos_predichos += 1;

    if (puntos === 5) stats.aciertos_5pts += 1;
    else if (puntos === 3) stats.aciertos_3pts += 1;
    else if (puntos === 1) stats.aciertos_1pt += 1;
    else stats.fallos += 1;

    const aciertos = stats.aciertos_5pts + stats.aciertos_3pts + stats.aciertos_1pt;
    stats.porcentaje_aciertos = ((aciertos / stats.partidos_predichos) * 100).toFixed(2);

    if (puntos > 0) {
      stats.racha_actual += 1;
      if (stats.racha_actual > stats.racha_maxima) {
        stats.racha_maxima = stats.racha_actual;
      }
    } else {
      stats.racha_actual = 0;
    }

    db.ref(`usuarios/${usuarioId}/estadisticas`).set(stats);

    if (currentUser && usuarioId === currentUser.id) {
      currentUser.estadisticas = stats;
    }

    verificarBadgesMejorado(usuarioId);
  });
}

function notificarCambiosPosicionMejorado(usuarioId) {
  db.ref('rankings/general').once('value', (snap) => {
    const ranking = snap.val();
    if (!ranking || !Array.isArray(ranking)) return;

    const usuario = ranking.find((u) => u.id === usuarioId);

    // Solo notificar al usuario afectado
    if (usuario && currentUser && usuarioId === currentUser.id) {
      const posicionAnterior = currentUser.posicion_ranking_general || 0;
      const posicionNueva = usuario.posicion;

      if (posicionNueva < posicionAnterior && posicionAnterior > 0) {
        const diferencia = posicionAnterior - posicionNueva;
        notificarUsuarioAfectado(usuarioId, 'success', `🎉 ¡Subiste ${diferencia} posiciones! Ahora eres ${posicionNueva}º`, 5000);
      } else if (posicionNueva > posicionAnterior && posicionAnterior > 0) {
        const diferencia = posicionNueva - posicionAnterior;
        notificarUsuarioAfectado(usuarioId, 'warning', `⬇️ Bajaste ${diferencia} posiciones (ahora ${posicionNueva}º)`, 5000);
      }

      currentUser.posicion_ranking_general = posicionNueva;
    }
  });
}

function verificarBadgesMejorado(usuarioId) {
  db.ref(`usuarios/${usuarioId}`).once('value', (snap) => {
    const usuario = snap.val();
    if (!usuario) return;
    if (usuario.sexo !== 'femenino') return;

    const stats = usuario.estadisticas || {};
    const badges = stats.badges || [];

    // Solo notificar al usuario que gano el badge
    if (stats.aciertos_5pts > 0 && !badges.includes('primera_acierto_total')) {
      badges.push('primera_acierto_total');
      notificarUsuarioAfectado(usuarioId, 'success', '🌟 ¡Ganaste badge: Primera acierto total!', 7000);
    }

    if (stats.racha_actual >= 5 && !badges.includes('5_aciertos_racha')) {
      badges.push('5_aciertos_racha');
      notificarUsuarioAfectado(usuarioId, 'success', '🔥 ¡Ganaste badge: 5 aciertos en racha!', 7000);
    }

    if (stats.puntos_totales >= 100 && !badges.includes('100_puntos')) {
      badges.push('100_puntos');
      notificarUsuarioAfectado(usuarioId, 'success', '💎 ¡Ganaste badge: 100 puntos!', 7000);
    }

    db.ref(`usuarios/${usuarioId}/estadisticas/badges`).set(badges);
  });
}

function generarResumenJornadaMejorado(numeroJornada) {
  db.ref('partidos').orderByChild('jornada').equalTo(numeroJornada).once('value', (snapshot) => {
    const partidos = [];
    snapshot.forEach((child) => partidos.push(child.val()));

    // Para cada usuario, contar sus aciertos
    db.ref('usuarios').once('value', (usuariosSnap) => {
      usuariosSnap.forEach((usuarioChild) => {
        const usuarioId = usuarioChild.key;
        let aciertos = 0;
        let pendientes = partidos.length;

        if (pendientes === 0) {
          const mensajeVacio = `🏆 Jornada ${numeroJornada} completada! Acertaste 0/0 partidos`;
          notificarUsuarioAfectado(usuarioId, 'info', mensajeVacio, 10000);
          return;
        }

        partidos.forEach((partido) => {
          db.ref(`predicciones/${usuarioId}/${partido.id}`).once('value', (predSnap) => {
            const pred = predSnap.val();
            if (pred && pred.puntos > 0) aciertos += 1;

            pendientes -= 1;
            if (pendientes === 0) {
              // Notificar SOLO a este usuario
              const mensaje = `🏆 Jornada ${numeroJornada} completada! Acertaste ${aciertos}/${partidos.length} partidos`;
              notificarUsuarioAfectado(usuarioId, 'info', mensaje, 10000);
            }
          });
        });
      });
    });
  });
}

// ============================================================
// PARTE 6: Partido en vivo
// ============================================================

let partidoEnVivoId = null;
let timerInterval = null;

function obtenerContenedorTabs() {
  return document.getElementById('tabs-container') || document.getElementById('app-shell') || document.getElementById('app-content');
}

function iniciarPartidoEnVivo(partidoId) {
  partidoEnVivoId = partidoId;

  db.ref(`partidos/${partidoId}/estado`).set('en_vivo');
  db.ref(`partidos/${partidoId}/minuto`).set(0);

  mostrarPantallaPartidoEnVivo(partidoId);
  iniciarTimer();
  iniciarListenerMarcador(partidoId);
  cargarChatPartido(partidoId);
}

function mostrarPantallaPartidoEnVivo(partidoId) {
  const tabsContainer = obtenerContenedorTabs();
  if (tabsContainer) tabsContainer.style.display = 'none';

  const pantallaVivo = document.getElementById('pantalla-vivo');
  if (pantallaVivo) pantallaVivo.style.display = 'block';

  db.ref(`partidos/${partidoId}`).once('value', (snap) => {
    const partido = snap.val();
    document.getElementById('vivo-equipos').innerHTML = `${partido.bandera1 || '🏳️'} ${partido.pais1} vs ${partido.pais2} ${partido.bandera2 || '🏳️'}`;
  });
}

function iniciarTimer() {
  let minutos = 0;
  let segundos = 0;

  timerInterval = setInterval(() => {
    segundos += 1;
    if (segundos === 60) {
      minutos += 1;
      segundos = 0;
    }

    const display = `${minutos}:${segundos.toString().padStart(2, '0')}`;
    document.getElementById('timer').innerHTML = display;

    const timerEl = document.getElementById('timer');
    if (minutos >= 60) {
      timerEl.style.color = '#E61D25';
    } else if (minutos >= 45) {
      timerEl.style.color = '#CDDC39';
    } else {
      timerEl.style.color = '#3CAC3B';
    }

    if (minutos === 90) {
      clearInterval(timerInterval);
      finalizarPartido();
    }
  }, 1000);
}

function iniciarListenerMarcador(partidoId) {
  db.ref(`partidos/${partidoId}/resultado_en_vivo`).on('value', (snap) => {
    const resultado = snap.val();
    if (resultado) {
      document.getElementById('marcador').innerHTML = `${resultado.goles1} - ${resultado.goles2}`;

      if ((resultado.goles1 > 0 || resultado.goles2 > 0)) {
        if (currentUser) {
          notificarUsuarioAfectado(currentUser.id, 'success', '🎉 ¡GOOOOL!', 3000);
        }
      }
    }
  });
}

function cargarChatPartido(partidoId) {
  db.ref(`chat_partido_${partidoId}`)
    .orderByChild('timestamp')
    .limitToLast(50)
    .on('value', (snapshot) => {
      const mensajes = [];
      snapshot.forEach((childSnap) => {
        mensajes.push({ key: childSnap.key, ...childSnap.val() });
      });
      mostrarChatPartidoEnUI(mensajes);
    });
}

function mostrarChatPartidoEnUI(mensajes) {
  const zona = document.getElementById('chat-partido');
  if (!zona) return;
  zona.innerHTML = '';

  mensajes.forEach((msg) => {
    const nombreVisible = formatearNombreConGrupo(msg.grupo, msg.nombre);
    const puedeBanear = esUsuarioAdmin() && tieneAccesoDocente() && msg.usuario_id && msg.usuario_id !== (currentUser ? currentUser.id : '');
    const div = document.createElement('div');
    div.style.padding = '8px';
    div.style.marginBottom = '4px';
    div.style.borderRadius = '4px';
    div.style.backgroundColor = '#F5F5F5';
    div.style.fontSize = '12px';

    const reacciones = msg.reacciones ? Object.entries(msg.reacciones).map(([emoji, count]) =>
      `<button style="background:none;border:none;cursor:pointer;padding:0;margin:0 2px;" onclick="agregarReaccionPartido('${msg.key}','${emoji}')">${emoji} ${count}</button>`
    ).join('') : '';

    div.innerHTML = `
      <strong>${nombreVisible}:</strong> ${msg.mensaje}
      ${puedeBanear ? `<button class="btn-chat-ban" data-user-id="${escaparHtml(msg.usuario_id)}" style="margin-left:6px;border:1px solid #E61D25;background:#fff;color:#E61D25;padding:1px 6px;border-radius:6px;font-size:11px;cursor:pointer;">Banear</button>` : ''}
      <div style="margin-top:4px;">${reacciones}</div>
    `;

    zona.appendChild(div);

    const btnBan = div.querySelector('.btn-chat-ban');
    if (btnBan) {
      btnBan.addEventListener('click', () => {
        const userId = btnBan.getAttribute('data-user-id') || '';
        banearJugadorDelChat(userId, 'Baneo desde chat de partido');
      });
    }
  });

  zona.scrollTop = zona.scrollHeight;
}

function enviarMensajePartido(mensaje) {
  if (!mensaje.trim()) return;

  esUsuarioBaneadoChat(currentUser.id).then((baneado) => {
    if (baneado) {
      mostrarNotificacion('error', '❌ Estás baneado del chat por el docente/admin');
      return;
    }

    const msgId = db.ref(`chat_partido_${partidoEnVivoId}`).push().key;
    db.ref(`chat_partido_${partidoEnVivoId}/${msgId}`).set({
      usuario_id: currentUser.id,
      nombre: currentUser.nombre,
      grupo: currentUser.grupo,
      mensaje: mensaje,
      timestamp: Date.now(),
      reacciones: {}
    });

    document.getElementById('input-chat-partido').value = '';
  });
}

function agregarReaccionPartido(mensajeId, emoji) {
  db.ref(`chat_partido_${partidoEnVivoId}/${mensajeId}/reacciones/${emoji}`).once('value', (snap) => {
    const count = (snap.val() || 0) + 1;
    db.ref(`chat_partido_${partidoEnVivoId}/${mensajeId}/reacciones/${emoji}`).set(count);
  });
}

function finalizarPartido() {
  db.ref(`partidos/${partidoEnVivoId}`).once('value', (snap) => {
    const partido = snap.val() || {};
    const resultado = snap.child('resultado_en_vivo').val();
    if (resultado) {
      db.ref(`partidos/${partidoEnVivoId}/estado`).set('finalizado');

      const puntosCalculados = snap.child('puntos_calculados').val() === true;
      if (!puntosCalculados) {
        actualizarPuntosPartidoMejorado(partidoEnVivoId, resultado.goles1, resultado.goles2);
        db.ref(`partidos/${partidoEnVivoId}/puntos_calculados`).set(true);
        db.ref(`partidos/${partidoEnVivoId}/puntos_calculados_timestamp`).set(Date.now());
      }

      propagarGanadorPartidoEliminatoria(partidoEnVivoId, partido, resultado.goles1, resultado.goles2)
        .then((info) => {
          if (!info || !info.propagado) return;
          mostrarNotificacion('success', `✅ ${info.ganador} avanzó automáticamente a la siguiente ronda`, 5000);
        })
        .catch(() => {
          mostrarNotificacion('warning', '⚠️ No se pudo actualizar la siguiente llave automáticamente', 5000);
        });

      if (currentUser) {
        notificarUsuarioAfectado(currentUser.id, 'info', '🏁 ¡Partido terminado!', 5000);
      }
      document.getElementById('btn-mejor-prediccion').style.display = 'block';
    }
  });
}

function mostrarMejorPrediccion() {
  db.ref('predicciones').once('value', (snapshot) => {
    let mejorPrediccion = null;
    let maxPuntos = 0;

    snapshot.forEach((usuarioSnap) => {
      const pred = usuarioSnap.child(partidoEnVivoId).val();
      if (pred && pred.puntos > maxPuntos) {
        maxPuntos = pred.puntos;
        mejorPrediccion = { usuario_id: usuarioSnap.key, ...pred };
      }
    });

    if (mejorPrediccion) {
      db.ref(`usuarios/${mejorPrediccion.usuario_id}`).once('value', (userSnap) => {
        const usuario = userSnap.val();
        alert(`
          🏆 MEJOR PREDICCIÓN DEL PARTIDO

          Usuario: ${usuario.nombre}
          Grupo: ${usuario.grupo}
          Predicción: ${mejorPrediccion.goles1} - ${mejorPrediccion.goles2}
          Puntos ganados: ${mejorPrediccion.puntos}
        `);
      });
    }
  });
}

function cerrarPartidoEnVivo() {
  clearInterval(timerInterval);

  const pantallaVivo = document.getElementById('pantalla-vivo');
  if (pantallaVivo) pantallaVivo.style.display = 'none';

  const tabsContainer = obtenerContenedorTabs();
  if (tabsContainer) {
    tabsContainer.style.display = tabsContainer.id === 'app-content' ? 'block' : 'flex';
  }

  partidoEnVivoId = null;
}
