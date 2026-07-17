import dotenv from "dotenv";
dotenv.config({ quiet: true });
//----------------
import { MongoClient, ObjectId } from "mongodb";

// en serverless (Vercel) el módulo se mantiene vivo entre invocaciones
// mientras la instancia siga caliente, así que cacheamos la conexión en
// vez de abrir/cerrar una por cada llamada: abrirla de nuevo cada vez
// sería muy lento (handshake TLS a Atlas) y agotaría conexiones rápido.
let promesaCliente = null;
function conectar() {
    if (!promesaCliente) {
        promesaCliente = MongoClient.connect(process.env.MONGO_URL);
    }
    return promesaCliente;
}

// =========================
//  USUARIOS
// =========================

export async function crearUsuario(usuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    const resultado = await coleccion.insertOne(usuario);
    return resultado.insertedId;
}

export async function buscarUsuarioPorEmail(email) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    return await coleccion.findOne({ email });
}

export async function buscarUsuarioPorId(id) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    return await coleccion.findOne(
        { _id: new ObjectId(id) },
        { projection: { passwordHash: 0 } }
    );
}

export async function actualizarUsuario(idUsuario, cambios) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    const resultado = await coleccion.updateOne(
        { _id: new ObjectId(idUsuario) },
        { $set: cambios }
    );
    return resultado.matchedCount;
}

export async function borrarUsuario(idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    await coleccion.deleteOne({ _id: new ObjectId(idUsuario) });
}

// favoritos: guardados como array de ids de receta (string) en el propio usuario
export async function agregarFavorito(idUsuario, idReceta) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    await coleccion.updateOne(
        { _id: new ObjectId(idUsuario) },
        { $addToSet: { favoritos: idReceta } }
    );
}

export async function quitarFavorito(idUsuario, idReceta) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    await coleccion.updateOne(
        { _id: new ObjectId(idUsuario) },
        { $pull: { favoritos: idReceta } }
    );
}

// =========================
//  COLECCIONES (tipo Pinterest: agrupaciones de recetas por usuario)
// =========================

export async function crearColeccion(coleccion) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    const resultado = await col.insertOne(coleccion);
    return resultado.insertedId;
}

// colecciones guardadas de OTROS usuarios (como Pinterest): array de ids en el usuario
export async function guardarColeccion(idUsuario, idColeccion) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    await coleccion.updateOne(
        { _id: new ObjectId(idUsuario) },
        { $addToSet: { coleccionesGuardadas: idColeccion } }
    );
}

export async function quitarColeccionGuardada(idUsuario, idColeccion) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("usuarios");
    await coleccion.updateOne(
        { _id: new ObjectId(idUsuario) },
        { $pull: { coleccionesGuardadas: idColeccion } }
    );
}

export async function leerColeccionesDeUsuario(idUsuario) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    return await col.find({ usuario: idUsuario }).sort({ creado: -1 }).toArray();
}

export async function buscarColeccionPorId(idColeccion) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    return await col.findOne({ _id: new ObjectId(idColeccion) });
}

export async function actualizarColeccion(idColeccion, cambios) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    await col.updateOne({ _id: new ObjectId(idColeccion) }, { $set: cambios });
}

export async function borrarColeccion(idColeccion) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    await col.deleteOne({ _id: new ObjectId(idColeccion) });
}

// añade/quita una receta de una colección (recetas guardadas como array de ids string)
export async function agregarRecetaAColeccion(idColeccion, idReceta) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    await col.updateOne(
        { _id: new ObjectId(idColeccion) },
        { $addToSet: { recetas: idReceta }, $set: { ultimoAnadido: new Date() } }
    );
}

export async function quitarRecetaDeColeccion(idColeccion, idReceta) {
    const conexion = await conectar();
    const col = conexion.db("recetas_familia").collection("colecciones");
    await col.updateOne(
        { _id: new ObjectId(idColeccion) },
        { $pull: { recetas: idReceta } }
    );
}

// =========================
//  FAMILIAS
// =========================

export async function crearFamilia(familia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    const resultado = await coleccion.insertOne(familia);
    return resultado.insertedId;
}

