import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import ModalSugerencia from "./ModalSugerencia"
import Cargando from "./Cargando"
import { obtenerNotificaciones, obtenerSugerencia, urlFoto } from "./api"

const selectorEnfocables = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Los parentescos guardados son relativos a la raíz del árbol ("yo").
// Cuando el parentesco es "yo" pero no eres tú, se usa el nombre real.
function normalizarParentesco(p){
    if(!p) return p
    if(["esposo","esposa","esposx"].includes(p.toLowerCase())) return "Pareja"
    return p
}

// "Tu primo ha añadido una receta de tu abuela. ¡Échale un vistazo!"
function fraseReciente(item){
    let sujeto
    if(!item.creador) sujeto = "Se ha añadido"
    else if(item.creador.esViewer) sujeto = "Has añadido"
    else if(item.creador.parentesco === "yo") sujeto = `${item.creador.nombreReal} ha añadido`
    else sujeto = `Tu ${normalizarParentesco(item.creador.parentesco)} ha añadido`

    let objeto
    if(item.esPropia && item.creador && !item.creador.esViewer) objeto = "una receta propia"
    else if(!item.autor) objeto = "una receta"
    else if(item.autor.esViewer) objeto = "una receta tuya"
    else if(item.autor.parentesco === "yo") objeto = `una receta de ${item.autor.nombreReal}`
    else objeto = `una receta de tu ${normalizarParentesco(item.autor.parentesco)}`

    let coletilla = item.creador && item.creador.esViewer ? "" : " ¡Échale un vistazo!"

    return `${sujeto} ${objeto}.${coletilla}`
}

function inicial(item){
    let nombre = item.creador?.nombreReal || item.autor?.nombreReal || "?"
    return nombre[0].toUpperCase()
}

