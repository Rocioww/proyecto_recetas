import { useState, useContext, useEffect, useRef } from "react"
import { useParams, useLocation, Navigate, Link, useNavigate } from "react-router-dom"
import Modal from "../Modal"
import ModalConfirmar from "../ModalConfirmar"
import ModalCompartirEnlace from "../ModalCompartirEnlace"
import AvisoSugerencia from "../AvisoSugerencia"
import EditarMiembroModal from "../EditarMiembroModal"
import SelectorFecha from "../SelectorFecha"
import Cargando from "../Cargando"
import TarjetaReceta from "../TarjetaReceta"
import Contexto from "../Contexto"
import ToastContexto from "../ToastContexto"
import { listarMiembros, crearMiembro, rellenarMiembro, obtenerMiembro, actualizarFamilia, obtenerFamilia, borrarFamilia, borrarMiembro, crearSugerencia, generarInvitacionVer, listarRecetasDeFamilia, urlFoto } from "../api"
import { calcularLayout, anchoTarjetaPx, altoTarjetaPx, altoFilaPx, huecoYPx, huecoXPx } from "../layoutArbol"

// margen alrededor del lienzo para que "yo" siempre pueda quedar
// centrado en pantalla (sin él, el scroll se recorta en los bordes)
const margen = 1000

// espera antes de ejecutar de verdad el borrado, para dar tiempo a deshacer
const retrasoBorradoMs = 4000

let coloresAvatar = ["bg-accent","bg-accent2","bg-accent3"]

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

let etiquetasRelacion = {
    progenitor : "Añadir Progenitor",
    pareja : "Añadir Pareja",
    descendiente : "Añadir Hijo/a",
    hermano : "Añadir Hermano/a",
}

let titulosFormulario = {
    progenitor : "Añadir progenitor",
    pareja : "Añadir pareja",
    descendiente : "Añadir hijo/a",
    hermano : "Añadir hermano/a",
    rellenar : "Añadir familiar",
}

function iniciales(nombre){
    if(!nombre) return "?"
    let partes = nombre.trim().split(" ")
    let letras = partes[0][0] + (partes[1] ? partes[1][0] : "")
    return letras.toUpperCase()
}

function normalizarParentesco(p){
    if(!p) return p
    if(["esposo","esposa","esposx"].includes(p.toLowerCase())) return "Pareja"
    return p
}

// etiqueta de parentesco a mostrar bajo el nombre de un miembro. Un
// invitado de "solo ver" no tiene ninguna relación propia con la familia,
// así que no ve ningún parentesco (ni "tío", ni "abuelo", nada): esa
// etiqueta queda reservada a quien puede editar el árbol.
function etiquetaParentesco(miembro, puedeEscribir){
    if(!puedeEscribir) return null
    if(miembro.parentesco === "yo") return null
    return normalizarParentesco(miembro.parentesco)
}

