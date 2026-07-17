import { useState, useContext, useEffect } from "react"
import Modal from "../Modal"
import ModalConfirmar from "../ModalConfirmar"
import VisorFoto from "../VisorFoto"
import Cargando from "../Cargando"
import TarjetaReceta from "../TarjetaReceta"
import RecortarFotoModal from "../RecortarFotoModal"
import Contexto from "../Contexto"
import { actualizarYo, subirFotoYo, borrarCuenta, listarAportacionesDeMiembro, urlFoto } from "../api"

let categorias = ["entrante","primero","segundo","postre"]
let temporadas = ["primavera","verano","otoño","invierno"]

function iniciales(nombre){
    if(!nombre) return "?"
    let partes = nombre.trim().split(" ")
    return (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase()
}

function formatearFecha(fecha){
    return new Date(fecha).toLocaleDateString("es-ES",{ day : "numeric", month : "short", year : "numeric" })
}

function Pildora({activa,children,onClick}){
    return  <button
                onClick={onClick}
                className={`inline-flex items-center justify-center leading-none px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors capitalize ${activa ? "bg-accent text-primary border-accent" : "bg-white text-secondary border-grey/30 hover:border-accent"}`}
            >
                {children}
            </button>
}

function Perfil(){

    // "usuario" vive en el contexto (compartido con el header) para que la
    // foto se vea igual en el header, aquí y en la tarjeta de "Tú" del
    // árbol en cuanto se cambia desde cualquiera de los tres sitios
    let { token, setToken, usuario, refrescarUsuario } = useContext(Contexto)

    let [verFoto,setVerFoto] = useState(false)
    let [editando,setEditando] = useState(false)
    let [nombreEdit,setNombreEdit] = useState("")
    let [archivoFoto,setArchivoFoto] = useState(null)
    let [archivoParaRecortar,setArchivoParaRecortar] = useState(null)
    let [error,setError] = useState(false)
    let [guardando,setGuardando] = useState(false)

    // aportaciones: recetas escritas por mí, sea quien sea el autor al que se atribuyan
    let [aportaciones,setAportaciones] = useState([])
    let [cargandoAportaciones,setCargandoAportaciones] = useState(() => !!usuario?.idMiembroVinculado)
    let [filtroCategoria,setFiltroCategoria] = useState("todas")
    let [filtroTemporada,setFiltroTemporada] = useState("todas")

    useEffect(() => {
        if(!token || !usuario?.idMiembroVinculado) return
        setCargandoAportaciones(true)
        listarAportacionesDeMiembro(usuario.idMiembroVinculado,token)
        .then( lista => setAportaciones(Array.isArray(lista) ? lista : []) )
        .catch( () => setAportaciones([]) )
        .finally( () => setCargandoAportaciones(false) )
    },[token,usuario?.idMiembroVinculado])

    function abrirEdicion(){
        setNombreEdit(usuario.nombre)
        setArchivoFoto(null)
        setError(false)
        setEditando(true)
    }

    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    function confirmarBorrado(){
        borrarCuenta(token)
        .then(() => setToken(null))
        .catch(() => {})
    }

    function manejarGuardar(evento){
        evento.preventDefault()
        if(guardando) return
        setError(false)

        if(nombreEdit.trim() === ""){
            return setError(true)
        }

        setGuardando(true)

        actualizarYo({ nombre : nombreEdit },token)
        .then(() => {
            if(!archivoFoto){
                return null
            }
            let formData = new FormData()
            formData.append("foto",archivoFoto)
            return subirFotoYo(formData,token)
        })
        .then(refrescarUsuario)
        .then(() => setEditando(false))
        .catch(() => setError(true))
        .finally(() => setGuardando(false))
    }

    if(!usuario){
        return <Cargando/>
    }

    let aportacionesFiltradas = aportaciones.filter( receta => {
        if(filtroCategoria !== "todas" && receta.categoria !== filtroCategoria) return false
        if(filtroTemporada !== "todas" && receta.temporada !== filtroTemporada && receta.temporada !== "todo el año") return false
        return true
    })

    return  <div className="max-w-2xl mx-auto p-4 flex flex-col gap-5">

                {/* misma estructura que el perfil de un miembro; el icono de editar
                    queda anclado arriba a la derecha, a la misma altura que la foto */}
                <div className="relative flex flex-col items-center gap-2 text-center">
                    <button onClick={abrirEdicion} aria-label="Editar perfil" className="absolute top-0 right-0 text-secondary hover:text-accent">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                    </button>
                    {
                        usuario.foto
                        ? <img src={urlFoto(usuario.foto)} alt={usuario.nombre} onClick={ () => setVerFoto(true) } className="w-24 h-24 rounded-full object-cover shadow cursor-zoom-in" />
                        : <div className="w-24 h-24 rounded-full bg-accent text-primary text-3xl font-semibold flex items-center justify-center leading-none shadow">
                                {iniciales(usuario.nombre)}
                            </div>
                    }
                    <h1 className="text-3xl mt-1">{usuario.nombre}</h1>

                    <div className="flex items-center justify-center gap-4 flex-wrap text-sm">
                        <span className="flex items-center gap-1.5 text-black">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="m3 8 9 6 9-6"/></svg>
                            {usuario.email}
                        </span>
                        {
                            usuario.fechaNacimiento &&
                            <span className="flex items-center gap-1.5 text-grey">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 2.5h3l-.5 3h-2l-.5-3Z"/><path d="M9.5 6.5h5"/><path d="M8 8.5h8v10a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3v-10Z"/><path d="M8 13.5h8"/></svg>
                                {formatearFecha(usuario.fechaNacimiento)}
                            </span>
                        }
                    </div>

                    <button
                        onClick={ () => setToken(null) }
                        className="text-sm text-grey hover:text-accent font-medium underline"
                    >
                        Cerrar sesión
                    </button>

                </div>

                {/* aportaciones: recetas que he escrito, sea quien sea el autor al que se atribuyan */}
                {
                    usuario.idMiembroVinculado &&
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-center">
                            <span className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap border bg-accent text-primary border-accent">Aportaciones</span>
                        </div>
                        {
                            cargandoAportaciones
                            ? <Cargando chico/>
                            : aportaciones.length === 0
                                ? <p className="text-sm text-grey text-center py-8">Aún no has añadido ninguna receta.</p>
                                : <div className="flex flex-col gap-6">
                                    <div className="flex flex-col gap-2">
                                    <div className="flex flex-col gap-1.5">
                                        <p className="text-[11px] uppercase tracking-widest text-grey">Estación</p>
                                        <div className="flex gap-2 overflow-x-auto sin-scrollbar pb-1">
                                            <Pildora activa={filtroTemporada === "todas"} onClick={ () => setFiltroTemporada("todas") }>Todas</Pildora>
                                            {
                                                temporadas.map( t =>
                                                    <Pildora key={t} activa={filtroTemporada === t} onClick={ () => setFiltroTemporada(t) }>{t}</Pildora>
                                                )
                                            }
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <p className="text-[11px] uppercase tracking-widest text-grey">Categoría</p>
                                        <div className="flex gap-2 overflow-x-auto sin-scrollbar pb-1">
                                            <Pildora activa={filtroCategoria === "todas"} onClick={ () => setFiltroCategoria("todas") }>Todas</Pildora>
                                            {
                                                categorias.map( c =>
                                                    <Pildora key={c} activa={filtroCategoria === c} onClick={ () => setFiltroCategoria(c) }>{c}s</Pildora>
                                                )
                                            }
                                        </div>
                                    </div>
                                    </div>
                                    {
                                        aportacionesFiltradas.length === 0
                                        ? <p className="text-sm text-grey text-center py-8">Ninguna receta coincide con los filtros.</p>
                                        : <ul className="grid grid-cols-[repeat(auto-fill,300px)] gap-4">
                                            {
                                                aportacionesFiltradas.map( receta =>
                                                    <li key={receta._id}>
                                                        <TarjetaReceta receta={receta} token={token} />
                                                    </li>
                                                )
                                            }
                                          </ul>
                                    }
                                  </div>
                        }
                    </div>
                }

                {
                    editando &&
                    <Modal onCerrar={ () => setEditando(false) }>
                        <h2 className="font-display text-[1.425rem] font-semibold">Editar perfil</h2>
                        <form onSubmit={manejarGuardar} className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                {
                                    archivoFoto
                                    ? <img src={URL.createObjectURL(archivoFoto)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                    : usuario.foto
                                        ? <img src={urlFoto(usuario.foto)} alt="" className="w-14 h-14 rounded-full object-cover" />
                                        : <div className="w-14 h-14 rounded-full bg-accent text-primary font-semibold flex items-center justify-center leading-none">{iniciales(usuario.nombre)}</div>
                                }
                                <label className="text-sm text-accent hover:underline cursor-pointer">
                                    {usuario.foto || archivoFoto ? "Cambiar foto" : "Añadir foto"}
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
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-black">
                                Nombre
                                <input type="text" value={nombreEdit} onChange={ evento => setNombreEdit(evento.target.value) } className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent" />
                            </label>
                            { error ? <p className="text-red-600 text-sm">Revisa los datos</p> : null }
                            <input type="submit" value={guardando ? "Guardando…" : "Guardar"} disabled={guardando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                            <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-xs text-red-500 hover:text-red-700 mt-1">Borrar mi cuenta</button>
                        </form>
                    </Modal>
                }

                {
                    verFoto && usuario.foto &&
                    <VisorFoto src={urlFoto(usuario.foto)} alt={usuario.nombre} onCerrar={ () => setVerFoto(false) } />
                }

                {
                    confirmandoBorrado &&
                    <ModalConfirmar
                        titulo="Borrar cuenta"
                        mensaje="¿Borrar tu cuenta? Se cerrará tu sesión y tu miembro quedará libre en el árbol. Esta acción no se puede deshacer."
                        onConfirmar={confirmarBorrado}
                        onCerrar={ () => setConfirmandoBorrado(false) }
                    />
                }

                {
                    archivoParaRecortar &&
                    <RecortarFotoModal
                        archivo={archivoParaRecortar}
                        proporcion={1}
                        onCancelar={ () => setArchivoParaRecortar(null) }
                        onRecortada={ archivoRecortado => {
                            setArchivoFoto(archivoRecortado)
                            setArchivoParaRecortar(null)
                        } }
                    />
                }
            </div>
}

export default Perfil
