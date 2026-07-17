import { useState, useContext, useEffect } from "react"
import { useParams, Link, Navigate, useNavigate } from "react-router-dom"
import Contexto from "../Contexto"
import ToastContexto from "../ToastContexto"
import Modal from "../Modal"
import ModalConfirmar from "../ModalConfirmar"
import Cargando from "../Cargando"
import TarjetaReceta from "../TarjetaReceta"
import { obtenerColeccion, renombrarColeccion, borrarColeccion, guardarColeccionAjena, quitarColeccionGuardada, quitarRecetaDeColeccion, urlFoto } from "../api"

// espera antes de ejecutar de verdad el borrado, para dar tiempo a deshacer
const retrasoBorradoMs = 4000

function Coleccion(){

    let { token } = useContext(Contexto)
    let { mostrarToast } = useContext(ToastContexto)
    let { idColeccion } = useParams()
    let navigate = useNavigate()

    let [coleccion,setColeccion] = useState(null)
    let [cargando,setCargando] = useState(true)

    let [editando,setEditando] = useState(false)
    let [nombreEdit,setNombreEdit] = useState("")
    let [guardando,setGuardando] = useState(false)
    let [guardada,setGuardada] = useState(true) // para colecciones ajenas: si la tengo en mis favoritos
    let [quitando,setQuitando] = useState(null) // receta a punto de quitarse de la colección (confirmación)

    function cargar(){
        return obtenerColeccion(idColeccion,token).then(setColeccion)
    }

    useEffect(() => {
        if(!token) return
        cargar().catch(() => setColeccion(false)).finally(() => setCargando(false))
    },[token,idColeccion])

    function manejarRenombrar(evento){
        evento.preventDefault()
        if(guardando) return
        if(nombreEdit.trim() === "") return
        setGuardando(true)
        renombrarColeccion(idColeccion,nombreEdit,token)
        .then(cargar)
        .then(() => setEditando(false))
        .catch(() => {})
        .finally(() => setGuardando(false))
    }

    function confirmarQuitarReceta(){
        if(!quitando) return
        let idReceta = quitando._id
        setQuitando(null)
        setColeccion( prev => ({ ...prev, recetas : prev.recetas.filter( r => r._id !== idReceta ) }) )
        quitarRecetaDeColeccion(idColeccion,idReceta,token).catch(cargar)
    }

    function alternarGuardadaColeccion(){
        if(guardada){
            setGuardada(false)
            quitarColeccionGuardada(idColeccion,token).catch(() => setGuardada(true))
        }else{
            setGuardada(true)
            guardarColeccionAjena(idColeccion,token).catch(() => setGuardada(false))
        }
    }

    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    function confirmarBorrado(){
        setConfirmandoBorrado(false)
        let temporizador = setTimeout(() => { borrarColeccion(idColeccion,token).catch(() => {}) }, retrasoBorradoMs)
        mostrarToast(`Has borrado ${coleccion.nombre}`, () => clearTimeout(temporizador))
        navigate("/favoritos")
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(cargando){
        return <Cargando/>
    }

    if(!coleccion){
        return  <div className="max-w-4xl mx-auto p-6">
                    <p className="text-sm text-grey">No se encontró la colección.</p>
                    <Link to="/favoritos" className="text-accent hover:underline text-sm">← Volver</Link>
                </div>
    }

    return  <div className="max-w-4xl mx-auto p-6 flex flex-col gap-5">

                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <Link to="/favoritos" className="text-xs text-grey hover:text-accent">← Mis colecciones</Link>
                        <h1 className="text-2xl truncate">{coleccion.nombre}</h1>
                        <p className="text-sm text-grey">{coleccion.recetas.length} {coleccion.recetas.length === 1 ? "receta" : "recetas"}</p>
                        {
                            !coleccion.esPropia && coleccion.creador &&
                            <div className="flex items-center gap-1.5 pt-1">
                                {
                                    coleccion.creador.foto
                                    ? <img src={urlFoto(coleccion.creador.foto)} alt="" className="w-5 h-5 rounded-full object-cover" />
                                    : <div className="w-5 h-5 rounded-full bg-accent2/40 flex items-center justify-center leading-none text-[9px] font-semibold text-secondary">{(coleccion.creador.nombreReal||"?")[0].toUpperCase()}</div>
                                }
                                <span className="text-[11px] text-grey">{coleccion.creador.nombreReal}</span>
                            </div>
                        }
                    </div>
                    <div className="flex items-center gap-4 text-secondary shrink-0">
                        {
                            coleccion.esPropia
                            ? <button onClick={ () => { setNombreEdit(coleccion.nombre); setEditando(true) } } aria-label="Renombrar colección" className="hover:text-accent">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                                </button>
                            : <button onClick={alternarGuardadaColeccion} className={`text-sm rounded-full px-4 py-1.5 border transition-colors ${guardada ? "border-accent text-accent" : "bg-accent text-primary border-accent"}`}>
                                    {guardada ? "Guardada" : "Guardar"}
                                </button>
                        }
                    </div>
                </div>

                {
                    coleccion.recetas.length === 0
                    ? <p className="text-sm text-grey">Esta colección está vacía. Guarda recetas en ella desde el icono de guardar de cualquier receta.</p>
                    : <ul className="grid grid-cols-[repeat(auto-fill,300px)] gap-4">
                        {
                            coleccion.recetas.map( receta =>
                                <li key={receta._id}>
                                    <TarjetaReceta
                                        receta={receta}
                                        token={token}
                                        modoColeccion={ coleccion.esPropia ? { onQuitar : setQuitando } : undefined }
                                    />
                                </li>
                            )
                        }
                      </ul>
                }

                {
                    editando &&
                    <Modal onCerrar={ () => setEditando(false) }>
                        <h2 className="font-display text-[1.425rem] font-semibold">Editar colección</h2>
                        <form onSubmit={manejarRenombrar} className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-xs text-black">
                                Nombre
                                <input type="text" value={nombreEdit} onChange={ evento => setNombreEdit(evento.target.value) } className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent" autoFocus />
                            </label>
                            <input type="submit" value={guardando ? "Guardando…" : "Guardar"} disabled={guardando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                            <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-xs text-red-500 hover:text-red-700 mt-1">Borrar colección</button>
                        </form>
                    </Modal>
                }

                {
                    confirmandoBorrado &&
                    <ModalConfirmar
                        titulo="Borrar colección"
                        mensaje={`¿Borrar la colección "${coleccion.nombre}"? Las recetas no se borran, solo la agrupación.`}
                        onConfirmar={confirmarBorrado}
                        onCerrar={ () => setConfirmandoBorrado(false) }
                    />
                }

                {
                    quitando &&
                    <ModalConfirmar
                        titulo="Quitar receta"
                        mensaje={`¿Quitar "${quitando.nombre}" de esta colección? La receta no se borra, solo deja de estar en esta colección.`}
                        onConfirmar={confirmarQuitarReceta}
                        onCerrar={ () => setQuitando(null) }
                    />
                }

            </div>
}

export default Coleccion