function Arbol(){

    let { idFamilia } = useParams()
    let navigate = useNavigate()
    let location = useLocation()
    let { token } = useContext(Contexto)
    let { mostrarToast } = useContext(ToastContexto)

    let [miembros,setMiembros] = useState([])
    let [cargando,setCargando] = useState(true)

    // nombre de la familia, editable desde el lápiz de la cabecera
    let [nombreFamilia,setNombreFamilia] = useState(location.state?.nombre || "Familia")
    let [editandoNombre,setEditandoNombre] = useState(false)
    let [nombreFamiliaEdit,setNombreFamiliaEdit] = useState("")
    let [numRecetas,setNumRecetas] = useState(0)
    let [esDuenoFamilia,setEsDuenoFamilia] = useState(false)
    let [puedeEscribir,setPuedeEscribir] = useState(false) // por defecto oculto: se confirma al cargar, así nunca hay parpadeo para invitados de solo ver
    let [compartiendo,setCompartiendo] = useState(false)

    // pestaña "Árbol" / "Todas las recetas"
    let [vista,setVista] = useState("arbol")
    let [recetas,setRecetas] = useState([])
    let [cargandoRecetas,setCargandoRecetas] = useState(false)
    let [paginaRecetas,setPaginaRecetas] = useState(1)
    let [hayMasRecetas,setHayMasRecetas] = useState(false)
    let [busquedaReceta,setBusquedaReceta] = useState("")
    let [filtroCategoria,setFiltroCategoria] = useState("todas")
    let [filtroTemporada,setFiltroTemporada] = useState("todas")
    let [creadorFamilia,setCreadorFamilia] = useState(null)
    let [guardandoNombre,setGuardandoNombre] = useState(false)

    let [confirmandoBorrado,setConfirmandoBorrado] = useState(false)

    function confirmarBorrado(){
        setConfirmandoBorrado(false)
        let temporizador = setTimeout(() => { borrarFamilia(idFamilia,token).catch(() => {}) }, retrasoBorradoMs)
        mostrarToast(`Has borrado la familia ${nombreFamilia}`, () => clearTimeout(temporizador))
        navigate("/familias")
    }

    function manejarRenombrar(evento){
        evento.preventDefault()
        if(guardandoNombre) return
        if(nombreFamiliaEdit.trim() === "") return

        setGuardandoNombre(true)

        if(esDuenoFamilia){
            actualizarFamilia(idFamilia,{ nombre : nombreFamiliaEdit },token)
            .then(() => { setNombreFamilia(nombreFamiliaEdit); setEditandoNombre(false) })
            .catch(() => {})
            .finally(() => setGuardandoNombre(false))
            return
        }

        // no es el dueño: se manda una sugerencia con solo lo que ha cambiado
        let cambios = {}
        if(nombreFamiliaEdit !== nombreFamilia) cambios.nombre = nombreFamiliaEdit

        if(Object.keys(cambios).length === 0){
            setGuardandoNombre(false)
            return
        }

        crearSugerencia({ tipo : "familia", idObjetivo : idFamilia, cambios },token)
        .then(() => setEditandoNombre(false))
        .catch(() => {})
        .finally(() => setGuardandoNombre(false))
    }

    // edición de un miembro directamente desde el árbol (lápiz de la
    // tarjeta), sin navegar a su perfil: mismo modal y mismas opciones que
    // en el perfil del miembro (ver EditarMiembroModal), así que hace
    // falta su ficha completa (con permisos), no la versión abreviada de
    // la lista del árbol
    let [miembroEditando,setMiembroEditando] = useState(null)

    function abrirEdicionMiembro(miembro){
        obtenerMiembro(miembro._id,token).then(setMiembroEditando).catch(() => {})
    }

    function cerrarEdicionMiembro(){
        setMiembroEditando(null)
    }

    // tras guardar/cambiar la foto/desvincular: refresca tanto la ficha
    // abierta en el modal como la lista abreviada que pinta el árbol
    function manejarMiembroActualizado(miembroFresco){
        setMiembroEditando(miembroFresco)
        cargar()
    }

    // se llama cuando el borrado se confirma DENTRO del modal (que ya se
    // ha cerrado a sí mismo): se retrasa el borrado real para dar tiempo a
    // deshacer, y mientras tanto se refleja el resultado en el árbol al
    // instante (hueco vacío si tenía descendientes, o desaparece del todo)
    function manejarBorrarMiembroDesdeArbol(miembroABorrar){
        let temporizador = setTimeout(() => { borrarMiembro(miembroABorrar._id,token).catch(() => {}) }, retrasoBorradoMs)

        if(miembroABorrar.tieneDescendientes){
            setMiembros( prev => prev.map( m => m._id === miembroABorrar._id
                ? { ...m, nombreReal : null, genero : null, foto : null, usuario : null, esPlaceholder : true, esYo : false }
                : m
            ))
        } else {
            setMiembros( prev => prev.filter( m => m._id !== miembroABorrar._id ) )
        }

        mostrarToast(`Has borrado a ${miembroABorrar.nombreReal}`, () => { clearTimeout(temporizador); cargar() })
    }

    // id del miembro (o "ghost-padre"/"ghost-madre") cuyo popover está abierto
    let [popoverAbierto,setPopoverAbierto] = useState(null)
    // en qué paso está el popover: "menu" (lista de opciones) o "form" (nombre+género)
    let [paso,setPaso] = useState("menu")
    // qué se va a enviar al confirmar el formulario:
    // { relacion : "progenitor"|"pareja"|"descendiente"|"hermano"|"rellenar", idReferencia }
    let [envio,setEnvio] = useState(null)

    let [nombreNuevo,setNombreNuevo] = useState("")
    let [generoNuevo,setGeneroNuevo] = useState("X")
    let [fechaNueva,setFechaNueva] = useState("")
    let [errorForm,setErrorForm] = useState(false)
    let [enviando,setEnviando] = useState(false)

    // --- arrastre del lienzo con el ratón ---
    let contenedorRef = useRef(null)
    let yaCentrado = useRef(false)
    let arrastrando = useRef(false)
    let inicioArrastre = useRef({ x:0, y:0, scrollX:0, scrollY:0 })

    // --- zoom del árbol ---
    let [zoom,setZoom] = useState(1)
    let [medidasContenedor,setMedidasContenedor] = useState({ width : 0, height : 0 })
    let observadorContenedorRef = useRef(null)

    // ref-callback en vez de useEffect(...,[]): mientras el árbol está
    // "cargando" el contenedor todavía no existe en el DOM, así que un
    // efecto que solo se ejecuta una vez al montar nunca llegaría a
    // engancharse. La ref-callback se dispara justo cuando el nodo real
    // aparece (y cuando desaparece), así que siempre mide el correcto.
    function asignarContenedor(nodo){
        contenedorRef.current = nodo

        if(observadorContenedorRef.current){
            observadorContenedorRef.current.disconnect()
            observadorContenedorRef.current = null
        }

        if(nodo){
            let observador = new ResizeObserver( entradas => {
                let { width, height } = entradas[0].contentRect
                setMedidasContenedor({ width, height })
            })
            observador.observe(nodo)
            observadorContenedorRef.current = observador
        }
    }

    function cargar(){
        return listarMiembros(idFamilia,token).then(setMiembros)
    }

    useEffect(() => {
        if(!token) return
        cargar().finally(() => setCargando(false))
        // datos de la familia (nombre y nº recetas) para la cabecera
        obtenerFamilia(idFamilia,token)
        .then( fam => {
            setNombreFamilia(fam.nombre)
            setNumRecetas(fam.numRecetas)
            setEsDuenoFamilia(!!fam.esDueno)
            setPuedeEscribir(!!fam.puedeEscribir)
            setCreadorFamilia(fam.creador || null)
        })
        .catch(() => {})
    },[token,idFamilia])

    // recetas de la familia, paginadas: filtro y búsqueda se resuelven en
    // el servidor, así que cada vez que cambian se recarga desde la
    // página 1. El texto de búsqueda se debe (300ms) para no lanzar una
    // petición por cada letra; los filtros de pastilla se aplican al momento.
    function opcionesFiltroRecetas(){
        let opciones = {}
        if(filtroCategoria !== "todas") opciones.categoria = filtroCategoria
        if(filtroTemporada !== "todas") opciones.temporada = filtroTemporada
        if(busquedaReceta.trim() !== "") opciones.busqueda = busquedaReceta.trim()
        return opciones
    }

    useEffect(() => {
        if(!token) return
        if(vista !== "recetas") return

        let cancelado = false
        let temporizador = setTimeout(() => {
            setCargandoRecetas(true)
            listarRecetasDeFamilia(idFamilia,token,{ ...opcionesFiltroRecetas(), pagina : 1 })
            .then( ({recetas: nuevas, hayMas}) => {
                if(cancelado) return
                setRecetas(nuevas)
                setHayMasRecetas(hayMas)
                setPaginaRecetas(1)
            })
            .catch(() => { if(!cancelado){ setRecetas([]); setHayMasRecetas(false) } })
            .finally(() => { if(!cancelado) setCargandoRecetas(false) })
        }, busquedaReceta.trim() === "" ? 0 : 300)

        return () => { cancelado = true; clearTimeout(temporizador) }
    },[token,idFamilia,vista,filtroCategoria,filtroTemporada,busquedaReceta])

    function cargarMasRecetas(){
        if(cargandoRecetas || !hayMasRecetas) return
        let siguientePagina = paginaRecetas + 1
        setCargandoRecetas(true)
        listarRecetasDeFamilia(idFamilia,token,{ ...opcionesFiltroRecetas(), pagina : siguientePagina })
        .then( ({recetas: nuevas, hayMas}) => {
            setRecetas( prev => [...prev, ...nuevas] )
            setHayMasRecetas(hayMas)
            setPaginaRecetas(siguientePagina)
        })
        .catch(() => {})
        .finally(() => setCargandoRecetas(false))
    }

    // posición (en el sistema de coordenadas de calcularLayout) de "mi"
    // tarjeta la última vez que se calculó: sirve para detectar si se ha
    // desplazado por una renormalización del árbol (p.ej. al añadir a
    // alguien más a la izquierda de todo), y compensar el scroll para que
    // mi tarjeta NUNCA se mueva en pantalla, sea lo que sea lo que se
    // añada o edite en cualquier otra parte del árbol
    let miPosicionAnterior = useRef(null)

    useEffect(() => {
        if(miembros.length === 0) return
        let contenedor = contenedorRef.current
        if(!contenedor) return

        // centra en MI propio miembro vinculado (no necesariamente la raíz
        // del árbol: puede que me hayan vinculado a otra card cualquiera);
        // si no estoy vinculado a nadie (soy espectador o dueño sin card
        // propia), centra en la raíz como antes
        let miObjetivo = miembros.find( m => m.esYo ) || miembros.find( m => m.idReferencia === null )
        if(!miObjetivo) return

        let visibles = miembros.filter(m => !(m.esPlaceholder && m.relacionDirecta === "pareja"))
        let { posiciones } = calcularLayout(visibles)
        let pos = posiciones[miObjetivo._id]
        if(!pos) return

        if(!yaCentrado.current){
            // primera vez: centra mi tarjeta en medio de la pantalla
            contenedor.scrollLeft = (margen + pos.x + anchoTarjetaPx / 2) * zoom - contenedor.clientWidth / 2
            contenedor.scrollTop = (margen + pos.y + altoTarjetaPx / 2) * zoom - contenedor.clientHeight / 2
            yaCentrado.current = true
        } else if(miPosicionAnterior.current){
            let dx = (pos.x - miPosicionAnterior.current.x) * zoom
            let dy = (pos.y - miPosicionAnterior.current.y) * zoom
            if(dx !== 0 || dy !== 0){
                contenedor.scrollLeft += dx
                contenedor.scrollTop += dy
            }
        }

        miPosicionAnterior.current = pos
    },[miembros])

    function iniciarArrastre(evento){
        // si el clic empieza sobre un botón/input/formulario, no es arrastre
        if(evento.target.closest("button, input, a, form")) return
        // clic en el fondo: cierra cualquier popover abierto
        cerrarPopover()
        arrastrando.current = true
        inicioArrastre.current = {
            x : evento.clientX,
            y : evento.clientY,
            scrollX : contenedorRef.current.scrollLeft,
            scrollY : contenedorRef.current.scrollTop,
        }
    }

    useEffect(() => {
        function mover(evento){
            if(!arrastrando.current) return
            let dx = evento.clientX - inicioArrastre.current.x
            let dy = evento.clientY - inicioArrastre.current.y
            contenedorRef.current.scrollLeft = inicioArrastre.current.scrollX - dx
            contenedorRef.current.scrollTop = inicioArrastre.current.scrollY - dy
        }
        function soltar(){
            arrastrando.current = false
        }
        window.addEventListener("mousemove",mover)
        window.addEventListener("mouseup",soltar)
        return () => {
            window.removeEventListener("mousemove",mover)
            window.removeEventListener("mouseup",soltar)
        }
    },[])

    function cerrarPopover(){
        setPopoverAbierto(null)
        setPaso("menu")
        setEnvio(null)
        setNombreNuevo("")
        setGeneroNuevo("X")
        setFechaNueva("")
        setErrorForm(false)
    }

    // SIEMPRE que se abre un popover se parte de un estado limpio: así el
    // formulario de un fantasma no puede "quedarse pegado" al + de otra tarjeta
    function abrirPopover(id, pasoInicial = "menu", envioInicial = null, genero = "X"){
        setPopoverAbierto(id)
        setPaso(pasoInicial)
        setEnvio(envioInicial)
        setNombreNuevo("")
        setGeneroNuevo(genero)
        setFechaNueva("")
        setErrorForm(false)
    }

    // padres conocidos de un miembro: sus progenitores registrados y, si el
    // propio miembro se creó como "descendiente de X", también X
    function padresDe(miembro){
        let lista = miembros.filter( m => m.idReferencia === miembro._id && m.relacionDirecta === "progenitor" )
        if(miembro.relacionDirecta === "descendiente"){
            let ref = miembros.find( m => m._id === miembro.idReferencia )
            if(ref) lista.push(ref)
        }
        return lista
    }

    function parejaDeMiembro(miembro){
        if(miembro.relacionDirecta === "pareja"){
            return miembros.find( m => m._id === miembro.idReferencia ) || null
        }
        // una pareja borrada queda como hueco (placeholder) invisible en el
        // árbol: ese hueco no cuenta como pareja activa, así se puede volver
        // a añadir una nueva
        return miembros.find( m => m.relacionDirecta === "pareja" && m.idReferencia === miembro._id && !m.esPlaceholder ) || null
    }

    // dos progenitores del mismo hijo cuentan como pareja aunque no tengan
    // un edge "pareja" explícito entre ellos (igual que en layoutArbol.js)
    function coProgenitorDeMiembro(miembro){
        if(miembro.relacionDirecta !== "progenitor") return null
        return miembros.find( m =>
            m._id !== miembro._id && m.relacionDirecta === "progenitor" && m.idReferencia === miembro.idReferencia
        ) || null
    }

    // progenitores YA registrados de un miembro, para no permitir más de 2:
    // sus progenitores explícitos y, si el propio miembro es "hijo de
    // ambos" de un par, también la pareja (o co-progenitor) de quien lo
    // referencia (todo descendiente se crea siempre hijo de ambos, ver backend)
    function progenitoresDe(miembro){
        let lista = padresDe(miembro)
        if(miembro.relacionDirecta === "descendiente"){
            let ref = miembros.find( m => m._id === miembro.idReferencia )
            let otroProgenitorDeRef = ref && (parejaDeMiembro(ref) || coProgenitorDeMiembro(ref))
            if(otroProgenitorDeRef && !lista.some( p => p._id === otroProgenitorDeRef._id )) lista.push(otroProgenitorDeRef)
        }
        return lista
    }

    // al elegir una relación en el menú del popover
    function elegirRelacion(clave, miembro){
        if(clave === "hermano"){
            let padres = padresDe(miembro)
            if(padres.length > 0){
                // hay padres registrados: el hermano/a se cuelga siempre como
                // hijo de ambos (o del único padre conocido), igual que
                // cualquier otro hijo/a, sin preguntar de cuál en concreto
                setEnvio({ relacion : "descendiente", idReferencia : padres[0]._id, hijoDeAmbos : true })
                return setPaso("form")
            }
            // sin padres registrados: hermano clásico colgado del miembro
            setEnvio({ relacion : "hermano", idReferencia : miembro._id })
            return setPaso("form")
        }
        if(clave === "descendiente"){
            // siempre hijo de ambos progenitores del par (si lo tiene): el
            // modelo de datos no admite elegir a un solo progenitor, así se
            // garantiza que el layout del árbol quede simétrico
            setEnvio({ relacion : "descendiente", idReferencia : miembro._id, hijoDeAmbos : true })
            return setPaso("form")
        }
        setEnvio({ relacion : clave, idReferencia : miembro._id })
        setPaso("form")
    }

    function manejarEnviar(evento){
        evento.preventDefault()

        // protección contra doble clic / doble submit
        if(enviando) return

        setErrorForm(false)

        if(nombreNuevo.trim() === ""){
            return setErrorForm(true)
        }

        if(!envio) return

        setEnviando(true)

        let fechaNacimiento = fechaNueva || undefined

        let promesa = envio.relacion === "rellenar"
            ? rellenarMiembro(envio.idReferencia,{ nombreReal : nombreNuevo, genero : generoNuevo, fechaNacimiento },token)
            : crearMiembro({
                familia : idFamilia,
                nombreReal : nombreNuevo,
                relacionDirecta : envio.relacion,
                idReferencia : envio.idReferencia,
                genero : generoNuevo,
                fechaNacimiento,
                // el modelo no admite elegir un solo progenitor: todo
                // descendiente se registra siempre como hijo de ambos
                ...(envio.relacion === "descendiente" ? { hijoDeAmbos : true } : {}),
            },token)

        promesa
        .then(cargar)
        .then(cerrarPopover)
        .catch(() => setErrorForm(true))
        .finally(() => setEnviando(false))
    }

    function renderFormulario(){
        return  <form onSubmit={manejarEnviar} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-xs text-black">
                        Nombre
                        <input
                            type="text"
                            value={nombreNuevo}
                            onChange={ evento => setNombreNuevo(evento.target.value) }
                            placeholder="Nombre del familiar"
                            className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent"
                            autoFocus
                        />
                    </label>
                    <div className="flex flex-col gap-1 text-xs text-grey">
                        Sexo
                        <div className="flex flex-col gap-1 text-xs text-secondary">
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={generoNuevo === "X"} onChange={ () => setGeneroNuevo("X") } className="accent-accent" /> No binario
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={generoNuevo === "F"} onChange={ () => setGeneroNuevo("F") } className="accent-accent" /> Femenino
                            </label>
                            <label className="flex items-center gap-1.5">
                                <input type="radio" checked={generoNuevo === "M"} onChange={ () => setGeneroNuevo("M") } className="accent-accent" /> Masculino
                            </label>
                        </div>
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-black">
                        Fecha de nacimiento
                        <SelectorFecha value={fechaNueva} onChange={setFechaNueva} />
                    </label>
                    {
                        errorForm ? <p className="text-red-600 text-sm">Revisa el nombre</p> : null
                    }
                    <input
                        type="submit"
                        value={enviando ? "Creando…" : "Crear"}
                        disabled={enviando}
                        className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60"
                    />
                </form>
    }

    // Los placeholders de pareja nunca se muestran en el árbol: si se borra
    // una pareja, no debe quedar ningún "fantasma" visible de ese tipo.
    let miembrosVisibles = miembros.filter(m => !(m.esPlaceholder && m.relacionDirecta === "pareja"))

    let { posiciones, lineas, anchoTotal, altoTotal } = calcularLayout(miembrosVisibles)

    // límites de zoom: si el árbol es pequeño y ya cabe entero en pantalla,
    // no se permite alejar apenas (zoomMin queda cerca de 1); si es grande,
    // se puede alejar hasta que quepa entero (con un pequeño margen)
    const zoomMax = 1
    const ajustePadding = 1.1
    let zoomMin = zoomMax
    if(medidasContenedor.width > 0 && medidasContenedor.height > 0 && anchoTotal > 0 && altoTotal > 0){
        let ajuste = Math.min(
            medidasContenedor.width / (anchoTotal * ajustePadding),
            medidasContenedor.height / (altoTotal * ajustePadding)
        )
        zoomMin = Math.min(zoomMax, Math.max(0.15, ajuste))
    }

    function aplicarZoom(nuevoZoom){
        let contenedor = contenedorRef.current
        if(!contenedor) return
        let ajustado = Math.min(zoomMax, Math.max(zoomMin, nuevoZoom))
        if(Math.abs(ajustado - zoom) < 0.001) return

        // mantiene fijo el punto del árbol que está en el centro de la
        // pantalla al cambiar de zoom, en vez de saltar hacia la esquina
        let cx = contenedor.scrollLeft + contenedor.clientWidth / 2
        let cy = contenedor.scrollTop + contenedor.clientHeight / 2
        let factor = ajustado / zoom

        setZoom(ajustado)
        requestAnimationFrame(() => {
            contenedor.scrollLeft = cx * factor - contenedor.clientWidth / 2
            contenedor.scrollTop = cy * factor - contenedor.clientHeight / 2
        })
    }

    function zoomIn(){ aplicarZoom(zoom + 0.15) }
    function zoomOut(){ aplicarZoom(zoom - 0.15) }
    function ajustarZoomCompleto(){ aplicarZoom(zoomMin) }

    // atajos de teclado (+/- para zoom, 0 para verlo completo) y Ctrl/Cmd +
    // rueda del ratón: solo mientras se está viendo la pestaña del árbol
    useEffect(() => {
        function manejarTecla(evento){
            if(vista !== "arbol") return
            if(evento.target.closest("input, textarea, button, a, form")) return
            if(evento.key === "+" || evento.key === "="){ evento.preventDefault(); zoomIn() }
            else if(evento.key === "-" || evento.key === "_"){ evento.preventDefault(); zoomOut() }
            else if(evento.key === "0"){ evento.preventDefault(); ajustarZoomCompleto() }
        }
        window.addEventListener("keydown",manejarTecla)
        return () => window.removeEventListener("keydown",manejarTecla)
    })

    function manejarRuedaZoom(evento){
        if(!evento.ctrlKey && !evento.metaKey) return
        evento.preventDefault()
        aplicarZoom(zoom - evento.deltaY * 0.001)
    }

    if(!token){
        return <Navigate to="/login"/>
    }

    if(cargando){
        return <Cargando/>
    }

    let raiz = miembrosVisibles.find( m => m.idReferencia === null )

    let progenitoresDeRaiz = miembrosVisibles.filter( m => raiz && m.idReferencia === raiz._id && m.relacionDirecta === "progenitor" )

    let posRaiz = raiz && posiciones[raiz._id]

    // fantasmas "Añadir progenitor" por NÚMERO de progenitores, y SOLO
    // cuando el árbol está "vacío" de verdad (nada más que la raíz y, como
    // mucho, sus progenitores). En cuanto hay cualquier otro miembro
    // (hijos, hermanos, pareja...) los fantasmas dejan de mostrarse, aunque
    // sigan faltando padre y/o madre.
    //   0 progenitores -> los dos, simétricos sobre la raíz
    //   1 progenitor   -> uno solo, al lado libre del progenitor existente
    //   2+ progenitores, o hay más miembros en el árbol -> ninguno
    let ghostPadre = null   // { x, etiqueta, genero }
    let ghostMadre = null
    let arbolVacioSalvoProgenitores = raiz && miembrosVisibles.every( m =>
        m._id === raiz._id || (m.idReferencia === raiz._id && m.relacionDirecta === "progenitor")
    )
    if(posRaiz && raiz && arbolVacioSalvoProgenitores){
        let centroYo = posRaiz.x + anchoTarjetaPx / 2
        if(progenitoresDeRaiz.length === 0){
            ghostPadre = { x : centroYo - anchoTarjetaPx - huecoXPx / 2, etiqueta : "Añadir progenitor", genero : "M" }
            ghostMadre = { x : centroYo + huecoXPx / 2, etiqueta : "Añadir progenitor", genero : "F" }
        }else if(progenitoresDeRaiz.length === 1){
            let existente = progenitoresDeRaiz[0]
            let posExistente = posiciones[existente._id]
            if(existente.genero === "F"){
                ghostPadre = { x : posExistente.x - anchoTarjetaPx - huecoXPx, etiqueta : "Añadir progenitor", genero : "M" }
            }else if(existente.genero === "M"){
                ghostMadre = { x : posExistente.x + anchoTarjetaPx + huecoXPx, etiqueta : "Añadir progenitor", genero : "F" }
            }else{
                ghostMadre = { x : posExistente.x + anchoTarjetaPx + huecoXPx, etiqueta : "Añadir progenitor", genero : "F" }
            }
        }
    }

    let filaGhostY = posRaiz ? posRaiz.y - altoFilaPx : 0

    // línea "apagada" en codo desde un fantasma hasta la raíz
    function puntosLineaGhost(ghost){
        let xGhost = ghost.x + anchoTarjetaPx / 2
        let yGhost = filaGhostY + altoTarjetaPx
        let yMedio = yGhost + huecoYPx / 2
        let xRaiz = posRaiz.x + anchoTarjetaPx / 2
        return `${xGhost},${yGhost} ${xGhost},${yMedio} ${xRaiz},${yMedio} ${xRaiz},${posRaiz.y}`
    }

    function renderGhost(idGhost, ghost){
        return  <div className="absolute" style={{ left : ghost.x, top : filaGhostY, width : anchoTarjetaPx, height : altoTarjetaPx }}>
                    <div
                        onClick={ () => abrirPopover(idGhost, "form", { relacion : "progenitor", idReferencia : raiz._id }, ghost.genero) }
                        className="h-full border-2 border-dashed border-grey/30 bg-grey/5 rounded-2xl flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
                    >
                        <p className="text-xs text-grey">{ghost.etiqueta}</p>
                        <span className="text-lg text-grey leading-none mt-1">+</span>
                    </div>
                </div>
    }

    return  <div className="h-full flex flex-col overflow-hidden">
                <div className="relative flex flex-col gap-2 px-4 py-4 border-b border-grey/20 shrink-0 bg-primary">

                    {/* editar / compartir: alineados en top con el resto de la cabecera,
                        no apilados encima */}
                    <div className="absolute top-4 right-4 flex items-center gap-4 text-secondary">
                        {
                            puedeEscribir &&
                            <button
                                onClick={ () => { setNombreFamiliaEdit(nombreFamilia); setEditandoNombre(true) } }
                                aria-label="Editar familia"
                                className="hover:text-accent"
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                            </button>
                        }
                        {
                            puedeEscribir &&
                            <button onClick={ () => setCompartiendo(true) } aria-label="Compartir" className="hover:text-accent">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6m-7.6 6 7.6 3.6"/></svg>
                            </button>
                        }
                    </div>

                    {/* nombre centrado, con miembros/recetas debajo (mismo patrón que un perfil);
                        padding lateral para que el título no quede bajo los iconos de editar/compartir */}
                    <div className="flex flex-col items-center gap-1 text-center px-16 sm:px-24">
                        <h1 className="text-3xl">Familia {nombreFamilia}</h1>
                        <p className="text-sm text-grey">{miembros.filter( m => !m.esPlaceholder ).length} miembros · {numRecetas} recetas</p>
                    </div>

                    {/* toggle Árbol / Todas las recetas */}
                    <div className="flex justify-center">
                        <div className="inline-flex p-1 rounded-full bg-white border border-grey/20">
                            <button
                                onClick={ () => setVista("arbol") }
                                className={`px-5 py-1.5 rounded-full text-sm transition-colors ${vista === "arbol" ? "bg-accent text-primary font-semibold" : "text-black hover:text-secondary"}`}
                            >
                                Árbol
                            </button>
                            <button
                                onClick={ () => setVista("recetas") }
                                className={`px-5 py-1.5 rounded-full text-sm transition-colors ${vista === "recetas" ? "bg-accent text-primary font-semibold" : "text-black hover:text-secondary"}`}
                            >
                                Todas las recetas
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    ref={asignarContenedor}
                    onMouseDown={iniciarArrastre}
                    onWheel={manejarRuedaZoom}
                    className={`flex-1 overflow-auto sin-scrollbar cursor-grab active:cursor-grabbing select-none ${vista === "arbol" ? "" : "hidden"}`}
                >
                    <div style={{ width : (anchoTotal + 2 * margen) * zoom, height : (altoTotal + 2 * margen) * zoom }}>
                    <div className="relative" style={{ left : margen * zoom, top : margen * zoom, width : anchoTotal, height : altoTotal, transform : `scale(${zoom})`, transformOrigin : "top left" }}>

                        <svg className="absolute inset-0 pointer-events-none" width={anchoTotal} height={altoTotal} style={{ overflow : "visible" }}>
                            {
                                lineas.map( (linea,i) =>
                                    <polyline
                                        key={i}
                                        points={linea.puntos.map( p => p.join(",") ).join(" ")}
                                        fill="none"
                                        style={{ stroke : "var(--color-grey)", strokeWidth : 1.5 }}
                                    />
                                )
                            }
                            {
                                ghostPadre &&
                                <polyline
                                    points={puntosLineaGhost(ghostPadre)}
                                    fill="none"
                                    style={{ stroke : "var(--color-grey)", strokeWidth : 1.5, opacity : 0.3 }}
                                />
                            }
                            {
                                ghostMadre &&
                                <polyline
                                    points={puntosLineaGhost(ghostMadre)}
                                    fill="none"
                                    style={{ stroke : "var(--color-grey)", strokeWidth : 1.5, opacity : 0.3 }}
                                />
                            }
                        </svg>

                        {
                            miembrosVisibles.map( (miembro,i) => {
                                let pos = posiciones[miembro._id]
                                if(!pos) return null

                                let esRaiz = miembro.idReferencia === null
                                let etiqueta = etiquetaParentesco(miembro, puedeEscribir)
                                let mostrarEtiqueta = miembro.esYo || etiqueta

                                return  <div key={miembro._id} className="absolute" style={{ left : pos.x, top : pos.y, width : anchoTarjetaPx }}>

                                            {
                                                miembro.esPlaceholder
                                                ? (
                                                    puedeEscribir
                                                    ? <div
                                                            onClick={ () => abrirPopover(miembro._id, "form", esRaiz ? { relacion : "descendiente", idReferencia : miembro._id } : { relacion : "rellenar", idReferencia : miembro._id }) }
                                                            style={{ height : altoTarjetaPx }}
                                                            className="border-2 border-dashed border-grey/30 bg-grey/5 rounded-2xl flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
                                                        >
                                                            <p className="text-xs text-grey">{ esRaiz ? "Añadir hijo/a" : `Añadir ${normalizarParentesco(miembro.parentesco)}` }</p>
                                                            <span className="text-lg text-grey leading-none mt-1">+</span>
                                                        </div>
                                                    : <div
                                                            style={{ height : altoTarjetaPx }}
                                                            className="border-2 border-dashed border-grey/20 bg-grey/5 rounded-2xl opacity-40"
                                                        ></div>
                                                  )
                                                : <Link to={`/miembros/${miembro._id}`} style={{ height : altoTarjetaPx }} className={`bg-white rounded-2xl shadow hover:shadow-md transition-shadow overflow-hidden flex flex-col ${miembro.esYo ? "ring-2 ring-accent" : ""}`}>
                                                        <div className="w-full h-1/2 shrink-0 bg-accent2/20 flex items-center justify-center">
                                                            {
                                                                miembro.foto
                                                                ? <img src={urlFoto(miembro.foto)} alt="" className="w-full h-full object-cover" />
                                                                : <div className={`w-full h-full flex items-center justify-center leading-none text-primary text-2xl font-semibold ${coloresAvatar[i % coloresAvatar.length]}`}>
                                                                        {iniciales(miembro.nombreReal)}
                                                                    </div>
                                                            }
                                                        </div>
                                                        <div className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-center px-2 ${mostrarEtiqueta ? "-translate-y-[5px]" : ""}`}>
                                                            <p className="font-semibold text-sm leading-tight truncate w-full">{miembro.nombreReal}</p>
                                                            {
                                                                mostrarEtiqueta &&
                                                                <p className="text-[0.8rem] text-grey capitalize truncate w-full">{miembro.esYo ? "Tú" : etiqueta}</p>
                                                            }
                                                            <p className={`text-[11px] text-grey ${mostrarEtiqueta ? "-translate-y-[3px]" : ""}`}>{miembro.numRecetas ?? 0} {miembro.numRecetas === 1 ? "receta" : "recetas"}</p>
                                                        </div>
                                                    </Link>
                                            }

                                            {
                                                !miembro.esPlaceholder && puedeEscribir &&
                                                <button
                                                    type="button"
                                                    onClick={ () => abrirEdicionMiembro(miembro) }
                                                    aria-label="Editar"
                                                    className="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 text-grey hover:text-accent flex items-center justify-center shadow"
                                                >
                                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>
                                                </button>
                                            }

                                            {
                                                !miembro.esPlaceholder && puedeEscribir &&
                                                <button
                                                    onClick={ () => popoverAbierto === miembro._id ? cerrarPopover() : abrirPopover(miembro._id) }
                                                    aria-label="Añadir familiar"
                                                    className="w-9 h-9 rounded-full bg-accent text-primary flex items-center justify-center mx-auto -mt-2.5 relative shadow -translate-y-[8px]"
                                                >
                                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4v16M4 12h16"/></svg>
                                                </button>
                                            }

                                            {
                                                popoverAbierto === miembro._id && paso === "menu" &&
                                                <div
                                                    ref={ nodo => nodo && nodo.scrollIntoView({ block : "nearest", inline : "nearest", behavior : "smooth" }) }
                                                    className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-lg p-3 w-52 z-10"
                                                >
                                                    <div className="flex flex-col gap-1">
                                                        {
                                                            Object.entries(etiquetasRelacion)
                                                            .filter( ([clave]) => clave !== "progenitor" || progenitoresDe(miembro).length < 2 )
                                                            .filter( ([clave]) => clave !== "pareja" || !parejaDeMiembro(miembro) )
                                                            .map( ([clave,etiqueta]) =>
                                                                <button
                                                                    key={clave}
                                                                    onClick={ () => elegirRelacion(clave, miembro) }
                                                                    className="text-left text-sm px-2 py-1.5 rounded hover:bg-primary"
                                                                >
                                                                    + {etiqueta}
                                                                </button>
                                                            )
                                                        }
                                                    </div>
                                                </div>
                                            }

                                        </div>
                            })
                        }

                        { puedeEscribir && ghostPadre && renderGhost("ghost-padre", ghostPadre) }
                        { puedeEscribir && ghostMadre && renderGhost("ghost-madre", ghostMadre) }

                    </div>
                    </div>
                </div>

                {/* control de zoom estilo Google Maps: solo +/-. zoomMin
                    depende del tamaño real del árbol frente al viewport (se
                    recalcula con el ResizeObserver de asignarContenedor): si
                    el árbol ya cabe en pantalla, "-" apenas hace nada; si es
                    grande, deja alejar hasta que quepa entero */}
                {
                    vista === "arbol" &&
                    <div className="fixed bottom-20 lg:bottom-6 right-4 z-30 flex flex-col bg-white rounded-full shadow-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={zoomIn}
                            disabled={zoom >= zoomMax - 0.001}
                            aria-label="Acercar"
                            className="w-10 h-10 flex items-center justify-center text-xl text-secondary hover:bg-primary disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            +
                        </button>
                        <div className="h-px bg-grey/20" />
                        <button
                            type="button"
                            onClick={zoomOut}
                            disabled={zoom <= zoomMin + 0.001}
                            aria-label="Alejar"
                            className="w-10 h-10 flex items-center justify-center text-xl text-secondary hover:bg-primary disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            −
                        </button>
                    </div>
                }

                {
                    vista === "recetas" &&
                    <div className="flex-1 overflow-y-auto sin-scrollbar p-4 flex flex-col items-center gap-7">
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
                            cargandoRecetas && recetas.length === 0
                            ? <Cargando chico/>
                            : recetas.length === 0
                                ? <p className="text-sm text-grey text-center py-8">
                                    {
                                        (busquedaReceta.trim() !== "" || filtroCategoria !== "todas" || filtroTemporada !== "todas")
                                        ? "Ninguna receta coincide con la búsqueda."
                                        : "Todavía no hay recetas en esta familia."
                                    }
                                  </p>
                                : <div className="w-full max-w-6xl flex flex-col items-center gap-4">
                                    {/* cards de ancho fijo 300px; la rejilla añade tantas columnas
                                        como quepan y, al reducir el viewport, va quitando columnas
                                        hasta quedar en una sola */}
                                    <ul className="w-full grid grid-cols-[repeat(auto-fill,300px)] gap-4 justify-center">
                                        {
                                            recetas.map( receta =>
                                                <li key={receta._id}>
                                                    <TarjetaReceta receta={receta} token={token} />
                                                </li>
                                            )
                                        }
                                    </ul>
                                    {
                                        hayMasRecetas &&
                                        <button
                                            onClick={cargarMasRecetas}
                                            disabled={cargandoRecetas}
                                            className="text-sm text-accent hover:underline disabled:opacity-50"
                                        >
                                            {cargandoRecetas ? "cargando…" : "Cargar más"}
                                        </button>
                                    }
                                  </div>
                        }
                    </div>
                }

            {
                editandoNombre &&
                <Modal onCerrar={ () => setEditandoNombre(false) }>
                    <h2 className="font-display text-[1.425rem] font-semibold">Editar familia</h2>
                    {
                        !esDuenoFamilia &&
                        <AvisoSugerencia prefijo="Esta familia" creador={creadorFamilia} />
                    }
                    <form onSubmit={manejarRenombrar} className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1 text-xs text-black">
                            Nombre
                            <input type="text" value={nombreFamiliaEdit} onChange={ evento => setNombreFamiliaEdit(evento.target.value) } className="border border-grey/40 rounded px-3 py-2 bg-form text-sm text-secondary focus:outline-none focus:border-accent" />
                        </label>
                        <input type="submit" value={guardandoNombre ? "Guardando..." : (esDuenoFamilia ? "Guardar" : "Enviar sugerencia")} disabled={guardandoNombre} className="bg-accent text-primary uppercase tracking-wide text-sm rounded px-4 py-2 cursor-pointer hover:opacity-90 disabled:opacity-60" />
                        {
                            esDuenoFamilia &&
                            <button type="button" onClick={ () => setConfirmandoBorrado(true) } className="text-xs text-red-500 hover:text-red-700 mt-1">Borrar familia</button>
                        }
                    </form>
                </Modal>
            }

            {
                confirmandoBorrado &&
                <ModalConfirmar
                    titulo="Borrar familia"
                    mensaje={`¿Borrar la familia "${nombreFamilia}"? Se borrarán todos sus miembros y recetas. Esta acción no se puede deshacer.`}
                    onConfirmar={confirmarBorrado}
                    onCerrar={ () => setConfirmandoBorrado(false) }
                />
            }

            {
                compartiendo &&
                <ModalCompartirEnlace
                    titulo="Compartir árbol"
                    descripcion={`Comparte este enlace para que alguien pueda ver el árbol de "${nombreFamilia}" sin poder editar nada. Cada enlace es de un solo uso.`}
                    generarFn={ () => generarInvitacionVer(idFamilia,token) }
                    rutaBase="/invitaciones-ver"
                    onCerrar={ () => setCompartiendo(false) }
                />
            }

            {
                miembroEditando &&
                <EditarMiembroModal
                    miembro={miembroEditando}
                    token={token}
                    onCerrar={cerrarEdicionMiembro}
                    onActualizado={manejarMiembroActualizado}
                    onBorrar={manejarBorrarMiembroDesdeArbol}
                />
            }

            {
                popoverAbierto && paso === "form" &&
                <Modal onCerrar={cerrarPopover}>
                    <h2 className="font-display text-[1.425rem] font-semibold">{(envio && titulosFormulario[envio.relacion]) || "Añadir familiar"}</h2>
                    {renderFormulario()}
                </Modal>
            }
        </div>
}

export default Arbol