export async function leerMisFamilias(idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    return await coleccion.find({ "acceso.usuario": idUsuario }).toArray();
}

export async function buscarFamilia(idFamilia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    return await coleccion.findOne({ _id: new ObjectId(idFamilia) });
}

export async function actualizarFamilia(idFamilia, cambios) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    const resultado = await coleccion.updateOne(
        { _id: new ObjectId(idFamilia) },
        { $set: cambios }
    );
    return resultado.matchedCount;
}

export async function borrarFamilia(idFamilia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    const resultado = await coleccion.deleteOne({ _id: new ObjectId(idFamilia) });
    return resultado.deletedCount;
}

// quita a un usuario del array "acceso" de la familia (salir / expulsar)
export async function quitarAccesoFamilia(idFamilia, idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    const resultado = await coleccion.updateOne(
        { _id: new ObjectId(idFamilia) },
        { $pull: { acceso: { usuario: idUsuario } } }
    );
    return resultado.modifiedCount;
}

export async function agregarAccesoFamilia(idFamilia, idUsuario, rol) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("familias");
    const fam = await coleccion.findOne({ _id: new ObjectId(idFamilia) });
    if (!fam) return;

    const existente = (fam.acceso || []).find(a => a.usuario === idUsuario);

    if (!existente) {
        await coleccion.updateOne(
            { _id: new ObjectId(idFamilia) },
            { $push: { acceso: { usuario: idUsuario, rol } } }
        );
    } else if (existente.rol !== "familia" && rol === "familia") {
        // solo se permite "ascender" de espectador a familia, nunca al revés
        // (evita que aceptar una invitación de solo-ver por error te baje de categoría)
        await coleccion.updateOne(
            { _id: new ObjectId(idFamilia), "acceso.usuario": idUsuario },
            { $set: { "acceso.$.rol": "familia" } }
        );
    }
}

// =========================
//  MIEMBROS (el árbol)
// =========================

export async function crearMiembro(miembro) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    const resultado = await coleccion.insertOne(miembro);
    return resultado.insertedId;
}

export async function leerMiembros(idFamilia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    return await coleccion.find({ familia: idFamilia }).toArray();
}

export async function buscarMiembroPorId(idMiembro) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    return await coleccion.findOne({ _id: new ObjectId(idMiembro) });
}

export async function buscarMiembroPorUsuarioYFamilia(idFamilia, idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    return await coleccion.findOne({ familia: idFamilia, usuario: idUsuario });
}

// un usuario está vinculado a un único miembro en total, así que basta el usuario
export async function buscarMiembroPorUsuario(idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    return await coleccion.findOne({ usuario: idUsuario });
}

export async function vincularUsuarioAMiembro(idMiembro, idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    await coleccion.updateOne(
        { _id: new ObjectId(idMiembro) },
        { $set: { usuario: idUsuario } }
    );
}

export async function desvincularUsuarioDeMiembro(idMiembro) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    await coleccion.updateOne(
        { _id: new ObjectId(idMiembro) },
        { $set: { usuario: null } }
    );
}

export async function actualizarMiembro(idMiembro, cambios) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    const resultado = await coleccion.updateOne(
        { _id: new ObjectId(idMiembro) },
        { $set: cambios }
    );
    return resultado.matchedCount;
}

export async function borrarMiembro(idMiembro) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    const resultado = await coleccion.deleteOne({ _id: new ObjectId(idMiembro) });
    return resultado.deletedCount;
}

// borra todos los miembros de una familia (al borrar la familia entera)
export async function borrarMiembrosDeFamilia(idFamilia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("miembros");
    const resultado = await coleccion.deleteMany({ familia: idFamilia });
    return resultado.deletedCount;
}

// =========================
//  RECETAS
// =========================

export async function crearReceta(receta) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    const resultado = await coleccion.insertOne(receta);
    return resultado.insertedId;
}

export async function leerRecetasDeFamilia(idFamilia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    return await coleccion.find({ familia: idFamilia }).toArray();
}

