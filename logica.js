/*
 * logica.js — Reglas de negocio y persistencia de la biblioteca.
 *
 * Este archivo NO toca el DOM: no usa document, no dibuja nada.
 * Solo trabaja con los datos (libros y prestamos) y con localStorage.
 * La interfaz (ui.js) llama a estas funciones y se redibuja a partir de los datos.
 */
(function (global) {
  'use strict';

  /* ================= Constantes ================= */

  const MAX_PRESTAMOS_ACTIVOS = 3;
  const DIAS_PRESTAMO = 14;
  const MS_POR_DIA = 24 * 60 * 60 * 1000;

  const TITULO_MIN = 3;
  const TITULO_MAX = 60;
  const PERSONA_MIN = 2;
  const PERSONA_MAX = 40;
  const ANIO_MIN = 1000;
  const ANIO_MAX = 2026;
  const COMENTARIO_MAX = 120;

  const GENEROS = [
    'novela', 'cuento', 'poesía', 'ensayo', 'ciencia',
    'historia', 'biografía', 'infantil', 'tecnología'
  ];

  const CLAVES = {
    libros: 'biblioteca.libros',
    prestamos: 'biblioteca.prestamos',
    tema: 'biblioteca.tema',
    usuario: 'biblioteca.usuario',
    orden: 'biblioteca.orden'
  };

  const CAMPOS_ORDEN = ['titulo', 'autor', 'anio'];
  const ORDEN_INICIAL = { campo: 'titulo', direccion: 'asc' };

  const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

  /* ================= Fechas (formato ISO "AAAA-MM-DD") ================= */
  // Se guardan solo como texto de fecha (sin hora) para evitar problemas de zona horaria.

  function dosDigitos(n) {
    return String(n).padStart(2, '0');
  }

  function hoy() {
    const f = new Date();
    return f.getFullYear() + '-' + dosDigitos(f.getMonth() + 1) + '-' + dosDigitos(f.getDate());
  }

  function aMilisegundosUTC(iso) {
    const partes = iso.split('-').map(Number);
    return Date.UTC(partes[0], partes[1] - 1, partes[2]);
  }

  function sumarDias(iso, dias) {
    return new Date(aMilisegundosUTC(iso) + dias * MS_POR_DIA).toISOString().slice(0, 10);
  }

  function diferenciaEnDias(desde, hasta) {
    return Math.round((aMilisegundosUTC(hasta) - aMilisegundosUTC(desde)) / MS_POR_DIA);
  }

  function formatearFecha(iso) {
    const partes = iso.split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  /* ================= Utilidades de texto ================= */

  // Para buscar y comparar duplicados: sin tildes, sin mayúsculas, sin espacios sobrantes.
  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function crearId(prefijo) {
    return prefijo + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function plural(n, singular, pluralTexto) {
    return n + ' ' + (n === 1 ? singular : pluralTexto);
  }

  /* ================= Estado en memoria ================= */

  let libros = [];
  let prestamos = [];

  /* ================= Datos iniciales ================= */
  // Las fechas se calculan a partir de hoy para que no queden desfasadas.

  function crearDatosIniciales() {
    const h = hoy();

    const librosIniciales = [
      { id: 'l1', titulo: 'Cien años de soledad', autor: 'Gabriel García Márquez', anio: 1967, genero: 'novela', coleccion: false, comentario: 'La saga de la familia Buendía en Macondo.' },
      { id: 'l2', titulo: 'Doña Bárbara', autor: 'Rómulo Gallegos', anio: 1929, genero: 'novela', coleccion: false, comentario: '' },
      { id: 'l3', titulo: 'Cosmos', autor: 'Carl Sagan', anio: 1980, genero: 'ciencia', coleccion: false, comentario: 'Un viaje por el universo y la historia de la ciencia.' },
      { id: 'l4', titulo: 'Breve historia del tiempo', autor: 'Stephen Hawking', anio: 1988, genero: 'ciencia', coleccion: false, comentario: '' },
      { id: 'l5', titulo: 'Sapiens', autor: 'Yuval Noah Harari', anio: 2011, genero: 'historia', coleccion: false, comentario: 'De animales a dioses: historia de la humanidad.' },
      { id: 'l6', titulo: 'Las venas abiertas de América Latina', autor: 'Eduardo Galeano', anio: 1971, genero: 'historia', coleccion: false, comentario: '' },
      { id: 'l7', titulo: 'Platero y yo', autor: 'Juan Ramón Jiménez', anio: 1914, genero: 'poesía', coleccion: false, comentario: '' },
      { id: 'l8', titulo: 'Versos sencillos', autor: 'José Martí', anio: 1891, genero: 'poesía', coleccion: true, comentario: 'Edición de colección.' },
      { id: 'l9', titulo: 'Don Quijote de la Mancha', autor: 'Miguel de Cervantes', anio: 1605, genero: 'novela', coleccion: true, comentario: 'Ejemplar antiguo, solo consulta.' },
      { id: 'l10', titulo: 'Pedro Páramo', autor: 'Juan Rulfo', anio: 1955, genero: 'novela', coleccion: false, comentario: '' }
    ];

    const prestamosIniciales = [
      // Activo, a tiempo
      { id: 'p1', idLibro: 'l3', persona: 'Ana', fechaPrestamo: sumarDias(h, -5), fechaLimite: sumarDias(h, 9), fechaDevolucion: null },
      // Activo y VENCIDO (6 días de retraso)
      { id: 'p2', idLibro: 'l5', persona: 'Luis', fechaPrestamo: sumarDias(h, -20), fechaLimite: sumarDias(h, -6), fechaDevolucion: null },
      // Devuelto a tiempo
      { id: 'p3', idLibro: 'l1', persona: 'Marta', fechaPrestamo: sumarDias(h, -30), fechaLimite: sumarDias(h, -16), fechaDevolucion: sumarDias(h, -22) },
      // Devuelto con retraso (6 días)
      { id: 'p4', idLibro: 'l4', persona: 'Carlos', fechaPrestamo: sumarDias(h, -40), fechaLimite: sumarDias(h, -26), fechaDevolucion: sumarDias(h, -20) }
    ];

    return { libros: librosIniciales, prestamos: prestamosIniciales };
  }

  /* ================= Persistencia ================= */

  function leer(clave) {
    try {
      const texto = localStorage.getItem(clave);
      return texto === null ? null : JSON.parse(texto);
    } catch (error) {
      return null;
    }
  }

  function escribir(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch (error) {
      // Si el almacenamiento falla (modo privado, cuota), la app sigue funcionando en memoria.
    }
  }

  function esLibroValido(l) {
    return l !== null && typeof l === 'object' &&
      typeof l.id === 'string' &&
      typeof l.titulo === 'string' &&
      typeof l.autor === 'string' &&
      typeof l.anio === 'number' &&
      typeof l.genero === 'string' &&
      typeof l.coleccion === 'boolean';
  }

  function esPrestamoValido(p) {
    return p !== null && typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.idLibro === 'string' &&
      typeof p.persona === 'string' &&
      typeof p.fechaPrestamo === 'string' && REGEX_FECHA.test(p.fechaPrestamo) &&
      typeof p.fechaLimite === 'string' && REGEX_FECHA.test(p.fechaLimite) &&
      (p.fechaDevolucion === null ||
        (typeof p.fechaDevolucion === 'string' && REGEX_FECHA.test(p.fechaDevolucion)));
  }

  // Todo préstamo debe apuntar a un libro que existe y cada libro tiene un solo préstamo activo.
  function sanearPrestamos(lista, listaLibros) {
    const idsLibros = new Set(listaLibros.map(function (l) { return l.id; }));
    const conActivo = new Set();
    return lista.filter(function (p) {
      if (!idsLibros.has(p.idLibro)) return false;
      if (p.fechaDevolucion === null) {
        if (conActivo.has(p.idLibro)) return false;
        conActivo.add(p.idLibro);
      }
      return true;
    });
  }

  function guardar() {
    escribir(CLAVES.libros, libros);
    escribir(CLAVES.prestamos, prestamos);
  }

  function cargar() {
    const librosGuardados = leer(CLAVES.libros);
    const prestamosGuardados = leer(CLAVES.prestamos);

    if (Array.isArray(librosGuardados)) {
      libros = librosGuardados.filter(esLibroValido);
      prestamos = Array.isArray(prestamosGuardados)
        ? sanearPrestamos(prestamosGuardados.filter(esPrestamoValido), libros)
        : [];
    } else {
      const iniciales = crearDatosIniciales();
      libros = iniciales.libros;
      prestamos = iniciales.prestamos;
      guardar();
    }
  }

  function resetear() {
    Object.keys(CLAVES).forEach(function (nombre) {
      try { localStorage.removeItem(CLAVES[nombre]); } catch (error) { /* se ignora */ }
    });
    const iniciales = crearDatosIniciales();
    libros = iniciales.libros;
    prestamos = iniciales.prestamos;
    guardar();
  }

  /* ----- Preferencias: tema, nombre de usuario, orden del catálogo ----- */

  function obtenerTema() {
    const tema = leer(CLAVES.tema);
    return tema === 'dark' || tema === 'light' ? tema : null;
  }

  function guardarTema(tema) {
    escribir(CLAVES.tema, tema);
  }

  function obtenerUsuario() {
    const usuario = leer(CLAVES.usuario);
    return typeof usuario === 'string' ? usuario : '';
  }

  function guardarUsuario(nombre) {
    escribir(CLAVES.usuario, nombre);
  }

  function obtenerOrden() {
    const orden = leer(CLAVES.orden);
    if (orden && CAMPOS_ORDEN.includes(orden.campo) &&
      (orden.direccion === 'asc' || orden.direccion === 'desc')) {
      return { campo: orden.campo, direccion: orden.direccion };
    }
    return { campo: ORDEN_INICIAL.campo, direccion: ORDEN_INICIAL.direccion };
  }

  function guardarOrden(orden) {
    escribir(CLAVES.orden, { campo: orden.campo, direccion: orden.direccion });
  }

  /* ================= Consultas (todo se calcula, nada se duplica) ================= */

  function obtenerLibros() {
    return libros.slice();
  }

  function obtenerLibro(idLibro) {
    return libros.find(function (l) { return l.id === idLibro; }) || null;
  }

  function obtenerPrestamos() {
    return prestamos.slice();
  }

  function prestamoActivoDe(idLibro) {
    return prestamos.find(function (p) {
      return p.idLibro === idLibro && p.fechaDevolucion === null;
    }) || null;
  }

  function estadoLibro(libro) {
    if (prestamoActivoDe(libro.id)) return 'prestado';
    if (libro.coleccion) return 'coleccion';
    return 'disponible';
  }

  function estaVencido(prestamo, fechaHoy) {
    return prestamo.fechaDevolucion === null && prestamo.fechaLimite < (fechaHoy || hoy());
  }

  // Días de retraso: si sigue activo se mide contra hoy; si ya se devolvió, contra la fecha de devolución.
  function diasRetraso(prestamo, fechaHoy) {
    const referencia = prestamo.fechaDevolucion !== null ? prestamo.fechaDevolucion : (fechaHoy || hoy());
    return Math.max(0, diferenciaEnDias(prestamo.fechaLimite, referencia));
  }

  function prestamosActivosOrdenados() {
    return prestamos
      .filter(function (p) { return p.fechaDevolucion === null; })
      .sort(function (a, b) {
        if (a.fechaLimite !== b.fechaLimite) return a.fechaLimite < b.fechaLimite ? -1 : 1;
        return a.fechaPrestamo < b.fechaPrestamo ? -1 : (a.fechaPrestamo > b.fechaPrestamo ? 1 : 0);
      });
  }

  // Historial: devueltos, del más reciente al más antiguo.
  function historialOrdenado() {
    return prestamos
      .filter(function (p) { return p.fechaDevolucion !== null; })
      .sort(function (a, b) {
        if (a.fechaDevolucion !== b.fechaDevolucion) return a.fechaDevolucion < b.fechaDevolucion ? 1 : -1;
        return a.fechaPrestamo < b.fechaPrestamo ? 1 : (a.fechaPrestamo > b.fechaPrestamo ? -1 : 0);
      });
  }

  function generosExistentes() {
    const unicos = Array.from(new Set(libros.map(function (l) { return l.genero; })));
    return unicos.sort(function (a, b) { return a.localeCompare(b, 'es', { sensitivity: 'base' }); });
  }

  function resumen() {
    const h = hoy();
    let disponibles = 0;
    let prestados = 0;
    let coleccion = 0;
    const conteo = new Map();

    libros.forEach(function (l) {
      const estado = estadoLibro(l);
      if (estado === 'disponible') disponibles++;
      else if (estado === 'prestado') prestados++;
      else coleccion++;
      conteo.set(l.genero, (conteo.get(l.genero) || 0) + 1);
    });

    const vencidos = prestamos.filter(function (p) { return estaVencido(p, h); }).length;
    const porGenero = Array.from(conteo.entries())
      .map(function (par) { return { genero: par[0], cantidad: par[1] }; })
      .sort(function (a, b) { return a.genero.localeCompare(b.genero, 'es', { sensitivity: 'base' }); });

    return { total: libros.length, disponibles: disponibles, prestados: prestados, coleccion: coleccion, vencidos: vencidos, porGenero: porGenero };
  }

  /* ================= Filtrar y ordenar (no modifican los datos originales) ================= */

  function filtrarLibros(lista, filtros) {
    const consulta = normalizar(filtros.busqueda || '');
    return lista.filter(function (l) {
      if (consulta && !(normalizar(l.titulo).includes(consulta) || normalizar(l.autor).includes(consulta))) return false;
      if (filtros.genero && l.genero !== filtros.genero) return false;
      const estado = estadoLibro(l);
      if (filtros.estado === 'disponibles' && estado !== 'disponible') return false;
      if (filtros.estado === 'prestados' && estado !== 'prestado') return false;
      return true;
    });
  }

  function ordenarLibros(lista, orden) {
    const factor = orden.direccion === 'desc' ? -1 : 1;
    const campo = CAMPOS_ORDEN.includes(orden.campo) ? orden.campo : 'titulo';
    const copia = lista.slice(); // se ordena una copia: el arreglo original queda intacto
    copia.sort(function (a, b) {
      let resultado;
      if (campo === 'anio') {
        resultado = a.anio - b.anio;
      } else {
        // localeCompare con 'es' ordena bien las tildes y la ñ (después de la n).
        resultado = a[campo].localeCompare(b[campo], 'es', { sensitivity: 'base' });
      }
      if (resultado === 0) {
        resultado = a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' });
      }
      return resultado * factor;
    });
    return copia;
  }

  /* ================= Préstamos ================= */

  function validarPersona(nombre) {
    const limpio = String(nombre || '').trim();
    if (limpio.length < PERSONA_MIN || limpio.length > PERSONA_MAX) {
      return 'El nombre debe tener entre ' + PERSONA_MIN + ' y ' + PERSONA_MAX + ' caracteres.';
    }
    return '';
  }

  // Devuelve el motivo por el que NO se puede prestar, o '' si sí se puede.
  function motivoNoPrestable(idLibro) {
    const libro = obtenerLibro(idLibro);
    if (!libro) return 'El libro no existe.';
    if (libro.coleccion) return '«' + libro.titulo + '» es un ejemplar de colección y no se presta.';
    if (prestamoActivoDe(idLibro)) return '«' + libro.titulo + '» ya está prestado.';
    const activos = prestamos.filter(function (p) { return p.fechaDevolucion === null; }).length;
    if (activos >= MAX_PRESTAMOS_ACTIVOS) {
      return 'No se puede prestar «' + libro.titulo + '»: ya hay ' + MAX_PRESTAMOS_ACTIVOS + ' préstamos activos, que es el máximo permitido.';
    }
    return '';
  }

  function prestar(idLibro, persona) {
    const motivo = motivoNoPrestable(idLibro);
    if (motivo) return { ok: false, campo: null, mensaje: motivo };

    const errorPersona = validarPersona(persona);
    if (errorPersona) return { ok: false, campo: 'persona', mensaje: errorPersona };

    const fecha = hoy();
    const prestamo = {
      id: crearId('p'),
      idLibro: idLibro,
      persona: String(persona).trim(),
      fechaPrestamo: fecha,
      fechaLimite: sumarDias(fecha, DIAS_PRESTAMO),
      fechaDevolucion: null
    };
    prestamos.push(prestamo); // el libro no se modifica
    guardar();
    return { ok: true, prestamo: prestamo, libro: obtenerLibro(idLibro) };
  }

  function devolver(idLibro) {
    const prestamo = prestamoActivoDe(idLibro);
    if (!prestamo) return { ok: false, mensaje: 'Ese libro no tiene un préstamo activo.' };

    prestamo.fechaDevolucion = hoy(); // no se borra nada: pasa al historial
    guardar();
    const retraso = diasRetraso(prestamo);
    const libro = obtenerLibro(idLibro);
    return {
      ok: true,
      titulo: libro ? libro.titulo : '(libro eliminado)',
      diasRetraso: retraso,
      aTiempo: retraso === 0
    };
  }

  /* ================= Libros: validar, agregar, editar, eliminar ================= */

  function validarLibro(datos, idExcluir) {
    const errores = {};
    const titulo = String(datos.titulo || '').trim();
    const autor = String(datos.autor || '').trim();
    const anioTexto = String(datos.anio === undefined || datos.anio === null ? '' : datos.anio).trim();
    const comentario = String(datos.comentario || '');

    if (titulo.length < TITULO_MIN || titulo.length > TITULO_MAX) {
      errores.titulo = 'El título debe tener entre ' + TITULO_MIN + ' y ' + TITULO_MAX + ' caracteres.';
    }

    if (autor === '') {
      errores.autor = 'El autor es obligatorio.';
    }

    if (anioTexto === '') {
      errores.anio = 'El año es obligatorio.';
    } else {
      const anio = Number(anioTexto);
      if (!Number.isInteger(anio) || anio < ANIO_MIN || anio > ANIO_MAX) {
        errores.anio = 'El año debe ser un número entero entre ' + ANIO_MIN + ' y ' + ANIO_MAX + '.';
      }
    }

    if (!GENEROS.includes(datos.genero)) {
      errores.genero = 'Elige un género de la lista.';
    }

    if (comentario.length > COMENTARIO_MAX) {
      errores.comentario = 'El comentario no puede superar los ' + COMENTARIO_MAX + ' caracteres.';
    }

    // Duplicado: mismo título y mismo autor (el libro que se edita no cuenta contra sí mismo).
    if (!errores.titulo && autor !== '') {
      const duplicado = libros.some(function (l) {
        return l.id !== idExcluir &&
          normalizar(l.titulo) === normalizar(titulo) &&
          normalizar(l.autor) === normalizar(autor);
      });
      if (duplicado) errores.titulo = 'Ya existe un libro con el mismo título y autor.';
    }

    // Un libro con préstamo activo no puede marcarse como de colección.
    if (datos.coleccion && idExcluir && prestamoActivoDe(idExcluir)) {
      errores.coleccion = 'Un libro con préstamo activo no puede marcarse como de colección.';
    }

    return errores;
  }

  function agregarLibro(datos) {
    const errores = validarLibro(datos, null);
    if (Object.keys(errores).length > 0) return { ok: false, errores: errores };

    const libro = {
      id: crearId('libro'),
      titulo: String(datos.titulo).trim(),
      autor: String(datos.autor).trim(),
      anio: Number(datos.anio),
      genero: datos.genero,
      coleccion: Boolean(datos.coleccion),
      comentario: String(datos.comentario || '').trim()
    };
    libros.push(libro);
    guardar();
    return { ok: true, libro: libro };
  }

  function editarLibro(idLibro, datos) {
    const libro = obtenerLibro(idLibro);
    if (!libro) return { ok: false, errores: {}, mensaje: 'El libro que intentas editar ya no existe.' };

    const errores = validarLibro(datos, idLibro);
    if (Object.keys(errores).length > 0) return { ok: false, errores: errores };

    libro.titulo = String(datos.titulo).trim();
    libro.autor = String(datos.autor).trim();
    libro.anio = Number(datos.anio);
    libro.genero = datos.genero;
    libro.coleccion = Boolean(datos.coleccion);
    libro.comentario = String(datos.comentario || '').trim();
    guardar();
    return { ok: true, libro: libro };
  }

  function motivoNoEliminable(idLibro) {
    const libro = obtenerLibro(idLibro);
    if (!libro) return 'El libro no existe.';
    if (prestamoActivoDe(idLibro)) {
      return 'No se puede eliminar «' + libro.titulo + '» porque tiene un préstamo activo. Devuélvelo primero.';
    }
    return '';
  }

  function eliminarLibro(idLibro) {
    const motivo = motivoNoEliminable(idLibro);
    if (motivo) return { ok: false, mensaje: motivo };

    const libro = obtenerLibro(idLibro);
    libros = libros.filter(function (l) { return l.id !== idLibro; });
    // Se elimina también su historial de préstamos devueltos.
    prestamos = prestamos.filter(function (p) { return p.idLibro !== idLibro; });
    guardar();
    return { ok: true, titulo: libro.titulo };
  }

  /* ================= API pública ================= */

  global.BibliotecaLogica = {
    // constantes
    MAX_PRESTAMOS_ACTIVOS: MAX_PRESTAMOS_ACTIVOS,
    DIAS_PRESTAMO: DIAS_PRESTAMO,
    PERSONA_MIN: PERSONA_MIN,
    PERSONA_MAX: PERSONA_MAX,
    COMENTARIO_MAX: COMENTARIO_MAX,
    GENEROS: GENEROS.slice(),
    // fechas
    hoy: hoy,
    sumarDias: sumarDias,
    diferenciaEnDias: diferenciaEnDias,
    formatearFecha: formatearFecha,
    plural: plural,
    // persistencia
    cargar: cargar,
    resetear: resetear,
    obtenerTema: obtenerTema,
    guardarTema: guardarTema,
    obtenerUsuario: obtenerUsuario,
    guardarUsuario: guardarUsuario,
    obtenerOrden: obtenerOrden,
    guardarOrden: guardarOrden,
    // consultas
    obtenerLibros: obtenerLibros,
    obtenerLibro: obtenerLibro,
    obtenerPrestamos: obtenerPrestamos,
    prestamoActivoDe: prestamoActivoDe,
    estadoLibro: estadoLibro,
    estaVencido: estaVencido,
    diasRetraso: diasRetraso,
    prestamosActivosOrdenados: prestamosActivosOrdenados,
    historialOrdenado: historialOrdenado,
    generosExistentes: generosExistentes,
    resumen: resumen,
    // filtrar / ordenar
    filtrarLibros: filtrarLibros,
    ordenarLibros: ordenarLibros,
    // operaciones
    validarPersona: validarPersona,
    motivoNoPrestable: motivoNoPrestable,
    prestar: prestar,
    devolver: devolver,
    validarLibro: validarLibro,
    agregarLibro: agregarLibro,
    editarLibro: editarLibro,
    motivoNoEliminable: motivoNoEliminable,
    eliminarLibro: eliminarLibro
  };
})(window);
