import { useState, useEffect } from "react"
import Modal from "./Modal"
import Cargando from "./Cargando"
import { listarColecciones, crearColeccion, agregarRecetaAColeccion, quitarRecetaDeColeccion, coleccionesDeReceta, urlFoto } from "./api"

// modal "Guardar en…": elegir (o crear) una colección propia donde
// guardar una receta. Se reutiliza desde la página de receta y desde
// cualquier tarjeta de receta, para poder guardar sin entrar en la receta.
// onGuardado(coleccion) se llama al añadir (y cierra el modal); onQuitado
// (coleccion) al quitar (el modal se queda abierto, igual que antes).
function ModalGuardarEnColeccion({ idReceta, token, onCerrar, onGuardado, onQuitado }){

    let [colecciones,setColecciones] = useState([])
    let [enColecciones,setEnColecciones] = useState([])
    let [cargando,setCargando] = useState(true)
    let [busqueda,setBusqueda] = useState("")
    let [crearAbierto,setCrearAbierto] = useState(false)
    let [nombreNuevo,setNombreNuevo] = useState("")
    let [creando,setCreando] = useState(false)

    useEffect(() => {
        Promise.all([
            listarColecciones(token).then( lista => setColecciones(Array.isArray(lista) ? lista : []) ).catch(() => setColecciones([])),
            coleccionesDeReceta(idReceta,token).then(setEnColecciones).catch(() => setEnColecciones([])),
        ])
        .finally(() => setCargando(false))
    },[])

    function alternar(coleccion){
        let yaEsta = enColecciones.includes(coleccion._id)

        if(yaEsta){
            // ya añadida: al pulsar, se quita (el modal NO se cierra)
            setEnColecciones( prev => prev.filter( id => id !== coleccion._id ) )
            quitarRecetaDeColeccion(coleccion._id,idReceta,token)
            .then(() => { if(onQuitado) onQuitado(coleccion) })
            .catch(() => setEnColecciones( prev => [...prev, coleccion._id] ))
            return
        }

        // no estaba: se añade y se cierra el modal. No se marca en
        // enColecciones antes de tiempo: la modal se cierra en cuanto
        // llega la confirmación, así que no hay que pintar el "Ya
        // añadido" de por medio, solo un instante antes de desaparecer
        agregarRecetaAColeccion(coleccion._id,idReceta,token)
        .then(() => {
            onCerrar()
            if(onGuardado) onGuardado(coleccion)
        })
        .catch(() => {})
    }

    function manejarCrear(evento){
        evento.preventDefault()
        if(creando) return
        if(nombreNuevo.trim() === "") return
        setCreando(true)
        crearColeccion(nombreNuevo,token)
        .then( ({_id}) => {
            let nombre = nombreNuevo
            return agregarRecetaAColeccion(_id,idReceta,token).then(() => ({ _id, nombre }))
        })
        .then( col => {
            onCerrar()
            if(onGuardado) onGuardado(col)
        })
        .catch(() => {})
        .finally(() => setCreando(false))
    }

    if(crearAbierto){
        return  <Modal onCerrar={ () => setCrearAbierto(false) }>
                    <h2 className="font-display text-[1.425rem] font-semibold">Nueva colección</h2>
                    <form onSubmit={manejarCrear} className="flex flex-col gap-3">
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
                        <input type="submit" value={creando ? "Creando…" : "Crear y guardar"} disabled={creando} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                    </form>
                </Modal>
    }

    let termino = busqueda.trim().toLowerCase()
    // solo puedo añadir recetas a MIS colecciones, no a las guardadas de otros
    let propias = colecciones.filter( c => c.esPropia )
    let filtradas = termino === "" ? propias : propias.filter( c => c.nombre.toLowerCase().includes(termino) )

    // recientes: colecciones con algo añadido en los últimos 7 días
    let haceUnaSemana = Date.now() - 7 * 24 * 60 * 60 * 1000
    let recientes = filtradas.filter( c => c.ultimoAnadido && new Date(c.ultimoAnadido).getTime() >= haceUnaSemana )

    // mosaico 1:1 pequeño para cada colección (mismo tablero que en "Mis colecciones")
    let emojis = ["🍲","🥘","🍰","🥗"]
    function tablero(portadas){
        let celdas = []
        for(let i = 0; i < 4; i++){
            celdas.push(
                portadas[i]
                ? <img key={i} src={urlFoto(portadas[i])} alt="" className="w-full h-full object-cover" />
                : <div key={i} className="w-full h-full bg-accent2/20 flex items-center justify-center text-[10px]">{emojis[i]}</div>
            )
        }
        return <div className="w-11 h-11 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 gap-px shrink-0">{celdas}</div>
    }

    function filaColeccion(col){
        let yaEsta = enColecciones.includes(col._id)
        return  <button
                    key={col._id}
                    onClick={ () => alternar(col) }
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white text-left"
                >
                    {tablero(col.portadas || [])}
                    <span className="text-sm truncate flex-1">{col.nombre}</span>
                    {
                        yaEsta &&
                        <span className="text-[11px] text-accent font-semibold shrink-0 flex items-center gap-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                            Ya añadido
                        </span>
                    }
                </button>
    }

    return  <Modal onCerrar={onCerrar}>
                <h2 className="font-display text-[1.425rem] font-semibold">Guardar en…</h2>

                <div className="flex items-center gap-2 bg-white rounded-full shadow px-4 py-2.5 border border-grey/20 focus-within:border-accent">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-grey shrink-0"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/></svg>
                    <input
                        type="text"
                        value={busqueda}
                        onChange={ evento => setBusqueda(evento.target.value) }
                        placeholder="Buscar colección"
                        className="flex-1 min-w-0 bg-transparent text-sm text-secondary focus:outline-none"
                    />
                </div>

                <div className="flex flex-col gap-3 max-h-72 overflow-y-auto sin-scrollbar">
                    {
                        cargando
                        ? <Cargando chico/>
                        : colecciones.length === 0
                        ? <p className="text-sm text-grey">No tienes colecciones todavía. Crea la primera abajo.</p>
                        : filtradas.length === 0
                            ? <p className="text-sm text-grey">Ninguna colección coincide con la búsqueda.</p>
                            : <>
                                {
                                    termino === "" && recientes.length > 0 &&
                                    <div className="flex flex-col gap-1">
                                        <p className="text-xs text-grey uppercase tracking-wide px-2">Recientes</p>
                                        {recientes.map(filaColeccion)}
                                    </div>
                                }
                                <div className="flex flex-col gap-1">
                                    {
                                        termino === "" &&
                                        <p className="text-xs text-grey uppercase tracking-wide px-2">Todas tus colecciones</p>
                                    }
                                    {filtradas.map(filaColeccion)}
                                </div>
                              </>
                    }
                </div>

                <button
                    onClick={ () => { setCrearAbierto(true); setNombreNuevo("") } }
                    className="border border-accent text-accent rounded-lg px-4 py-2 text-sm hover:bg-accent hover:text-primary transition-colors"
                >
                    Crear colección
                </button>
            </Modal>
}

export default ModalGuardarEnColeccion
