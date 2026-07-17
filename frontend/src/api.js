export const urlApi = import.meta.env.VITE_API_URL || "http://localhost:4000"

// se registra desde App.jsx: qué hacer cuando CUALQUIER petición devuelve
// 401 (token caducado o inválido). Si no hay sesión iniciada, limpiar un
// token que ya es null no tiene ningún efecto visible, así que no hace
// falta comprobar aquí si había sesión antes de llamarlo.
let manejador401 = null
export function alExpirarSesion(fn){
    manejador401 = fn
}

function comprobarRespuesta(respuesta){
    if(!respuesta.ok){
        if(respuesta.status === 401 && manejador401) manejador401()
        throw respuesta.status
    }
}

function peticion(ruta,opciones = {}){
    return fetch(`${urlApi}${ruta}`,{
        ...opciones,
        headers : {
            "Content-type" : "application/json",
            ...(opciones.headers || {})
        }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)

        // respuestas sin cuerpo (204 de los PUT/DELETE)
        if(respuesta.status === 204){
            return null
        }

        return respuesta.json()
    })
}

export function registrarUsuario(datos){
    return peticion("/registro",{
        method : "POST",
        body : JSON.stringify(datos)
    })
}

export function iniciarSesion(datos){
    return peticion("/login",{
        method : "POST",
        body : JSON.stringify(datos)
    })
}

// traduce lo que lanza peticion() a un mensaje legible: un número (fallo
// HTTP) o un Error real de fetch (típicamente sin conexión, no hay
// número de estado para eso)
export function mensajeErrorLogin(codigo){
    if(codigo === 401) return "Email y/o contraseña incorrectos"
    if(codigo === 429) return "Demasiados intentos fallidos, inténtalo de nuevo en unos minutos"
    if(typeof codigo === "number") return "Ha ocurrido un error, inténtalo de nuevo"
    return "No se ha podido conectar con el servidor. Comprueba tu conexión"
}

export function mensajeErrorRegistro(codigo){
    if(codigo === 409) return "Ese email ya está registrado"
    if(typeof codigo === "number") return "Revisa los datos: el nombre, que el email sea válido y que la contraseña tenga 6 caracteres o más con letras y números"
    return "No se ha podido conectar con el servidor. Comprueba tu conexión"
}

export function loginConGoogle(credential){
    return peticion("/login/google",{
        method : "POST",
        body : JSON.stringify({ credential })
    })
}

