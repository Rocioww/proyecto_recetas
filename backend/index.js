import dns from "dns";
// workaround para resolución DNS lenta/fallida de los SRV de Mongo Atlas en
// máquinas de desarrollo; en Vercel la red ya resuelve bien, así que no se
// aplica ahí (evita depender de un comportamiento de red distinto al local)
if (!process.env.VERCEL) dns.setServers(["8.8.8.8", "8.8.4.4"]);
//----------------
import crypto from "crypto";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { OAuth2Client } from "google-auth-library";

import {
    crearUsuario, buscarUsuarioPorEmail, buscarUsuarioPorId, actualizarUsuario, borrarUsuario,
    agregarFavorito, quitarFavorito,
    crearColeccion, leerColeccionesDeUsuario, buscarColeccionPorId,
    actualizarColeccion, borrarColeccion,
    agregarRecetaAColeccion, quitarRecetaDeColeccion,
    guardarColeccion, quitarColeccionGuardada,
    crearFamilia, leerMisFamilias, buscarFamilia, actualizarFamilia,
    borrarFamilia, quitarAccesoFamilia, agregarAccesoFamilia,
    crearMiembro, leerMiembros, buscarMiembroPorId,
    buscarMiembroPorUsuarioYFamilia, vincularUsuarioAMiembro,
    buscarMiembroPorUsuario,
    crearSugerencia, leerSugerenciasPendientesPara, buscarSugerenciaPorId, borrarSugerencia,
    crearInvitacionVer, buscarInvitacionVerPorToken, marcarInvitacionVerUsada,
    desvincularUsuarioDeMiembro, actualizarMiembro, borrarMiembro,
    borrarMiembrosDeFamilia,
    crearReceta, leerRecetasDeFamilia, leerRecetasDeFamiliaPaginado, leerRecetasDeMiembro, leerAportacionesDeUsuario,
    buscarRecetaPorId, actualizarReceta, borrarReceta, borrarRecetasDeFamilia
} from "./datos.js";

import { calcularPosicion, calcularParentescoConsanguineo, calcularParentescoEntre } from "./parentesco.js";

// relaciones directas que el usuario puede elegir al añadir a alguien.
// el género de la persona (M/F/X) va en un campo aparte: estas 4
// categorías son neutras, no hace falta duplicarlas por género.
const relacionesDirectas = ["progenitor", "descendiente", "hermano", "pareja"];
const generosValidos = ["M", "F", "X"];

function fechaNacimientoValida(fecha) {
    // opcional: si viene, formato YYYY-MM-DD
    return fecha === undefined || fecha === null || /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

// ingredientes: [{ cantidad: número >= 0 o null (no escalable), unidad: string, nombre: string }]
function ingredientesValidos(ingredientes) {
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) return false;
    return ingredientes.every(i =>
        i && typeof i === "object" &&
        typeof i.nombre === "string" && i.nombre.trim() !== "" &&
        (i.cantidad === null || (typeof i.cantidad === "number" && i.cantidad >= 0)) &&
        typeof i.unidad === "string"
    );
}

// cada paso es { texto: string, foto?: url de cloudinary o null }; la foto
// es opcional y se sube aparte (ver POST /recetas/:idReceta/pasos/:indice/foto),
// así que aquí solo se valida que si viene sea una URL (o null)
function pasosValidos(pasos) {
    if (!Array.isArray(pasos) || pasos.length === 0) return false;
    return pasos.every(p =>
        p && typeof p === "object" &&
        typeof p.texto === "string" && p.texto.trim() !== "" &&
        (p.foto === undefined || p.foto === null || typeof p.foto === "string")
    );
}

function etiquetasValidas(etiquetas) {
    return etiquetas === undefined || (Array.isArray(etiquetas) && etiquetas.every(e => typeof e === "string"));
}

// dedicatoria: opcional, texto corto (3-4 líneas como mucho)
function dedicatoriaValida(dedicatoria) {
    return dedicatoria === undefined || dedicatoria === null ||
        (typeof dedicatoria === "string" && dedicatoria.length <= 250);
}
const categoriasValidas = ["entrante", "primero", "segundo", "postre"];
const temporadasValidas = ["primavera", "verano", "otoño", "invierno", "todo el año"];

// campos que se pueden proponer en una sugerencia, según el tipo de
// objetivo. Cualquier otro campo (p.ej. "usuario", "acceso", "creadaPor")
// queda fuera aunque el cliente lo mande, así una sugerencia nunca puede
// tocar algo que no debería.
const camposSugeriblesPorTipo = {
    miembro: ["nombreReal", "fechaNacimiento", "foto"],
    familia: ["nombre", "foto"],
    receta: ["nombre", "tiempoMinutos", "categoria", "temporada", "ingredientes", "pasos", "etiquetas", "dedicatoria"],
};

// valida que "cambios" solo toque campos permitidos para ese tipo, y que
// cada valor tenga la forma correcta: las mismas reglas que se usan al
// editar directamente. Se usa tanto al crear la sugerencia como, por si
// acaso, otra vez al aceptarla justo antes de aplicar el $set.
function cambiosSugeridosValidos(tipo, cambios) {
    const permitidos = camposSugeriblesPorTipo[tipo];
    if (!permitidos) return false;

    for (const campo of Object.keys(cambios)) {
        if (!permitidos.includes(campo)) return false;
        const valor = cambios[campo];

        if (campo === "nombreReal" || campo === "nombre") {
            if (typeof valor !== "string" || valor.trim() === "") return false;
        } else if (campo === "fechaNacimiento") {
            if (!fechaNacimientoValida(valor)) return false;
        } else if (campo === "foto") {
            if (valor !== null && typeof valor !== "string") return false;
        } else if (campo === "tiempoMinutos") {
            if (valor !== null && (typeof valor !== "number" || valor < 0)) return false;
        } else if (campo === "categoria") {
            if (!categoriasValidas.includes(valor)) return false;
        } else if (campo === "temporada") {
            if (!temporadasValidas.includes(valor)) return false;
        } else if (campo === "ingredientes") {
            if (!ingredientesValidos(valor)) return false;
        } else if (campo === "pasos") {
            if (!pasosValidos(valor)) return false;
        } else if (campo === "etiquetas") {
            if (!Array.isArray(valor) || !valor.every(e => typeof e === "string")) return false;
        } else if (campo === "dedicatoria") {
            if (!dedicatoriaValida(valor)) return false;
        }
    }

    return true;
}

// =========================
//  CLOUDINARY + MULTER (memoria → Cloudinary)
// =========================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer en memoria: el archivo nunca toca el disco, se pasa directo a Cloudinary
function filtroImagen(peticion, archivo, cb) {
    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!tiposPermitidos.includes(archivo.mimetype)) {
        return cb(new Error("tipo de archivo no permitido"));
    }
    cb(null, true);
}

const subirFoto = multer({
    storage: multer.memoryStorage(),
    fileFilter: filtroImagen,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB (fotos de móvil suelen superar los 5MB)
});

// sube un buffer a Cloudinary y devuelve la URL segura (https)
function subirACloudinary(buffer, carpeta) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: carpeta, resource_type: "image" },
            (error, resultado) => {
                if (error) reject(error);
                else resolve(resultado.secure_url);
            }
        ).end(buffer);
    });
}

// borra una imagen de Cloudinary dado su public_id extraído de la URL
function borrarArchivoFoto(urlFoto) {
    if (!urlFoto || !urlFoto.includes("cloudinary.com")) return;
    try {
        const partes = urlFoto.split("/upload/");
        const sinVersion = partes[1].replace(/^v\d+\//, "");
        const publicId = sinVersion.replace(/\.[^.]+$/, "");
        cloudinary.uploader.destroy(publicId, (error) => { if (error) console.error(error); });
    } catch (e) { console.error(e); }
}

const servidor = express();

// Vercel pone la app detrás de un proxy: sin esto, express-rate-limit
// vería siempre la IP del proxy en vez de la del cliente real.
servidor.set("trust proxy", 1);

// en producción solo el frontend desplegado (y opcionalmente localhost
// en desarrollo) puede llamar a la API; FRONTEND_URL se define como
// variable de entorno en Vercel, nunca hardcodeada aquí.
const origenesPermitidos = process.env.VERCEL
    ? [process.env.FRONTEND_URL].filter(Boolean)
    : [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean);
servidor.use(cors({
    origin: origenesPermitidos.length > 0 ? origenesPermitidos : true,
}));
servidor.use(express.json());

// protección básica contra fuerza bruta en el login: tras varios intentos
// fallidos seguidos desde la misma IP, bloquea temporalmente nuevos
// intentos. Los intentos que SÍ tienen éxito no cuentan para el límite.
const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (peticion, respuesta) => {
        respuesta.status(429).json({ error: "demasiados intentos fallidos, inténtalo de nuevo en unos minutos" });
    },
});

// --- middleware: protege las rutas con token JWT ---
function autorizar(peticion, respuesta, siguiente) {
    const { authorization } = peticion.headers;
    if (!authorization) return respuesta.sendStatus(401);

    const partes = authorization.split(" ");
    if (partes[0] !== "Bearer" || !partes[1]) return respuesta.sendStatus(401);

    jwt.verify(partes[1], process.env.SECRET, (error, datos) => {
        if (error) return respuesta.sendStatus(401);
        peticion.idUsuario = datos.id;
        siguiente();
    });
}

// comprueba que el usuario tenga acceso a la familia y devuelve la
// familia + su rol. Devuelve null si ya respondió (403). Si la familia
// no existe, devuelve { fam: null } para que la ruta llame a siguiente().
async function requiereAccesoFamilia(peticion, respuesta, idFamilia) {
    const fam = await buscarFamilia(idFamilia);
    if (!fam) return { fam: null, miAcceso: null };
    const miAcceso = fam.acceso.find(a => a.usuario === peticion.idUsuario);
    if (!miAcceso) {
        respuesta.sendStatus(403);
        return null;
    }
    return { fam, miAcceso };
}

// misma comprobación pero sin escribir en la respuesta (para bucles como
// el de /favoritos, donde si no hay acceso simplemente se omite la receta)
async function tieneAccesoFamilia(idUsuario, idFamilia) {
    const fam = await buscarFamilia(idFamilia);
    if (!fam) return false;
    return fam.acceso.some(a => a.usuario === idUsuario);
}

// foto mostrada de un miembro. Prioridad:
//   1) si el miembro tiene un usuario vinculado y ese usuario tiene foto de
//      perfil, esa manda (foto de perfil = foto del miembro "Tú")
//   2) la foto que el propio miembro se puso (fotoPropia)
//   3) la que le puso otra persona de la familia (fotoCreador)
async function fotoDeMiembro(miembro) {
    if (miembro.usuario) {
        try {
            const usuarioVinculado = await buscarUsuarioPorId(miembro.usuario);
            if (usuarioVinculado && usuarioVinculado.foto) return usuarioVinculado.foto;
        } catch (e) { console.error(e); }
    }
    return miembro.fotoPropia || miembro.fotoCreador || null;
}

// puede editar un miembro directamente (nombre/fecha/foto) quien:
// - es la persona vinculada a ese miembro (edita su propio "Tú"), o
// - es quien creó la familia (el dueño)
// el resto solo puede enviar una sugerencia al dueño de la familia.
function puedeEditarMiembroDirecto(miembro, fam, idUsuario) {
    return miembro.usuario === idUsuario || fam.creadaPor === idUsuario;
}

// solo quien tiene rol "familia" puede escribir (crear miembros/recetas,
// invitar, sugerir cambios). Los espectadores (rol "espectador") solo miran.
function puedeEscribirEnFamilia(acceso) {
    return acceso.miAcceso.rol === "familia";
}

// datos del creador/dueño para mostrar en el aviso "no puedes editar esto,
// pero puedes sugerir cambios a X". Si el creador tiene un miembro vinculado
// en esa misma familia, se puede enlazar a su perfil.
async function datosCreadorParaAviso(idUsuarioCreador, idFamilia) {
    if (!idUsuarioCreador) return null;
    try {
        const miembroVinculado = await buscarMiembroPorUsuarioYFamilia(idFamilia, idUsuarioCreador);
        if (miembroVinculado) {
            return {
                nombreReal: miembroVinculado.nombreReal,
                foto: await fotoDeMiembro(miembroVinculado),
                idMiembro: miembroVinculado._id,
            };
        }
        const usuario = await buscarUsuarioPorId(idUsuarioCreador);
        if (usuario) return { nombreReal: usuario.nombre, foto: usuario.foto || null, idMiembro: null };
    } catch (e) { console.error(e); }
    return null;
}

