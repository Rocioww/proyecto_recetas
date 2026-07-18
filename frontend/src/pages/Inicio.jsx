import { useState, useContext, useEffect, useRef } from "react"
import { Navigate } from "react-router-dom"
import Contexto from "../Contexto"
import Cargando from "../Cargando"
import TarjetaReceta from "../TarjetaReceta"
import { obtenerInicio, obtenerYo, buscarRecetas } from "../api"

const claveBusquedasRecientes = "busquedasRecientes"
const maxBusquedasRecientes = 6

let categorias = ["entrante","primero","segundo","postre"]

function Pildora({activa,children,onClick}){
    return  <button
                onClick={onClick}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors capitalize ${activa ? "bg-accent text-primary border-accent" : "bg-white text-secondary border-grey/30 hover:border-accent"}`}
            >
                {children}
            </button>
}

function leerBusquedasRecientes(){
    try {
        let guardadas = JSON.parse(localStorage.getItem(claveBusquedasRecientes))
        return Array.isArray(guardadas) ? guardadas : []
    } catch {
        return []
    }
}

function guardarBusquedasRecientes(lista){
    localStorage.setItem(claveBusquedasRecientes, JSON.stringify(lista))
}

function IconoLupa(){
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/></svg>
}

// reloj con flecha (búsqueda reciente), estilo YouTube
function IconoHistorial(){
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/></svg>
}

function Inicio(){

    let { token } = useContext(Contexto)

    let [usuario,setUsuario] = useState(null)
    let [datos,setDatos] = useState(null)

    let [termino,setTermino] = useState("")
    let [mostrarHistorial,setMostrarHistorial] = useState(false)
    let [busquedasRecientes,setBusquedasRecientes] = useState( () => leerBusquedasRecientes() )
    let [resultados,setResultados] = useState(null)
    let [buscando,setBuscando] = useState(false)
    let [filtroCategoria,setFiltroCategoria] = useState("todas")

    let inputRef = useRef(null)

    useEffect(() => {
        if(!token) return
        obtenerInicio(token).then(setDatos)
        obtenerYo(token).then(setUsuario)
    },[token])

    function ejecutarBusqueda(valor){
        let limpio = valor.trim()
        if(limpio === "") return

        setMostrarHistorial(false)
        setBuscando(true)
        buscarRecetas(limpio,token)
        .then( lista => setResultados(Array.isArray(lista) ? lista : []) )
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false))

        let sinDuplicados = busquedasRecientes.filter( b => b.toLowerCase() !== limpio.toLowerCase() )
        let nuevaLista = [limpio, ...sinDuplicados].slice(0,maxBusquedasRecientes)
        setBusquedasRecientes(nuevaLista)
        guardarBusquedasRecientes(nuevaLista)
    }

    function manejarSubmit(evento){
        evento.preventDefault()
        ejecutarBusqueda(termino)
    }

    function manejarClicHistorial(valor){
        setTermino(valor)
        ejecutarBusqueda(valor)
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(!datos){
        return <Cargando/>
    }

    let primerNombre = usuario?.nombre ? usuario.nombre.trim().split(" ")[0] : ""

    let resultadosFiltrados = resultados
        ? (filtroCategoria === "todas" ? resultados : resultados.filter( r => r.categoria === filtroCategoria ))
        : null

    return  <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8">

                <section className="flex flex-col items-center gap-4 pt-2">
                    <h1 className="text-2xl text-center leading-tight">
                        <span className="block">Hola{primerNombre ? ` ${primerNombre}` : ""},</span>
                        <span className="block">¿qué cocinamos hoy?</span>
                    </h1>

                    <div className="w-full max-w-xl relative">
                        <form onSubmit={manejarSubmit} className="flex items-center gap-2 bg-white rounded-full shadow px-4 py-2.5 border border-grey/20 focus-within:border-accent">
                            <IconoLupa />
                            <input
                                ref={inputRef}
                                type="text"
                                value={termino}
                                onChange={ evento => setTermino(evento.target.value) }
                                onFocus={ () => setMostrarHistorial(true) }
                                onBlur={ () => setMostrarHistorial(false) }
                                placeholder="Busca una receta en todas tus familias"
                                className="flex-1 min-w-0 bg-transparent text-sm text-secondary focus:outline-none"
                            />
                        </form>

                        {
                            mostrarHistorial && busquedasRecientes.length > 0 &&
                            <ul className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-lg border border-grey/10 overflow-hidden z-10">
                                {
                                    busquedasRecientes.map( (b,i) =>
                                        <li key={i}>
                                            <button
                                                type="button"
                                                onMouseDown={ evento => evento.preventDefault() }
                                                onClick={ () => manejarClicHistorial(b) }
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-secondary hover:bg-primary text-left"
                                            >
                                                <span className="text-grey shrink-0"><IconoHistorial /></span>
                                                <span className="truncate">{b}</span>
                                            </button>
                                        </li>
                                    )
                                }
                            </ul>
                        }
                    </div>
                </section>

                {
                    resultados === null &&
                    !buscando &&
                    !mostrarHistorial &&
                    datos.deTemporada.length > 0 &&
                    <section className="flex flex-col gap-3">
                        <h2 className="text-xl">Un día como hoy tu familia cocinó</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,300px)] gap-4 justify-center">
                            {
                                // /inicio manda el autor en "autor" (no "autorInfo" como el
                                // resto de listados, porque aquí también lleva esViewer para
                                // las frases "cocinaste tú"/"tu abuela"); se alía para que la
                                // tarjeta compartida lo pinte igual
                                datos.deTemporada.map( item =>
                                    <TarjetaReceta key={item._id} receta={{ ...item, autorInfo : item.autor }} token={token} />
                                )
                            }
                        </div>
                    </section>
                }

                {
                    (resultados !== null || buscando) &&
                    <section className="flex flex-col gap-7">
                        <div className="flex gap-2 overflow-x-auto sin-scrollbar pb-1">
                            <Pildora activa={filtroCategoria === "todas"} onClick={ () => setFiltroCategoria("todas") }>Todas</Pildora>
                            {
                                categorias.map( c =>
                                    <Pildora key={c} activa={filtroCategoria === c} onClick={ () => setFiltroCategoria(c) }>{c}s</Pildora>
                                )
                            }
                        </div>

                        {
                            buscando
                            ? <Cargando chico/>
                            : resultadosFiltrados.length === 0
                                ? <p className="text-sm text-grey text-center py-12">Ninguna receta coincide con tu búsqueda.</p>
                                : <ul className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,300px)] gap-4 justify-center">
                                    {
                                        resultadosFiltrados.map( receta =>
                                            <li key={receta._id}>
                                                <TarjetaReceta receta={receta} token={token} mostrarFamilia />
                                            </li>
                                        )
                                    }
                                  </ul>
                        }
                    </section>
                }

            </div>
}

export default Inicio
