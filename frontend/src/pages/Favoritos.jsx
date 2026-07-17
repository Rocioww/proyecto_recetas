import { useState, useContext, useEffect } from "react"
import { Link, Navigate } from "react-router-dom"
import Contexto from "../Contexto"
import ToastContexto from "../ToastContexto"
import Modal from "../Modal"
import ModalConfirmar from "../ModalConfirmar"
import TarjetaReceta from "../TarjetaReceta"
import Cargando from "../Cargando"
import { listarFavoritos, listarColecciones, crearColeccion, renombrarColeccion, borrarColeccion, urlFoto } from "../api"

// espera antes de ejecutar de verdad el borrado, para dar tiempo a deshacer
const retrasoBorradoMs = 4000

let categorias = ["entrante","primero","segundo","postre"]
let temporadas = ["primavera","verano","otoño","invierno"]

function Pildora({activa,children,onClick}){
    return  <button
                onClick={onClick}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors capitalize ${activa ? "bg-accent text-primary border-accent" : "bg-white text-secondary border-grey/30 hover:border-accent"}`}
            >
                {children}
            </button>
}

// mosaico 2x2 para la portada de una colección: usa las portadas que haya,
// y rellena los huecos con emojis de comida (igual que el placeholder de receta)
function MosaicoColeccion({ portadas }){
    let emojis = ["🍲","🥘","🍰","🥗"]
    let celdas = []
    for(let i = 0; i < 4; i++){
        if(portadas[i]){
            celdas.push(<img key={i} src={urlFoto(portadas[i])} alt="" className="w-full h-full object-cover" />)
        }else{
            celdas.push(<div key={i} className="w-full h-full bg-accent2/20 flex items-center justify-center text-xl">{emojis[i]}</div>)
        }
    }
    return  <div className="w-full h-40 grid grid-cols-2 grid-rows-2 gap-0.5">
                {celdas}
            </div>
}

function Favoritos(){

    let { token } = useContext(Contexto)
    let { mostrarToast } = useContext(ToastContexto)

    let [pestana,setPestana] = useState("todos")   // "todos" | "colecciones"

    // recetas favoritas
    let [recetas,setRecetas] = useState(null)
    let [cargandoRecetas,setCargandoRecetas] = useState(true)
    let [filtroCategoria,setFiltroCategoria] = useState("todas")
    let [filtroTemporada,setFiltroTemporada] = useState("todas")
    let [busquedaReceta,setBusquedaReceta] = useState("")

    // colecciones
    let [colecciones,setColecciones] = useState(null)
    let [cargandoColecciones,setCargandoColecciones] = useState(true)

    // modal de crear colección
    let [creando,setCreando] = useState(false)
    let [nombreNuevo,setNombreNuevo] = useState("")
    let [guardando,setGuardando] = useState(false)

    // modal de editar (renombrar/borrar) una colección propia
    let [editando,setEditando] = useState(null)   // colección que se está editando
    let [nombreEdit,setNombreEdit] = useState("")
    let [guardandoEdicion,setGuardandoEdicion] = useState(false)
    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    useEffect(() => {
        if(!token) return
        listarFavoritos(token)
        .then( lista => setRecetas(Array.isArray(lista) ? lista : []) )
        .catch( () => setRecetas([]) )
        .finally( () => setCargandoRecetas(false) )

        cargarColecciones()
    },[token])

    function cargarColecciones(){
        return listarColecciones(token)
        .then( lista => setColecciones(Array.isArray(lista) ? lista : []) )
        .catch( () => setColecciones([]) )
        .finally( () => setCargandoColecciones(false) )
    }

    function manejarCrearColeccion(evento){
        evento.preventDefault()
        if(guardando) return
        if(nombreNuevo.trim() === "") return

        setGuardando(true)
        crearColeccion(nombreNuevo,token)
        .then(cargarColecciones)
        .then(() => { setNombreNuevo(""); setCreando(false) })
        .catch(() => {})
        .finally(() => setGuardando(false))
    }

    function abrirEditarColeccion(col){
        setNombreEdit(col.nombre)
        setEditando(col)
    }

    function manejarRenombrarColeccion(evento){
        evento.preventDefault()
        if(guardandoEdicion) return
        if(nombreEdit.trim() === "") return

        setGuardandoEdicion(true)
        renombrarColeccion(editando._id,nombreEdit,token)
        .then(cargarColecciones)
        .then(() => setEditando(null))
        .catch(() => {})
        .finally(() => setGuardandoEdicion(false))
    }

    function confirmarBorradoColeccion(){
        if(!editando) return
        let idBorrada = editando._id
        let nombreBorrada = editando.nombre

        setConfirmandoBorrado(false)
        setEditando(null)
        setColecciones( prev => prev.filter( c => c._id !== idBorrada ) )

        let temporizador = setTimeout(() => { borrarColeccion(idBorrada,token).catch(() => {}) }, retrasoBorradoMs)
        mostrarToast(`Has borrado ${nombreBorrada}`, () => { clearTimeout(temporizador); cargarColecciones() })
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    let recetasFiltradas = (recetas || []).filter( r => {
        if(filtroCategoria !== "todas" && r.categoria !== filtroCategoria) return false
        if(filtroTemporada !== "todas" && r.temporada !== filtroTemporada && r.temporada !== "todo el año") return false
        if(busquedaReceta.trim() !== "" && !r.nombre.toLowerCase().includes(busquedaReceta.trim().toLowerCase())) return false
        return true
    })

    return  <div className="max-w-6xl mx-auto p-6 flex flex-col items-center gap-5">

                <h1 className="text-2xl text-center">Mis recetas favoritas</h1>

                {/* toggle Todos / Mis colecciones (mismo patrón que Árbol / Todas las recetas en Familias) */}
                <div className="flex justify-center">
                    <div className="inline-flex p-1 rounded-full bg-white border border-grey/20">
                        <button
                            onClick={ () => setPestana("todos") }
                            className={`px-5 py-1.5 rounded-full text-sm transition-colors ${pestana === "todos" ? "bg-accent text-primary font-semibold" : "text-black hover:text-secondary"}`}
                        >
                            Todas
                        </button>
                        <button
                            onClick={ () => setPestana("colecciones") }
                            className={`px-5 py-1.5 rounded-full text-sm transition-colors ${pestana === "colecciones" ? "bg-accent text-primary font-semibold" : "text-black hover:text-secondary"}`}
                        >
                            Mis colecciones
                        </button>
                    </div>
                </div>

                {/* ---- TODOS: todas las recetas favoritas ---- */}
                {
                    pestana === "todos" &&
                    (
                        cargandoRecetas
                        ? <Cargando chico/>
                        : recetas.length === 0
                            ? <p className="text-sm text-grey">Todavía no has guardado ninguna receta. Dale al corazón en cualquier receta para verla aquí.</p>
                            : <div className="flex flex-col items-center gap-7">
                                <div className="w-full max-w-md flex flex-col gap-4">
                                    <div className="w-full flex items-center gap-2 bg-white rounded-full shadow px-4 py-2.5 border border-grey/20 focus-within:border-accent">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-grey shrink-0"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/></svg>
                                        <input
                                            type="text"
                                            value={busquedaReceta}
                                            onChange={ evento => setBusquedaReceta(evento.target.value) }
                                            placeholder="Buscar receta"
                                            className="flex-1 min-w-0 bg-transparent text-sm text-secondary focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-2">
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
                                    </div>
                                </div>
                                {
                                    recetasFiltradas.length === 0
                                    ? <p className="text-sm text-grey text-center py-8">Ninguna receta favorita coincide con los filtros.</p>
                                    : <ul className="w-full max-w-6xl grid grid-cols-[repeat(auto-fill,300px)] gap-4 justify-center">
                                {
                                    recetasFiltradas.map( receta =>
                                        <li key={receta._id}>
                                            <TarjetaReceta
                                                receta={receta}
                                                token={token}
                                                onFavoritoCambiado={ (r,nuevoValor) => {
                                                    // esta lista ES la de favoritos: si se quita, desaparece al momento
                                                    if(!nuevoValor) setRecetas( prev => prev.filter( x => x._id !== r._id ) )
                                                } }
                                            />
                                        </li>
                                    )
                                }
                                    </ul>
                                }
                              </div>
                    )
                }

                {/* ---- MIS COLECCIONES ---- */}
                {
                    pestana === "colecciones" &&
                    (
                        cargandoColecciones
                        ? <Cargando chico/>
                        : <ul className="w-full max-w-6xl grid grid-cols-[repeat(auto-fill,300px)] gap-4">
                            {/* botón + para crear colección, como una card más */}
                            <li>
                                <button
                                    onClick={ () => { setNombreNuevo(""); setCreando(true) } }
                                    className="w-full h-full min-h-[13rem] bg-white rounded-2xl shadow hover:shadow-md transition-shadow flex flex-col items-center justify-center gap-2 text-grey hover:text-accent"
                                >
                                    <span className="text-4xl leading-none">+</span>
                                    <span className="text-sm">Nueva colección</span>
                                </button>
                            </li>
                            {
                                colecciones.map( col =>
                                    <li key={col._id} className="relative">
                                        <Link to={`/colecciones/${col._id}`} className="block bg-white rounded-2xl shadow hover:shadow-md transition-shadow overflow-hidden">
                                            <MosaicoColeccion portadas={col.portadas || []} />
                                            <div className="p-3 flex flex-col gap-1.5">
                                                <p className="font-display font-semibold text-[1.3rem] leading-snug truncate">{col.nombre}</p>
                                                <p className="text-xs text-grey">{col.numRecetas} {col.numRecetas === 1 ? "receta" : "recetas"}</p>
                                                {
                                                    !col.esPropia && col.creador &&
                                                    <div className="flex items-center gap-1.5 pt-0.5">
                                                        {
                                                            col.creador.foto
                                                            ? <img src={urlFoto(col.creador.foto)} alt="" className="w-5 h-5 rounded-full object-cover" />
                                                            : <div className="w-5 h-5 rounded-full bg-accent2/40 flex items-center justify-center leading-none text-[9px] font-semibold text-secondary">{(col.creador.nombreReal||"?")[0].toUpperCase()}</div>
                                                        }
                                                        <p className="text-[11px] text-grey truncate">{col.creador.nombreReal}</p>
                                                    </div>
                                                }
                                            </div>
                                        </Link>
                                        {
                                            col.esPropia &&
                                            <button
                                                onClick={ () => abrirEditarColeccion(col) }
                                                aria-label="Editar colección"
                                                className="absolute top-2 right-2 w-9 h-9 rounded-full bg-primary/90 text-secondary hover:text-accent flex items-center justify-center shadow"
                                            >
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                                            </button>
                                        }
                                    </li>
                                )
                            }
                          </ul>
                    )
                }

                {
                    creando &&
                    <Modal onCerrar={ () => setCreando(false) }>
                        <h2 className="font-display text-[1.425rem] font-semibold">Nueva colección</h2>
                        <form onSubmit={manejarCrearColeccion} className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-xs text-black">
                                Nombre
                                <input
                                    type="text"
                                    value={nombreNuevo}
                                    onChange={ evento => setNombreNuevo(evento.target.value) }
                                    placeholder="Postres de Navidad, Recetas rápidas…"
                                    className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent"
                                    autoFocus
                                />
                            </label>
                            <input type="submit" value={guardando ? "Creando…" : "Crear"} disabled={guardando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                        </form>
                    </Modal>
                }

                {
                    editando &&
                    <Modal onCerrar={ () => setEditando(null) }>
                        <h2 className="font-display text-[1.425rem] font-semibold">Editar colección</h2>
                        <form onSubmit={manejarRenombrarColeccion} className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1 text-xs text-black">
                                Nombre
                                <input type="text" value={nombreEdit} onChange={ evento => setNombreEdit(evento.target.value) } className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent" autoFocus />
                            </label>
                            <input type="submit" value={guardandoEdicion ? "Guardando…" : "Guardar"} disabled={guardandoEdicion} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                            <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-xs text-red-500 hover:text-red-700 mt-1">Borrar colección</button>
                        </form>
                    </Modal>
                }

                {
                    confirmandoBorrado && editando &&
                    <ModalConfirmar
                        titulo="Borrar colección"
                        mensaje={`¿Borrar la colección "${editando.nombre}"? Las recetas no se borran, solo la agrupación.`}
                        onConfirmar={confirmarBorradoColeccion}
                        onCerrar={ () => setConfirmandoBorrado(false) }
                    />
                }

            </div>
}

export default Favoritos
