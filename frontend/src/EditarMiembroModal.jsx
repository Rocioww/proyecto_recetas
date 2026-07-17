import { useState, useContext } from "react"
import Modal from "./Modal"
import ModalConfirmar from "./ModalConfirmar"
import ModalCompartirEnlace from "./ModalCompartirEnlace"
import AvisoSugerencia from "./AvisoSugerencia"
import RecortarFotoModal from "./RecortarFotoModal"
import SelectorFecha from "./SelectorFecha"
import Contexto from "./Contexto"
import { obtenerMiembro, actualizarMiembro, subirFotoMiembro, borrarFotoMiembro, crearSugerencia, subirFotoSugerencia, generarInvitacionMiembro, desvincularMiembro, urlFoto } from "./api"

function iniciales(nombre){
    if(!nombre) return "?"
    let partes = nombre.trim().split(" ")
    return (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase()
}

// modal de edición de un miembro, con exactamente las mismas opciones se
// abra desde donde se abra (árbol o perfil del miembro): foto, nombre,
// fecha de nacimiento, vincular usuario real, desvincular y borrar.
// "miembro" tiene que venir con los campos de permisos ya calculados
// (puedeEditar, puedeBorrar, puedeDesvincular, puedeInvitar, creador...),
// es decir, obtenido con obtenerMiembro (GET /miembro/:id), no con la
// lista abreviada de la familia.
function EditarMiembroModal({ miembro, token, onCerrar, onActualizado, onBorrar }){

    // la foto de "Tú" es en realidad la foto de perfil de la cuenta
    // (ver comentario de fotoDeMiembro en el backend), así que cualquier
    // cambio hecho aquí que pueda afectarla también refresca la cuenta
    // compartida en el contexto: así el header y el perfil se enteran al
    // momento, sin esperar a una recarga. Si el miembro editado no es "Tú"
    // esto es un GET /yo de más, inofensivo.
    let { refrescarUsuario } = useContext(Contexto)

    let [vista,setVista] = useState("editar") // "editar" | "invitar"

    let [nombreEdit,setNombreEdit] = useState(miembro.nombreReal || "")
    let [generoEdit,setGeneroEdit] = useState(miembro.genero || "X")
    let [fechaEdit,setFechaEdit] = useState(miembro.fechaNacimiento || "")
    let [archivoFoto,setArchivoFoto] = useState(null)
    let [archivoParaRecortar,setArchivoParaRecortar] = useState(null)
    let [errorEdit,setErrorEdit] = useState(false)
    let [guardando,setGuardando] = useState(false)

    let [confirmandoDesvincular,setConfirmandoDesvincular] = useState(false)
    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    function manejarBorrarFoto(){
        borrarFotoMiembro(miembro._id,token)
        .then(() => obtenerMiembro(miembro._id,token))
        .then( m => { onActualizado(m); setArchivoFoto(null); refrescarUsuario() })
        .catch(() => {})
    }

    function manejarDesvincular(){
        desvincularMiembro(miembro._id,token)
        .then(() => obtenerMiembro(miembro._id,token))
        .then( m => { onActualizado(m); setConfirmandoDesvincular(false); refrescarUsuario() })
        .catch(() => {})
    }

    function manejarGuardar(evento){
        evento.preventDefault()
        if(guardando) return
        setErrorEdit(false)

        if(nombreEdit.trim() === ""){
            return setErrorEdit(true)
        }

        setGuardando(true)

        if(miembro.puedeEditar){
            actualizarMiembro(miembro._id,{ nombreReal : nombreEdit, genero : generoEdit, fechaNacimiento : fechaEdit || null },token)
            .then(() => {
                if(!archivoFoto) return null
                let formData = new FormData()
                formData.append("foto",archivoFoto)
                return subirFotoMiembro(miembro._id,formData,token)
            })
            .then(() => obtenerMiembro(miembro._id,token))
            .then( m => { onActualizado(m); onCerrar(); if(archivoFoto) refrescarUsuario() })
            .catch(() => setErrorEdit(true))
            .finally(() => setGuardando(false))
            return
        }

        // no se puede editar directo: se manda una sugerencia con solo los
        // campos que realmente hayan cambiado
        let cambios = {}
        if(nombreEdit !== miembro.nombreReal) cambios.nombreReal = nombreEdit
        if(generoEdit !== (miembro.genero || "X")) cambios.genero = generoEdit
        if((fechaEdit || null) !== (miembro.fechaNacimiento || null)) cambios.fechaNacimiento = fechaEdit || null

        let promesaFoto = archivoFoto
            ? (() => { let fd = new FormData(); fd.append("foto",archivoFoto); return subirFotoSugerencia(fd,token).then( ({foto}) => { cambios.foto = foto } ) })()
            : Promise.resolve()

        promesaFoto
        .then(() => {
            if(Object.keys(cambios).length === 0){
                setErrorEdit(true)
                return
            }
            return crearSugerencia({ tipo : "miembro", idObjetivo : miembro._id, cambios },token)
            .then(onCerrar)
        })
        .catch(() => setErrorEdit(true))
        .finally(() => setGuardando(false))
    }

    function manejarConfirmarBorrado(){
        setConfirmandoBorrado(false)
        onCerrar()
        onBorrar(miembro)
    }

    if(vista === "invitar"){
        return  <ModalCompartirEnlace
                    titulo="Vincular usuario real"
                    descripcion={`Comparte este enlace con la persona que es "${miembro.nombreReal}" para que se vincule a este miembro del árbol.`}
                    generarFn={ () => generarInvitacionMiembro(miembro._id,token) }
                    rutaBase="/invitaciones"
                    onCerrar={onCerrar}
                />
    }

    return  <>
                <Modal onCerrar={onCerrar}>
                    <h2 className="font-display text-[1.425rem] font-semibold">Editar miembro</h2>
                    {
                        !miembro.puedeEditar &&
                        <AvisoSugerencia prefijo="Este miembro" creador={miembro.creador} />
                    }
                    <form onSubmit={manejarGuardar} className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            {
                                archivoFoto
                                ? <img src={URL.createObjectURL(archivoFoto)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                : miembro.foto
                                    ? <img src={urlFoto(miembro.foto)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                    : <div className="w-14 h-14 rounded-full bg-accent text-primary font-semibold flex items-center justify-center leading-none">{iniciales(miembro.nombreReal)}</div>
                            }
                            <div className="flex flex-col gap-1">
                                <label className="text-sm text-accent hover:underline cursor-pointer">
                                    Cambiar foto
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={ evento => {
                                            let f = evento.target.files[0]
                                            if(f) setArchivoParaRecortar(f)
                                            evento.target.value = ""
                                        } }
                                        className="hidden"
                                    />
                                </label>
                                {
                                    miembro.puedeEditar && miembro.foto && !archivoFoto &&
                                    <button type="button" onClick={manejarBorrarFoto} className="text-xs text-red-500 hover:text-red-700 text-left">Borrar foto</button>
                                }
                            </div>
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Nombre
                            <input type="text" value={nombreEdit} onChange={ evento => setNombreEdit(evento.target.value) } className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent" />
                        </label>
                        <div className="flex flex-col gap-1 text-xs text-grey">
                            Sexo
                            <div className="flex flex-col gap-1 text-xs text-secondary">
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={generoEdit === "X"} onChange={ () => setGeneroEdit("X") } className="accent-accent" /> No binario
                                </label>
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={generoEdit === "F"} onChange={ () => setGeneroEdit("F") } className="accent-accent" /> Femenino
                                </label>
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={generoEdit === "M"} onChange={ () => setGeneroEdit("M") } className="accent-accent" /> Masculino
                                </label>
                            </div>
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Fecha de nacimiento
                            <SelectorFecha value={fechaEdit} onChange={setFechaEdit} />
                        </label>
                        { errorEdit ? <p className="text-red-600 text-sm">Revisa los datos</p> : null }
                        <input type="submit" value={guardando ? "Guardando…" : (miembro.puedeEditar ? "Guardar" : "Enviar sugerencia")} disabled={guardando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                        {
                            !miembro.usuario && miembro.puedeInvitar &&
                            <button type="button" onClick={ () => setVista("invitar") } className="text-xs text-accent hover:underline text-left mt-1">Vincular usuario real</button>
                        }
                        {
                            miembro.puedeDesvincular &&
                            <button type="button" onClick={ () => setConfirmandoDesvincular(true) } className="text-xs text-grey hover:text-secondary mt-1">Desvincular a {miembro.nombreUsuarioVinculado || "esta persona"} de este miembro</button>
                        }
                        {
                            miembro.puedeBorrar &&
                            <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-xs text-red-500 hover:text-red-700 mt-1">Borrar miembro</button>
                        }
                    </form>
                </Modal>

                {
                    confirmandoDesvincular &&
                    <ModalConfirmar
                        titulo="Desvincular"
                        mensaje={`¿Desvincular la cuenta actual de "${miembro.nombreReal}"? Esa persona dejará de tener acceso como este miembro, y podrás vincular a otra.`}
                        textoConfirmar="Desvincular"
                        onConfirmar={manejarDesvincular}
                        onCerrar={ () => setConfirmandoDesvincular(false) }
                    />
                }

                {
                    confirmandoBorrado &&
                    <ModalConfirmar
                        titulo="Borrar miembro"
                        mensaje={
                            miembro.tieneDescendientes
                            ? `¿Borrar a ${miembro.nombreReal} del árbol? Como tiene descendientes registrados, quedará un hueco vacío en su lugar para no perder esa rama.`
                            : `¿Borrar a ${miembro.nombreReal} del árbol? Desaparecerá por completo.`
                        }
                        onConfirmar={manejarConfirmarBorrado}
                        onCerrar={ () => setConfirmandoBorrado(false) }
                    />
                }

                {
                    archivoParaRecortar &&
                    <RecortarFotoModal
                        archivo={archivoParaRecortar}
                        onCancelar={ () => setArchivoParaRecortar(null) }
                        onRecortada={ archivoRecortado => {
                            setArchivoFoto(archivoRecortado)
                            setArchivoParaRecortar(null)
                        } }
                    />
                }
            </>
}

export default EditarMiembroModal
