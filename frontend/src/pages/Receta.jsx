import { useState, useContext, useEffect } from "react"
import { useParams, useNavigate, Navigate, Link } from "react-router-dom"
import Contexto from "../Contexto"
import ModalGuardarEnColeccion from "../ModalGuardarEnColeccion"
import Cargando from "../Cargando"
import VisorFoto from "../VisorFoto"
import { obtenerReceta, marcarFavorito, desmarcarFavorito, quitarRecetaDeColeccion, coleccionesDeReceta, urlFoto} from "../api"
import { compartirEnlace } from "../compartir"

// formatea una cantidad ya escalada: sin decimales sobrantes (2 -> "2", 1.5 -> "1,5")
function formatearCantidad(valor){
    let redondeado = Math.round(valor * 100) / 100
    return redondeado.toLocaleString("es-ES")
}

// lee de localStorage el progreso de tachado guardado bajo esa clave (o vacío si no hay nada)
function cargarTachados(clave){
    try{
        let guardado = JSON.parse(localStorage.getItem(clave))
        return { ingredientes : guardado?.ingredientes || [], pasos : guardado?.pasos || [] }
    }catch{
        return { ingredientes : [], pasos : [] }
    }
}

function Receta(){

    let { idReceta } = useParams()
    let { token, usuario } = useContext(Contexto)
    let navigate = useNavigate()

    // clave de localStorage donde se guarda el progreso de tachado de ESTE usuario en ESTA receta
    let claveTachados = `recetaTachados_${idReceta}_${usuario?._id || "anon"}`

    let [receta,setReceta] = useState(null)
    let [cargando,setCargando] = useState(true)

    // raciones seleccionadas: las cantidades guardadas son SIEMPRE para 1
    let [raciones,setRaciones] = useState(1)

    // índices de ingredientes tachados y de pasos completados, restaurados de
    // localStorage para este usuario y esta receta
    let [ingredientesTachados,setIngredientesTachados] = useState(() => cargarTachados(claveTachados).ingredientes)
    let [pasosTachados,setPasosTachados] = useState(() => cargarTachados(claveTachados).pasos)
    // clave con la que se cargó lo anterior; si claveTachados cambia (cambia la
    // receta o llega el usuario), se recarga durante el render, sin un efecto
    let [claveTachadosCargada,setClaveTachadosCargada] = useState(claveTachados)
    if(claveTachados !== claveTachadosCargada){
        setClaveTachadosCargada(claveTachados)
        let cargado = cargarTachados(claveTachados)
        setIngredientesTachados(cargado.ingredientes)
        setPasosTachados(cargado.pasos)
    }

    // foto de un paso ampliada a pantalla completa (url o null)
    let [fotoPasoAmpliada,setFotoPasoAmpliada] = useState(null)

    // favorito: se refleja al vuelo, sin esperar a recargar toda la receta
    let [favorita,setFavorita] = useState(false)

    // toast flotante reutilizable: { texto, foto, onDeshacer } o null
    let [toast,setToast] = useState(null)

    // guardar en colección (icono marcapáginas): "guardada" es solo para
    // pintar el icono relleno/vacío; el detalle de en qué colecciones
    // concretas está lo gestiona el propio ModalGuardarEnColeccion
    let [guardarAbierto,setGuardarAbierto] = useState(false)
    let [guardada,setGuardada] = useState(false)

    // índice de la foto mostrada en el carrusel
    let [indiceFoto,setIndiceFoto] = useState(0)

    useEffect(() => {
        if(!token) return
        obtenerReceta(idReceta,token)
        .then( r => {
            setReceta(r)
            setFavorita(!!r.esFavorita)
            let fotos = r.fotos || []
            let indice = r.portada ? fotos.indexOf(r.portada) : 0
            setIndiceFoto(indice >= 0 ? indice : 0)
        } )
        .finally(() => setCargando(false))

        coleccionesDeReceta(idReceta,token)
        .then( lista => setGuardada(Array.isArray(lista) && lista.length > 0) )
        .catch(() => {})
    },[token,idReceta])

    // persiste el tachado cada vez que cambia
    useEffect(() => {
        localStorage.setItem(claveTachados, JSON.stringify({ ingredientes : ingredientesTachados, pasos : pasosTachados }))
    },[claveTachados,ingredientesTachados,pasosTachados])

    // muestra un toast unos segundos; onDeshacer es opcional
    function mostrarToast(texto, onDeshacer){
        let foto = receta.portada || (receta.fotos && receta.fotos[0]) || null
        setToast({ texto, foto, onDeshacer, saliendo : false })
        // a los 3.5s inicia la animación de salida, y a los 4s lo quita del DOM
        setTimeout(() => setToast( t => t ? { ...t, saliendo : true } : null ), 3500)
        setTimeout(() => setToast(null), 4000)
    }

    function compartir(){
        compartirEnlace({
            titulo : receta.nombre,
            texto : `Receta de ${receta.nombre}`,
            url : window.location.href,
        })
        .then( resultado => { if(resultado === "copiado") mostrarToast("Enlace copiado", null) } )
        .catch(() => mostrarToast("No se ha podido compartir el enlace", null))
    }

    function alternarFavorito(){
        let nuevoValor = !favorita
        setFavorita(nuevoValor) // optimista: se ve al instante
        let promesa = nuevoValor ? marcarFavorito(idReceta,token) : desmarcarFavorito(idReceta,token)
        promesa.catch(() => setFavorita(!nuevoValor)) // si falla, se deshace

        if(nuevoValor){
            mostrarToast("Receta guardada en favoritos", null)
        }
    }

    function manejarGuardado(coleccion){
        setGuardada(true)
        mostrarToast(`Has añadido la receta a la colección ${coleccion.nombre}`, () => {
            quitarRecetaDeColeccion(coleccion._id,idReceta,token).catch(() => {})
            setGuardada(false)
            setToast(null)
        })
    }

    function alternar(lista,setLista,indice){
        if(lista.includes(indice)){
            setLista(lista.filter( i => i !== indice ))
        }else{
            setLista([...lista,indice])
        }
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(cargando || !receta){
        return <Cargando/>
    }

    return  <div className="pb-10">

                {/* cabecera: volver / favorito / compartir */}
                <div className="max-w-2xl mx-auto flex items-center justify-between p-4">
                    <button onClick={ () => navigate(-1) } className="flex items-center gap-1 text-sm text-secondary hover:text-accent">
                        ← Volver
                    </button>
                    <div className="flex items-center gap-4 text-secondary">
                        {
                            receta.puedeEscribir &&
                            <button onClick={ () => navigate(`/recetas/${idReceta}/editar`) } aria-label="Editar receta" className="hover:text-accent">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                            </button>
                        }
                        <button onClick={alternarFavorito} aria-label={favorita ? "Quitar de favoritos" : "Guardar en favoritos"} className="hover:text-accent">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill={favorita ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={favorita ? "text-accent" : ""}><path d="M12 20.5s-7.5-4.7-9.3-9.4C1.4 7.6 3.6 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.2 0 5.4 3.1 4.1 6.6-1.8 4.7-9.3 9.4-9.3 9.4Z"/></svg>
                        </button>
                        <button onClick={ () => setGuardarAbierto(true) } aria-label="Guardar en una colección" className="hover:text-accent">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill={guardada ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={guardada ? "text-accent" : ""}><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>
                        </button>
                        <button onClick={compartir} aria-label="Compartir" className="hover:text-accent">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6m-7.6 6 7.6 3.6"/></svg>
                        </button>
                    </div>
                </div>

                {/* imagen al ancho del contenido, con carrusel si hay varias fotos */}
                {
                    (() => {
                        let fotos = receta.fotos || []
                        let principal = fotos[indiceFoto] || receta.portada || fotos[0] || null
                        let hayVarias = fotos.length > 1
                        return  <div className="max-w-2xl mx-auto px-5">
                                    <div className="relative w-full h-[calc(33vh+30px)] rounded-2xl overflow-hidden">
                                        {
                                            principal
                                            ? <img src={`${urlFoto(principal)}`} alt={receta.nombre} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full bg-accent2/20 flex items-center justify-center text-6xl">🍲</div>
                                        }
                                        {
                                            hayVarias &&
                                            <>
                                                <button
                                                    onClick={ () => setIndiceFoto( i => (i - 1 + fotos.length) % fotos.length) }
                                                    aria-label="Foto anterior"
                                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center"
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                                </button>
                                                <button
                                                    onClick={ () => setIndiceFoto( i => (i + 1) % fotos.length) }
                                                    aria-label="Foto siguiente"
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center"
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                                </button>
                                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                                    {
                                                        fotos.map( (foto,i) =>
                                                            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === indiceFoto ? "bg-white" : "bg-white/40"}`} />
                                                        )
                                                    }
                                                </div>
                                            </>
                                        }
                                    </div>
                                </div>
                    })()
                }

                <div className="max-w-2xl mx-auto px-5 flex flex-col gap-6">

                    {/* título y metadatos */}
                    <div className="flex flex-col gap-3 pt-5">
                        <h1 className="text-3xl leading-tight">{receta.nombre}</h1>
                        {
                            receta.autorInfo &&
                            <Link to={`/miembros/${receta.autorInfo._id}`} className="flex items-center gap-2 w-fit group">
                                {
                                    receta.autorInfo.foto
                                    ? <img src={urlFoto(receta.autorInfo.foto)} alt="" className="w-7 h-7 rounded-full object-cover" />
                                    : <div className="w-7 h-7 rounded-full bg-accent2/40 flex items-center justify-center leading-none text-[11px] font-semibold text-secondary">{(receta.autorInfo.nombreReal||"?")[0].toUpperCase()}</div>
                                }
                                <span className="text-sm text-grey group-hover:text-accent">{receta.autorInfo.nombreReal}</span>
                            </Link>
                        }
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                            {
                                receta.tiempoMinutos != null &&
                                <span className="flex items-center gap-1 text-grey mr-1">⏱ {receta.tiempoMinutos} min</span>
                            }
                            <span className="px-2.5 py-1 rounded-full text-xs bg-white border border-grey/30 capitalize">{receta.categoria}</span>
                            <span className="px-2.5 py-1 rounded-full text-xs bg-white border border-grey/30 capitalize">{receta.temporada}</span>
                            {
                                (receta.etiquetas || []).map( etiqueta =>
                                    <span key={etiqueta} className="px-2.5 py-1 rounded-full text-xs bg-white border border-grey/30">{etiqueta}</span>
                                )
                            }
                        </div>
                    </div>

                    {
                        receta.dedicatoria &&
                        <blockquote className="border-l-4 border-accent pl-4 py-1 italic font-semibold text-secondary/90 leading-relaxed">
                            “{receta.dedicatoria}”
                        </blockquote>
                    }

                    {/* ingredientes con selector de raciones */}
                    <section className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl">Ingredientes</h2>
                            <div className="flex items-center gap-3 bg-white rounded-full border border-grey/30 px-2 py-1">
                                <button
                                    onClick={ () => setRaciones(Math.max(1, raciones - 1)) }
                                    disabled={raciones <= 1}
                                    aria-label="Menos raciones"
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-accent disabled:opacity-30"
                                >
                                    −
                                </button>
                                <span className="text-sm whitespace-nowrap flex items-center gap-1">
                                    <span className="inline-block w-[2ch] text-center tabular-nums">{raciones}</span>
                                    {raciones === 1 ? "ración" : "raciones"}
                                </span>
                                <button
                                    onClick={ () => setRaciones(raciones + 1) }
                                    aria-label="Más raciones"
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-accent"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <ul className="flex flex-col gap-1">
                            {
                                receta.ingredientes.map( (ingrediente,i) => {
                                    let tachado = ingredientesTachados.includes(i)
                                    return  <li key={i}>
                                                <button
                                                    onClick={ () => alternar(ingredientesTachados,setIngredientesTachados,i) }
                                                    className="w-full flex items-center gap-3 text-left py-2 group"
                                                >
                                                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${tachado ? "bg-accent border-accent text-primary" : "border-grey/50 group-hover:border-accent"}`}>
                                                        { tachado ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg> : null }
                                                    </span>
                                                    <span className={`text-sm ${tachado ? "line-through text-grey" : "text-secondary"}`}>
                                                        {
                                                            ingrediente.cantidad !== null &&
                                                            <span className="font-medium mr-1.5">
                                                                {formatearCantidad(ingrediente.cantidad * raciones)}{ingrediente.unidad ? ` ${ingrediente.unidad}` : ""}
                                                            </span>
                                                        }
                                                        {ingrediente.cantidad !== null && ingrediente.unidad ? "de " : ""}{ingrediente.nombre}
                                                    </span>
                                                </button>
                                            </li>
                                })
                            }
                        </ul>
                    </section>

                    {/* preparación */}
                    <section className="flex flex-col gap-3">
                        <h2 className="text-xl">Preparación</h2>
                        <ol className="flex flex-col gap-1">
                            {
                                receta.pasos.map( (paso,i) => {
                                    let tachado = pasosTachados.includes(i)
                                    // pasos antiguos son solo texto; los nuevos llevan foto opcional
                                    let textoPaso = typeof paso === "string" ? paso : paso.texto
                                    let fotoPaso = typeof paso === "string" ? null : paso.foto
                                    return  <li key={i} className="flex flex-col gap-2 py-2">
                                                <button
                                                    onClick={ () => alternar(pasosTachados,setPasosTachados,i) }
                                                    className="w-full flex items-start gap-3 text-left group"
                                                >
                                                    <span className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-semibold transition-colors ${tachado ? "bg-accent border-accent text-primary" : "border-grey/50 text-grey group-hover:border-accent"}`}>
                                                        {i + 1}
                                                    </span>
                                                    <span className={`text-sm leading-relaxed ${tachado ? "line-through text-grey" : "text-secondary"}`}>
                                                        {textoPaso}
                                                    </span>
                                                </button>
                                                {
                                                    fotoPaso &&
                                                    <img
                                                        src={urlFoto(fotoPaso)}
                                                        alt=""
                                                        onClick={ () => setFotoPasoAmpliada(urlFoto(fotoPaso)) }
                                                        className="w-24 h-24 object-cover rounded-xl ml-9 cursor-zoom-in"
                                                    />
                                                }
                                            </li>
                                })
                            }
                        </ol>
                    </section>

                </div>

                {/* pie: quién aportó (escribió y publicó) la receta realmente, no a quién se atribuye */}
                {
                    receta.creador &&
                    <div className="max-w-2xl mx-auto px-5">
                        <hr className="border-grey/30 my-6" />
                        {
                            receta.creador.idMiembro
                            ? <Link to={`/miembros/${receta.creador.idMiembro}`} className="flex items-center gap-2 w-fit group">
                                  {
                                      receta.creador.foto
                                      ? <img src={urlFoto(receta.creador.foto)} alt="" className="w-7 h-7 rounded-full object-cover" />
                                      : <div className="w-7 h-7 rounded-full bg-accent2/40 flex items-center justify-center leading-none text-[11px] font-semibold text-secondary">{(receta.creador.nombreReal||"?")[0].toUpperCase()}</div>
                                  }
                                  <span className="text-sm text-grey group-hover:text-accent">Receta aportada por {receta.creador.nombreReal}</span>
                              </Link>
                            : <div className="flex items-center gap-2 w-fit">
                                  {
                                      receta.creador.foto
                                      ? <img src={urlFoto(receta.creador.foto)} alt="" className="w-7 h-7 rounded-full object-cover" />
                                      : <div className="w-7 h-7 rounded-full bg-accent2/40 flex items-center justify-center leading-none text-[11px] font-semibold text-secondary">{(receta.creador.nombreReal||"?")[0].toUpperCase()}</div>
                                  }
                                  <span className="text-sm text-grey">Receta aportada por {receta.creador.nombreReal}</span>
                              </div>
                        }
                    </div>
                }

                {/* toast flotante reutilizable (favoritos y colecciones) */}
                {
                    toast &&
                    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-secondary text-primary rounded-2xl shadow-lg flex items-center gap-3 pl-2 pr-4 py-2 max-w-[92vw] ${toast.saliendo ? "animate-[fadeOut_0.5s_ease-in_forwards]" : "animate-[fadeIn_0.25s_ease-out]"}`}>
                        {
                            toast.foto
                            ? <img src={urlFoto(toast.foto)} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                            : <div className="w-10 h-10 rounded-xl bg-accent2/30 flex items-center justify-center text-lg shrink-0">🍲</div>
                        }
                        <span className="text-sm">{toast.texto}</span>
                        {
                            toast.onDeshacer &&
                            <button onClick={toast.onDeshacer} className="text-sm font-semibold text-accent2 hover:underline shrink-0 ml-1">Deshacer</button>
                        }
                    </div>
                }

                {/* modal: guardar en una colección */}
                {
                    guardarAbierto &&
                    <ModalGuardarEnColeccion
                        idReceta={idReceta}
                        token={token}
                        onCerrar={ () => setGuardarAbierto(false) }
                        onGuardado={manejarGuardado}
                        onQuitado={ () => setGuardada(false) }
                    />
                }

                {
                    fotoPasoAmpliada &&
                    <VisorFoto src={fotoPasoAmpliada} onCerrar={ () => setFotoPasoAmpliada(null) } />
                }
            </div>
}

export default Receta
