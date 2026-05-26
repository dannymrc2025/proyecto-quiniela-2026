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
  document.getElementById('modal-login').style.display = 'flex';
}

function registrarUsuario(codigo, nombre, grupo, sexo) {
  const loginError = document.getElementById('modal-login-error');
  if (loginError) loginError.textContent = '';

  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const nombreNormalizado = (nombre || '').toString().trim();

  if (!codigo || !nombre || !grupo || !sexo) {
    if (loginError) loginError.textContent = 'Todos los campos son obligatorios.';
    mostrarNotificacion('error', '❌ Todos los campos son obligatorios');
    return;
  }

  // Validar codigo en Firebase
  db.ref(`codigos_invitacion/${codigoNormalizado}`).once('value', (snap) => {
    if (!snap.exists()) {
      if (loginError) loginError.textContent = 'Código inválido. Verifica e intenta de nuevo.';
      mostrarNotificacion('error', '❌ Código inválido');
      return;
    }

    const codigoData = snap.val();
    if (codigoData.usado === true) {
      if (loginError) loginError.textContent = 'Código ya fue usado.';
      mostrarNotificacion('error', '❌ Código ya fue usado');
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

    db.ref(`usuarios/${usuarioId}`).set(usuarioData);
    db.ref(`codigos_invitacion/${codigoNormalizado}/usado`).set(true);
    db.ref(`codigos_invitacion/${codigoNormalizado}/usuario_id`).set(usuarioId);

    localStorage.setItem('usuarioId', usuarioId);
    currentUser = usuarioData;

    mostrarNotificacion('success', '✅ ¡Bienvenido! Registro completado');
    document.getElementById('modal-login').style.display = 'none';
    mostrarApp();
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

  if (currentUser) {
    const headerUserName = document.getElementById('header-username');
    const headerUserGroup = document.getElementById('header-usergroup');
    const profileName = document.getElementById('profile-name');
    const profileGroup = document.getElementById('profile-group');
    const profileRole = document.getElementById('profile-role');

    if (headerUserName) headerUserName.textContent = currentUser.nombre || 'Usuario';
    if (headerUserGroup) headerUserGroup.textContent = `Grupo ${currentUser.grupo || '—'}`;
    if (profileName) profileName.textContent = currentUser.nombre || 'Usuario';
    if (profileGroup) profileGroup.textContent = `Grupo ${currentUser.grupo || '—'}`;
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

  if (!currentUser) return;

  const rol = (currentUser.rol || '').toLowerCase();
  const esAdmin = rol === 'profesor' || rol === 'admin' || rol === 'organizador';
  if (!esAdmin) return;

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
  currentUser = null;
  mostrarLoginModal();
}

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
  if (goles1 < 0 || goles1 > 9 || goles2 < 0 || goles2 > 9) {
    mostrarNotificacion('error', '❌ Goles deben estar entre 0 y 9');
    return;
  }

  const resultado_previsto = goles1 > goles2 ? 'gana_equipo1' : goles1 < goles2 ? 'gana_equipo2' : 'empate';

  db.ref(`predicciones/${usuarioId}/${partidoId}`).set({
    goles1: goles1,
    goles2: goles2,
    resultado_previsto: resultado_previsto,
    puntos: null,
    timestamp: Date.now()
  });

  mostrarNotificacion('success', '✅ Predicción guardada');
  cerrarModal('modal-prediccion');
}

// ============================================================
// PARTE 3: Chat y Sugerencias
// ============================================================

function enviarMensaje(mensaje) {
  if (!mensaje.trim()) return;

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
            <strong style="color:#474A4A;">${msg.nombre}</strong>
            <span style="color:#D1D4D1;font-size:12px;">${msg.grupo}</span>
            <span style="color:#D1D4D1;font-size:12px;">${hora}</span>
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
  setText('profile-group', `Grupo ${currentUser.grupo || '—'}`);
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
}

function cargarPartidos() {
  db.ref('partidos').once('value', (snapshot) => {
    const partidos = [];
    snapshot.forEach((child) => {
      partidos.push({ id: child.key, ...child.val() });
    });
    mostrarPartidosEnUI(partidos);
  });
}

function mostrarPartidosEnUI(partidos) {
  const contenedor = document.getElementById('matches-proximos');
  if (!contenedor) return;

  if (!Array.isArray(partidos) || !partidos.length) {
    contenedor.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No hay partidos disponibles</p></div>';
    return;
  }

  const proximos = partidos
    .filter((p) => !p.estado || p.estado === 'pendiente' || p.estado === 'programado' || p.estado === 'proximo')
    .slice(0, 20);

  if (!proximos.length) {
    contenedor.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>No hay partidos próximos</p></div>';
    return;
  }

  contenedor.innerHTML = proximos.map((p) => `
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
        <span class="my-prediction no-pred">Sin predicción aún</span>
        <button class="btn-predict" onclick="abrirModalPrediccion({id:'${p.id}', flagA:'${p.bandera1 || '🏳️'}', teamA:'${p.pais1 || 'Equipo 1'}', flagB:'${p.bandera2 || '🏳️'}', teamB:'${p.pais2 || 'Equipo 2'}'})">✏️ Hacer predicción</button>
      </div>
    </article>
  `).join('');
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

  hacerPrediccion(currentUser.id, partidoId, goles1, goles2);
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
      const codigo = document.getElementById('modal-login-code')?.value?.trim() || '';
      const nombre = document.getElementById('modal-login-name')?.value?.trim() || '';
      const grupo = document.getElementById('modal-login-group')?.value || '';
      const sexoRaw = document.getElementById('modal-login-sex')?.value || '';
      const sexo = sexoRaw === 'F' ? 'femenino' : 'masculino';
      registrarUsuario(codigo, nombre, grupo, sexo);
    });
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
      <strong>${msg.nombre}:</strong> ${msg.mensaje}
      <div style="margin-top:4px;">${reacciones}</div>
    `;

    zona.appendChild(div);
  });

  zona.scrollTop = zona.scrollHeight;
}

function enviarMensajePartido(mensaje) {
  if (!mensaje.trim()) return;

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
}

function agregarReaccionPartido(mensajeId, emoji) {
  db.ref(`chat_partido_${partidoEnVivoId}/${mensajeId}/reacciones/${emoji}`).once('value', (snap) => {
    const count = (snap.val() || 0) + 1;
    db.ref(`chat_partido_${partidoEnVivoId}/${mensajeId}/reacciones/${emoji}`).set(count);
  });
}

function finalizarPartido() {
  db.ref(`partidos/${partidoEnVivoId}`).once('value', (snap) => {
    const resultado = snap.child('resultado_en_vivo').val();
    if (resultado) {
      db.ref(`partidos/${partidoEnVivoId}/estado`).set('finalizado');
      actualizarPuntosPartidoMejorado(partidoEnVivoId, resultado.goles1, resultado.goles2);

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
