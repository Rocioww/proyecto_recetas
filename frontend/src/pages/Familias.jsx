import { useState, useContext, useEffect } from "react"
import { Navigate, Link, useNavigate } from "react-router-dom"
import Contexto from "../Contexto"
import ToastContexto from "../ToastContexto"
import Modal from "../Modal"
import ModalConfirmar from "../ModalConfirmar"
import ModalCompartirEnlace from "../ModalCompartirEnlace"
import AvisoSugerencia from "../AvisoSugerencia"
import Cargando from "../Cargando"
import RecortarFotoModal from "../RecortarFotoModal"
import { crearFamilia, listarFamilias, actualizarFamilia, borrarFamilia, salirDeFamilia, subirFotoFamilia, borrarFotoFamilia, crearSugerencia, subirFotoSugerencia, generarInvitacionVer, urlFoto } from "../api"

// espera antes de ejecutar de verdad el borrado, para dar tiempo a deshacer
const retrasoBorradoMs = 4000

function Familias(){

    let { token } = useContext(Contexto)
    let { mostrarToast } = useContext(ToastContexto)

    let [familias,setFamilias] = useState([])
    let [cargando,setCargando] = useState(true)

    // --- crear familia (en modal) ---
    let [creandoAbierto,setCreandoAbierto] = useState(false)
    let [nombre,setNombre] = useState("")
    let [pertenezco,setPertenezco] = useState(true)
    let [archivoFotoCrear,setArchivoFotoCrear] = useState(null)
    let [archivoParaRecortarCrear,setArchivoParaRecortarCrear] = useState(null)
    let [error,setError] = useState(false)
    let [creando,setCreando] = useState(false)

    // --- editar familia (en modal: nombre y foto) ---
    let [editando,setEditando] = useState(null)   // familia que se está editando
    let [compartiendo,setCompartiendo] = useState(null)   // familia cuyo enlace se está generando
    let [nombreEdit,setNombreEdit] = useState("")
    let [archivoFotoEdit,setArchivoFotoEdit] = useState(null)
    let [archivoParaRecortarEdit,setArchivoParaRecortarEdit] = useState(null)
    let [guardando,setGuardando] = useState(false)

    // --- salir de una familia (espectador) ---
    let [saliendoDe,setSaliendoDe] = useState(null)   // familia de la que se quiere salir

    let navigate = useNavigate()

    function recargar(){
        return listarFamilias(token).then(setFamilias)
    }

    useEffect(() => {
        if(!token) return
        recargar().finally(() => setCargando(false))
    },[token])

    // ---- crear ----
    function abrirCrear(){
        setNombre("")
        setPertenezco(true)
        setArchivoFotoCrear(null)
        setError(false)
        setCreandoAbierto(true)
    }

    function manejarCrear(evento){
        evento.preventDefault()
        if(creando) return
        setError(false)

        if(nombre.trim() === ""){
            return setError(true)
        }

        setCreando(true)
        crearFamilia({ nombre, pertenezco },token)
        .then( ({_id}) => {
            if(!archivoFotoCrear) return navigate(`/familias/${_id}`,{ state : { nombre } })
            let formData = new FormData()
            formData.append("foto",archivoFotoCrear)
            return subirFotoFamilia(_id,formData,token)
                .catch(() => mostrarToast("La familia se ha creado, pero no se ha podido subir la foto", null))
                .then(() => navigate(`/familias/${_id}`,{ state : { nombre } }))
        })
        .catch(() => setError(true))
        .finally(() => setCreando(false))
    }

    // ---- editar ----
    function abrirEditar(familia){
        setEditando(familia)
        setNombreEdit(familia.nombre)
        setArchivoFotoEdit(null)
    }

    function manejarBorrarFotoEdit(){
        if(!editando) return
        borrarFotoFamilia(editando._id,token)
        .then(() => { setEditando( prev => ({ ...prev, foto : null }) ); setArchivoFotoEdit(null); recargar() })
        .catch(() => {})
    }

    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    function confirmarBorrado(){
        if(!editando) return
        let idBorrada = editando._id
        let nombreBorrada = editando.nombre

        setConfirmandoBorrado(false)
        setEditando(null)
        setFamilias( prev => prev.filter( f => f._id !== idBorrada ) )

        let temporizador = setTimeout(() => { borrarFamilia(idBorrada,token).catch(() => {}) }, retrasoBorradoMs)
        mostrarToast(`Has borrado la familia ${nombreBorrada}`, () => { clearTimeout(temporizador); recargar() })
    }

    function manejarEditar(evento){
        evento.preventDefault()
        if(guardando) return
        if(nombreEdit.trim() === "") return

        setGuardando(true)

        if(editando.esDueno){
            actualizarFamilia(editando._id,{ nombre : nombreEdit },token)
            .then(() => {
                if(!archivoFotoEdit) return null
                let formData = new FormData()
                formData.append("foto",archivoFotoEdit)
                return subirFotoFamilia(editando._id,formData,token)
            })
            .then(recargar)
            .then(() => setEditando(null))
            .catch(() => {})
            .finally(() => setGuardando(false))
            return
        }

        // no es el dueño: se manda una sugerencia con solo lo que ha cambiado
        let cambios = {}
        if(nombreEdit !== editando.nombre) cambios.nombre = nombreEdit

        let promesaFoto = archivoFotoEdit
            ? (() => { let fd = new FormData(); fd.append("foto",archivoFotoEdit); return subirFotoSugerencia(fd,token).then( ({foto}) => { cambios.foto = foto } ) })()
            : Promise.resolve()

        promesaFoto
        .then(() => {
            if(Object.keys(cambios).length === 0) return null
            return crearSugerencia({ tipo : "familia", idObjetivo : editando._id, cambios },token)
            .then(() => setEditando(null))
        })
        .catch(() => {})
        .finally(() => setGuardando(false))
    }

    function confirmarSalir(){
        if(!saliendoDe) return
        let idFamilia = saliendoDe._id
        let nombreFamilia = saliendoDe.nombre

        setSaliendoDe(null)
        setFamilias( prev => prev.filter( f => f._id !== idFamilia ) )

        salirDeFamilia(idFamilia,token)
        .then(() => mostrarToast(`Has salido de la familia ${nombreFamilia}`, null))
        .catch(() => { mostrarToast("No se ha podido salir de la familia", null); recargar() })
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(cargando){
        return <Cargando/>
    }

    return  <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl">Mis Familias</h1>
                        <p className="text-sm text-grey">Crea y edita tus familias.</p>
                    </div>
                    <button
                        onClick={abrirCrear}
                        aria-label="Crear familia"
                        className="w-9 h-9 rounded-full bg-accent text-primary flex items-center justify-center shadow hover:opacity-90"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4v16M4 12h16"/></svg>
                    </button>
                </div>

                {
                    familias.length === 0
                    ? <div className="flex flex-col items-center gap-4 text-center py-16">
                            <p className="text-grey">Todavía no tienes ninguna familia. Crea la primera con el botón +.</p>
                        </div>
                    : <ul className="grid grid-cols-[repeat(auto-fill,300px)] gap-4">
                        {
                            familias.map( familia =>
                                <li key={familia._id} className="relative">
                                    <Link
                                        to={`/familias/${familia._id}`}
                                        state={{ nombre : familia.nombre }}
                                        className="block bg-white rounded-2xl shadow hover:shadow-md transition-shadow overflow-hidden"
                                    >
                                        <div className="w-full h-28 bg-accent2/20 flex items-center justify-center">
                                            {
                                                familia.foto
                                                ? <img src={urlFoto(familia.foto)} alt="" className="w-full h-full object-cover" />
                                                : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 7.5v4m0 0-5 4m5-4 5 4"/></svg>
                                            }
                                        </div>
                                        <div className="p-3 flex flex-col gap-1">
                                            <p className="font-display font-semibold text-[1.3rem] leading-snug truncate">Familia {familia.nombre}</p>
                                            <p className="text-xs text-grey">{familia.numRecetas ?? 0} recetas · {familia.numMiembros ?? 0} miembros</p>
                                        </div>
                                    </Link>

                                    <div className="absolute top-2 right-2 flex items-center gap-2">
                                        {
                                            familia.miRol === "familia" &&
                                            <button
                                                onClick={ () => abrirEditar(familia) }
                                                aria-label="Editar familia"
                                                className="w-9 h-9 rounded-full bg-primary/90 text-secondary hover:text-accent flex items-center justify-center shadow"
                                            >
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                                            </button>
                                        }
                                        {
                                            familia.miRol === "familia" &&
                                            <button
                                                onClick={ () => setCompartiendo(familia) }
                                                aria-label="Compartir"
                                                className="w-9 h-9 rounded-full bg-primary/90 text-secondary hover:text-accent flex items-center justify-center shadow"
                                            >
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6m-7.6 6 7.6 3.6"/></svg>
                                            </button>
                                        }
                                        {
                                            familia.miRol === "espectador" &&
                                            <button
                                                onClick={ () => setSaliendoDe(familia) }
                                                aria-label="Salir de la familia"
                                                className="w-9 h-9 rounded-full bg-primary/90 text-secondary hover:text-red-600 flex items-center justify-center shadow"
                                            >
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><path d="M10 12h10m0 0-3-3m3 3-3 3"/></svg>
                                            </button>
                                        }
                                    </div>
                                </li>
                            )
                        }
                      </ul>
                }

                {/* modal: crear familia */}
                {
                    creandoAbierto &&
                    <Modal onCerrar={ () => setCreandoAbierto(false) }>
                        <h2 className="font-display text-[1.425rem] font-semibold">Nueva familia</h2>
                        <form onSubmit={manejarCrear} className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                {
                                    archivoFotoCrear
                                    ? <img src={URL.createObjectURL(archivoFotoCrear)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                    : <div className="w-14 h-14 rounded-full bg-accent2/20 flex items-center justify-center">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 7.5v4m0 0-5 4m5-4 5 4"/></svg>
                                        </div>
                                }
                                <label className="text-sm text-accent hover:underline cursor-pointer">
                                    Añadir foto
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={ evento => {
                                            let f = evento.target.files[0]
                                            if(f) setArchivoParaRecortarCrear(f)
                                            evento.target.value = ""
                                        } }
                                        className="hidden"
                                    />
                                </label>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-black">
                                Nombre
                                <input
                                    type="text"
                                    value={nombre}
                                    onChange={ evento => setNombre(evento.target.value) }
                                    placeholder="Nombre de la familia"
                                    className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent"
                                    autoFocus
                                />
                            </label>
                            { error ? <p className="text-red-600 text-sm">Escribe un nombre para la familia</p> : null }
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={pertenezco}
                                    onClick={ () => setPertenezco(!pertenezco) }
                                    className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${pertenezco ? "bg-accent" : "bg-grey/40"}`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${pertenezco ? "left-[18px]" : "left-0.5"}`}></span>
                                </button>
                                Pertenezco a esta familia
                            </label>
                            <input
                                type="submit"
                                value={creando ? "Creando…" : "Crear"}
                                disabled={creando}
                                className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60"
                            />
                        </form>
                    </Modal>
                }

                {/* modal: editar el nombre de la familia */}
                {
                    editando &&
                    <Modal onCerrar={ () => setEditando(null) }>
                        <h2 className="font-display text-[1.425rem] font-semibold">Editar familia</h2>
                        {
                            !editando.esDueno &&
                            <AvisoSugerencia prefijo="Esta familia" creador={editando.creador} />
                        }
                        <form onSubmit={manejarEditar} className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                {
                                    archivoFotoEdit
                                    ? <img src={URL.createObjectURL(archivoFotoEdit)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                    : editando.foto
                                        ? <img src={urlFoto(editando.foto)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                        : <div className="w-14 h-14 rounded-full bg-accent2/20 flex items-center justify-center">
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 7.5v4m0 0-5 4m5-4 5 4"/></svg>
                                            </div>
                                }
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm text-accent hover:underline cursor-pointer">
                                        Cambiar foto
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={ evento => {
                                                let f = evento.target.files[0]
                                                if(f) setArchivoParaRecortarEdit(f)
                                                evento.target.value = ""
                                            } }
                                            className="hidden"
                                        />
                                    </label>
                                    {
                                        editando.esDueno && editando.foto && !archivoFotoEdit &&
                                        <button type="button" onClick={manejarBorrarFotoEdit} className="text-xs text-red-500 hover:text-red-700 text-left">Borrar foto</button>
                                    }
                                </div>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-black">
                                Nombre
                                <input type="text" value={nombreEdit} onChange={ evento => setNombreEdit(evento.target.value) } className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent" />
                            </label>
                            <input type="submit" value={guardando ? "Guardando…" : (editando.esDueno ? "Guardar" : "Enviar sugerencia")} disabled={guardando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                            {
                                editando.esDueno &&
                                <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-xs text-red-500 hover:text-red-700 mt-1">Borrar familia</button>
                            }
                        </form>
                    </Modal>
                }

                {
                    confirmandoBorrado && editando &&
                    <ModalConfirmar
                        titulo="Borrar familia"
                        mensaje={`¿Borrar la familia "${editando.nombre}"? Se borrarán todos sus miembros y recetas. Esta acción no se puede deshacer.`}
                        onConfirmar={confirmarBorrado}
                        onCerrar={ () => setConfirmandoBorrado(false) }
                    />
                }

                {
                    saliendoDe &&
                    <ModalConfirmar
                        titulo="Salir de la familia"
                        mensaje={`¿Salir de la familia "${saliendoDe.nombre}"? Dejarás de verla en tu lista, pero podrás volver a entrar si te invitan de nuevo.`}
                        onConfirmar={confirmarSalir}
                        onCerrar={ () => setSaliendoDe(null) }
                    />
                }

                {
                    compartiendo &&
                    <ModalCompartirEnlace
                        titulo="Compartir árbol"
                        descripcion={`Comparte este enlace para que alguien pueda ver el árbol de "${compartiendo.nombre}" sin poder editar nada. Cada enlace es de un solo uso.`}
                        generarFn={ () => generarInvitacionVer(compartiendo._id,token) }
                        rutaBase="/invitaciones-ver"
                        onCerrar={ () => setCompartiendo(null) }
                    />
                }

                {
                    archivoParaRecortarCrear &&
                    <RecortarFotoModal
                        archivo={archivoParaRecortarCrear}
                        onCancelar={ () => setArchivoParaRecortarCrear(null) }
                        onRecortada={ archivoRecortado => {
                            setArchivoFotoCrear(archivoRecortado)
                            setArchivoParaRecortarCrear(null)
                        } }
                    />
                }

                {
                    archivoParaRecortarEdit &&
                    <RecortarFotoModal
                        archivo={archivoParaRecortarEdit}
                        onCancelar={ () => setArchivoParaRecortarEdit(null) }
                        onRecortada={ archivoRecortado => {
                            setArchivoFotoEdit(archivoRecortado)
                            setArchivoParaRecortarEdit(null)
                        } }
                    />
                }

            </div>
}

export default Familias
