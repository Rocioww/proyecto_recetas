import { useState, useContext, useEffect } from "react"
import { useParams, useNavigate, Link, Navigate } from "react-router-dom"
import Contexto from "../Contexto"
import ToastContexto from "../ToastContexto"
import EditarMiembroModal from "../EditarMiembroModal"
import VisorFoto from "../VisorFoto"
import Cargando from "../Cargando"
import TarjetaReceta from "../TarjetaReceta"
import { obtenerMiembro, listarRecetasDeMiembro, listarColeccionesDeMiembro, borrarMiembro, urlFoto} from "../api"
import { compartirEnlace } from "../compartir"

let categorias = ["entrante","primero","segundo","postre"]
let temporadas = ["primavera","verano","otoño","invierno"]

// espera antes de ejecutar de verdad el borrado, para dar tiempo a deshacer
const retrasoBorradoMs = 4000

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
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors capitalize ${activa ? "bg-accent text-primary border-accent" : "bg-white text-secondary border-grey/30 hover:border-accent"}`}
            >
                {children}
            </button>
}

function PerfilMiembro(){

    let { idMiembro } = useParams()
    let { token } = useContext(Contexto)
    let { mostrarToast } = useContext(ToastContexto)
    let navigate = useNavigate()

    let [miembro,setMiembro] = useState(null)
    let [recetas,setRecetas] = useState([])
    let [colecciones,setColecciones] = useState([])
    let [cargando,setCargando] = useState(true)

    // pestaña activa: "recetas" o "colecciones"
    let [pestaña,setPestaña] = useState("recetas")

    // filtros de píldoras
    let [filtroTemporada,setFiltroTemporada] = useState("todas")
    let [filtroCategoria,setFiltroCategoria] = useState("todas")

    // edición del miembro (abierta a cualquier usuario de la familia)
    let [verFoto,setVerFoto] = useState(false)
    let [editando,setEditando] = useState(false)

    useEffect(() => {
        if(!token) return
        Promise.all([
            obtenerMiembro(idMiembro,token),
            listarRecetasDeMiembro(idMiembro,token),
            listarColeccionesDeMiembro(idMiembro,token),
        ])
        .then( ([m,r,cols]) => {
            setMiembro(m)
            setRecetas(r)
            setColecciones(cols)
        })
        .finally(() => setCargando(false))
    },[token,idMiembro])

    function compartir(){
        compartirEnlace({
            titulo : miembro.nombreReal,
            texto : `Perfil de ${miembro.nombreReal} en Recetario`,
            url : window.location.href,
        })
        .then( resultado => { if(resultado === "copiado") mostrarToast("Enlace copiado", null) } )
        .catch(() => mostrarToast("No se ha podido compartir el enlace", null))
    }

    // se llama cuando el borrado se confirma DENTRO del modal de edición
    // (que ya se ha cerrado a sí mismo): retrasa el borrado real para dar
    // tiempo a deshacer, y navega ya al árbol de la familia
    function manejarBorrarMiembro(miembroABorrar){
        let temporizador = setTimeout(() => { borrarMiembro(miembroABorrar._id,token).catch(() => {}) }, retrasoBorradoMs)
        mostrarToast(`Has borrado a ${miembroABorrar.nombreReal}`, () => clearTimeout(temporizador))
        navigate(`/familias/${miembroABorrar.familia}`)
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(cargando || !miembro){
        return <Cargando/>
    }

    let listaFiltrada = recetas.filter( receta => {
        if(filtroCategoria !== "todas" && receta.categoria !== filtroCategoria) return false
        if(filtroTemporada !== "todas" && receta.temporada !== filtroTemporada && receta.temporada !== "todo el año") return false
        return true
    })

    return  <div className="max-w-2xl mx-auto p-4 pb-24 flex flex-col gap-5 relative">

                {/* cabecera: volver / favorito / compartir */}
                <div className="flex items-center justify-between">
                    <button onClick={ () => navigate(-1) } className="flex items-center gap-1 text-sm text-secondary hover:text-accent">
                        ← Árbol
                    </button>
                    <div className="flex items-center gap-4 text-secondary">
                        {
                            miembro.puedeEscribir &&
                            <button onClick={ () => setEditando(true) } aria-label="Editar perfil" className="hover:text-accent">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                            </button>
                        }
                        <button onClick={compartir} aria-label="Compartir" className="hover:text-accent">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6m-7.6 6 7.6 3.6"/></svg>
                        </button>
                    </div>
                </div>

                {/* foto / avatar y datos */}
                <div className="flex flex-col items-center gap-2 text-center">
                    {
                        miembro.foto
                        ? <img src={urlFoto(miembro.foto)} alt={miembro.nombreReal} onClick={ () => setVerFoto(true) } className="w-24 h-24 rounded-full object-cover shadow cursor-zoom-in" />
                        : <div className="w-24 h-24 rounded-full bg-accent text-primary text-3xl font-semibold flex items-center justify-center leading-none shadow">
                                {iniciales(miembro.nombreReal)}
                            </div>
                    }
                    <h1 className="text-3xl mt-1">{miembro.nombreReal}</h1>

                    <div className="flex items-center justify-center gap-4 flex-wrap text-sm">

                        <Link to={`/familias/${miembro.familia}`} state={{ nombre : miembro.nombreFamilia }} className="flex items-center gap-1.5 text-accent hover:underline">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 7.5v4m0 0-5 4m5-4 5 4"/></svg>
                            Familia {miembro.nombreFamilia}
                        </Link>

                        <span className="flex items-center gap-1.5 text-grey">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5h16v6.5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9.5Z"/><path d="M1.5 9.5h3M19.5 9.5h3"/><path d="M8.5 9.5a3.5 3.5 0 0 1 7 0"/></svg>
                            {recetas.length} recetas
                        </span>

                        {
                            miembro.fechaNacimiento &&
                            <span className="flex items-center gap-1.5 text-grey">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-1 2.5-2.5 2.5c-1.1 0-2-.5-2-1.5"/></svg>
                                {formatearFecha(miembro.fechaNacimiento)}
                            </span>
                        }

                    </div>

                    {
                        miembro.usuario &&
                        <p className="text-xs text-grey italic">
                            Miembro vinculado al usuario{" "}
                            <Link to={`/miembros/${idMiembro}`} className="text-accent hover:underline">{miembro.nombreUsuarioVinculado || "desconocido"}</Link>
                        </p>
                    }

                </div>

                {
                    editando &&
                    <EditarMiembroModal
                        miembro={miembro}
                        token={token}
                        onCerrar={ () => setEditando(false) }
                        onActualizado={setMiembro}
                        onBorrar={manejarBorrarMiembro}
                    />
                }

                {/* toggle recetas / colecciones */}
                <div className="flex justify-center">
                    <div className="inline-flex p-1 rounded-full bg-white border border-grey/20">
                        <button
                            onClick={ () => setPestaña("recetas") }
                            className={`px-5 py-1.5 rounded-full text-sm transition-colors ${pestaña === "recetas" ? "bg-accent text-primary font-semibold" : "text-black hover:text-secondary"}`}
                        >
                            Recetas
                        </button>
                        <button
                            onClick={ () => setPestaña("colecciones") }
                            className={`px-5 py-1.5 rounded-full text-sm transition-colors ${pestaña === "colecciones" ? "bg-accent text-primary font-semibold" : "text-black hover:text-secondary"}`}
                        >
                            Colecciones
                        </button>
                    </div>
                </div>

                {/* filtros + rejilla de recetas (solo en recetas) */}
                {
                    pestaña !== "colecciones" &&
                    <div className="flex flex-col gap-8">
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
                        listaFiltrada.length === 0
                        ? <p className="text-sm text-grey text-center py-8">Aún no hay recetas atribuidas a esta persona.</p>
                        : <ul className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,300px)] gap-4 justify-center">
                            {
                                listaFiltrada.map( receta =>
                                    <li key={receta._id}>
                                        <TarjetaReceta receta={receta} token={token} />
                                    </li>
                                )
                            }
                          </ul>
                    }
                    </div>
                }

                {/* rejilla de colecciones creadas por este miembro */}
                {
                    pestaña === "colecciones" &&
                    (
                    colecciones.length === 0
                    ? <p className="text-sm text-grey text-center py-8">Aún no ha creado ninguna colección.</p>
                    : <ul className="grid grid-cols-[repeat(auto-fill,300px)] gap-4">
                        {
                            colecciones.map( col =>
                                <li key={col._id}>
                                    <Link to={`/colecciones/${col._id}`} className="block bg-white rounded-2xl shadow hover:shadow-md transition-shadow overflow-hidden">
                                        <div className="w-full h-40 grid grid-cols-2 grid-rows-2 gap-0.5">
                                            {
                                                [0,1,2,3].map( i =>
                                                    (col.portadas && col.portadas[i])
                                                    ? <img key={i} src={urlFoto(col.portadas[i])} alt="" className="w-full h-full object-cover" />
                                                    : <div key={i} className="w-full h-full bg-accent2/20 flex items-center justify-center text-xl">{["🍲","🥘","🍰","🥗"][i]}</div>
                                                )
                                            }
                                        </div>
                                        <div className="p-3 flex flex-col gap-1">
                                            <p className="font-display font-semibold text-[1.3rem] leading-snug truncate">{col.nombre}</p>
                                            <p className="text-xs text-grey">{col.numRecetas} {col.numRecetas === 1 ? "receta" : "recetas"}</p>
                                        </div>
                                    </Link>
                                </li>
                            )
                        }
                      </ul>
                    )
                }

                {/* botón fijo de añadir receta (oculto para quien solo puede ver) */}
                {
                    miembro.puedeEscribir &&
                    <Link
                        to={`/recetas/nueva/${idMiembro}`}
                        aria-label="Añadir receta"
                        className="fixed bottom-20 lg:bottom-8 right-6 w-14 h-14 rounded-full bg-accent text-primary flex items-center justify-center shadow-lg hover:opacity-90 z-20"
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4v16M4 12h16"/></svg>
                    </Link>
                }


            {
                verFoto && miembro.foto &&
                <VisorFoto src={urlFoto(miembro.foto)} alt={miembro.nombreReal} onCerrar={ () => setVerFoto(false) } />
            }
            </div>
}

export default PerfilMiembro
