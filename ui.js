/*
 * ui.js — Interfaz de la Biblioteca Digital.
 *
 * Aquí vive todo lo que toca el DOM: dibujar tarjetas y listas, abrir modales,
 * leer formularios y escuchar eventos. Las reglas (prestar, devolver, validar, filtrar,
 * ordenar...) están en logica.js (BibliotecaLogica); este archivo solo las llama
 * y vuelve a dibujar la pantalla a partir de los datos.
 *
 * Regla de seguridad: nunca se usa innerHTML. Todo el texto (incluido el que escribe el
 * usuario) se inserta con textContent, así no se puede inyectar código (XSS).
 */
(function () {
  'use strict';

  const B = window.BibliotecaLogica;

  /* ================= Atajos y utilidades del DOM ================= */

  const $ = function (selector) { return document.querySelector(selector); };
  const $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };

  // Crea un elemento de forma segura: el texto siempre va por textContent.
  function crear(etiqueta, opciones) {
    const nodo = document.createElement(etiqueta);
    const o = opciones || {};
    if (o.clase) nodo.className = o.clase;
    if (o.texto !== undefined) nodo.textContent = o.texto;
    if (o.atributos) {
      Object.keys(o.atributos).forEach(function (nombre) {
        nodo.setAttribute(nombre, o.atributos[nombre]);
      });
    }
    if (o.datos) {
      Object.keys(o.datos).forEach(function (nombre) {
        nodo.dataset[nombre] = o.datos[nombre];
      });
    }
    for (let i = 2; i < arguments.length; i++) {
      if (arguments[i]) nodo.append(arguments[i]);
    }
    return nodo;
  }

  function etiqueta(texto, variante) {
    return crear('span', { clase: 'etiqueta etiqueta--' + variante, texto: texto });
  }

  const TEXTO_ESTADO = {
    disponible: 'Disponible',
    prestado: 'Prestado',
    coleccion: 'De colección'
  };

  /* ================= Referencias a elementos ================= */

  const vistas = $$('.vista');
  const enlacesMenu = $$('.menu-enlace');
  const enlacePrestamos = $('#enlace-prestamos');
  const saludo = $('#saludo');
  const aviso = $('#aviso');

  // Catálogo
  const inputBusqueda = $('#busqueda');
  const selectFiltroGenero = $('#filtro-genero');
  const selectOrdenarPor = $('#ordenar-por');
  const selectDireccion = $('#orden-direccion');
  const contenedorFiltros = $('#filtros-estado');
  const contador = $('#contador');
  const listaLibros = $('#lista-libros');
  const catalogoVacio = $('#catalogo-vacio');

  // Préstamos
  const listaPrestamos = $('#lista-prestamos');
  const prestamosVacio = $('#prestamos-vacio');
  const listaHistorial = $('#lista-historial');
  const historialVacio = $('#historial-vacio');

  // Formulario de libros
  const formLibro = $('#form-libro');
  const campos = {
    titulo: $('#campo-titulo'),
    autor: $('#campo-autor'),
    anio: $('#campo-anio'),
    genero: $('#campo-genero'),
    comentario: $('#campo-comentario'),
    coleccion: $('#campo-coleccion')
  };
  const ORDEN_CAMPOS = ['titulo', 'autor', 'anio', 'genero', 'comentario', 'coleccion'];
  const tituloFormulario = $('#titulo-formulario');
  const btnEnviar = $('#btn-enviar');
  const btnCancelarEdicion = $('#btn-cancelar-edicion');
  const contadorComentario = $('#contador-comentario');

  // Resumen y ajustes
  const estadisticas = $('#estadisticas');
  const resumenGeneros = $('#resumen-generos');
  const generosVacio = $('#generos-vacio');
  const btnTema = $('#btn-tema');
  const temaActual = $('#tema-actual');
  const formUsuario = $('#form-usuario');
  const campoUsuario = $('#campo-usuario');
  const errorUsuario = $('#error-usuario');
  const btnRestablecer = $('#btn-restablecer');

  // Modales
  const modalPrestar = $('#modal-prestar');
  const modalPrestarLibro = $('#modal-prestar-libro');
  const formPrestar = $('#form-prestar');
  const campoPersona = $('#campo-persona');
  const errorPersona = $('#error-persona');
  const modalConfirmar = $('#modal-confirmar');
  const modalConfirmarTexto = $('#modal-confirmar-texto');
  const btnAceptarConfirmar = $('#aceptar-confirmar');

  /* ================= Estado de la interfaz ================= */
  // Son datos de la pantalla (no de la biblioteca): qué filtros hay, qué se edita, etc.

  const filtros = { busqueda: '', estado: 'todos', genero: '' };
  let orden = B.obtenerOrden();
  let vistaActual = 'catalogo';
  let idEditando = null;       // id del libro que se edita en el formulario (null = modo agregar)
  let idPrestando = null;      // id del libro para el que está abierto el modal de préstamo
  let accionConfirmar = null;  // función a ejecutar si el usuario confirma en el modal
  let focoPrevio = null;       // elemento que tenía el foco antes de abrir un modal
  let temporizadorAviso = null;

  /* ================= Avisos en la página ================= */

  function mostrarAviso(texto, tipo) {
    aviso.textContent = texto;
    aviso.className = 'aviso aviso--' + tipo;
    aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(limpiarAviso, 8000);
  }

  function limpiarAviso() {
    clearTimeout(temporizadorAviso);
    aviso.textContent = '';
    aviso.className = 'aviso';
  }

  /* ================= Navegación entre vistas ================= */

  function mostrarVista(nombre) {
    if (!vistas.some(function (v) { return v.dataset.vista === nombre; })) nombre = 'catalogo';
    vistas.forEach(function (vista) {
      vista.hidden = vista.dataset.vista !== nombre;
    });
    enlacesMenu.forEach(function (enlace) {
      const activo = enlace.dataset.vista === nombre;
      enlace.classList.toggle('activo', activo);
      if (activo) enlace.setAttribute('aria-current', 'page');
      else enlace.removeAttribute('aria-current');
    });
    vistaActual = nombre;
    limpiarAviso();
    history.replaceState(null, '', '#' + nombre); // sin recargar la página
  }

  /* ================= Render: Vista 1 — Catálogo ================= */

  function actualizarSelectorGeneros(todos) {
    const generos = B.generosExistentes();
    if (filtros.genero && !generos.includes(filtros.genero)) filtros.genero = '';

    const opciones = [crear('option', { texto: 'Todos los géneros', atributos: { value: '' } })];
    generos.forEach(function (g) {
      opciones.push(crear('option', { texto: g.charAt(0).toUpperCase() + g.slice(1), atributos: { value: g } }));
    });
    selectFiltroGenero.replaceChildren.apply(selectFiltroGenero, opciones);
    selectFiltroGenero.value = filtros.genero;
    return todos;
  }

  function crearBoton(texto, accion, idLibro, titulo, extra) {
    const clases = 'btn pequeno' + (extra && extra.clase ? ' ' + extra.clase : '');
    const atributos = { type: 'button', 'aria-label': texto + ' «' + titulo + '»' };
    if (extra && extra.deshabilitado) {
      atributos.disabled = '';
      atributos.title = 'Los ejemplares de colección no se prestan';
    }
    return crear('button', { clase: clases, texto: texto, atributos: atributos, datos: { accion: accion, id: idLibro } });
  }

  function crearTarjeta(libro, fechaHoy) {
    const estado = B.estadoLibro(libro);
    const prestamo = B.prestamoActivoDe(libro.id);
    const vencido = prestamo !== null && B.estaVencido(prestamo, fechaHoy);

    let clase = 'tarjeta tarjeta--' + estado;
    if (vencido) clase += ' tarjeta--vencida';

    const tarjeta = crear('article', { clase: clase, datos: { id: libro.id } });

    tarjeta.append(
      crear('div', { clase: 'tarjeta-cabecera' },
        crear('h3', { texto: libro.titulo }),
        etiqueta(TEXTO_ESTADO[estado], estado)
      ),
      crear('p', { clase: 'autor', texto: libro.autor })
    );

    const meta = crear('p', { clase: 'meta' });
    meta.append(String(libro.anio) + ' · ', crear('span', { clase: 'genero', texto: libro.genero }));
    tarjeta.append(meta);

    if (libro.comentario) {
      tarjeta.append(crear('p', { clase: 'comentario', texto: libro.comentario }));
    }

    if (prestamo) {
      const info = crear('div', { clase: 'prestamo-info' },
        crear('p', { texto: 'Prestado a ' + prestamo.persona }),
        crear('p', { texto: 'Devolver antes del ' + B.formatearFecha(prestamo.fechaLimite) })
      );
      if (vencido) {
        info.append(etiqueta('Vencido · ' + B.plural(B.diasRetraso(prestamo, fechaHoy), 'día', 'días') + ' de retraso', 'vencido'));
      }
      tarjeta.append(info);
    }

    const acciones = crear('div', { clase: 'acciones' });
    if (prestamo) {
      acciones.append(crearBoton('Devolver', 'devolver', libro.id, libro.titulo));
    } else {
      acciones.append(crearBoton('Prestar', 'prestar', libro.id, libro.titulo, { deshabilitado: libro.coleccion }));
    }
    acciones.append(
      crearBoton('Editar', 'editar', libro.id, libro.titulo, { clase: 'secundario' }),
      crearBoton('Eliminar', 'eliminar', libro.id, libro.titulo, { clase: 'peligro' })
    );
    tarjeta.append(acciones);

    return tarjeta;
  }

  function renderCatalogo() {
    const fechaHoy = B.hoy();
    const todos = actualizarSelectorGeneros(B.obtenerLibros());

    // Primero se filtra y después se ordena (el orden se aplica sobre una copia).
    const filtrados = B.filtrarLibros(todos, filtros);
    const ordenados = B.ordenarLibros(filtrados, orden);

    contador.textContent = 'Mostrando ' + ordenados.length + ' de ' + todos.length + ' libros';
    listaLibros.replaceChildren.apply(listaLibros, ordenados.map(function (l) { return crearTarjeta(l, fechaHoy); }));
    catalogoVacio.hidden = ordenados.length !== 0;

    $$('.filtro').forEach(function (boton) {
      const activo = boton.dataset.estado === filtros.estado;
      boton.classList.toggle('activo', activo);
      boton.setAttribute('aria-pressed', String(activo));
    });
  }

  /* ================= Render: Vista 2 — Mis préstamos ================= */

  function tituloDe(idLibro) {
    const libro = B.obtenerLibro(idLibro);
    return libro ? libro.titulo : '(libro eliminado)';
  }

  function crearItemActivo(prestamo, fechaHoy) {
    const vencido = B.estaVencido(prestamo, fechaHoy);
    const titulo = tituloDe(prestamo.idLibro);

    const info = crear('div', { clase: 'item-info' },
      crear('h4', { texto: titulo }),
      crear('p', { texto: 'Prestado a ' + prestamo.persona }),
      crear('p', { texto: 'Fecha límite: ' + B.formatearFecha(prestamo.fechaLimite) })
    );
    if (vencido) {
      info.append(crear('div', { clase: 'fila-etiquetas' },
        etiqueta('Vencido', 'vencido'),
        crear('span', { texto: B.plural(B.diasRetraso(prestamo, fechaHoy), 'día', 'días') + ' de retraso' })
      ));
    }

    return crear('li', { clase: 'item-prestamo' + (vencido ? ' item-prestamo--vencido' : '') },
      info,
      crear('button', {
        clase: 'btn pequeno',
        texto: 'Devolver',
        atributos: { type: 'button', 'aria-label': 'Devolver «' + titulo + '»' },
        datos: { accion: 'devolver', id: prestamo.idLibro }
      })
    );
  }

  function crearItemHistorial(prestamo) {
    const retraso = B.diasRetraso(prestamo);
    const estado = retraso === 0
      ? etiqueta('Devuelto a tiempo', 'atiempo')
      : etiqueta('Con ' + B.plural(retraso, 'día', 'días') + ' de retraso', 'vencido');

    return crear('li', { clase: 'item-prestamo item-prestamo--historial' },
      crear('div', { clase: 'item-info' },
        crear('h4', { texto: tituloDe(prestamo.idLibro) }),
        crear('p', { texto: 'Persona: ' + prestamo.persona }),
        crear('p', { texto: 'Prestado el ' + B.formatearFecha(prestamo.fechaPrestamo) + ' · Devuelto el ' + B.formatearFecha(prestamo.fechaDevolucion) }),
        crear('div', { clase: 'fila-etiquetas' }, estado)
      )
    );
  }

  function renderPrestamos() {
    const fechaHoy = B.hoy();
    const activos = B.prestamosActivosOrdenados();
    const historial = B.historialOrdenado();

    listaPrestamos.replaceChildren.apply(listaPrestamos, activos.map(function (p) { return crearItemActivo(p, fechaHoy); }));
    prestamosVacio.hidden = activos.length !== 0;

    listaHistorial.replaceChildren.apply(listaHistorial, historial.map(crearItemHistorial));
    historialVacio.hidden = historial.length !== 0;
  }

  /* ================= Render: Vista 4 — Resumen ================= */

  function crearEstadistica(valor, nombre, alerta) {
    return crear('div', { clase: 'estadistica' + (alerta ? ' estadistica--alerta' : '') },
      crear('p', { clase: 'valor', texto: String(valor) }),
      crear('p', { clase: 'nombre', texto: nombre })
    );
  }

  function renderResumen() {
    const r = B.resumen();
    estadisticas.replaceChildren(
      crearEstadistica(r.total, 'Total de libros'),
      crearEstadistica(r.disponibles, 'Disponibles'),
      crearEstadistica(r.prestados, 'Prestados'),
      crearEstadistica(r.coleccion, 'De colección'),
      crearEstadistica(r.vencidos, 'Vencidos', r.vencidos > 0)
    );

    resumenGeneros.replaceChildren.apply(resumenGeneros, r.porGenero.map(function (g) {
      return crear('li', {},
        crear('span', { clase: 'genero', texto: g.genero }),
        crear('strong', { texto: String(g.cantidad) })
      );
    }));
    generosVacio.hidden = r.porGenero.length !== 0;
  }

  /* ================= Render: menú ================= */

  function renderMenu() {
    const activos = B.prestamosActivosOrdenados().length;
    enlacePrestamos.textContent = 'Mis préstamos (' + activos + ')';
    const usuario = B.obtenerUsuario();
    saludo.textContent = usuario ? 'Hola, ' + usuario : '';
  }

  // Después de cada cambio en los datos: la interfaz se vuelve a dibujar desde cero a partir de ellos.
  function renderTodo() {
    renderCatalogo();
    renderPrestamos();
    renderResumen();
    renderMenu();
  }

  /* ================= Modales propios ================= */

  function modalAbierto() {
    if (!modalPrestar.hidden) return modalPrestar;
    if (!modalConfirmar.hidden) return modalConfirmar;
    return null;
  }

  function abrirModal(fondo, focoInicial) {
    focoPrevio = document.activeElement;
    fondo.hidden = false;
    document.body.classList.add('con-modal');
    focoInicial.focus();
  }

  // Devuelve true si había un modal abierto y lo cerró.
  function cerrarModal() {
    const abierto = modalAbierto();
    if (!abierto) return false;
    abierto.hidden = true;
    document.body.classList.remove('con-modal');
    idPrestando = null;
    accionConfirmar = null;
    if (focoPrevio && document.contains(focoPrevio)) focoPrevio.focus();
    focoPrevio = null;
    return true;
  }

  function mantenerFocoEnModal(evento) {
    const abierto = modalAbierto();
    if (!abierto) return;
    const enfocables = Array.from(abierto.querySelectorAll('button:not([disabled]), input, select, textarea'));
    if (enfocables.length === 0) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  function abrirModalPrestar(libro) {
    idPrestando = libro.id;
    modalPrestarLibro.textContent = 'Libro: «' + libro.titulo + '»';
    campoPersona.value = B.obtenerUsuario(); // prellenado con el nombre guardado en la Vista 4
    errorPersona.textContent = '';
    campoPersona.removeAttribute('aria-invalid');
    abrirModal(modalPrestar, campoPersona);
    campoPersona.select();
  }

  function abrirModalConfirmar(titulo, texto, textoBoton, alConfirmar) {
    $('#modal-confirmar-titulo').textContent = titulo;
    modalConfirmarTexto.textContent = texto;
    btnAceptarConfirmar.textContent = textoBoton;
    accionConfirmar = alConfirmar;
    abrirModal(modalConfirmar, $('#cancelar-confirmar'));
  }

  /* ================= Acciones del catálogo y de préstamos ================= */

  function accionPrestar(idLibro) {
    const libro = B.obtenerLibro(idLibro);
    if (!libro) return;
    // Si ya se sabe que no se puede (cuarto préstamo, colección...), se avisa en la página sin abrir el modal.
    const motivo = B.motivoNoPrestable(idLibro);
    if (motivo) {
      mostrarAviso(motivo, 'error');
      return;
    }
    abrirModalPrestar(libro);
  }

  function accionDevolver(idLibro) {
    const resultado = B.devolver(idLibro);
    if (!resultado.ok) {
      mostrarAviso(resultado.mensaje, 'error');
      return;
    }
    const detalle = resultado.aTiempo
      ? 'se devolvió a tiempo.'
      : 'se devolvió con ' + B.plural(resultado.diasRetraso, 'día', 'días') + ' de retraso.';
    mostrarAviso('«' + resultado.titulo + '» ' + detalle, 'exito');
    renderTodo();
  }

  function accionEliminar(idLibro) {
    const libro = B.obtenerLibro(idLibro);
    if (!libro) return;
    const motivo = B.motivoNoEliminable(idLibro);
    if (motivo) {
      mostrarAviso(motivo, 'error');
      return;
    }
    abrirModalConfirmar('Eliminar libro', '¿Eliminar «' + libro.titulo + '»?', 'Eliminar', function () {
      const resultado = B.eliminarLibro(idLibro);
      if (!resultado.ok) {
        mostrarAviso(resultado.mensaje, 'error');
        return;
      }
      if (idEditando === idLibro) limpiarFormulario(); // si se estaba editando, se cancela la edición
      mostrarAviso('«' + resultado.titulo + '» se eliminó junto con su historial de préstamos.', 'exito');
      renderTodo();
    });
  }

  function accionEditar(idLibro) {
    const libro = B.obtenerLibro(idLibro);
    if (!libro) return;
    limpiarErrores();
    idEditando = libro.id;
    campos.titulo.value = libro.titulo;
    campos.autor.value = libro.autor;
    campos.anio.value = String(libro.anio);
    campos.genero.value = libro.genero;
    campos.comentario.value = libro.comentario || '';
    campos.coleccion.checked = libro.coleccion;
    actualizarContadorComentario();
    tituloFormulario.textContent = 'Editar libro';
    btnEnviar.textContent = 'Guardar cambios';
    btnCancelarEdicion.hidden = false;
    mostrarVista('formulario');
    campos.titulo.focus();
  }

  // Delegación de eventos: un solo listener por contenedor atiende todos los botones,
  // incluidos los de tarjetas creadas dinámicamente.
  function manejarClickAcciones(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton || boton.disabled) return;
    const id = boton.dataset.id;
    switch (boton.dataset.accion) {
      case 'prestar': accionPrestar(id); break;
      case 'devolver': accionDevolver(id); break;
      case 'editar': accionEditar(id); break;
      case 'eliminar': accionEliminar(id); break;
      default: break;
    }
  }

  /* ================= Formulario de libros (Vista 3) ================= */

  function leerFormulario() {
    return {
      titulo: campos.titulo.value,
      autor: campos.autor.value,
      anio: campos.anio.value,
      genero: campos.genero.value,
      comentario: campos.comentario.value,
      coleccion: campos.coleccion.checked
    };
  }

  function limpiarErrores() {
    ORDEN_CAMPOS.forEach(function (nombre) {
      $('#error-' + nombre).textContent = '';
      campos[nombre].removeAttribute('aria-invalid');
    });
  }

  // Muestra el error debajo de cada campo y pasa el foco al primer campo con error.
  function mostrarErrores(errores) {
    let primero = null;
    ORDEN_CAMPOS.forEach(function (nombre) {
      const mensaje = errores[nombre];
      $('#error-' + nombre).textContent = mensaje || '';
      if (mensaje) {
        campos[nombre].setAttribute('aria-invalid', 'true');
        if (!primero) primero = campos[nombre];
      } else {
        campos[nombre].removeAttribute('aria-invalid');
      }
    });
    if (primero) primero.focus();
  }

  function actualizarContadorComentario() {
    const restantes = B.COMENTARIO_MAX - campos.comentario.value.length;
    contadorComentario.textContent = restantes === 1 ? 'Queda 1 carácter' : 'Quedan ' + restantes + ' caracteres';
  }

  // Limpia el formulario y lo devuelve al modo "agregar" (también cancela la edición).
  function limpiarFormulario() {
    formLibro.reset();
    idEditando = null;
    limpiarErrores();
    actualizarContadorComentario();
    tituloFormulario.textContent = 'Agregar libro';
    btnEnviar.textContent = 'Agregar libro';
    btnCancelarEdicion.hidden = true;
  }

  function enviarFormularioLibro(evento) {
    evento.preventDefault(); // no se recarga la página
    const datos = leerFormulario();
    const resultado = idEditando ? B.editarLibro(idEditando, datos) : B.agregarLibro(datos);

    if (!resultado.ok) {
      if (resultado.mensaje) {
        mostrarAviso(resultado.mensaje, 'error');
        limpiarFormulario();
        renderTodo();
      } else {
        limpiarAviso();
        mostrarErrores(resultado.errores);
      }
      return;
    }

    const editando = idEditando !== null;
    limpiarFormulario();
    mostrarAviso(
      editando
        ? 'Cambios guardados en «' + resultado.libro.titulo + '».'
        : '«' + resultado.libro.titulo + '» se agregó al catálogo.',
      'exito'
    );
    renderTodo();
  }

  /* ================= Tema, usuario y restablecer (Vista 4) ================= */

  function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    temaActual.textContent = 'Tema actual: ' + (tema === 'dark' ? 'oscuro' : 'claro');
    btnTema.textContent = tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }

  function temaInicial() {
    const guardado = B.obtenerTema();
    if (guardado) return guardado;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function alternarTema() {
    const nuevo = document.documentElement.dataset.tema === 'dark' ? 'light' : 'dark';
    B.guardarTema(nuevo);
    aplicarTema(nuevo);
  }

  function guardarNombreUsuario(evento) {
    evento.preventDefault();
    const nombre = campoUsuario.value.trim();
    if (nombre !== '' && (nombre.length < B.PERSONA_MIN || nombre.length > B.PERSONA_MAX)) {
      errorUsuario.textContent = 'El nombre debe tener entre ' + B.PERSONA_MIN + ' y ' + B.PERSONA_MAX + ' caracteres.';
      campoUsuario.setAttribute('aria-invalid', 'true');
      campoUsuario.focus();
      return;
    }
    errorUsuario.textContent = '';
    campoUsuario.removeAttribute('aria-invalid');
    B.guardarUsuario(nombre);
    campoUsuario.value = nombre;
    renderMenu();
    mostrarAviso(nombre ? 'Nombre guardado: ' + nombre + '.' : 'Se quitó tu nombre.', 'exito');
  }

  function sincronizarControlesDeCatalogo() {
    inputBusqueda.value = filtros.busqueda;
    selectOrdenarPor.value = orden.campo;
    selectDireccion.value = orden.direccion;
  }

  function restablecerBiblioteca() {
    B.resetear();
    filtros.busqueda = '';
    filtros.estado = 'todos';
    filtros.genero = '';
    orden = B.obtenerOrden();
    sincronizarControlesDeCatalogo();
    campoUsuario.value = B.obtenerUsuario();
    errorUsuario.textContent = '';
    aplicarTema(temaInicial());
    limpiarFormulario();
    renderTodo();
    mostrarAviso('La biblioteca se restableció a los libros y préstamos iniciales.', 'exito');
  }

  /* ================= Eventos ================= */

  function registrarEventos() {
    // Menú: cambia de vista sin recargar la página.
    $('.menu').addEventListener('click', function (evento) {
      const enlace = evento.target.closest('a[data-vista]');
      if (!enlace) return;
      evento.preventDefault();
      mostrarVista(enlace.dataset.vista);
    });

    window.addEventListener('hashchange', function () {
      const nombre = window.location.hash.slice(1);
      if (vistas.some(function (v) { return v.dataset.vista === nombre; })) mostrarVista(nombre);
    });

    // Catálogo: búsqueda mientras se escribe, filtros y orden.
    inputBusqueda.addEventListener('input', function () {
      filtros.busqueda = inputBusqueda.value;
      renderCatalogo();
    });

    contenedorFiltros.addEventListener('click', function (evento) {
      const boton = evento.target.closest('button[data-estado]');
      if (!boton) return;
      filtros.estado = boton.dataset.estado;
      renderCatalogo();
    });

    selectFiltroGenero.addEventListener('change', function () {
      filtros.genero = selectFiltroGenero.value;
      renderCatalogo();
    });

    function cambiarOrden() {
      orden = { campo: selectOrdenarPor.value, direccion: selectDireccion.value };
      B.guardarOrden(orden); // la elección se conserva al recargar
      renderCatalogo();
    }
    selectOrdenarPor.addEventListener('change', cambiarOrden);
    selectDireccion.addEventListener('change', cambiarOrden);

    // Botones de tarjetas y de la lista de préstamos (delegación).
    listaLibros.addEventListener('click', manejarClickAcciones);
    listaPrestamos.addEventListener('click', manejarClickAcciones);

    // Modal de préstamo.
    formPrestar.addEventListener('submit', function (evento) {
      evento.preventDefault();
      const resultado = B.prestar(idPrestando, campoPersona.value);
      if (!resultado.ok) {
        if (resultado.campo === 'persona') {
          // El error de validación se escribe dentro del modal.
          errorPersona.textContent = resultado.mensaje;
          campoPersona.setAttribute('aria-invalid', 'true');
          campoPersona.focus();
        } else {
          cerrarModal();
          mostrarAviso(resultado.mensaje, 'error');
        }
        return;
      }
      cerrarModal();
      mostrarAviso(
        '«' + resultado.libro.titulo + '» se prestó a ' + resultado.prestamo.persona +
        '. Debe devolverse antes del ' + B.formatearFecha(resultado.prestamo.fechaLimite) + '.',
        'exito'
      );
      renderTodo();
    });

    campoPersona.addEventListener('input', function () {
      errorPersona.textContent = '';
      campoPersona.removeAttribute('aria-invalid');
    });

    $('#cancelar-prestar').addEventListener('click', cerrarModal);
    $('#cancelar-confirmar').addEventListener('click', cerrarModal);

    btnAceptarConfirmar.addEventListener('click', function () {
      const accion = accionConfirmar;
      cerrarModal();
      if (accion) accion();
    });

    // Clic en el fondo oscuro cierra el modal (pero no clics dentro de la ventana).
    [modalPrestar, modalConfirmar].forEach(function (fondo) {
      fondo.addEventListener('click', function (evento) {
        if (evento.target === fondo) cerrarModal();
      });
    });

    // Formulario de libros.
    formLibro.addEventListener('submit', enviarFormularioLibro);
    campos.comentario.addEventListener('input', actualizarContadorComentario);
    btnCancelarEdicion.addEventListener('click', function () {
      limpiarFormulario();
      mostrarAviso('Edición cancelada.', 'exito');
    });

    // Al corregir un campo se quita su mensaje de error.
    ORDEN_CAMPOS.forEach(function (nombre) {
      const evento = nombre === 'genero' || nombre === 'coleccion' ? 'change' : 'input';
      campos[nombre].addEventListener(evento, function () {
        $('#error-' + nombre).textContent = '';
        campos[nombre].removeAttribute('aria-invalid');
      });
    });

    // Ajustes.
    btnTema.addEventListener('click', alternarTema);
    formUsuario.addEventListener('submit', guardarNombreUsuario);
    btnRestablecer.addEventListener('click', function () {
      abrirModalConfirmar(
        'Restablecer biblioteca',
        '¿Restablecer la biblioteca? Se borrará todo lo guardado (libros, préstamos, tema, nombre y orden) y se volverá a los datos iniciales.',
        'Restablecer',
        restablecerBiblioteca
      );
    });

    // Teclado global: Escape y atrapar el foco dentro del modal.
    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') {
        // Si hay un modal abierto, Escape solo cierra el modal y no toca el formulario.
        if (cerrarModal()) {
          evento.preventDefault();
          return;
        }
        if (vistaActual === 'formulario') limpiarFormulario();
        return;
      }
      if (evento.key === 'Tab') mantenerFocoEnModal(evento);
    });
  }

  /* ================= Inicio ================= */

  function llenarSelectorDeGenerosDelFormulario() {
    B.GENEROS.forEach(function (g) {
      campos.genero.append(crear('option', { texto: g.charAt(0).toUpperCase() + g.slice(1), atributos: { value: g } }));
    });
  }

  function iniciar() {
    B.cargar();
    orden = B.obtenerOrden();
    llenarSelectorDeGenerosDelFormulario();
    sincronizarControlesDeCatalogo();
    campoUsuario.value = B.obtenerUsuario();
    aplicarTema(temaInicial());
    actualizarContadorComentario();
    registrarEventos();
    renderTodo();
    mostrarVista(window.location.hash.slice(1) || 'catalogo');
  }

  iniciar();
})();