// como leerRecetasDeFamilia, pero con el filtro (categoría/temporada/nombre)
// y la paginación aplicados en la propia consulta a Mongo en vez de traerlo
// todo a memoria. Se usa solo en la pestaña "Todas las recetas" del árbol,
// que es la lista con más potencial de crecer mucho con el tiempo.
// Devuelve { items, total }.
export async function leerRecetasDeFamiliaPaginado(idFamilia, opciones = {}) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    const { categoria, temporada, busqueda, pagina, limite } = opciones;

    const filtro = { familia: idFamilia };
    if (categoria) filtro.categoria = categoria;
    if (temporada && temporada !== "todo el año") {
        filtro.temporada = { $in: [temporada, "todo el año"] };
    }
    if (busqueda) {
        const escapado = busqueda.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filtro.nombre = { $regex: escapado, $options: "i" };
    }

    const total = await coleccion.countDocuments(filtro);
    const items = await coleccion
        .find(filtro)
        .sort({ creado: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .toArray();

    return { items, total };
}

// recetas ATRIBUIDAS a un miembro (campo autor)
export async function leerRecetasDeMiembro(idMiembro) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    return await coleccion.find({ autor: idMiembro }).toArray();
}

// recetas ESCRITAS por un usuario dentro de una familia (campo creadoPor)
export async function leerAportacionesDeUsuario(idFamilia, idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    return await coleccion.find({ familia: idFamilia, creadoPor: idUsuario }).toArray();
}

export async function buscarRecetaPorId(idReceta) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    return await coleccion.findOne({ _id: new ObjectId(idReceta) });
}

export async function actualizarReceta(idReceta, cambios) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    const resultado = await coleccion.updateOne(
        { _id: new ObjectId(idReceta) },
        { $set: cambios }
    );
    return resultado.matchedCount;
}

export async function borrarReceta(idReceta) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    const resultado = await coleccion.deleteOne({ _id: new ObjectId(idReceta) });
    return resultado.deletedCount;
}

// borra todas las recetas de una familia (al borrar la familia entera)
export async function borrarRecetasDeFamilia(idFamilia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("recetas");
    const resultado = await coleccion.deleteMany({ familia: idFamilia });
    return resultado.deletedCount;
}

// =========================
//  SUGERENCIAS
// =========================
// Cuando alguien sin permiso de edición directa propone un cambio (a un
// miembro, una familia o una receta), se guarda aquí en vez de aplicarse.
// El dueño del elemento la ve en Inicio y puede aceptarla o rechazarla.

export async function crearSugerencia(sugerencia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("sugerencias");
    const resultado = await coleccion.insertOne(sugerencia);
    return resultado.insertedId;
}

// sugerencias PENDIENTES dirigidas a un usuario (las que tiene que revisar)
export async function leerSugerenciasPendientesPara(idUsuarioDestino) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("sugerencias");
    return await coleccion
        .find({ destino: idUsuarioDestino, estado: "pendiente" })
        .sort({ creado: -1 })
        .toArray();
}

export async function buscarSugerenciaPorId(idSugerencia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("sugerencias");
    return await coleccion.findOne({ _id: new ObjectId(idSugerencia) });
}

export async function borrarSugerencia(idSugerencia) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("sugerencias");
    await coleccion.deleteOne({ _id: new ObjectId(idSugerencia) });
}

// =========================
//  INVITACIONES DE SOLO VER
// =========================
// A diferencia de "vincular familiar" (que usa un JWT ligado a un hueco del
// árbol), estas son un enlace por persona: se guardan en Mongo para poder
// marcarlas como usadas y que cada una sirva una sola vez.

export async function crearInvitacionVer(invitacion) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("invitacionesVer");
    const resultado = await coleccion.insertOne(invitacion);
    return resultado.insertedId;
}

export async function buscarInvitacionVerPorToken(token) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("invitacionesVer");
    return await coleccion.findOne({ token });
}

export async function marcarInvitacionVerUsada(idInvitacion, idUsuario) {
    const conexion = await conectar();
    const coleccion = conexion.db("recetas_familia").collection("invitacionesVer");
    await coleccion.updateOne(
        { _id: new ObjectId(idInvitacion) },
        { $set: { usado: true, usadoPor: idUsuario } }
    );
}