// panel de notificaciones: se desliza desde la derecha y se ancla a la
// derecha de la pantalla; por debajo de 1000px ocupa toda la pantalla.
// Cierra con X, con Escape, o con clic fuera (solo cuando no ocupa toda
// la pantalla, porque entonces no hay "fuera").
function PanelNotificaciones({ abierto, onCerrar, token }){

    let [datos,setDatos] = useState(null)
    let [sugerenciaAbierta,setSugerenciaAbierta] = useState(null)
    let panelRef = useRef(null)
    let onCerrarRef = useRef(onCerrar)
    useEffect(() => { onCerrarRef.current = onCerrar })

    useEffect(() => {
        if(!abierto || !token) return
        obtenerNotificaciones(token).then(setDatos).catch(() => setDatos({ recientes : [], sugerencias : [] }))
    },[abierto,token])

    useEffect(() => {
        if(!abierto) return

        let elementoPrevio = document.activeElement
        let panel = panelRef.current
        let enfocables = panel ? panel.querySelectorAll(selectorEnfocables) : []
        if(enfocables.length > 0) enfocables[0].focus()
        else if(panel) panel.focus()

        function manejarTecla(evento){
            if(evento.key === "Escape"){
                onCerrarRef.current()
                return
            }
            if(evento.key !== "Tab") return

            let actual = panelRef.current
            if(!actual) return
            let focales = actual.querySelectorAll(selectorEnfocables)
            if(focales.length === 0) return

            let primero = focales[0]
            let ultimo = focales[focales.length - 1]

            if(evento.shiftKey && document.activeElement === primero){
                evento.preventDefault()
                ultimo.focus()
            }else if(!evento.shiftKey && document.activeElement === ultimo){
                evento.preventDefault()
                primero.focus()
            }
        }

        document.addEventListener("keydown",manejarTecla)
        return () => {
            document.removeEventListener("keydown",manejarTecla)
            if(elementoPrevio && elementoPrevio.focus) elementoPrevio.focus()
        }
    },[abierto])

    function abrirSugerencia(idSugerencia){
        obtenerSugerencia(idSugerencia,token).then(setSugerenciaAbierta).catch(() => {})
    }

    function sugerenciaResuelta(idSugerencia){
        setSugerenciaAbierta(null)
        setDatos( d => ({ ...d, sugerencias : d.sugerencias.filter( s => s._id !== idSugerencia ) }) )
    }

    let hayContenido = datos && (datos.recientes.length > 0 || datos.sugerencias.length > 0)

    return  <>
                <div className={`fixed inset-0 z-50 ${abierto ? "" : "pointer-events-none"}`}>

                    {/* fondo: en pantallas >=1000px queda visible alrededor del panel y
                        cerrarlo con un clic aquí; por debajo de 1000px el panel ocupa
                        todo el ancho y lo tapa por completo, así que no es alcanzable */}
                    <div
                        className={`absolute inset-0 bg-black/50 cursor-pointer transition-opacity duration-300 ${abierto ? "opacity-100" : "opacity-0"}`}
                        onClick={onCerrar}
                    />

                    <div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Notificaciones"
                        tabIndex={-1}
                        className={`absolute top-0 right-0 h-full w-full min-[1000px]:max-w-sm bg-primary shadow-xl flex flex-col transition-transform duration-300 ease-in-out focus:outline-none ${abierto ? "translate-x-0" : "translate-x-full"}`}
                        onClick={ evento => evento.stopPropagation() }
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-grey/20 shrink-0">
                            <h2 className="text-[1.425rem] font-display">Notificaciones</h2>
                            <button
                                onClick={onCerrar}
                                aria-label="Cerrar"
                                className="text-grey hover:text-secondary"
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            {
                                !datos
                                ? <Cargando chico/>
                                : !hayContenido
                                    ? <p className="text-sm text-grey text-center py-12">No tienes notificaciones nuevas.</p>
                                    : <ul className="flex flex-col gap-2">
                                        {
                                            datos.sugerencias.map( sug =>
                                                <li key={sug._id}>
                                                    <button
                                                        onClick={ () => abrirSugerencia(sug._id) }
                                                        className="w-full flex items-center gap-3 bg-white rounded-2xl shadow p-3 hover:shadow-md transition-shadow text-left"
                                                    >
                                                        {
                                                            sug.sugerente.foto
                                                            ? <img src={urlFoto(sug.sugerente.foto)} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                                                            : <span className="w-12 h-12 rounded-xl bg-accent2 text-primary font-semibold flex items-center justify-center shrink-0">💡</span>
                                                        }
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-secondary leading-snug">{sug.texto}</p>
                                                            <p className="text-xs text-accent">Toca para revisar la sugerencia</p>
                                                        </div>
                                                    </button>
                                                </li>
                                            )
                                        }
                                        {
                                            datos.recientes.map( item =>
                                                <li key={item._id}>
                                                    <Link
                                                        to={`/recetas/${item._id}`}
                                                        onClick={onCerrar}
                                                        className="flex items-center gap-3 bg-white rounded-2xl shadow p-3 hover:shadow-md transition-shadow"
                                                    >
                                                        {
                                                            item.portada
                                                            ? <img src={`${urlFoto(item.portada)}`} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                                                            : <span className="w-12 h-12 rounded-xl bg-accent text-primary font-semibold flex items-center justify-center leading-none shrink-0">{inicial(item)}</span>
                                                        }
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-secondary leading-snug">{fraseReciente(item)}</p>
                                                            <p className="text-xs text-grey truncate">{item.nombre} · {item.nombreFamilia}</p>
                                                        </div>
                                                    </Link>
                                                </li>
                                            )
                                        }
                                      </ul>
                            }
                        </div>
                    </div>
                </div>

                {
                    sugerenciaAbierta &&
                    <ModalSugerencia
                        sugerencia={sugerenciaAbierta}
                        token={token}
                        onCerrar={ () => setSugerenciaAbierta(null) }
                        onResuelta={sugerenciaResuelta}
                    />
                }
            </>
}

export default PanelNotificaciones