// protección básica contra fuerza bruta / enumeración de emails en el
// registro: limita cuántos registros se pueden intentar desde la misma IP.
const limitadorRegistro = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (peticion, respuesta) => {
        respuesta.status(429).json({ error: "demasiados intentos, inténtalo de nuevo en unos minutos" });
    },
});

// --- registro ---
servidor.post("/registro", limitadorRegistro, async (peticion, respuesta, siguiente) => {
    try {
        const { nombre, email, password } = peticion.body;

        // formato de email real: usuario@dominio.tld, con el dominio
        // pudiendo tener subdominios (mail.empresa.com) y un TLD de al
        // menos 2 letras; sin espacios ni caracteres sueltos como "a@b"
        const emailValido = /^[\w.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(email || "");

        // contraseña mínimamente segura sin ser exigente: al menos 6
        // caracteres, con letras y números (no solo dígitos ni solo letras)
        const passwordValida = typeof password === "string" && password.length >= 6 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);

        if (!nombre || !emailValido || !passwordValida) {
            return siguiente(true);
        }

        const existe = await buscarUsuarioPorEmail(email);
        if (existe) return respuesta.status(409).json({ error: "ese email ya está registrado" });

        const passwordHash = await bcrypt.hash(password, 12);
        const _id = await crearUsuario({ nombre, email, passwordHash, creado: new Date() });

        respuesta.status(201).json({ _id });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- login ---
servidor.post("/login", limitadorLogin, async (peticion, respuesta, siguiente) => {
    try {
        const { email, password } = peticion.body;
        if (typeof email !== "string" || typeof password !== "string" || !email || !password) return siguiente(true);

        const usuario = await buscarUsuarioPorEmail(email);
        if (!usuario) return respuesta.sendStatus(401);

        // cuentas creadas con Google no tienen contraseña propia
        if (!usuario.passwordHash) {
            return respuesta.status(401).json({ error: "esta cuenta se registró con Google, inicia sesión con Google" });
        }

        const valido = await bcrypt.compare(password, usuario.passwordHash);
        if (!valido) return respuesta.sendStatus(401);

        const token = jwt.sign({ id: usuario._id }, process.env.SECRET, { expiresIn: "2h" });
        respuesta.json({ token });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- login / registro con Google ---
// el cliente (Google Identity Services) nos manda el credential (id_token);
// lo verificamos con Google, y si el email ya existe iniciamos sesión con esa
// cuenta; si no existe, se crea una cuenta nueva vinculada a ese email.
const clienteGoogle = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

servidor.post("/login/google", async (peticion, respuesta, siguiente) => {
    try {
        const { credential } = peticion.body;
        if (!credential) return siguiente(true);

        let payload;
        try {
            const ticket = await clienteGoogle.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (e) {
            console.error(e);
            return respuesta.status(401).json({ error: "no se ha podido verificar el inicio de sesión con Google" });
        }

        if (!payload || !payload.email) {
            return respuesta.status(401).json({ error: "Google no ha devuelto un email válido" });
        }

        let usuario = await buscarUsuarioPorEmail(payload.email);

        if (!usuario) {
            // cuenta nueva: sin contraseña, foto tomada de la cuenta de Google
            const _id = await crearUsuario({
                nombre: payload.name || payload.email.split("@")[0],
                email: payload.email,
                passwordHash: null,
                googleId: payload.sub,
                foto: payload.picture || null,
                creado: new Date(),
            });
            usuario = await buscarUsuarioPorId(_id);
        }

        const token = jwt.sign({ id: usuario._id }, process.env.SECRET, { expiresIn: "2h" });
        respuesta.json({ token });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// la abuela pincha el enlace: la app pide esto SIN login para mostrar el mensaje
// (tiene que ir ANTES de servidor.use(autorizar), es una ruta pública)
servidor.get("/invitaciones/:token", async (peticion, respuesta) => {
    try {
        const { token } = peticion.params;

        jwt.verify(token, process.env.SECRET, async (error, datos) => {
            if (error || datos.tipo !== "invitacion") return respuesta.sendStatus(401);

            const miembro = await buscarMiembroPorId(datos.idMiembro);
            if (!miembro) return respuesta.status(404).json({ error: "la invitación ya no es válida" });
            if (miembro.usuario) {
                return respuesta.status(409).json({ error: "esta invitación ya fue usada" });
            }

            const fam = await buscarFamilia(datos.idFamilia);
            if (!fam) return respuesta.status(404).json({ error: "esta familia ya no existe" });
            const idInvitador = datos.invitadoPor || fam.creadaPor; // compatibilidad con tokens antiguos
            const invitador = await buscarUsuarioPorId(idInvitador);

            respuesta.json({
                nombreFamilia: fam.nombre,
                parentesco: miembro.parentesco,
                nombreMiembro: miembro.nombreReal,
                invitadoPor: invitador ? invitador.nombre : "alguien",
            });
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// la persona invitada a "solo ver" pincha el enlace: vista previa SIN login
// (ruta pública, tiene que ir antes de servidor.use(autorizar))
servidor.get("/invitaciones-ver/:token", async (peticion, respuesta) => {
    try {
        const { token } = peticion.params;

        const invitacion = await buscarInvitacionVerPorToken(token);
        if (!invitacion) return respuesta.status(404).json({ error: "el enlace no es válido" });
        if (invitacion.usado) return respuesta.status(409).json({ error: "este enlace ya se ha usado" });

        const fam = await buscarFamilia(invitacion.idFamilia);
        if (!fam) return respuesta.status(404).json({ error: "esta familia ya no existe" });

        const invitador = await buscarUsuarioPorId(invitacion.creadoPor);

        respuesta.json({
            nombreFamilia: fam.nombre,
            invitadoPor: invitador ? invitador.nombre : "alguien",
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// a partir de aquí, todas las rutas necesitan token
servidor.use(autorizar);

// --- yo ---
servidor.get("/yo", async (peticion, respuesta) => {
    try {
        const usuario = await buscarUsuarioPorId(peticion.idUsuario);
        const miMiembro = await buscarMiembroPorUsuario(peticion.idUsuario);
        respuesta.json({ ...usuario, idMiembroVinculado: miMiembro ? miMiembro._id.toString() : null });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// editar el propio perfil de usuario (nombre y fecha de nacimiento)
servidor.put("/yo", async (peticion, respuesta, siguiente) => {
    try {
        const { nombre, fechaNacimiento } = peticion.body;

        const cambios = {};
        if (nombre !== undefined) {
            if (!nombre || nombre.trim() === "") return siguiente(true);
            cambios.nombre = nombre;
        }
        if (fechaNacimiento !== undefined) {
            if (!fechaNacimientoValida(fechaNacimiento)) return siguiente(true);
            cambios.fechaNacimiento = fechaNacimiento || null;
        }

        if (Object.keys(cambios).length === 0) return siguiente(true);

        await actualizarUsuario(peticion.idUsuario, cambios);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// subir/cambiar la foto del propio perfil de usuario
servidor.post("/yo/foto", (peticion, respuesta, siguiente) => {
    subirFoto.single("foto")(peticion, respuesta, async (errorMulter) => {
        try {
            if (errorMulter) return respuesta.status(400).json({ error: errorMulter.message });
            if (!peticion.file) return respuesta.status(400).json({ error: "no se ha enviado ninguna imagen (campo 'foto')" });

            const usuario = await buscarUsuarioPorId(peticion.idUsuario);
            if (usuario.foto) borrarArchivoFoto(usuario.foto);

            const urlFoto = await subirACloudinary(peticion.file.buffer, "recetas_familia/usuarios");
            await actualizarUsuario(peticion.idUsuario, { foto: urlFoto });

            respuesta.json({ foto: urlFoto });
        } catch (e) {
            console.log(e);
            respuesta.status(500).json({ error: "error en el servidor" });
        }
    });
});

// borrar la propia cuenta. Se desvincula del miembro que ocupara (ese miembro
// queda sin cuenta, pero conserva su sitio en el árbol) y se borra el usuario.
// Nota: las familias que creó y sus recetas NO se borran en cascada aquí para no
// destruir el trabajo de otros; el miembro vinculado simplemente queda libre.
servidor.delete("/yo", async (peticion, respuesta) => {
    try {
        const miMiembro = await buscarMiembroPorUsuario(peticion.idUsuario);
        if (miMiembro) {
            await desvincularUsuarioDeMiembro(miMiembro._id.toString());
        }
        await borrarUsuario(peticion.idUsuario);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- familias ---

servidor.post("/familias", async (peticion, respuesta, siguiente) => {
    try {
        const { nombre, pertenezco } = peticion.body;
        if (!nombre || nombre.trim() === "") return siguiente(true);

        const usuario = await buscarUsuarioPorId(peticion.idUsuario);

        const familia = {
            nombre,
            creadaPor: peticion.idUsuario,
            acceso: [{ usuario: peticion.idUsuario, rol: "familia" }],
            creado: new Date(),
        };

        const _id = await crearFamilia(familia);

        // pertenezco (por defecto true): si quien crea la familia forma
        // parte de ella, el miembro raíz es él mismo; si no, el raíz se
        // crea como hueco vacío para rellenarlo con la persona que toque
        const perteneceALaFamilia = pertenezco !== false;

        if (perteneceALaFamilia) {
            // el género es un dato del miembro en el árbol, no de la cuenta:
            // se crea sin él y se completa luego editando el miembro
            const posicion = calcularPosicion("yo", null, null);
            await crearMiembro({
                familia: _id.toString(),
                nombreReal: usuario.nombre,
                genero: null,
                parentesco: posicion.parentesco,
                relacionDirecta: "yo",
                idReferencia: null,
                arriba: posicion.arriba,
                abajo: posicion.abajo,
                esPolitico: posicion.esPolitico,
                esPlaceholder: false,
                usuario: peticion.idUsuario,
                fotoCreador: null,
                fotoPropia: null,
                creado: new Date(),
            });
        } else {
            await crearMiembro({
                familia: _id.toString(),
                nombreReal: null,
                genero: null,
                parentesco: "yo",
                relacionDirecta: "yo",
                idReferencia: null,
                arriba: 0,
                abajo: 0,
                esPolitico: false,
                esPlaceholder: true,
                usuario: null,
                fotoCreador: null,
                fotoPropia: null,
                creado: new Date(),
            });
        }

        respuesta.status(201).json({ _id });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.get("/familias", async (peticion, respuesta) => {
    try {
        const familias = await leerMisFamilias(peticion.idUsuario);

        // enriquecer cada familia con sus contadores para las tarjetas
        const enriquecidas = await Promise.all(familias.map(async fam => {
            const idFamilia = fam._id.toString();
            const [miembros, recetas] = await Promise.all([
                leerMiembros(idFamilia),
                leerRecetasDeFamilia(idFamilia),
            ]);
            return {
                ...fam,
                foto: fam.foto || null,
                // solo cuentan los miembros reales, no los huecos vacíos
                numMiembros: miembros.filter(m => !m.esPlaceholder).length,
                numRecetas: recetas.length,
                esDueno: fam.creadaPor === peticion.idUsuario,
                miRol: (fam.acceso.find(a => a.usuario === peticion.idUsuario) || {}).rol || null,
                creador: await datosCreadorParaAviso(fam.creadaPor, idFamilia),
            };
        }));

        respuesta.json(enriquecidas);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// datos de una familia concreta (nombre) para la cabecera del árbol
servidor.get("/familias/:idFamilia", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        const [miembros, recetas] = await Promise.all([
            leerMiembros(idFamilia),
            leerRecetasDeFamilia(idFamilia),
        ]);

        respuesta.json({
            _id: acceso.fam._id,
            nombre: acceso.fam.nombre,
            foto: acceso.fam.foto || null,
            numMiembros: miembros.filter(m => !m.esPlaceholder).length,
            numRecetas: recetas.length,
            esDueno: acceso.fam.creadaPor === peticion.idUsuario,
            miRol: acceso.miAcceso.rol,
            puedeEscribir: puedeEscribirEnFamilia(acceso),
            creador: await datosCreadorParaAviso(acceso.fam.creadaPor, idFamilia),
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// editar el nombre de la familia: solo quien la creó puede hacerlo
// directamente; el resto puede enviar una sugerencia
servidor.put("/familias/:idFamilia", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

        const { nombre } = peticion.body;
        if (nombre !== undefined && (!nombre || nombre.trim() === "")) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (acceso.fam.creadaPor !== peticion.idUsuario) {
            return respuesta.status(403).json({ error: "no puedes editar directamente esta familia; envía una sugerencia" });
        }

        const cambios = {};
        if (nombre !== undefined) cambios.nombre = nombre;

        if (Object.keys(cambios).length === 0) return siguiente(true);

        await actualizarFamilia(idFamilia, cambios);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// subir/cambiar la foto de la familia (solo quien la creó; el resto
// puede sugerirla vía /sugerencias/foto + /sugerencias, igual que el nombre)
servidor.post("/familias/:idFamilia/foto", (peticion, respuesta, siguiente) => {
    subirFoto.single("foto")(peticion, respuesta, async (errorMulter) => {
        try {
            const { idFamilia } = peticion.params;
            if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

            if (errorMulter) {
                return respuesta.status(400).json({ error: errorMulter.message });
            }
            if (!peticion.file) {
                return respuesta.status(400).json({ error: "no se ha enviado ninguna imagen (campo 'foto')" });
            }

            const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
            if (!acceso) return;
            if (!acceso.fam) return siguiente();

            if (acceso.fam.creadaPor !== peticion.idUsuario) {
                return respuesta.status(403).json({ error: "no puedes editar directamente esta familia; envía una sugerencia" });
            }

            borrarArchivoFoto(acceso.fam.foto);

            const urlFoto = await subirACloudinary(peticion.file.buffer, "recetas_familia/familias");
            await actualizarFamilia(idFamilia, { foto: urlFoto });

            respuesta.json({ foto: urlFoto });
        } catch (e) {
            console.log(e);
            respuesta.status(500).json({ error: "error en el servidor" });
        }
    });
});

// borrar la foto de la familia (solo quien la creó)
servidor.delete("/familias/:idFamilia/foto", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (acceso.fam.creadaPor !== peticion.idUsuario) {
            return respuesta.status(403).json({ error: "no puedes editar directamente esta familia; envía una sugerencia" });
        }

        borrarArchivoFoto(acceso.fam.foto);
        await actualizarFamilia(idFamilia, { foto: null });

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// borrar la familia entera (solo quien la creó)
servidor.delete("/familias/:idFamilia", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente();

        const fam = await buscarFamilia(idFamilia);
        if (!fam) return siguiente();

        if (fam.creadaPor !== peticion.idUsuario) {
            return respuesta.status(403).json({ error: "solo quien creó la familia puede borrarla" });
        }

        borrarArchivoFoto(fam.foto);

        const miembros = await leerMiembros(idFamilia);
        for (const m of miembros) {
            borrarArchivoFoto(m.fotoCreador);
            borrarArchivoFoto(m.fotoPropia);
        }

        const recetas = await leerRecetasDeFamilia(idFamilia);
        for (const r of recetas) {
            (r.fotos || []).forEach(borrarArchivoFoto);
        }

        await borrarMiembrosDeFamilia(idFamilia);
        await borrarRecetasDeFamilia(idFamilia);
        await borrarFamilia(idFamilia);

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// salir de una familia (no puede salir quien la creó)
servidor.post("/familias/:idFamilia/salir", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente();

        const fam = await buscarFamilia(idFamilia);
        if (!fam) return siguiente();

        if (fam.creadaPor === peticion.idUsuario) {
            return respuesta.status(409).json({ error: "quien creó la familia no puede salir, tiene que borrarla" });
        }

        const miAcceso = fam.acceso.find(a => a.usuario === peticion.idUsuario);
        if (!miAcceso) return respuesta.sendStatus(403);

        await quitarAccesoFamilia(idFamilia, peticion.idUsuario);

        // desvincula tu usuario del miembro del árbol, para que puedan
        // volver a invitarte (o a otra persona) a ese mismo hueco
        const miMiembro = await buscarMiembroPorUsuarioYFamilia(idFamilia, peticion.idUsuario);
        if (miMiembro) await desvincularUsuarioDeMiembro(miMiembro._id.toString());

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// revocar el acceso de OTRA persona (expulsarla de la familia)
servidor.delete("/familias/:idFamilia/acceso/:idUsuarioObjetivo", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia, idUsuarioObjetivo } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente();

        const fam = await buscarFamilia(idFamilia);
        if (!fam) return siguiente();

        if (fam.creadaPor !== peticion.idUsuario) return respuesta.sendStatus(403);

        if (idUsuarioObjetivo === fam.creadaPor) {
            return respuesta.status(409).json({ error: "no se puede expulsar a quien creó la familia" });
        }

        await quitarAccesoFamilia(idFamilia, idUsuarioObjetivo);

        const miembroObjetivo = await buscarMiembroPorUsuarioYFamilia(idFamilia, idUsuarioObjetivo);
        if (miembroObjetivo) await desvincularUsuarioDeMiembro(miembroObjetivo._id.toString());

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- miembros (el árbol) ---

servidor.post("/miembros", async (peticion, respuesta, siguiente) => {
    try {
        const { familia, nombreReal, relacionDirecta, idReferencia, genero } = peticion.body;

        if (!familia || !/^[0-9a-f]{24}$/.test(familia)) return siguiente(true);
        if (!nombreReal || nombreReal.trim() === "") return siguiente(true);
        if (!relacionesDirectas.includes(relacionDirecta)) return siguiente(true);
        if (!generosValidos.includes(genero)) return siguiente(true);
        if (!idReferencia || !/^[0-9a-f]{24}$/.test(idReferencia)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!puedeEscribirEnFamilia(acceso)) {
            return respuesta.status(403).json({ error: "solo puedes ver este árbol, no puedes añadir miembros" });
        }

        const miembros = await leerMiembros(familia);
        const referencia = miembros.find(m => m._id.toString() === idReferencia);
        if (!referencia) return siguiente(true);

        // ningún miembro puede tener más de 2 progenitores
        if (relacionDirecta === "progenitor") {
            const progenitoresActuales = miembros.filter(
                m => m.idReferencia === idReferencia && m.relacionDirecta === "progenitor"
            );
            if (progenitoresActuales.length >= 2) {
                return respuesta.status(409).json({ error: "este miembro ya tiene 2 progenitores registrados" });
            }
        }

        // ningún miembro puede tener más de 1 pareja (un hueco de pareja
        // borrada queda como placeholder y no cuenta, se puede reemplazar)
        if (relacionDirecta === "pareja") {
            const parejaActual = miembros.find(
                m => m.idReferencia === idReferencia && m.relacionDirecta === "pareja" && !m.esPlaceholder
            );
            if (parejaActual) {
                return respuesta.status(409).json({ error: "este miembro ya tiene una pareja registrada" });
            }
        }

        const posicion = calcularPosicion(relacionDirecta, referencia, genero);
        if (!posicion) return siguiente(true);

        const { fechaNacimiento } = peticion.body;
        if (!fechaNacimientoValida(fechaNacimiento)) return siguiente(true);

        const miembro = {
            familia,
            nombreReal,
            genero,
            fechaNacimiento: fechaNacimiento || null,
            parentesco: posicion.parentesco,
            relacionDirecta,
            idReferencia,
            arriba: posicion.arriba,
            abajo: posicion.abajo,
            esPolitico: posicion.esPolitico,
            esPlaceholder: false,
            usuario: null,
            fotoCreador: null,
            fotoPropia: null,
            creado: new Date(),
        };

        // todo descendiente se registra siempre como hijo de ambos
        // progenitores del par de referencia: el modelo no admite vincular
        // a uno solo, así el layout del árbol se mantiene simétrico. Esto
        // no depende de lo que mande el cliente en el payload.
        if (relacionDirecta === "descendiente") {
            miembro.hijoDeAmbos = true;
        }

        const _id = await crearMiembro(miembro);
        respuesta.status(201).json({ _id, parentesco: posicion.parentesco });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.get("/miembros/:idFamilia", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        let miembros = await leerMiembros(idFamilia);

        // número de recetas de las que cada miembro es autor, para
        // mostrarlo en su tarjeta del árbol sin una petición por miembro
        const recetasFamilia = await leerRecetasDeFamilia(idFamilia);
        const numRecetasPorAutor = {};
        recetasFamilia.forEach(r => {
            numRecetasPorAutor[r.autor] = (numRecetasPorAutor[r.autor] || 0) + 1;
        });

        // el parentesco guardado en cada miembro es relativo a la raíz
        // original del árbol; aquí se recalcula relativo a MI propio
        // miembro (si estoy vinculado a alguno en esta familia), para que
        // cada usuario vea los parentescos desde su propia posición
        const miMiembro = miembros.find(m => m.usuario === peticion.idUsuario) || null;

        // si nadie está vinculado a ningún miembro (espectador con enlace de
        // solo lectura, o el propio dueño sin miembro propio), no hay "yo"
        // desde el que anclar los parentescos. Los guardados en BD son
        // relativos a quien creó la familia, que no tiene por qué ser el
        // ascendiente de más edad del árbol (p.ej. si luego se le añadieron
        // sus propios progenitores) - usarlos tal cual haría que dos
        // hermanos se vieran "hermano" el uno del otro en vez de "hijo/a"
        // de sus padres. Para que se lea como un árbol genealógico
        // estándar, se recalculan todos relativos al ascendiente de mayor
        // generación (arriba - abajo máximo) en vez de a la raíz técnica
        let ancla = null;
        if (!miMiembro && miembros.length) {
            ancla = miembros.reduce((mejor, m) =>
                (!mejor || (m.arriba - m.abajo) > (mejor.arriba - mejor.abajo)) ? m : mejor
            , null);
        }

        // añade "foto" calculada, "esYo" (si este miembro es al que estoy
        // vinculado yo, no necesariamente la raíz del árbol) y "numRecetas"
        miembros = await Promise.all(miembros.map(async m => ({
            ...m,
            foto: await fotoDeMiembro(m),
            esYo: m.usuario === peticion.idUsuario,
            numRecetas: numRecetasPorAutor[m._id.toString()] || 0,
            // el ancla, respecto a sí misma, no tiene parentesco (no puede
            // ser "abuela de sí misma"): para su propia fila se mantiene su
            // parentesco ya guardado (relativo a la raíz técnica), que sigue
            // siendo un parentesco real siempre que el ancla no sea esa
            // misma raíz (p.ej. si se le añadieron progenitores por encima)
            parentesco: miMiembro
                ? calcularParentescoEntre(miMiembro, m, miembros)
                : (ancla ? (m._id.toString() === ancla._id.toString() ? m.parentesco : calcularParentescoEntre(ancla, m, miembros)) : m.parentesco),
        })));

        respuesta.json(miembros);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// recalcula recursivamente arriba/abajo/parentesco de un miembro y de
// TODA su descendencia, a partir de una nueva posición de referencia.
// se usa cuando se edita un miembro y eso mueve su sitio en el árbol.
async function recalcularEnCascada(miembroActualizado, todosLosMiembros) {
    const hijos = todosLosMiembros.filter(
        m => m.idReferencia === miembroActualizado._id.toString()
    );

    for (const hijo of hijos) {
        const nuevaPosicion = calcularPosicion(hijo.relacionDirecta, miembroActualizado, hijo.genero);
        if (!nuevaPosicion) continue;

        await actualizarMiembro(hijo._id.toString(), {
            arriba: nuevaPosicion.arriba,
            abajo: nuevaPosicion.abajo,
            esPolitico: nuevaPosicion.esPolitico,
            parentesco: nuevaPosicion.parentesco,
        });

        const hijoActualizado = { ...hijo, ...nuevaPosicion };
        await recalcularEnCascada(hijoActualizado, todosLosMiembros);
    }
}

// editar un miembro: nombre, género, o re-engancharlo a otra parte del
// árbol (cambiar relacionDirecta/idReferencia). No funciona sobre huecos
// vacíos: para esos usa PUT /miembros/:id/rellenar.
servidor.put("/miembros/:idMiembro", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (miembro.esPlaceholder) {
            return respuesta.status(409).json({ error: "este miembro está vacío, usa PUT /miembros/:id/rellenar" });
        }

        const { nombreReal, genero, relacionDirecta, idReferencia } = peticion.body;

        // editar nombre/fecha es información personal: solo la persona vinculada
        // o el dueño de la familia pueden hacerlo directamente
        const tocaDatosPersonales = nombreReal !== undefined || peticion.body.fechaNacimiento !== undefined;
        if (tocaDatosPersonales && !puedeEditarMiembroDirecto(miembro, acceso.fam, peticion.idUsuario)) {
            return respuesta.status(403).json({ error: "no puedes editar directamente este miembro; envía una sugerencia" });
        }

        const cambios = {};
        if (nombreReal !== undefined) {
            if (nombreReal.trim() === "") return siguiente(true);
            cambios.nombreReal = nombreReal;
        }

        if (genero !== undefined && !generosValidos.includes(genero)) return siguiente(true);
        const generoFinal = genero !== undefined ? genero : miembro.genero;
        if (genero !== undefined) cambios.genero = genero;

        const { fechaNacimiento } = peticion.body;
        if (fechaNacimiento !== undefined) {
            if (!fechaNacimientoValida(fechaNacimiento)) return siguiente(true);
            cambios.fechaNacimiento = fechaNacimiento || null;
        }

        const seMueve = relacionDirecta !== undefined || idReferencia !== undefined;

        if (seMueve) {
            if (miembro.idReferencia === null) {
                return respuesta.status(409).json({ error: "el miembro raíz no se puede re-enganchar a otra rama" });
            }
            if (!relacionesDirectas.includes(relacionDirecta) || !/^[0-9a-f]{24}$/.test(idReferencia || "")) {
                return siguiente(true);
            }
            if (idReferencia === idMiembro) return siguiente(true); // no puede ser su propia referencia

            const miembrosFamilia = await leerMiembros(miembro.familia);
            const nuevaReferencia = miembrosFamilia.find(m => m._id.toString() === idReferencia);
            if (!nuevaReferencia) return siguiente(true);

            // ningún miembro puede tener más de 2 progenitores
            if (relacionDirecta === "progenitor") {
                const progenitoresActuales = miembrosFamilia.filter(
                    m => m.idReferencia === idReferencia && m.relacionDirecta === "progenitor" && m._id.toString() !== idMiembro
                );
                if (progenitoresActuales.length >= 2) {
                    return respuesta.status(409).json({ error: "este miembro ya tiene 2 progenitores registrados" });
                }
            }

            // ningún miembro puede tener más de 1 pareja
            if (relacionDirecta === "pareja") {
                const parejaActual = miembrosFamilia.find(
                    m => m.idReferencia === idReferencia && m.relacionDirecta === "pareja" && !m.esPlaceholder && m._id.toString() !== idMiembro
                );
                if (parejaActual) {
                    return respuesta.status(409).json({ error: "este miembro ya tiene una pareja registrada" });
                }
            }

            const nuevaPosicion = calcularPosicion(relacionDirecta, nuevaReferencia, generoFinal);
            if (!nuevaPosicion) return siguiente(true);

            cambios.relacionDirecta = relacionDirecta;
            cambios.idReferencia = idReferencia;
            cambios.arriba = nuevaPosicion.arriba;
            cambios.abajo = nuevaPosicion.abajo;
            cambios.esPolitico = nuevaPosicion.esPolitico;
            cambios.parentesco = nuevaPosicion.parentesco;
        } else if (genero !== undefined && !miembro.esPolitico) {
            // solo cambió el género (y no es una "pareja"): se recalcula
            // el mismo parentesco con la nueva palabra
            cambios.parentesco = calcularParentescoConsanguineo(miembro.arriba, miembro.abajo, generoFinal);
        }

        if (Object.keys(cambios).length === 0) return siguiente(true);

        await actualizarMiembro(idMiembro, cambios);

        if (seMueve) {
            const miembroActualizado = { ...miembro, ...cambios };
            const miembrosFamilia = await leerMiembros(miembro.familia);
            await recalcularEnCascada(miembroActualizado, miembrosFamilia);
        }

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// "borrar" un miembro:
//   - si nadie depende de él (no tiene descendientes registrados debajo),
//     desaparece del todo, sin dejar ningún hueco.
//   - si tiene descendientes (está en medio de varias generaciones), se
//     deja un hueco placeholder en su sitio para no romper la posición
//     de esa descendencia.
servidor.delete("/miembros/:idMiembro", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente();

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        // solo el dueño de la familia (quien la creó) puede borrar miembros
        if (acceso.fam.creadaPor !== peticion.idUsuario) {
            return respuesta.status(403).json({ error: "solo quien creó la familia puede borrar miembros" });
        }

        if (miembro.idReferencia === null) {
            return respuesta.status(409).json({ error: "el miembro raíz no se puede borrar, borra la familia en su lugar" });
        }
        if (miembro.esPlaceholder) {
            return respuesta.status(409).json({ error: "este hueco ya está vacío" });
        }

        borrarArchivoFoto(miembro.fotoCreador);
        borrarArchivoFoto(miembro.fotoPropia);

        const todosLosMiembros = await leerMiembros(miembro.familia);
        const tieneDescendientes = todosLosMiembros.some(m => m.idReferencia === idMiembro);

        if (!tieneDescendientes) {
            await borrarMiembro(idMiembro);
            return respuesta.sendStatus(204);
        }

        await actualizarMiembro(idMiembro, {
            nombreReal: null,
            genero: null,
            fotoCreador: null,
            fotoPropia: null,
            usuario: null,
            esPlaceholder: true,
            // se mantienen: familia, relacionDirecta, idReferencia,
            // arriba, abajo, esPolitico y parentesco, para no romper
            // la posición de este hueco ni la de sus descendientes
        });

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// rellenar un hueco vacío con una persona real
servidor.put("/miembros/:idMiembro/rellenar", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!miembro.esPlaceholder) {
            return respuesta.status(409).json({ error: "este miembro no es un hueco vacío" });
        }

        const { nombreReal, genero } = peticion.body;
        if (!nombreReal || nombreReal.trim() === "") return siguiente(true);
        if (!generosValidos.includes(genero)) return siguiente(true);

        // el miembro raíz (idReferencia null) no tiene referencia: se
        // recalcula como "yo" directamente
        let posicion;
        if (miembro.idReferencia === null) {
            posicion = calcularPosicion("yo", null, genero);
        } else {
            const referencia = await buscarMiembroPorId(miembro.idReferencia);
            if (!referencia) return respuesta.status(500).json({ error: "error en el servidor" });
            posicion = calcularPosicion(miembro.relacionDirecta, referencia, genero);
        }
        if (!posicion) return respuesta.status(500).json({ error: "error en el servidor" });

        const { fechaNacimiento } = peticion.body;
        if (!fechaNacimientoValida(fechaNacimiento)) return siguiente(true);

        await actualizarMiembro(idMiembro, {
            nombreReal,
            genero,
            fechaNacimiento: fechaNacimiento || null,
            esPlaceholder: false,
            arriba: posicion.arriba,
            abajo: posicion.abajo,
            esPolitico: posicion.esPolitico,
            parentesco: posicion.parentesco,
        });

        respuesta.json({ parentesco: posicion.parentesco });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// subir/cambiar la foto de un miembro.
// - el dueño de la familia puede ponerla en "fotoCreador" a cualquiera.
// - la propia persona (si su cuenta está vinculada a ese miembro) la pone
//   en "fotoPropia", que siempre prevalece sobre la del creador.
// - cualquier otra persona: no puede editar directo, solo sugerir.
servidor.post("/miembros/:idMiembro/foto", (peticion, respuesta, siguiente) => {
    subirFoto.single("foto")(peticion, respuesta, async (errorMulter) => {
        try {
            const { idMiembro } = peticion.params;
            if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

            if (errorMulter) {
                return respuesta.status(400).json({ error: errorMulter.message });
            }
            if (!peticion.file) {
                return respuesta.status(400).json({ error: "no se ha enviado ninguna imagen (campo 'foto')" });
            }

            const miembro = await buscarMiembroPorId(idMiembro);
            if (!miembro) return siguiente();

            const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
            if (!acceso) return;
            if (!acceso.fam) return siguiente();

            if (miembro.esPlaceholder) {
                return respuesta.status(409).json({ error: "no se puede asignar foto a un hueco vacío, rellénalo primero" });
            }

            if (!puedeEditarMiembroDirecto(miembro, acceso.fam, peticion.idUsuario)) {
                return respuesta.status(403).json({ error: "no puedes editar directamente este miembro; envía una sugerencia" });
            }

            // si es el propio miembro va a fotoPropia (prevalece); si es el
            // dueño de la familia poniéndosela a otro, va a fotoCreador
            const esElPropioMiembro = miembro.usuario !== null && miembro.usuario === peticion.idUsuario;
            const campo = esElPropioMiembro ? "fotoPropia" : "fotoCreador";
            borrarArchivoFoto(miembro[campo]);

            const urlFoto = await subirACloudinary(peticion.file.buffer, "recetas_familia/miembros");
            await actualizarMiembro(idMiembro, { [campo]: urlFoto });

            // fotoDeMiembro() antepone siempre la foto de perfil de la cuenta
            // vinculada a fotoPropia/fotoCreador; si no se actualiza también
            // aquí, subir una foto nueva a "Tú" no tendría ningún efecto
            // visible cuando la cuenta ya tenía una foto de perfil puesta
            if (esElPropioMiembro) {
                const usuarioActual = await buscarUsuarioPorId(peticion.idUsuario);
                if (usuarioActual && usuarioActual.foto) borrarArchivoFoto(usuarioActual.foto);
                await actualizarUsuario(peticion.idUsuario, { foto: urlFoto });
            }

            const fotoPropiaFinal = campo === "fotoPropia" ? urlFoto : miembro.fotoPropia;
            const fotoCreadorFinal = campo === "fotoCreador" ? urlFoto : miembro.fotoCreador;

            respuesta.json({
                [campo]: urlFoto,
                foto: esElPropioMiembro ? urlFoto : (fotoPropiaFinal || fotoCreadorFinal || null),
            });
        } catch (e) {
            console.log(e);
            respuesta.status(500).json({ error: "error en el servidor" });
        }
    });
});

// borrar la foto de un miembro (la propia si eres tú, o la que puso el
// dueño de la familia si la editas como dueño)
servidor.delete("/miembros/:idMiembro/foto", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!puedeEditarMiembroDirecto(miembro, acceso.fam, peticion.idUsuario)) {
            return respuesta.status(403).json({ error: "no puedes editar directamente este miembro; envía una sugerencia" });
        }

        const esElPropioMiembro = miembro.usuario !== null && miembro.usuario === peticion.idUsuario;
        const campo = esElPropioMiembro ? "fotoPropia" : "fotoCreador";

        borrarArchivoFoto(miembro[campo]);
        await actualizarMiembro(idMiembro, { [campo]: null });

        // igual que al subir: la foto de perfil de la cuenta vinculada
        // manda sobre fotoPropia, así que también hay que borrarla aquí
        if (esElPropioMiembro) {
            const usuarioActual = await buscarUsuarioPorId(peticion.idUsuario);
            if (usuarioActual && usuarioActual.foto) borrarArchivoFoto(usuarioActual.foto);
            await actualizarUsuario(peticion.idUsuario, { foto: null });
        }

        const fotoRestante = campo === "fotoPropia" ? miembro.fotoCreador : miembro.fotoPropia;
        respuesta.json({ foto: fotoRestante || null });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- perfil de un miembro concreto ---

servidor.get("/miembro/:idMiembro", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        // si hay alguien vinculado a este miembro, su nombre real de cuenta
        // (puede ser distinto del nombre que se le puso en el árbol)
        let nombreUsuarioVinculado = null;
        if (miembro.usuario) {
            const usuarioVinculado = await buscarUsuarioPorId(miembro.usuario);
            if (usuarioVinculado) nombreUsuarioVinculado = usuarioVinculado.nombre;
        }

        // si tiene descendientes registrados, borrarlo deja un hueco en vez
        // de desaparecer del todo (ver DELETE /miembros/:idMiembro)
        const miembrosFamilia = await leerMiembros(miembro.familia);
        const tieneDescendientes = miembrosFamilia.some(m => m.idReferencia === idMiembro);

        // el parentesco guardado es relativo a la raíz original del árbol;
        // aquí se recalcula relativo a quien lo está viendo, igual que en
        // GET /miembros/:idFamilia (si no, alguien vinculado a su propia
        // tarjeta vería su parentesco con la raíz en vez de "Tú"/"yo")
        const miMiembro = miembrosFamilia.find(m => m.usuario === peticion.idUsuario) || null;
        const parentesco = miMiembro
            ? calcularParentescoEntre(miMiembro, miembro, miembrosFamilia)
            : miembro.parentesco;

        respuesta.json({
            ...miembro,
            parentesco,
            esYo: miembro.usuario === peticion.idUsuario,
            foto: await fotoDeMiembro(miembro),
            nombreFamilia: acceso.fam.nombre,
            nombreUsuarioVinculado,
            tieneDescendientes,
            // el dueño de la familia siempre puede borrar (vaciar) un miembro,
            // esté o no vinculado a alguien; la raíz nunca se borra así
            puedeBorrar: acceso.fam.creadaPor === peticion.idUsuario && miembro.idReferencia !== null,
            puedeEditar: puedeEditarMiembroDirecto(miembro, acceso.fam, peticion.idUsuario),
            puedeEscribir: puedeEscribirEnFamilia(acceso),
            // "vincular familiar": cualquiera de la familia puede invitar a
            // alguien a ocupar un hueco real todavía sin cuenta
            puedeInvitar: puedeEscribirEnFamilia(acceso) && !miembro.usuario && !miembro.esPlaceholder,
            // solo el dueño puede desvincular a quien ya ocupa el hueco, y
            // nunca a sí mismo (no tiene sentido desvincularse de tu propia
            // tarjeta, la de "Tú")
            puedeDesvincular: acceso.fam.creadaPor === peticion.idUsuario && !!miembro.usuario && miembro.usuario !== peticion.idUsuario,
            creador: await datosCreadorParaAviso(acceso.fam.creadaPor, acceso.fam._id.toString()),
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- recetas ---

servidor.post("/recetas", async (peticion, respuesta, siguiente) => {
    try {
        const { familia, autor, nombre, tiempoMinutos, categoria, temporada, ingredientes, pasos, etiquetas } = peticion.body;

        if (!familia || !/^[0-9a-f]{24}$/.test(familia)) return siguiente(true);
        if (!autor || !/^[0-9a-f]{24}$/.test(autor)) return siguiente(true);
        if (!nombre || nombre.trim() === "") return siguiente(true);
        if (!categoriasValidas.includes(categoria)) return siguiente(true);
        if (!temporadasValidas.includes(temporada)) return siguiente(true);
        if (tiempoMinutos !== undefined && tiempoMinutos !== null && (typeof tiempoMinutos !== "number" || tiempoMinutos < 0)) return siguiente(true);
        if (!ingredientesValidos(ingredientes)) return siguiente(true);
        if (!pasosValidos(pasos)) return siguiente(true);
        if (!etiquetasValidas(etiquetas)) return siguiente(true);
        const { dedicatoria } = peticion.body;
        if (!dedicatoriaValida(dedicatoria)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!puedeEscribirEnFamilia(acceso)) {
            return respuesta.status(403).json({ error: "solo puedes ver este árbol, no puedes añadir recetas" });
        }

        // el miembro al que se atribuye la receta tiene que ser de esta familia
        const miembroAutor = await buscarMiembroPorId(autor);
        if (!miembroAutor || miembroAutor.familia !== familia) return siguiente(true);
        if (miembroAutor.esPlaceholder) {
            return respuesta.status(409).json({ error: "no se puede atribuir una receta a un hueco vacío" });
        }

        const receta = {
            familia,
            autor,                              // miembro al que se atribuye
            creadoPor: peticion.idUsuario,      // usuario que la escribió
            nombre,
            tiempoMinutos: tiempoMinutos ?? null,
            categoria,
            temporada,
            etiquetas: etiquetas || [],
            // cantidades SIEMPRE normalizadas a 1 ración; el escalado es del cliente
            ingredientes: ingredientes.map(i => ({
                cantidad: i.cantidad,
                unidad: i.unidad.trim(),
                nombre: i.nombre.trim(),
            })),
            pasos: pasos.map(p => ({ texto: p.texto.trim(), foto: null })),
            dedicatoria: dedicatoria ? dedicatoria.trim() : null,
            fotos: [],
            portada: null,
            creado: new Date(),
        };

        const _id = await crearReceta(receta);
        respuesta.status(201).json({ _id });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// tamaño de página por defecto para /recetas/familia/:idFamilia; también
// hace de tope máximo aunque el cliente pida uno mayor
const recetasPorPagina = 30;

// todas las recetas de una familia (pestaña "Todas las recetas" del árbol),
// paginada y con filtros opcionales ?categoria=&temporada=&busqueda=&pagina=
servidor.get("/recetas/familia/:idFamilia", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        const { categoria, temporada, busqueda } = peticion.query;

        const pagina = Math.max(1, parseInt(peticion.query.pagina, 10) || 1);
        const limite = recetasPorPagina;

        const { items, total } = await leerRecetasDeFamiliaPaginado(idFamilia, {
            categoria: categoriasValidas.includes(categoria) ? categoria : undefined,
            temporada: temporadasValidas.includes(temporada) ? temporada : undefined,
            busqueda: busqueda && busqueda.trim() !== "" ? busqueda.trim() : undefined,
            pagina,
            limite,
        });

        const enriquecidas = await Promise.all(items.map(enriquecerReceta));
        const estado = await estadoRecetasDeUsuario(peticion.idUsuario);
        respuesta.json({
            recetas: marcarEstadoRecetas(enriquecidas, estado),
            total,
            pagina,
            limite,
            hayMas: pagina * limite < total,
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// recetas ATRIBUIDAS a un miembro (es su autor), las haya escrito quien sea
servidor.get("/recetas/miembro/:idMiembro", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        const recetas = await leerRecetasDeMiembro(idMiembro);
        const enriquecidas = await Promise.all(recetas.map(enriquecerReceta));
        const estado = await estadoRecetasDeUsuario(peticion.idUsuario);
        respuesta.json(marcarEstadoRecetas(enriquecidas, estado));
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// APORTACIONES de un miembro: recetas escritas por su usuario vinculado,
// sea quien sea el autor al que se atribuyan
servidor.get("/recetas/aportaciones/:idMiembro", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        // un miembro sin cuenta vinculada no ha podido escribir nada
        if (!miembro.usuario) return respuesta.json([]);

        const recetas = await leerAportacionesDeUsuario(miembro.familia, miembro.usuario);
        const enriquecidas = await Promise.all(recetas.map(enriquecerReceta));
        const estado = await estadoRecetasDeUsuario(peticion.idUsuario);
        respuesta.json(marcarEstadoRecetas(enriquecidas, estado));
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// buscador global: por nombre, entre TODAS las familias a las que tengo
// acceso (no solo dentro de una). Búsqueda básica —substring insensible a
// mayúsculas, sin índices ni relevancia— y limitada a 30 resultados,
// los más recientes primero. IMPORTANTE: tiene que ir ANTES de
// GET /recetas/:idReceta, si no Express intentaría tratar "buscar" como
// un id de receta.
servidor.get("/recetas/buscar", async (peticion, respuesta) => {
    try {
        const termino = (peticion.query.q || "").trim().toLowerCase();
        if (termino === "") return respuesta.json([]);

        const familias = await leerMisFamilias(peticion.idUsuario);

        let resultados = [];
        for (const fam of familias) {
            const idFamilia = fam._id.toString();
            const recetas = await leerRecetasDeFamilia(idFamilia);
            const coinciden = recetas.filter(r => r.nombre.toLowerCase().includes(termino));
            for (const r of coinciden) {
                const enriquecida = await enriquecerReceta(r);
                resultados.push({ ...enriquecida, nombreFamilia: fam.nombre });
            }
        }

        resultados.sort((a, b) => new Date(b.creado) - new Date(a.creado));
        const estado = await estadoRecetasDeUsuario(peticion.idUsuario);
        respuesta.json(marcarEstadoRecetas(resultados.slice(0, 30), estado));
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// una receta concreta (para la página de detalle)
servidor.get("/recetas/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        const usuario = await buscarUsuarioPorId(peticion.idUsuario);
        const esFavorita = (usuario.favoritos || []).includes(idReceta);
        const puedeEditar = await puedeModificarReceta(receta, peticion.idUsuario);
        const recetaEnriquecida = await enriquecerReceta(receta);
        const creador = await datosCreadorParaAviso(receta.creadoPor, receta.familia);

        respuesta.json({ ...recetaEnriquecida, esFavorita, puedeEditar, puedeEscribir: puedeEscribirEnFamilia(acceso), creador });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// marcar/desmarcar una receta como favorita (cualquiera con acceso a su familia)
servidor.post("/favoritos/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        await agregarFavorito(peticion.idUsuario, idReceta);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.delete("/favoritos/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        await quitarFavorito(peticion.idUsuario, idReceta);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// lista de recetas favoritas del usuario, enriquecidas igual que el resto
servidor.get("/favoritos", async (peticion, respuesta) => {
    try {
        const usuario = await buscarUsuarioPorId(peticion.idUsuario);
        const idsFavoritos = usuario.favoritos || [];

        const recetas = [];
        for (const idReceta of idsFavoritos) {
            const receta = await buscarRecetaPorId(idReceta);
            // puede que la receta ya no exista, o que ya no tengamos acceso a su familia
            if (!receta) continue;
            const tieneAcceso = await tieneAccesoFamilia(peticion.idUsuario, receta.familia);
            if (!tieneAcceso) continue;
            recetas.push(await enriquecerReceta(receta));
        }

        // todas son favoritas por definición (es la lista de favoritos),
        // pero también puede que alguna esté además guardada en una
        // colección propia, así que se calcula igual que en el resto
        const estado = await estadoRecetasDeUsuario(peticion.idUsuario);
        respuesta.json(marcarEstadoRecetas(recetas, estado));
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// =========================
//  COLECCIONES
// =========================

// arma el objeto-tarjeta de una colección: portadas (máx 4) + datos del creador.
// idViewer sirve para saber si tenemos acceso a las recetas al elegir portadas.
async function tarjetaColeccion(col, idViewer) {
    const portadas = [];
    for (const idReceta of (col.recetas || [])) {
        if (portadas.length >= 4) break;
        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) continue;
        const portada = receta.portada || (receta.fotos && receta.fotos[0]) || null;
        if (portada) portadas.push(portada);
    }

    // creador: el miembro vinculado al usuario dueño de la colección
    let creador = null;
    try {
        const miembroCreador = await buscarMiembroPorUsuario(col.usuario);
        if (miembroCreador) {
            creador = {
                nombreReal: miembroCreador.nombreReal,
                foto: await fotoDeMiembro(miembroCreador),
            };
        } else {
            const usuarioCreador = await buscarUsuarioPorId(col.usuario);
            if (usuarioCreador) creador = { nombreReal: usuarioCreador.nombre, foto: usuarioCreador.foto || null };
        }
    } catch (e) { console.error(e); }

    return {
        _id: col._id,
        nombre: col.nombre,
        numRecetas: (col.recetas || []).length,
        portadas,
        ultimoAnadido: col.ultimoAnadido || null,
        creador,
        esPropia: col.usuario === idViewer,
    };
}

// crear una colección vacía
servidor.post("/colecciones", async (peticion, respuesta, siguiente) => {
    try {
        const { nombre } = peticion.body;
        if (!nombre || nombre.trim() === "") return siguiente(true);

        const id = await crearColeccion({
            usuario: peticion.idUsuario,
            nombre: nombre.trim(),
            recetas: [],
            creado: new Date(),
        });

        respuesta.status(201).json({ _id: id });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// listar mis colecciones: las propias + las que he guardado de otros usuarios
servidor.get("/colecciones", async (peticion, respuesta) => {
    try {
        const propias = await leerColeccionesDeUsuario(peticion.idUsuario);

        const usuario = await buscarUsuarioPorId(peticion.idUsuario);
        const idsGuardadas = usuario.coleccionesGuardadas || [];
        const guardadas = [];
        for (const idCol of idsGuardadas) {
            const col = await buscarColeccionPorId(idCol);
            if (col) guardadas.push(col);
        }

        const todas = [...propias, ...guardadas];
        const enriquecidas = await Promise.all(todas.map(col => tarjetaColeccion(col, peticion.idUsuario)));

        respuesta.json(enriquecidas);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// colecciones CREADAS por un miembro (para la pestaña en su perfil).
// Solo las propias del usuario vinculado, no las que tenga guardadas de otros.
servidor.get("/colecciones/miembro/:idMiembro", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        // si el miembro no tiene usuario vinculado, no tiene colecciones
        if (!miembro.usuario) return respuesta.json([]);

        const colecciones = await leerColeccionesDeUsuario(miembro.usuario);
        const enriquecidas = await Promise.all(colecciones.map(col => tarjetaColeccion(col, peticion.idUsuario)));

        respuesta.json(enriquecidas);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// ver una colección concreta con sus recetas. Accesible si es tuya o si la
// tienes guardada (colección de otro que has añadido a tus favoritos).
servidor.get("/colecciones/:idColeccion", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);

        const col = await buscarColeccionPorId(idColeccion);
        if (!col) return siguiente();

        const esPropia = col.usuario === peticion.idUsuario;
        const usuario = await buscarUsuarioPorId(peticion.idUsuario);
        const laTengoGuardada = (usuario.coleccionesGuardadas || []).includes(idColeccion);
        if (!esPropia && !laTengoGuardada) return respuesta.sendStatus(403);

        const recetas = [];
        for (const idReceta of (col.recetas || [])) {
            const receta = await buscarRecetaPorId(idReceta);
            if (!receta) continue;
            const tieneAcceso = await tieneAccesoFamilia(peticion.idUsuario, receta.familia);
            if (!tieneAcceso) continue;
            recetas.push(await enriquecerReceta(receta));
        }

        // datos del creador para la cabecera
        let creador = null;
        try {
            const miembroCreador = await buscarMiembroPorUsuario(col.usuario);
            if (miembroCreador) creador = { nombreReal: miembroCreador.nombreReal, foto: await fotoDeMiembro(miembroCreador) };
        } catch (e) { console.error(e); }

        // esFavorita para el corazón de cada tarjeta (estaGuardada no
        // aplica aquí: dentro de una colección concreta el icono de
        // guardado representa "está en ESTA colección", que es siempre
        // cierto para lo que se lista aquí, no "en alguna colección")
        const estado = await estadoRecetasDeUsuario(peticion.idUsuario);
        respuesta.json({ _id: col._id, nombre: col.nombre, recetas: marcarEstadoRecetas(recetas, estado), esPropia, creador });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// renombrar una colección
servidor.put("/colecciones/:idColeccion", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);

        const { nombre } = peticion.body;
        if (!nombre || nombre.trim() === "") return siguiente(true);

        const col = await buscarColeccionPorId(idColeccion);
        if (!col) return siguiente();
        if (col.usuario !== peticion.idUsuario) return respuesta.sendStatus(403);

        await actualizarColeccion(idColeccion, { nombre: nombre.trim() });
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// borrar una colección (no borra las recetas, solo la agrupación)
servidor.delete("/colecciones/:idColeccion", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);

        const col = await buscarColeccionPorId(idColeccion);
        if (!col) return siguiente();
        if (col.usuario !== peticion.idUsuario) return respuesta.sendStatus(403);

        await borrarColeccion(idColeccion);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// añadir una receta a una colección
servidor.post("/colecciones/:idColeccion/recetas/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion, idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const col = await buscarColeccionPorId(idColeccion);
        if (!col) return siguiente();
        if (col.usuario !== peticion.idUsuario) return respuesta.sendStatus(403);

        // comprobar que la receta existe y tenemos acceso
        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();
        const tieneAcceso = await tieneAccesoFamilia(peticion.idUsuario, receta.familia);
        if (!tieneAcceso) return respuesta.sendStatus(403);

        await agregarRecetaAColeccion(idColeccion, idReceta);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// quitar una receta de una colección
servidor.delete("/colecciones/:idColeccion/recetas/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion, idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const col = await buscarColeccionPorId(idColeccion);
        if (!col) return siguiente();
        if (col.usuario !== peticion.idUsuario) return respuesta.sendStatus(403);

        await quitarRecetaDeColeccion(idColeccion, idReceta);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// guardar en mis favoritos una colección de OTRO usuario (tipo Pinterest)
servidor.post("/colecciones/:idColeccion/guardar", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);

        const col = await buscarColeccionPorId(idColeccion);
        if (!col) return siguiente();
        if (col.usuario === peticion.idUsuario) {
            return respuesta.status(400).json({ error: "no puedes guardar tu propia colección" });
        }

        await guardarColeccion(peticion.idUsuario, idColeccion);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.delete("/colecciones/:idColeccion/guardar", async (peticion, respuesta, siguiente) => {
    try {
        const { idColeccion } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idColeccion)) return siguiente(true);

        await quitarColeccionGuardada(peticion.idUsuario, idColeccion);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// en qué de mis colecciones propias está una receta (para marcar "Ya añadido"
// y para rellenar el icono de guardar). Devuelve un array de ids de colección.
servidor.get("/recetas/:idReceta/colecciones", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const colecciones = await leerColeccionesDeUsuario(peticion.idUsuario);
        const contienen = colecciones
            .filter(col => (col.recetas || []).includes(idReceta))
            .map(col => col._id.toString());

        respuesta.json(contienen);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// enriquece una receta con los datos del miembro autor (para las cards)
// conjuntos de ids de receta favoritas/guardadas (en alguna colección
// propia) de un usuario, para poder marcar el corazón/guardado en las
// tarjetas de golpe, sin una consulta por receta
async function estadoRecetasDeUsuario(idUsuario) {
    const usuario = await buscarUsuarioPorId(idUsuario);
    const favoritos = new Set(usuario.favoritos || []);

    const misColecciones = await leerColeccionesDeUsuario(idUsuario);
    const guardadas = new Set();
    misColecciones.forEach(col => (col.recetas || []).forEach(id => guardadas.add(id)));

    return { favoritos, guardadas };
}

// añade esFavorita/estaGuardada a una lista de recetas ya cargada
function marcarEstadoRecetas(recetas, estado) {
    return recetas.map(r => ({
        ...r,
        esFavorita: estado.favoritos.has(r._id.toString()),
        estaGuardada: estado.guardadas.has(r._id.toString()),
    }));
}

async function enriquecerReceta(receta) {
    if (!receta.autor) return receta;
    try {
        const miembroAutor = await buscarMiembroPorId(receta.autor);
        if (!miembroAutor) return receta;
        return {
            ...receta,
            autorInfo: {
                _id: miembroAutor._id,
                nombreReal: miembroAutor.nombreReal,
                parentesco: miembroAutor.parentesco,
                foto: await fotoDeMiembro(miembroAutor),
            },
        };
    } catch (e) {
        console.error(e);
        return receta;
    }
}

async function puedeModificarReceta(receta, idUsuario) {
    if (receta.creadoPor === idUsuario) return true;
    const miembroAutor = await buscarMiembroPorId(receta.autor);
    return miembroAutor !== null && miembroAutor.usuario === idUsuario;
}

// =========================
//  SUGERENCIAS
// =========================
// Cuando alguien no tiene permiso para editar directamente un miembro, una
// familia o una receta, puede proponer un cambio. Se guarda pendiente hasta
// que el dueño del elemento la acepta (se aplica) o la rechaza (se borra).

// dado un tipo+id, calcula quién es el "destino" (a quién le llega la
// sugerencia) y los datos actuales para mostrar la comparación
async function datosObjetivoSugerencia(tipo, idObjetivo, idUsuarioSugerente) {
    if (tipo === "miembro") {
        const miembro = await buscarMiembroPorId(idObjetivo);
        if (!miembro) return null;
        const fam = await buscarFamilia(miembro.familia);
        if (!fam) return null;
        return {
            familia: miembro.familia,
            destino: fam.creadaPor,
            puedeEditarDirecto: puedeEditarMiembroDirecto(miembro, fam, idUsuarioSugerente),
            actual: { nombreReal: miembro.nombreReal, fechaNacimiento: miembro.fechaNacimiento || null, foto: await fotoDeMiembro(miembro) },
        };
    }

    if (tipo === "familia") {
        const fam = await buscarFamilia(idObjetivo);
        if (!fam) return null;
        return {
            familia: idObjetivo,
            destino: fam.creadaPor,
            puedeEditarDirecto: fam.creadaPor === idUsuarioSugerente,
            actual: { nombre: fam.nombre },
        };
    }

    if (tipo === "receta") {
        const receta = await buscarRecetaPorId(idObjetivo);
        if (!receta) return null;
        const puedeEditar = await puedeModificarReceta(receta, idUsuarioSugerente);
        return {
            familia: receta.familia,
            destino: receta.creadoPor,
            puedeEditarDirecto: puedeEditar,
            actual: {
                nombre: receta.nombre,
                tiempoMinutos: receta.tiempoMinutos,
                categoria: receta.categoria,
                temporada: receta.temporada,
                ingredientes: receta.ingredientes,
                pasos: receta.pasos,
            },
        };
    }

    return null;
}

// texto legible para la notificación en Recientes
function textoSugerencia(tipo, cambios, nombreSugerente, nombreObjetivo) {
    const campos = Object.keys(cambios);
    let que;
    if (tipo === "miembro") {
        if (campos.length === 1 && campos[0] === "foto") que = `cambiar la foto de perfil de ${nombreObjetivo}`;
        else if (campos.length === 1 && campos[0] === "nombreReal") que = `cambiar el nombre de ${nombreObjetivo}`;
        else que = `cambios en el perfil de ${nombreObjetivo}`;
    } else if (tipo === "familia") {
        que = `cambiar el nombre de la familia ${nombreObjetivo}`;
    } else {
        que = `cambios en la receta "${nombreObjetivo}"`;
    }
    return `${nombreSugerente} ha sugerido ${que}`;
}

// subir la foto propuesta en una sugerencia (miembro o familia). Devuelve la
// URL para incluir luego en el body de POST /sugerencias
servidor.post("/sugerencias/foto", (peticion, respuesta, siguiente) => {
    subirFoto.single("foto")(peticion, respuesta, async (errorMulter) => {
        try {
            if (errorMulter) return respuesta.status(400).json({ error: errorMulter.message });
            if (!peticion.file) return respuesta.status(400).json({ error: "no se ha enviado ninguna imagen (campo 'foto')" });

            const urlFoto = await subirACloudinary(peticion.file.buffer, "recetas_familia/sugerencias");
            respuesta.json({ foto: urlFoto });
        } catch (e) {
            console.log(e);
            respuesta.status(500).json({ error: "error en el servidor" });
        }
    });
});

// crear una sugerencia de cambio
servidor.post("/sugerencias", async (peticion, respuesta, siguiente) => {
    try {
        const { tipo, idObjetivo, cambios } = peticion.body;

        if (!["miembro", "familia", "receta"].includes(tipo)) return siguiente(true);
        if (!idObjetivo || !/^[0-9a-f]{24}$/.test(idObjetivo)) return siguiente(true);
        if (!cambios || typeof cambios !== "object" || Object.keys(cambios).length === 0) return siguiente(true);
        if (!cambiosSugeridosValidos(tipo, cambios)) return siguiente(true);

        const info = await datosObjetivoSugerencia(tipo, idObjetivo, peticion.idUsuario);
        if (!info) return siguiente();

        // hace falta tener acceso a la familia para poder sugerir
        const acceso = await requiereAccesoFamilia(peticion, respuesta, info.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!puedeEscribirEnFamilia(acceso)) {
            return respuesta.status(403).json({ error: "solo puedes ver este árbol, no puedes enviar sugerencias" });
        }

        // si ya puede editar directo, no tiene sentido crear una sugerencia
        if (info.puedeEditarDirecto) {
            return respuesta.status(400).json({ error: "puedes editar esto directamente, no hace falta sugerir" });
        }

        if (!info.destino) {
            return respuesta.status(409).json({ error: "no se ha podido determinar quién debe recibir la sugerencia" });
        }

        const idSugerencia = await crearSugerencia({
            tipo,
            idObjetivo,
            familia: info.familia,
            sugerente: peticion.idUsuario,
            destino: info.destino,
            cambios,
            estado: "pendiente",
            creado: new Date(),
        });

        respuesta.status(201).json({ _id: idSugerencia });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// listar las sugerencias pendientes dirigidas a mí, enriquecidas para
// mostrarlas en Recientes y para la modal de comparación
servidor.get("/sugerencias", async (peticion, respuesta) => {
    try {
        const sugerencias = await leerSugerenciasPendientesPara(peticion.idUsuario);

        const enriquecidas = await Promise.all(sugerencias.map(async sug => {
            const info = await datosObjetivoSugerencia(sug.tipo, sug.idObjetivo, sug.sugerente);
            if (!info) return null;

            const miembroSugerente = await buscarMiembroPorUsuario(sug.sugerente);
            const sugerente = miembroSugerente
                ? { nombreReal: miembroSugerente.nombreReal, foto: await fotoDeMiembro(miembroSugerente) }
                : { nombreReal: "alguien", foto: null };

            const nombreObjetivo = info.actual.nombre || info.actual.nombreReal || "";

            return {
                _id: sug._id,
                tipo: sug.tipo,
                idObjetivo: sug.idObjetivo,
                sugerente,
                actual: info.actual,
                cambios: sug.cambios,
                texto: textoSugerencia(sug.tipo, sug.cambios, sugerente.nombreReal, nombreObjetivo),
                creado: sug.creado,
            };
        }));

        respuesta.json(enriquecidas.filter(s => s !== null));
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// una sugerencia concreta, con todo el detalle para la modal de comparación
servidor.get("/sugerencias/:idSugerencia", async (peticion, respuesta, siguiente) => {
    try {
        const { idSugerencia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idSugerencia)) return siguiente(true);

        const sug = await buscarSugerenciaPorId(idSugerencia);
        if (!sug) return siguiente();
        if (sug.destino !== peticion.idUsuario) return respuesta.sendStatus(403);

        const info = await datosObjetivoSugerencia(sug.tipo, sug.idObjetivo, sug.sugerente);
        if (!info) return siguiente();

        const miembroSugerente = await buscarMiembroPorUsuario(sug.sugerente);
        const sugerente = miembroSugerente
            ? { nombreReal: miembroSugerente.nombreReal, foto: await fotoDeMiembro(miembroSugerente) }
            : { nombreReal: "alguien", foto: null };

        const nombreObjetivo = info.actual.nombre || info.actual.nombreReal || "";

        respuesta.json({
            _id: sug._id,
            tipo: sug.tipo,
            idObjetivo: sug.idObjetivo,
            sugerente,
            actual: info.actual,
            cambios: sug.cambios,
            texto: textoSugerencia(sug.tipo, sug.cambios, sugerente.nombreReal, nombreObjetivo),
            creado: sug.creado,
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// aceptar una sugerencia: aplica los cambios y la borra
servidor.post("/sugerencias/:idSugerencia/aceptar", async (peticion, respuesta, siguiente) => {
    try {
        const { idSugerencia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idSugerencia)) return siguiente(true);

        const sug = await buscarSugerenciaPorId(idSugerencia);
        if (!sug) return siguiente();
        if (sug.destino !== peticion.idUsuario) return respuesta.sendStatus(403);

        // por si acaso: revalida antes de aplicar el $set, aunque ya se
        // validó al crearla (defensa en profundidad)
        if (!cambiosSugeridosValidos(sug.tipo, sug.cambios)) {
            return respuesta.status(409).json({ error: "esta sugerencia tiene datos no válidos y no se puede aplicar" });
        }

        if (sug.tipo === "miembro") {
            await actualizarMiembro(sug.idObjetivo, sug.cambios);
        } else if (sug.tipo === "familia") {
            await actualizarFamilia(sug.idObjetivo, sug.cambios);
        } else if (sug.tipo === "receta") {
            await actualizarReceta(sug.idObjetivo, sug.cambios);
        }

        await borrarSugerencia(idSugerencia);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// rechazar una sugerencia: se borra sin aplicar
servidor.delete("/sugerencias/:idSugerencia", async (peticion, respuesta, siguiente) => {
    try {
        const { idSugerencia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idSugerencia)) return siguiente(true);

        const sug = await buscarSugerenciaPorId(idSugerencia);
        if (!sug) return siguiente();
        if (sug.destino !== peticion.idUsuario) return respuesta.sendStatus(403);

        await borrarSugerencia(idSugerencia);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.put("/recetas/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!(await puedeModificarReceta(receta, peticion.idUsuario))) {
            return respuesta.sendStatus(403);
        }

        const { nombre, tiempoMinutos, categoria, temporada, ingredientes, pasos, etiquetas } = peticion.body;
        const cambios = {};

        if (nombre !== undefined) {
            if (nombre.trim() === "") return siguiente(true);
            cambios.nombre = nombre;
        }
        if (tiempoMinutos !== undefined) {
            if (tiempoMinutos !== null && (typeof tiempoMinutos !== "number" || tiempoMinutos < 0)) return siguiente(true);
            cambios.tiempoMinutos = tiempoMinutos;
        }
        if (categoria !== undefined) {
            if (!categoriasValidas.includes(categoria)) return siguiente(true);
            cambios.categoria = categoria;
        }
        if (temporada !== undefined) {
            if (!temporadasValidas.includes(temporada)) return siguiente(true);
            cambios.temporada = temporada;
        }
        if (ingredientes !== undefined) {
            if (!ingredientesValidos(ingredientes)) return siguiente(true);
            cambios.ingredientes = ingredientes.map(i => ({ cantidad: i.cantidad, unidad: i.unidad.trim(), nombre: i.nombre.trim() }));
        }
        if (pasos !== undefined) {
            if (!pasosValidos(pasos)) return siguiente(true);
            const pasosNormalizados = pasos.map(p => ({ texto: p.texto.trim(), foto: p.foto || null }));

            // limpieza en Cloudinary de las fotos de paso que ya no van a
            // quedar (se ha quitado la foto, o el paso entero ha
            // desaparecido al borrarlo); se compara por URL, no por
            // posición, porque borrar/reordenar pasos de en medio desplaza
            // los índices de los que sí sobreviven. La sustitución por una
            // foto nueva se limpia aparte, en
            // POST /recetas/:idReceta/pasos/:indice/foto
            const fotosQueQuedan = new Set(pasosNormalizados.map(p => p.foto).filter(Boolean));
            (receta.pasos || []).forEach(pAntiguo => {
                const fotoAntigua = pAntiguo && typeof pAntiguo === "object" ? pAntiguo.foto : null;
                if (fotoAntigua && !fotosQueQuedan.has(fotoAntigua)) borrarArchivoFoto(fotoAntigua);
            });

            cambios.pasos = pasosNormalizados;
        }
        if (etiquetas !== undefined) {
            if (!etiquetasValidas(etiquetas)) return siguiente(true);
            cambios.etiquetas = etiquetas;
        }
        const { dedicatoria } = peticion.body;
        if (dedicatoria !== undefined) {
            if (!dedicatoriaValida(dedicatoria)) return siguiente(true);
            cambios.dedicatoria = dedicatoria ? dedicatoria.trim() : null;
        }

        if (Object.keys(cambios).length === 0) return siguiente(true);

        await actualizarReceta(idReceta, cambios);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.delete("/recetas/:idReceta", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente();

        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!(await puedeModificarReceta(receta, peticion.idUsuario))) {
            return respuesta.sendStatus(403);
        }

        (receta.fotos || []).forEach(borrarArchivoFoto);
        (receta.pasos || []).forEach(p => p && typeof p === "object" && p.foto && borrarArchivoFoto(p.foto));
        await borrarReceta(idReceta);

        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// subir una o varias fotos de una receta (hasta 6 por envío) y elegir portada.
// Campo multipart "fotos" (múltiple) y campo de texto opcional "portadaIndice"
// con el índice, dentro de este envío, de la imagen que será la portada.
servidor.post("/recetas/:idReceta/fotos", (peticion, respuesta, siguiente) => {
    subirFoto.array("fotos", 6)(peticion, respuesta, async (errorMulter) => {
        try {
            const { idReceta } = peticion.params;
            if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

            if (errorMulter) {
                return respuesta.status(400).json({ error: errorMulter.message });
            }
            if (!peticion.files || peticion.files.length === 0) {
                return respuesta.status(400).json({ error: "no se ha enviado ninguna imagen (campo 'fotos')" });
            }

            const receta = await buscarRecetaPorId(idReceta);
            if (!receta) return siguiente();

            const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
            if (!acceso) return;
            if (!acceso.fam) return siguiente();

            if (!(await puedeModificarReceta(receta, peticion.idUsuario))) {
                return respuesta.sendStatus(403);
            }

            const nuevas = await Promise.all(
                peticion.files.map(archivo => subirACloudinary(archivo.buffer, "recetas_familia/recetas"))
            );
            const fotos = [...(receta.fotos || []), ...nuevas];

            // portada: el índice se refiere a las fotos de ESTE envío; si no
            // viene y la receta aún no tiene portada, se usa la primera
            const indice = parseInt(peticion.body.portadaIndice, 10);
            let portada = receta.portada || null;
            if (!isNaN(indice) && nuevas[indice]) {
                portada = nuevas[indice];
            } else if (!portada) {
                portada = fotos[0];
            }

            await actualizarReceta(idReceta, { fotos, portada });

            respuesta.json({ fotos, portada });
        } catch (e) {
            console.log(e);
            respuesta.status(500).json({ error: "error en el servidor" });
        }
    });
});

// quita una foto ya guardada de la receta (y la borra de Cloudinary). Si
// era la portada, la portada pasa a ser la primera foto que quede (o null).
servidor.delete("/recetas/:idReceta/fotos", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const { foto } = peticion.body;
        if (typeof foto !== "string" || !foto) return siguiente(true);

        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!(await puedeModificarReceta(receta, peticion.idUsuario))) {
            return respuesta.sendStatus(403);
        }

        const fotos = (receta.fotos || []).filter(f => f !== foto);
        const portada = receta.portada === foto ? (fotos[0] || null) : (receta.portada || null);

        await actualizarReceta(idReceta, { fotos, portada });
        borrarArchivoFoto(foto);

        respuesta.json({ fotos, portada });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// cambia la portada de la receta a una foto que ya estaba guardada (debe
// estar dentro de "fotos"; para portada = una recién subida se usa
// "portadaIndice" en POST /recetas/:idReceta/fotos)
servidor.put("/recetas/:idReceta/portada", async (peticion, respuesta, siguiente) => {
    try {
        const { idReceta } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

        const { foto } = peticion.body;
        if (typeof foto !== "string" || !foto) return siguiente(true);

        const receta = await buscarRecetaPorId(idReceta);
        if (!receta) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!(await puedeModificarReceta(receta, peticion.idUsuario))) {
            return respuesta.sendStatus(403);
        }

        if (!(receta.fotos || []).includes(foto)) return siguiente(true);

        await actualizarReceta(idReceta, { portada: foto });

        respuesta.json({ portada: foto });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// sube (o sustituye) la foto de un paso concreto de la preparación. Campo
// multipart "foto" (único). Se hace aparte de PUT /recetas/:idReceta porque
// ese es JSON y esto necesita multipart; el resto de cambios del paso
// (texto) sí se guardan a través del PUT normal.
servidor.post("/recetas/:idReceta/pasos/:indice/foto", (peticion, respuesta, siguiente) => {
    subirFoto.single("foto")(peticion, respuesta, async (errorMulter) => {
        try {
            const { idReceta, indice } = peticion.params;
            if (!/^[0-9a-f]{24}$/.test(idReceta)) return siguiente(true);

            const indiceNum = parseInt(indice, 10);
            if (isNaN(indiceNum) || indiceNum < 0) return siguiente(true);

            if (errorMulter) {
                return respuesta.status(400).json({ error: errorMulter.message });
            }
            if (!peticion.file) {
                return respuesta.status(400).json({ error: "no se ha enviado ninguna imagen (campo 'foto')" });
            }

            const receta = await buscarRecetaPorId(idReceta);
            if (!receta) return siguiente();

            const acceso = await requiereAccesoFamilia(peticion, respuesta, receta.familia);
            if (!acceso) return;
            if (!acceso.fam) return siguiente();

            if (!(await puedeModificarReceta(receta, peticion.idUsuario))) {
                return respuesta.sendStatus(403);
            }

            const pasos = receta.pasos || [];
            if (indiceNum >= pasos.length) {
                return respuesta.status(400).json({ error: "ese paso no existe" });
            }

            const pasoAntiguo = pasos[indiceNum];
            const fotoAntigua = pasoAntiguo && typeof pasoAntiguo === "object" ? pasoAntiguo.foto : null;
            if (fotoAntigua) borrarArchivoFoto(fotoAntigua);

            const urlFoto = await subirACloudinary(peticion.file.buffer, "recetas_familia/pasos");
            const textoActual = pasoAntiguo && typeof pasoAntiguo === "object" ? pasoAntiguo.texto : (pasoAntiguo || "");

            // se actualiza solo esta posición del array (notación de punto) en vez de
            // reescribir "pasos" entero: al subirse las fotos de varios pasos en
            // paralelo, un $set del array completo basado en una lectura previa
            // pisaría las fotos que hubieran guardado las demás peticiones concurrentes
            await actualizarReceta(idReceta, { [`pasos.${indiceNum}`]: { texto: textoActual, foto: urlFoto } });

            respuesta.json({ foto: urlFoto });
        } catch (e) {
            console.log(e);
            respuesta.status(500).json({ error: "error en el servidor" });
        }
    });
});

// --- inicio: secciones dinámicas de la página principal ---

function estacionActual() {
    const mes = new Date().getMonth() + 1;
    if (mes >= 3 && mes <= 5) return "primavera";
    if (mes >= 6 && mes <= 8) return "verano";
    if (mes >= 9 && mes <= 11) return "otoño";
    return "invierno";
}

// recetas de todas las familias del usuario, con autor/creador ya resueltos:
// base compartida por /inicio (destacadas de temporada) y /notificaciones (recientes)
// soloVinculadas: descarta familias a las que el usuario solo tiene acceso
// como espectador o como dueño sin tarjeta propia (creó la familia con
// "no pertenezco"), es decir, familias que no son realmente "la suya"
async function recetasDeTodasMisFamilias(idUsuario, { soloVinculadas = false } = {}) {
    const familias = await leerMisFamilias(idUsuario);
    let todas = [];

    for (const fam of familias) {
        const idFamilia = fam._id.toString();
        const [miembros, recetas] = await Promise.all([
            leerMiembros(idFamilia),
            leerRecetasDeFamilia(idFamilia),
        ]);

        const miembroPorId = {};
        const miembroPorUsuario = {};
        miembros.forEach(m => {
            miembroPorId[m._id.toString()] = m;
            if (m.usuario) miembroPorUsuario[m.usuario] = m;
        });

        if (soloVinculadas && !miembroPorUsuario[idUsuario]) continue;

        // fotos de perfil de los usuarios vinculados (prevalecen sobre las del miembro)
        const fotosUsuario = {};
        const idsUsuarios = [...new Set(miembros.filter(m => m.usuario).map(m => m.usuario))];
        await Promise.all(idsUsuarios.map(async idU => {
            try {
                const u = await buscarUsuarioPorId(idU);
                if (u && u.foto) fotosUsuario[idU] = u.foto;
            } catch (e) { console.error(e); }
        }));
        const fotoDe = (m) => (m.usuario && fotosUsuario[m.usuario]) || m.fotoPropia || m.fotoCreador || null;

        // el parentesco guardado en cada miembro es relativo a la raíz
        // original del árbol; para que la notificación tenga sentido para
        // QUIEN LA LEE hay que recalcularlo relativo a su propio miembro
        // en esta familia (si no está vinculado a ninguno, se cae de
        // vuelta al parentesco guardado, relativo a la raíz)
        const miMiembro = miembroPorUsuario[idUsuario] || null;
        const parentescoParaViewer = (m) => miMiembro ? calcularParentescoEntre(miMiembro, m, miembros) : m.parentesco;

        recetas.forEach(r => {
            const autorMiembro = miembroPorId[r.autor];
            const creadorMiembro = miembroPorUsuario[r.creadoPor];

            todas.push({
                _id: r._id,
                nombre: r.nombre,
                portada: r.portada || (r.fotos && r.fotos[0]) || null,
                tiempoMinutos: r.tiempoMinutos,
                categoria: r.categoria,
                temporada: r.temporada,
                creado: r.creado,
                nombreFamilia: fam.nombre,
                autor: autorMiembro ? {
                    _id: autorMiembro._id,
                    nombreReal: autorMiembro.nombreReal,
                    parentesco: parentescoParaViewer(autorMiembro),
                    foto: fotoDe(autorMiembro),
                    esViewer: autorMiembro.usuario === idUsuario,
                } : null,
                creador: creadorMiembro ? {
                    nombreReal: creadorMiembro.nombreReal,
                    parentesco: parentescoParaViewer(creadorMiembro),
                    esViewer: r.creadoPor === idUsuario,
                } : null,
                // propia = está atribuida al propio miembro de quien la escribió
                esPropia: creadorMiembro ? r.autor === creadorMiembro._id.toString() : false,
            });
        });
    }

    return todas;
}

servidor.get("/inicio", async (peticion, respuesta) => {
    try {
        const estacion = estacionActual();
        const todas = await recetasDeTodasMisFamilias(peticion.idUsuario, { soloVinculadas: true });

        // "un día como hoy": recetas de la estación en curso, hasta 4 al azar
        let deTemporada = todas
            .filter(r => r.temporada === estacion)
            .sort(() => Math.random() - 0.5)
            .slice(0, 4);

        // esFavorita/estaGuardada para el corazón/guardado de cada tarjeta
        const estadoRecetas = await estadoRecetasDeUsuario(peticion.idUsuario);
        deTemporada = marcarEstadoRecetas(deTemporada, estadoRecetas);

        respuesta.json({ estacion, deTemporada });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- notificaciones: sugerencias pendientes de revisión + recetas recién añadidas ---

servidor.get("/notificaciones", async (peticion, respuesta) => {
    try {
        const usuario = await buscarUsuarioPorId(peticion.idUsuario);
        const todas = await recetasDeTodasMisFamilias(peticion.idUsuario);

        // recientes: las últimas añadidas por OTROS miembros después de mi registro
        // (las propias no se notifican, ni las de antes de que yo existiera), hasta 8
        let recientes = todas
            .filter(r => !(r.creador && r.creador.esViewer))
            .filter(r => !usuario.creado || new Date(r.creado) > new Date(usuario.creado))
            .sort((a, b) => new Date(b.creado) - new Date(a.creado))
            .slice(0, 8);

        const estadoRecetas = await estadoRecetasDeUsuario(peticion.idUsuario);
        recientes = marcarEstadoRecetas(recientes, estadoRecetas);

        const sugerenciasCrudas = await leerSugerenciasPendientesPara(peticion.idUsuario);
        const sugerencias = await Promise.all(sugerenciasCrudas.map(async sug => {
            const info = await datosObjetivoSugerencia(sug.tipo, sug.idObjetivo, sug.sugerente);
            if (!info) return null;

            const miembroSugerente = await buscarMiembroPorUsuario(sug.sugerente);
            const sugerente = miembroSugerente
                ? { nombreReal: miembroSugerente.nombreReal, foto: await fotoDeMiembro(miembroSugerente) }
                : { nombreReal: "alguien", foto: null };

            const nombreObjetivo = info.actual.nombre || info.actual.nombreReal || "";

            return {
                _id: sug._id,
                tipo: sug.tipo,
                sugerente,
                texto: textoSugerencia(sug.tipo, sug.cambios, sugerente.nombreReal, nombreObjetivo),
                creado: sug.creado,
            };
        }));

        respuesta.json({ recientes, sugerencias: sugerencias.filter(s => s !== null) });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// --- invitaciones ---

servidor.post("/miembros/:idMiembro/invitacion", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!puedeEscribirEnFamilia(acceso)) {
            return respuesta.status(403).json({ error: "solo quien es parte de la familia puede invitar a otros" });
        }

        if (miembro.esPlaceholder) {
            return respuesta.status(409).json({ error: "no se puede invitar a un hueco vacío, rellénalo primero" });
        }
        if (miembro.usuario) {
            return respuesta.status(409).json({ error: "este miembro ya tiene una cuenta vinculada" });
        }

        const token = jwt.sign(
            { tipo: "invitacion", idFamilia: miembro.familia, idMiembro, invitadoPor: peticion.idUsuario },
            process.env.SECRET,
            { expiresIn: "7d" }
        );

        respuesta.json({ token });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

servidor.post("/invitaciones/:token/aceptar", async (peticion, respuesta) => {
    try {
        const { token } = peticion.params;

        jwt.verify(token, process.env.SECRET, async (error, datos) => {
            if (error || datos.tipo !== "invitacion") return respuesta.sendStatus(401);

            const miembro = await buscarMiembroPorId(datos.idMiembro);
            if (!miembro) return respuesta.status(404).json({ error: "la invitación ya no es válida" });
            if (miembro.usuario) {
                return respuesta.status(409).json({ error: "esta invitación ya fue usada" });
            }

            await vincularUsuarioAMiembro(datos.idMiembro, peticion.idUsuario);
            await agregarAccesoFamilia(datos.idFamilia, peticion.idUsuario, "familia");

            const fam = await buscarFamilia(datos.idFamilia);
            if (!fam) return respuesta.status(404).json({ error: "esta familia ya no existe" });
            const idInvitador = datos.invitadoPor || fam.creadaPor;
            const invitador = await buscarUsuarioPorId(idInvitador);

            respuesta.json({
                idFamilia: datos.idFamilia,
                nombreFamilia: fam.nombre,
                idMiembro: datos.idMiembro,
                nombreMiembro: miembro.nombreReal,
                parentesco: miembro.parentesco,
                invitadoPor: invitador ? invitador.nombre : "alguien",
            });
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// desvincular a la persona que ocupa un miembro (solo el dueño de la
// familia), para poder volver a vincular a otra persona después
servidor.delete("/miembros/:idMiembro/vinculo", async (peticion, respuesta, siguiente) => {
    try {
        const { idMiembro } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idMiembro)) return siguiente(true);

        const miembro = await buscarMiembroPorId(idMiembro);
        if (!miembro) return siguiente();

        const acceso = await requiereAccesoFamilia(peticion, respuesta, miembro.familia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (acceso.fam.creadaPor !== peticion.idUsuario) {
            return respuesta.status(403).json({ error: "solo quien creó la familia puede desvincular a alguien" });
        }
        if (!miembro.usuario) {
            return respuesta.status(409).json({ error: "este miembro no tiene ninguna cuenta vinculada" });
        }
        if (miembro.usuario === peticion.idUsuario) {
            return respuesta.status(409).json({ error: "no puedes desvincularte de tu propia tarjeta" });
        }

        await desvincularUsuarioDeMiembro(idMiembro);
        respuesta.sendStatus(204);
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});

// =========================
//  INVITACIONES DE SOLO VER
// =========================
// Enlace de un solo uso para que alguien pueda ver el árbol sin poder editar
// nada. A diferencia de "vincular familiar", no está ligado a ningún miembro.

// generar un enlace de invitación de solo ver (cualquiera con rol "familia")
servidor.post("/familias/:idFamilia/invitacion-ver", async (peticion, respuesta, siguiente) => {
    try {
        const { idFamilia } = peticion.params;
        if (!/^[0-9a-f]{24}$/.test(idFamilia)) return siguiente(true);

        const acceso = await requiereAccesoFamilia(peticion, respuesta, idFamilia);
        if (!acceso) return;
        if (!acceso.fam) return siguiente();

        if (!puedeEscribirEnFamilia(acceso)) {
            return respuesta.status(403).json({ error: "solo quien es parte de la familia puede invitar a otros" });
        }

        const token = crypto.randomBytes(24).toString("hex");

        await crearInvitacionVer({
            idFamilia,
            creadoPor: peticion.idUsuario,
            token,
            usado: false,
            usadoPor: null,
            creado: new Date(),
        });

        respuesta.json({ token });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});


// aceptar la invitación de solo ver (necesita estar logueado)
servidor.post("/invitaciones-ver/:token/aceptar", async (peticion, respuesta) => {
    try {
        const { token } = peticion.params;

        const invitacion = await buscarInvitacionVerPorToken(token);
        if (!invitacion) return respuesta.status(404).json({ error: "el enlace no es válido" });
        if (invitacion.usado) return respuesta.status(409).json({ error: "este enlace ya se ha usado" });

        const fam = await buscarFamilia(invitacion.idFamilia);
        if (!fam) return respuesta.status(404).json({ error: "esta familia ya no existe" });

        await marcarInvitacionVerUsada(invitacion._id, peticion.idUsuario);
        await agregarAccesoFamilia(invitacion.idFamilia, peticion.idUsuario, "espectador");

        const invitador = await buscarUsuarioPorId(invitacion.creadoPor);

        respuesta.json({
            idFamilia: invitacion.idFamilia,
            nombreFamilia: fam.nombre,
            invitadoPor: invitador ? invitador.nombre : "alguien",
        });
    } catch (e) {
        console.log(e);
        respuesta.status(500).json({ error: "error en el servidor" });
    }
});
servidor.use((error, peticion, respuesta, siguiente) => {
    respuesta.status(400).json({ error: "error en la petición" });
});

servidor.use((peticion, respuesta) => {
    respuesta.status(404).json({ error: "recurso no encontrado" });
});

// en Vercel el servidor no debe escuchar un puerto: la plataforma invoca
// la app exportada como función serverless (ver api/index.js). Solo
// arrancamos con .listen() en local/otros hosts con servidor persistente.
if (!process.env.VERCEL) {
    servidor.listen(process.env.PORT, () => {
        console.log("🚀 Servidor levantado");
    });
}

export default servidor;