export function obtenerYo(token){
    return peticion("/yo",{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function crearFamilia(datos,token){
    return peticion("/familias",{
        method : "POST",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarFamilias(token){
    return peticion("/familias",{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarMiembros(idFamilia,token){
    return peticion(`/miembros/${idFamilia}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function crearMiembro(datos,token){
    return peticion("/miembros",{
        method : "POST",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function rellenarMiembro(idMiembro,datos,token){
    return peticion(`/miembros/${idMiembro}/rellenar`,{
        method : "PUT",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function obtenerMiembro(idMiembro,token){
    return peticion(`/miembro/${idMiembro}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarRecetasDeMiembro(idMiembro,token){
    return peticion(`/recetas/miembro/${idMiembro}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarAportacionesDeMiembro(idMiembro,token){
    return peticion(`/recetas/aportaciones/${idMiembro}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function obtenerReceta(idReceta,token){
    return peticion(`/recetas/${idReceta}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function crearReceta(datos,token){
    return peticion("/recetas",{
        method : "POST",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

// subida de imágenes: multipart, sin cabecera JSON (el navegador pone el boundary)
export function subirFotosReceta(idReceta,formData,token){
    return fetch(`${urlApi}/recetas/${idReceta}/fotos`,{
        method : "POST",
        body : formData,
        headers : { authorization : `Bearer ${token}` }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)
        return respuesta.json()
    })
}

// quita una foto ya guardada de la receta
export function quitarFotoReceta(idReceta,foto,token){
    return peticion(`/recetas/${idReceta}/fotos`,{
        method : "DELETE",
        body : JSON.stringify({ foto }),
        headers : { authorization : `Bearer ${token}` }
    })
}

// hace portada una foto que ya estaba guardada en la receta
export function cambiarPortadaReceta(idReceta,foto,token){
    return peticion(`/recetas/${idReceta}/portada`,{
        method : "PUT",
        body : JSON.stringify({ foto }),
        headers : { authorization : `Bearer ${token}` }
    })
}

// foto (opcional) de un paso concreto de la preparación; "indice" es la
// posición del paso dentro del array ya guardado en el servidor
export function subirFotoPasoReceta(idReceta,indice,formData,token){
    return fetch(`${urlApi}/recetas/${idReceta}/pasos/${indice}/foto`,{
        method : "POST",
        body : formData,
        headers : { authorization : `Bearer ${token}` }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)
        return respuesta.json()
    })
}

export function obtenerInicio(token){
    return peticion("/inicio",{
        headers : { authorization : `Bearer ${token}` }
    })
}

// sugerencias pendientes de revisión + recetas recién añadidas, para el panel de notificaciones
export function obtenerNotificaciones(token){
    return peticion("/notificaciones",{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function actualizarYo(datos,token){
    return peticion("/yo",{
        method : "PUT",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function actualizarMiembro(idMiembro,datos,token){
    return peticion(`/miembros/${idMiembro}`,{
        method : "PUT",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function subirFotoMiembro(idMiembro,formData,token){
    return fetch(`${urlApi}/miembros/${idMiembro}/foto`,{
        method : "POST",
        body : formData,
        headers : { authorization : `Bearer ${token}` }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)
        return respuesta.json()
    })
}

export function borrarFotoMiembro(idMiembro,token){
    return peticion(`/miembros/${idMiembro}/foto`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function actualizarFamilia(idFamilia,datos,token){
    return peticion(`/familias/${idFamilia}`,{
        method : "PUT",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function subirFotoFamilia(idFamilia,formData,token){
    return fetch(`${urlApi}/familias/${idFamilia}/foto`,{
        method : "POST",
        body : formData,
        headers : { authorization : `Bearer ${token}` }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)
        return respuesta.json()
    })
}

export function borrarFotoFamilia(idFamilia,token){
    return peticion(`/familias/${idFamilia}/foto`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

// devuelve una URL absoluta para mostrar una imagen:
// si ya es absoluta (Cloudinary, etc.) la devuelve tal cual;
// si es una ruta relativa del servidor antiguo (/uploads/...) le añade el prefijo
export function urlFoto(src){
    if(!src) return null
    if(src.startsWith("http://") || src.startsWith("https://")) return src
    return `${urlApi}${src}`
}

export function marcarFavorito(idReceta,token){
    return peticion(`/favoritos/${idReceta}`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function desmarcarFavorito(idReceta,token){
    return peticion(`/favoritos/${idReceta}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarFavoritos(token){
    return peticion("/favoritos",{
        headers : { authorization : `Bearer ${token}` }
    })
}

// opciones: { categoria, temporada, busqueda, pagina }. Devuelve
// { recetas, total, pagina, limite, hayMas }
export function listarRecetasDeFamilia(idFamilia,token,opciones = {}){
    let params = new URLSearchParams()
    if(opciones.categoria) params.set("categoria",opciones.categoria)
    if(opciones.temporada) params.set("temporada",opciones.temporada)
    if(opciones.busqueda) params.set("busqueda",opciones.busqueda)
    if(opciones.pagina) params.set("pagina",opciones.pagina)
    let query = params.toString()

    return peticion(`/recetas/familia/${idFamilia}${query ? `?${query}` : ""}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

// busca recetas por nombre entre todas mis familias a la vez
export function buscarRecetas(termino,token){
    return peticion(`/recetas/buscar?q=${encodeURIComponent(termino)}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function obtenerFamilia(idFamilia,token){
    return peticion(`/familias/${idFamilia}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function subirFotoYo(formData,token){
    return fetch(`${urlApi}/yo/foto`,{
        method : "POST",
        body : formData,
        headers : { authorization : `Bearer ${token}` }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)
        return respuesta.json()
    })
}

// --- colecciones ---
export function crearColeccion(nombre,token){
    return peticion("/colecciones",{
        method : "POST",
        body : JSON.stringify({ nombre }),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarColecciones(token){
    return peticion("/colecciones",{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function obtenerColeccion(idColeccion,token){
    return peticion(`/colecciones/${idColeccion}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function renombrarColeccion(idColeccion,nombre,token){
    return peticion(`/colecciones/${idColeccion}`,{
        method : "PUT",
        body : JSON.stringify({ nombre }),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function borrarColeccion(idColeccion,token){
    return peticion(`/colecciones/${idColeccion}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function agregarRecetaAColeccion(idColeccion,idReceta,token){
    return peticion(`/colecciones/${idColeccion}/recetas/${idReceta}`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function quitarRecetaDeColeccion(idColeccion,idReceta,token){
    return peticion(`/colecciones/${idColeccion}/recetas/${idReceta}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function listarColeccionesDeMiembro(idMiembro,token){
    return peticion(`/colecciones/miembro/${idMiembro}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function guardarColeccionAjena(idColeccion,token){
    return peticion(`/colecciones/${idColeccion}/guardar`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function quitarColeccionGuardada(idColeccion,token){
    return peticion(`/colecciones/${idColeccion}/guardar`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function coleccionesDeReceta(idReceta,token){
    return peticion(`/recetas/${idReceta}/colecciones`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function editarReceta(idReceta,datos,token){
    return peticion(`/recetas/${idReceta}`,{
        method : "PUT",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

// --- borrar entidades (solo el creador, controlado en el backend) ---
export function borrarFamilia(idFamilia,token){
    return peticion(`/familias/${idFamilia}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

// deja la familia (solo quita mi acceso, no la borra para los demás)
export function salirDeFamilia(idFamilia,token){
    return peticion(`/familias/${idFamilia}/salir`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function borrarMiembro(idMiembro,token){
    return peticion(`/miembros/${idMiembro}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function borrarReceta(idReceta,token){
    return peticion(`/recetas/${idReceta}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function borrarCuenta(token){
    return peticion("/yo",{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

// --- sugerencias ---
export function subirFotoSugerencia(formData,token){
    return fetch(`${urlApi}/sugerencias/foto`,{
        method : "POST",
        body : formData,
        headers : { authorization : `Bearer ${token}` }
    })
    .then(respuesta => {
        comprobarRespuesta(respuesta)
        return respuesta.json()
    })
}

export function crearSugerencia(datos,token){
    return peticion("/sugerencias",{
        method : "POST",
        body : JSON.stringify(datos),
        headers : { authorization : `Bearer ${token}` }
    })
}

export function obtenerSugerencia(idSugerencia,token){
    return peticion(`/sugerencias/${idSugerencia}`,{
        headers : { authorization : `Bearer ${token}` }
    })
}

export function aceptarSugerencia(idSugerencia,token){
    return peticion(`/sugerencias/${idSugerencia}/aceptar`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function rechazarSugerencia(idSugerencia,token){
    return peticion(`/sugerencias/${idSugerencia}`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

// --- invitaciones: vincular familiar a un hueco del árbol ---
export function generarInvitacionMiembro(idMiembro,token){
    return peticion(`/miembros/${idMiembro}/invitacion`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function verInvitacionMiembro(token){
    // pública: sin cabecera de autorización
    return peticion(`/invitaciones/${token}`)
}

export function aceptarInvitacionMiembro(token,tokenSesion){
    return peticion(`/invitaciones/${token}/aceptar`,{
        method : "POST",
        headers : { authorization : `Bearer ${tokenSesion}` }
    })
}

export function desvincularMiembro(idMiembro,token){
    return peticion(`/miembros/${idMiembro}/vinculo`,{
        method : "DELETE",
        headers : { authorization : `Bearer ${token}` }
    })
}

// --- invitaciones: compartir árbol de solo ver ---
export function generarInvitacionVer(idFamilia,token){
    return peticion(`/familias/${idFamilia}/invitacion-ver`,{
        method : "POST",
        headers : { authorization : `Bearer ${token}` }
    })
}

export function verInvitacionVer(token){
    return peticion(`/invitaciones-ver/${token}`)
}

export function aceptarInvitacionVer(token,tokenSesion){
    return peticion(`/invitaciones-ver/${token}/aceptar`,{
        method : "POST",
        headers : { authorization : `Bearer ${tokenSesion}` }
    })
}
